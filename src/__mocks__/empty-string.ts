/**
 * Stand-in for the `?url` import of sql-wasm.wasm in tests. Vite's
 * `?url` suffix returns the asset URL at build time; in vitest we
 * just return an empty string since the WASM is never fetched.
 */
export default "";
