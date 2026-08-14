/**
 * dsh-wallpaper host half.
 * @module dsh-wallpaper
 */

/** Settings namespace owned by this plugin. */
export declare const WALLPAPER_NAMESPACE: string;

/** HTTP prefix under which all wallpaper routes live. */
export declare const WALLPAPER_API_PREFIX: string;

/** Hard cap on accepted upload bodies, in bytes. */
export declare const MAX_UPLOAD_BYTES: number;

/** The persisted `wallpaper` settings section shape. */
export declare const WALLPAPER_SETTINGS_SCHEMA: unknown;

/** Cordis plugin body: settings namespace + wallpaper HTTP routes. */
export declare function apply(ctx: unknown): void;
