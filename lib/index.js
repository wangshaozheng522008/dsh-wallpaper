import { randomUUID } from "node:crypto";
import { createReadStream, promises as fsp } from "node:fs";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";

/**
 * dsh-wallpaper host half:
 *  - registers the `wallpaper` settings namespace (image URL, opacity, accent),
 *  - owns the wallpaper file store under $DSH_HOME/wallpaper,
 *  - serves the upload / read / delete HTTP routes consumed by the client half.
 */

/** Settings namespace owned by this plugin. */
export const WALLPAPER_NAMESPACE = settingsNamespace("wallpaper");

/** HTTP prefix under which all wallpaper routes live. */
export const WALLPAPER_API_PREFIX = "/api/dsh-wallpaper";

/** Hard cap on accepted upload bodies. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Accepted image content types and their stored extensions. */
const EXTENSION_BY_CONTENT_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp"
};

const CONTENT_TYPE_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp"
};

/** Stored wallpaper file names: one uuid plus a whitelisted extension. */
const IMAGE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}\.(png|jpg|webp|gif|avif|bmp)$/;

/** The persisted `wallpaper` section shape (schemastery: fields optional unless `.required()`). */
export const WALLPAPER_SETTINGS_SCHEMA = z.object({
  /** Relative URL of the stored original image, or absent when no wallpaper. */
  image: z
    .string()
    .pattern(new RegExp(`^${WALLPAPER_API_PREFIX}/image/[A-Za-z0-9-]{1,64}\\.(png|jpg|webp|gif|avif|bmp)$`)),
  /** Display opacity in [0, 1]; the client falls back to 0.5. */
  opacity: z.number().min(0).max(1),
  /** Dominant color of the uploaded image as `#rrggbb`. */
  accent: z.string().pattern(/^#[0-9a-fA-F]{6}$/)
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

/** Read the request body with a byte cap; rejects with a status code. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject({ status: 413, message: `wallpaper upload exceeds ${Math.floor(limit / 1024 / 1024)}MB` });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on("error", (error) => {
      if (!done) {
        done = true;
        reject({ status: 400, message: `failed to read upload body: ${error.message}` });
      }
    });
  });
}

/**
 * The host plugin body. Both capabilities use optional-injection sub-plugins so
 * the plugin degrades to a no-op in compositions without the services.
 * @param ctx - host root context.
 */
export function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(WALLPAPER_NAMESPACE, WALLPAPER_SETTINGS_SCHEMA);
  });

  ctx.inject(["webServer"], (webCtx) => {
    const dir = dshHomePath("wallpaper");
    const ensureDir = () => fsp.mkdir(dir, { recursive: true });

    const handler = async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);

      // POST /api/dsh-wallpaper/upload — raw image body, content-type selects the extension.
      if (req.method === "POST" && pathname === `${WALLPAPER_API_PREFIX}/upload`) {
        const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
        if (extension === void 0) {
          sendJson(res, 400, { ok: false, message: `unsupported content type "${contentType}"` });
          return;
        }
        let body;
        try {
          body = await readBody(req, MAX_UPLOAD_BYTES);
        } catch (error) {
          sendJson(res, error.status ?? 400, { ok: false, message: error.message });
          return;
        }
        try {
          await ensureDir();
          const id = `${randomUUID()}.${extension}`;
          await fsp.writeFile(join(dir, id), body);
          sendJson(res, 200, { ok: true, id, url: `${WALLPAPER_API_PREFIX}/image/${id}` });
        } catch (error) {
          sendJson(res, 500, { ok: false, message: `failed to store wallpaper: ${error.message}` });
        }
        return;
      }

      // GET/HEAD + DELETE /api/dsh-wallpaper/image/<id>
      const imagePrefix = `${WALLPAPER_API_PREFIX}/image/`;
      if (pathname.startsWith(imagePrefix)) {
        const id = pathname.slice(imagePrefix.length);
        if (!IMAGE_ID_PATTERN.test(id)) {
          sendJson(res, 404, { ok: false, message: "unknown wallpaper" });
          return;
        }
        const file = join(dir, id);
        if (req.method === "DELETE") {
          try {
            await fsp.unlink(file);
            sendJson(res, 200, { ok: true });
          } catch (error) {
            if (error.code === "ENOENT") sendJson(res, 404, { ok: false, message: "unknown wallpaper" });
            else sendJson(res, 500, { ok: false, message: `failed to remove wallpaper: ${error.message}` });
          }
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        try {
          const stat = await fsp.stat(file);
          const extension = id.slice(id.lastIndexOf(".") + 1);
          res.writeHead(200, {
            "content-type": CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream",
            "content-length": stat.size,
            "cache-control": "no-cache"
          });
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          const stream = createReadStream(file);
          stream.on("error", () => {
            res.destroy();
          });
          stream.pipe(res);
        } catch (error) {
          if (error.code === "ENOENT") sendJson(res, 404, { ok: false, message: "unknown wallpaper" });
          else sendJson(res, 500, { ok: false, message: `failed to read wallpaper: ${error.message}` });
        }
        return;
      }

      res.writeHead(404);
      res.end();
    };

    webCtx.effect(
      () => webCtx.webServer.register({ kind: "prefix", path: WALLPAPER_API_PREFIX, handler }),
      "dsh-wallpaper: wallpaper HTTP routes"
    );
  });
}
