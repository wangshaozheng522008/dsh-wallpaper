/**
 * dsh-wallpaper client half (hand-authored `__ModuleLoader__` factory bundle).
 *
 * What it does:
 *  - registers a "wallpaper" row into the General settings section item slot,
 *  - uploads the picked image to the host, persists `{image, opacity, accent}`,
 *  - paints the main app frame background with the image at the chosen opacity
 *    (default 50%; alpha is baked into a WebP/PNG so the base color shows through),
 *  - overrides the workspace alias tokens with a palette derived from the
 *    image's dominant color through the `theme` service.
 *
 * Dependencies are platform seeds (react, jsx-runtime, primitives) plus the
 * client-runtime graph module; every cross-plugin value passes through Cordis
 * services (slots, locale, settingsScope, theme), never through imports.
 */
window.__ModuleLoader__.load({
	id: "dsh-wallpaper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var jsxRuntime = require("react/jsx-runtime");
		var React = require("react");
		var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		var clientRuntime = require("@deepseek-ai/dsh-client-runtime/client");

		/* ---------------------------------------------------------------- */
		/* constants                                                         */
		/* ---------------------------------------------------------------- */

		var SETTINGS_NS = "settings.wallpaper";
		var WALLPAPER_NAMESPACE = "wallpaper";
		var DEFAULT_OPACITY = 0.5;
		var MAX_BAKE_DIMENSION = 2048;
		var UPLOAD_ENDPOINT = "/api/dsh-wallpaper/upload";

		/* ---------------------------------------------------------------- */
		/* dictionaries                                                      */
		/* ---------------------------------------------------------------- */

		var zh = {
			"wallpaper.title": "壁纸",
			"wallpaper.upload": "上传壁纸",
			"wallpaper.replace": "更换壁纸",
			"wallpaper.uploading": "上传中…",
			"wallpaper.remove": "移除壁纸",
			"wallpaper.opacity": "透明度",
			"wallpaper.error.upload": "上传失败",
			"wallpaper.error.load": "壁纸加载失败"
		};

		var en = {
			"wallpaper.title": "Wallpaper",
			"wallpaper.upload": "Upload wallpaper",
			"wallpaper.replace": "Replace wallpaper",
			"wallpaper.uploading": "Uploading…",
			"wallpaper.remove": "Remove wallpaper",
			"wallpaper.opacity": "Opacity",
			"wallpaper.error.upload": "Upload failed",
			"wallpaper.error.load": "Failed to load wallpaper"
		};

		/* ---------------------------------------------------------------- */
		/* styles                                                            */
		/* ---------------------------------------------------------------- */

		var css = [
			".dshw-group{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:16px 0;display:flex}",
			".dshw-title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}",
			".dshw-row{flex-wrap:wrap;align-items:center;gap:8px;display:flex}",
			".dshw-file{display:none}",
			".dshw-preview{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:160px;height:90px;border-radius:12px;overflow:hidden}",
			".dshw-thumb{width:100%;height:100%;object-fit:cover;display:block}",
			".dshw-accent{align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;display:flex}",
			".dshw-swatch{width:14px;height:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;display:inline-block}",
			".dshw-opacity{align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;display:flex}",
			".dshw-range{flex:1;min-width:120px;accent-color:var(--dsw-alias-brand-primary)}",
			".dshw-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}"
		].join("");

		function injectCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector('style[data-plugin="dsh-wallpaper"]') !== null) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-wallpaper";
			tag.textContent = css;
			(document.head || document.documentElement).appendChild(tag);
		}
		if (typeof document !== "undefined" && document.head) injectCss();
		else if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", injectCss);

		/* ---------------------------------------------------------------- */
		/* color helpers                                                     */
		/* ---------------------------------------------------------------- */

		function clampOpacity(value) {
			if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_OPACITY;
			return Math.min(1, Math.max(0, value));
		}

		function hexToRgb(hex) {
			var value = String(hex).replace("#", "");
			if (value.length === 3) value = value.split("").map((c) => c + c).join("");
			var n = parseInt(value, 16);
			if (Number.isNaN(n)) return [128, 128, 128];
			return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
		}

		function mix(a, b, t) {
			return [
				Math.round(a[0] + (b[0] - a[0]) * t),
				Math.round(a[1] + (b[1] - a[1]) * t),
				Math.round(a[2] + (b[2] - a[2]) * t)
			];
		}

		function rgbToHex(rgb) {
			return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
		}

		/**
		 * Build the token override layer from the dominant accent: near-accent
		 * brand, accent-tinted surfaces/borders, and a tinted sidebar fill, with
		 * separate light/dark pairs blended toward white / near-black bases.
		 */
		function buildPalette(accent) {
			var a = hexToRgb(accent);
			var white = [255, 255, 255];
			var lightBase = [247, 248, 250];
			var black = [16, 16, 22];
			var darkBase = [22, 23, 28];
			return {
				"--dsw-alias-brand-primary": {
					light: rgbToHex(mix(a, white, 0.05)),
					dark: rgbToHex(mix(a, white, 0.18))
				},
				"--dsw-alias-bg-layer-1": {
					light: rgbToHex(mix(a, lightBase, 0.88)),
					dark: rgbToHex(mix(a, darkBase, 0.84))
				},
				"--dsw-alias-bg-layer-2": {
					light: rgbToHex(mix(a, lightBase, 0.76)),
					dark: rgbToHex(mix(a, darkBase, 0.7))
				},
				"--dsw-alias-bg-overlay": {
					light: rgbToHex(mix(a, lightBase, 0.8)),
					dark: rgbToHex(mix(a, darkBase, 0.76))
				},
				"--dsw-alias-border-l1": {
					light: rgbToHex(mix(a, lightBase, 0.6)),
					dark: rgbToHex(mix(a, darkBase, 0.5))
				},
				"--dsw-alias-border-l2": {
					light: rgbToHex(mix(a, lightBase, 0.42)),
					dark: rgbToHex(mix(a, darkBase, 0.3))
				},
				"--dsw-specific-sidebar-fill": {
					light: rgbToHex(mix(a, lightBase, 0.42)),
					dark: rgbToHex(mix(a, darkBase, 0.5))
				}
			};
		}

		/* ---------------------------------------------------------------- */
		/* image helpers                                                     */
		/* ---------------------------------------------------------------- */

		function readAsDataUrl(blob) {
			return new Promise((resolve, reject) => {
				var reader = new FileReader();
				reader.onload = () => resolve(reader.result);
				reader.onerror = () => reject(new Error("FileReader failed"));
				reader.readAsDataURL(blob);
			});
		}

		function loadImage(source) {
			return new Promise((resolve, reject) => {
				var img = new Image();
				img.onload = () => resolve(img);
				img.onerror = () => reject(new Error("image decode failed"));
				img.src = source;
			});
		}

		/**
		 * Dominant color extraction: downscale to <= 64px, histogram 4-bit RGB
		 * buckets, skip transparent / near-black / near-white / gray pixels,
		 * weight buckets by total saturation, average the winning bucket.
		 */
		function extractDominantColor(source) {
			return loadImage(source).then((img) => {
				var w = img.naturalWidth || 1;
				var h = img.naturalHeight || 1;
				var scale = Math.min(1, 64 / Math.max(w, h));
				var cw = Math.max(1, Math.round(w * scale));
				var ch = Math.max(1, Math.round(h * scale));
				var canvas = document.createElement("canvas");
				canvas.width = cw;
				canvas.height = ch;
				var g = canvas.getContext("2d");
				if (g === null) throw new Error("canvas unavailable");
				g.drawImage(img, 0, 0, cw, ch);
				var data;
				try {
					data = g.getImageData(0, 0, cw, ch).data;
				} catch (error) {
					throw new Error("image pixel access blocked");
				}
				var buckets = new Map();
				var fallback = [0, 0, 0];
				var fallbackCount = 0;
				for (var i = 0; i < data.length; i += 4) {
					var r = data[i];
					var gg = data[i + 1];
					var b = data[i + 2];
					var a = data[i + 3];
					if (a < 128) continue;
					fallback[0] += r;
					fallback[1] += gg;
					fallback[2] += b;
					fallbackCount += 1;
					var max = Math.max(r, gg, b);
					var min = Math.min(r, gg, b);
					var luma = 0.299 * r + 0.587 * gg + 0.114 * b;
					var sat = max === 0 ? 0 : (max - min) / max;
					if (luma < 18 || luma > 238 || sat < 0.08) continue;
					var key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
					var entry = buckets.get(key);
					if (entry === void 0) {
						entry = { sum: [0, 0, 0], count: 0, weight: 0 };
						buckets.set(key, entry);
					}
					entry.sum[0] += r;
					entry.sum[1] += gg;
					entry.sum[2] += b;
					entry.count += 1;
					entry.weight += sat;
				}
				var best = null;
				buckets.forEach((entry) => {
					if (best === null || entry.weight > best.weight || (entry.weight === best.weight && entry.count > best.count)) best = entry;
				});
				var rgb;
				if (best !== null) rgb = best.sum.map((v) => v / best.count);
				else if (fallbackCount > 0) rgb = fallback.map((v) => v / fallbackCount);
				else rgb = [120, 120, 120];
				return rgbToHex(rgb);
			});
		}

		/**
		 * Bake the source image at the requested opacity into a WebP (PNG
		 * fallback) data URL; the alpha lets the frame's base color show through.
		 */
		function bakeToDataUrl(img, opacity) {
			var w = img.naturalWidth || 1;
			var h = img.naturalHeight || 1;
			var scale = Math.min(1, MAX_BAKE_DIMENSION / Math.max(w, h));
			var cw = Math.max(1, Math.round(w * scale));
			var ch = Math.max(1, Math.round(h * scale));
			var canvas = document.createElement("canvas");
			canvas.width = cw;
			canvas.height = ch;
			var g = canvas.getContext("2d");
			if (g === null) throw new Error("canvas unavailable");
			g.globalAlpha = clampOpacity(opacity);
			g.drawImage(img, 0, 0, cw, ch);
			var url = canvas.toDataURL("image/webp", 0.9);
			if (url.slice(0, 15) === "data:image/webp") return url;
			return canvas.toDataURL("image/png");
		}

		/* ---------------------------------------------------------------- */
		/* settings-row store (a mirror of the wallpaper state)              */
		/* ---------------------------------------------------------------- */

		var store = clientRuntime.defineStore({
			init: () => ({
				image: null,
				opacity: DEFAULT_OPACITY,
				accent: null,
				uploading: false,
				error: null
			}),
			actions: {
				adopt: (d, image, opacity, accent) => {
					d.image = image;
					d.opacity = clampOpacity(opacity);
					d.accent = accent;
				},
				setUploading: (d, value) => {
					d.uploading = value === true;
				},
				setError: (d, value) => {
					d.error = value === void 0 || value === null ? null : String(value);
				}
			}
		});

		/* ---------------------------------------------------------------- */
		/* wallpaper service                                                 */
		/* ---------------------------------------------------------------- */

		var WallpaperService = class {
			constructor(ctx, scope) {
				this.ctx = ctx;
				this.scope = scope;
				this.t = ctx.locale.bind(SETTINGS_NS);
				this.bound = null;
				this.state = { image: null, opacity: DEFAULT_OPACITY, accent: null };
				this.uploading = false;
				this.error = null;
				this.source = null;
				this.sourceUrl = null;
				this.baked = null;
				this.bakeToken = 0;
				this.frameEl = null;
				this.disposeOverride = null;

				ctx.effect(() => scope.subscribe(() => this.onScopeChange()), "dsh-wallpaper: settings scope adoption");
				this.onScopeChange();

				ctx.effect(() => {
					var check = () => {
						var overlay = document.querySelector("[data-shell-overlay]");
						var frame = overlay !== null && overlay.parentElement !== null ? overlay.parentElement : null;
						if (frame !== this.frameEl) {
							this.frameEl = frame;
							this.applyFrameStyle();
						}
					};
					var observer = new MutationObserver(check);
					observer.observe(document.documentElement, { childList: true, subtree: true });
					check();
					return () => {
						observer.disconnect();
						this.frameEl = null;
					};
				}, "dsh-wallpaper: frame watcher");

				ctx.effect(() => () => {
					this.bakeToken += 1;
					this.clearFrameStyle();
					if (this.disposeOverride !== null) {
						this.disposeOverride();
						this.disposeOverride = null;
					}
				}, "dsh-wallpaper: teardown");
			}

			settingsValue() {
				var snap = this.scope.getSnapshot();
				if (snap.status !== "ready" || typeof snap.value !== "object" || snap.value === null) return {};
				return snap.value;
			}

			onScopeChange() {
				var value = this.settingsValue();
				var image = typeof value.image === "string" ? value.image : null;
				var opacity = typeof value.opacity === "number" ? clampOpacity(value.opacity) : DEFAULT_OPACITY;
				var accent = typeof value.accent === "string" ? value.accent : null;
				var prev = this.state;
				if (image === prev.image && opacity === prev.opacity && accent === prev.accent) return;
				this.state = { image, opacity, accent };
				this.pushToBound();
				this.refresh();
			}

			pushToBound() {
				if (this.bound === null) return;
				this.bound.adopt(this.state.image, this.state.opacity, this.state.accent);
			}

			setUploading(value) {
				this.uploading = value === true;
				if (this.bound !== null) this.bound.setUploading(this.uploading);
			}

			setError(message) {
				this.error = message === void 0 || message === null ? null : String(message);
				if (this.bound !== null) this.bound.setError(this.error);
			}

			applyAccent(accent) {
				if (this.disposeOverride !== null) {
					this.disposeOverride();
					this.disposeOverride = null;
				}
				if (accent === null) return;
				this.disposeOverride = this.ctx.theme.overrideTokens("dsh-wallpaper", buildPalette(accent));
			}

			async refresh() {
				var token = ++this.bakeToken;
				var image = this.state.image;
				var opacity = this.state.opacity;
				this.applyAccent(this.state.accent);
				if (image === null) {
					this.source = null;
					this.sourceUrl = null;
					this.baked = null;
					this.applyFrameStyle();
					return;
				}
				try {
					var img = this.sourceUrl === image && this.source !== null ? this.source : await this.loadSource(image);
					if (token !== this.bakeToken) return;
					this.source = img;
					this.sourceUrl = image;
					this.baked = bakeToDataUrl(img, opacity);
					this.applyFrameStyle();
					this.setError(null);
				} catch (error) {
					if (token !== this.bakeToken) return;
					this.baked = null;
					this.applyFrameStyle();
					this.setError(`${this.t("wallpaper.error.load")}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}

			async loadSource(url) {
				var response = await fetch(url);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				var blob = await response.blob();
				var objectUrl = URL.createObjectURL(blob);
				try {
					return await loadImage(objectUrl);
				} finally {
					URL.revokeObjectURL(objectUrl);
				}
			}

			applyFrameStyle() {
				if (this.frameEl === null) return;
				if (this.baked !== null) {
					this.frameEl.style.backgroundImage = `url("${this.baked}")`;
					this.frameEl.style.backgroundSize = "cover";
					this.frameEl.style.backgroundPosition = "center";
					this.frameEl.style.backgroundRepeat = "no-repeat";
				} else {
					this.clearFrameStyle();
				}
			}

			clearFrameStyle() {
				if (this.frameEl === null) return;
				this.frameEl.style.removeProperty("background-image");
				this.frameEl.style.removeProperty("background-size");
				this.frameEl.style.removeProperty("background-position");
				this.frameEl.style.removeProperty("background-repeat");
			}

			/** Upload a picked file: extract the accent, store it, persist. */
			async upload(file) {
				this.setUploading(true);
				this.setError(null);
				try {
					var dataUrl = await readAsDataUrl(file);
					var accent = await extractDominantColor(dataUrl);
					var contentType = typeof file.type === "string" && file.type !== "" ? file.type : "application/octet-stream";
					var response = await fetch(UPLOAD_ENDPOINT, {
						method: "POST",
						headers: { "content-type": contentType },
						body: file
					});
					var result = {};
					try {
						result = await response.json();
					} catch (_) {
						result = {};
					}
					if (!response.ok || result.ok !== true || typeof result.url !== "string") {
						throw new Error(typeof result.message === "string" ? result.message : `HTTP ${response.status}`);
					}
					await this.scope.set("image", result.url);
					await this.scope.set("accent", accent);
					await this.scope.set("opacity", DEFAULT_OPACITY);
				} catch (error) {
					this.setError(`${this.t("wallpaper.error.upload")}: ${error instanceof Error ? error.message : String(error)}`);
				} finally {
					this.setUploading(false);
				}
			}

			/** Change the display opacity and persist it. */
			setOpacity(value) {
				var next = clampOpacity(value);
				this.scope.set("opacity", next).catch(() => {});
				if (this.state.image === null || this.state.opacity === next) return;
				this.state = { image: this.state.image, opacity: next, accent: this.state.accent };
				this.pushToBound();
				this.refresh();
			}

			/** Remove the wallpaper: unset persistence and delete the file. */
			clear() {
				var image = this.state.image;
				this.scope.unset("image").catch(() => {});
				this.scope.unset("accent").catch(() => {});
				if (image !== null) fetch(image, { method: "DELETE" }).catch(() => {});
				this.setError(null);
			}
		};

		/* ---------------------------------------------------------------- */
		/* settings row component                                            */
		/* ---------------------------------------------------------------- */

		function WallpaperRow(props) {
			var t = props.t;
			var useStore = props.useStore;
			var state = useStore((s) => s);
			var fileRef = React.useRef(null);
			var hasWallpaper = state.image !== null && state.image !== void 0;
			var preview = hasWallpaper ? jsxRuntime.jsxs("div", {
				className: "dshw-preview",
				children: [
					jsxRuntime.jsx("img", { className: "dshw-thumb", src: state.image, alt: "" })
				]
			}) : null;
			var accentSwatch = hasWallpaper && state.accent !== null ? jsxRuntime.jsxs("div", {
				className: "dshw-accent",
				children: [
					jsxRuntime.jsx("span", {
						className: "dshw-swatch",
						style: { backgroundColor: state.accent }
					}),
					state.accent
				]
			}) : null;
			var opacitySlider = hasWallpaper ? jsxRuntime.jsxs("label", {
				className: "dshw-opacity",
				children: [
					jsxRuntime.jsx("span", { children: t("wallpaper.opacity") }),
					jsxRuntime.jsx("input", {
						type: "range",
						className: "dshw-range",
						min: 0,
						max: 100,
						step: 5,
						value: Math.round(state.opacity * 100),
						onChange: (event) => {
							props.setOpacity(Number(event.target.value) / 100);
						}
					}),
					jsxRuntime.jsx("span", { children: `${Math.round(state.opacity * 100)}%` })
				]
			}) : null;
			return jsxRuntime.jsxs("div", {
				className: "dshw-group",
				children: [
					jsxRuntime.jsx("div", { className: "dshw-title", children: t("wallpaper.title") }),
					preview,
					accentSwatch,
					jsxRuntime.jsxs("div", {
						className: "dshw-row",
						children: [
							jsxRuntime.jsx(primitives.Button, {
								variant: "outline",
								size: "sm",
								disabled: state.uploading,
								onClick: () => {
									if (fileRef.current !== null) fileRef.current.click();
								},
								children: state.uploading ? t("wallpaper.uploading") : hasWallpaper ? t("wallpaper.replace") : t("wallpaper.upload")
							}),
							hasWallpaper ? jsxRuntime.jsx(primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									props.removeWallpaper();
								},
								children: t("wallpaper.remove")
							}) : null,
							jsxRuntime.jsx("input", {
								ref: fileRef,
								type: "file",
								accept: "image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp",
								className: "dshw-file",
								onChange: (event) => {
									var file = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null;
									event.target.value = "";
									if (file !== null) props.requestUpload(file);
								}
							})
						]
					}),
					opacitySlider,
					state.error !== null && state.error !== void 0 ? jsxRuntime.jsx("div", {
						className: "dshw-error",
						role: "alert",
						children: state.error
					}) : null
				]
			});
		}

		/* ---------------------------------------------------------------- */
		/* plugin body                                                       */
		/* ---------------------------------------------------------------- */

		var inject = ["slots", "locale", "connection", "remote", "settingsScope", "theme"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), "dsh-wallpaper: dictionaries");

			var service = new WallpaperService(ctx, ctx.settingsScope.bind({ namespace: WALLPAPER_NAMESPACE }));
			ctx.provide("wallpaper", service);

			var injected = (actions) => {
				service.bound = actions;
				actions.adopt(service.state.image, service.state.opacity, service.state.accent);
				actions.setUploading(service.uploading);
				actions.setError(service.error);
				return {
					requestUpload: (file) => {
						service.upload(file);
					},
					setOpacity: (value) => {
						service.setOpacity(value);
					},
					removeWallpaper: () => {
						service.clear();
					}
				};
			};

			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "wallpaper",
				order: 20,
				store,
				locale: SETTINGS_NS,
				inject: injected
			}, WallpaperRow));
		}

		exports.WallpaperService = WallpaperService;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
