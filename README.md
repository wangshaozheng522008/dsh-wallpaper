# dsh-wallpaper

A plugin for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) that adds a custom **wallpaper** feature to the web UI:

1. **Upload wallpaper in Appearance settings** — the gear (settings) panel's **General → 外观 (Appearance)** section gains a new **壁纸 (Wallpaper)** row with upload / replace / remove buttons.
2. **Main-interface background** — the uploaded image replaces the main app background at **50% opacity by default**, adjustable with a 0–100% slider. The opacity is baked into the image's alpha channel so the original theme base color shows through.
3. **Workspace recoloring** — the UI automatically derives the image's **dominant color** and tints the workspace surfaces (sidebar fill, raised surfaces, borders, brand accent) to match, in both light and dark themes.

The wallpaper is stored under `$DSH_HOME/wallpaper/` and served by the plugin's own HTTP routes; only `{image, opacity, accent}` (a URL, a number, and a hex color) are persisted in the `wallpaper` settings namespace.

## Install

The plugin is a dual-face Cordis package (a host half plus a `dsh.client` web bundle). Install it into your web profile and register it in the profile's patch layer:

```sh
dsh plugin --profile web add github:<owner>/dsh-wallpaper
```

Then add the loader entry to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-wallpaper
      name: dsh-wallpaper
```

(If your machine has no pnpm on PATH yet, `dsh plugin` will tell you — install pnpm and re-run. The patch file edit is hot-reloaded by the running server; refresh the page afterwards.)

## Usage

1. Open the settings gear in the web UI.
2. Under **外观 / Appearance** find **壁纸 / Wallpaper**.
3. Click **上传壁纸 / Upload wallpaper** and pick an image (PNG/JPEG/WebP/GIF/AVIF/BMP, up to 25 MB).
4. The main background switches to the image at 50% opacity and the workspace UI adopts the image's dominant color.
5. Adjust the **透明度 / Opacity** slider, replace the image, or click **移除壁纸 / Remove wallpaper** to revert.

## How it works

- **Host half** (`lib/index.js`): registers the `wallpaper` settings namespace (schemastery schema, so the state lives in the host settings document at `~/.dsh/settings.yaml`) and HTTP routes on the harness web server:
  - `POST /api/dsh-wallpaper/upload` — raw image body, content-type selects the extension, stored as `$DSH_HOME/wallpaper/<uuid>.<ext>` (≤ 25 MB),
  - `GET /api/dsh-wallpaper/image/<id>` — serves the original,
  - `DELETE /api/dsh-wallpaper/image/<id>` — removes it,
  - `GET/POST /api/dsh-wallpaper/state` — reads / replaces the persisted `{image, opacity, accent}` section. The web settings RPC only serves an explicit namespace allow-list, so the plugin owns its state surface; state changes still emit `settings/document-updated`, which the client receives through the `remote` service to stay in sync across tabs.
- **Client half** (`lib/client.js`): a `__ModuleLoader__` factory bundle that
  - registers a `settings.general.item` slot row (order 20, right after Appearance),
  - computes the dominant color client-side (canvas downscale + weighted RGB histogram),
  - bakes the image at the chosen opacity into a WebP/PNG data URL and paints it as `background-image` on the main app frame (located via the stable `[data-shell-overlay]` hook; the baked alpha lets the base color show through),
  - pushes a token override layer through the theme service (`theme.overrideTokens`) so `--dsw-alias-*` workspace tokens follow the accent in light and dark modes.

## Requirements

- dsh `0.1.0-rc.6` (the harness API this plugin was built against).
- A `web` profile with the standard dsh-web-app bundle (the plugin resolves all of its `@deepseek-ai/*` peer dependencies from the harness's shared module fallback, so no extra installs are needed).

## Development

The client bundle is hand-authored against the web shell's public module loader (`window.__ModuleLoader__.load`) and needs no build step. To iterate:

```sh
git clone <this repo> dsh-wallpaper
cd dsh-wallpaper
ln -s "$PWD" ~/.dsh/profiles/web/node_modules/dsh-wallpaper   # or: dsh plugin --profile web add .
```

then keep the profile patch row from above in place and refresh the page (a profile-server restart picks up plugin-set changes).

## License

MIT
