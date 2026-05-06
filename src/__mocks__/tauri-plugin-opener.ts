/**
 * Vitest mock for @tauri-apps/plugin-opener. Tests don't actually
 * launch the OS browser; the URL-safety helper is tested directly.
 */

export async function openUrl(_url: string): Promise<void> {
  // No-op
}
