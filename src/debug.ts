/** Temporary troubleshooting switch. Keep false in integration/release builds. */
export const SMART_REFERENCE_DEBUG = false;

/** Lazy payloads avoid collecting note text or forcing layout while disabled. */
export function debugLog(details: () => readonly unknown[]): void {
  if (SMART_REFERENCE_DEBUG) console.debug(...details());
}
