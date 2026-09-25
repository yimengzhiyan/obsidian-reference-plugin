/** Lazy payloads avoid collecting note text or forcing layout while disabled. */
export function debugLog(details: () => readonly unknown[]): void {
  try {
    // Storage may be absent (Node/SSR) or throw when browser access is restricted.
    if (typeof localStorage === "undefined" || localStorage.getItem("SMART_REFERENCE_DEBUG") !== "true") return;
  } catch {
    return;
  }
  console.debug(...details());
}
