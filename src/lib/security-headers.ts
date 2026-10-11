/**
 * Headers sent with every response the server renders (Node or Cloudflare),
 * error pages included. No HSTS until HTTPS is live on the real domain, and
 * no script CSP yet (hydration uses inline scripts): only frame-ancestors,
 * which cannot break the page.
 */
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "frame-ancestors 'none'",
} as const;
