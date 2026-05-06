/**
 * App version — sourced from package.json so bumping the package version
 * automatically updates everywhere (sidebar, operator card, anywhere else
 * that imports `APP_VERSION`).
 *
 * Vite resolves the JSON import at build time, so this is a static string
 * with zero runtime cost.
 */

import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
