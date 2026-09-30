/**
 * Post-login destinations must be same-site paths. Absolute URLs, protocol-relative ("//host") and
 * backslash tricks ("/\\host") would make login an open redirect, so they fall back to the dashboard.
 */
export function isSafeCallbackPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\u0000-\u001f]/.test(value);
}
