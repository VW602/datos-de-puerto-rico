/**
 * Headers sent with every response the server renders (Node or Cloudflare),
 * error pages included. No script CSP yet (hydration uses inline scripts):
 * only frame-ancestors, which cannot break the page.
 *
 * HSTS, first step: one day, this host only (no includeSubDomains, so
 * tn242.com, www and any other subdomain are untouched), no preload. Raise
 * max-age in steps once it has run without trouble; see docs/OPERATIONS.md.
 */
export const HSTS = "max-age=86400";

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Strict-Transport-Security": HSTS,
} as const;
