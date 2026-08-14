/**
 * dsh-wallpaper client half (the `./client` export of the dual-face package).
 * @module dsh-wallpaper/client
 */

/** Cordis service names required by the client plugin. */
export declare const inject: string[];

/** Client plugin body: wallpaper service + settings row. */
export declare function apply(ctx: unknown): void;
