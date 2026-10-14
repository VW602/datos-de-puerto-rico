/**
 * Workers KV namespace for live data (read-only from the site). The IDs are
 * configuration, not secrets: they identify the namespaces but grant no
 * access. Writes come only from the validated refresh workflow (a later
 * phase), never from the site.
 */
export const LIVE_KV = {
  binding: "LIVE_DATA",
  /** datos-live */
  id: "ecce8f1170284a9590b279017b7cd31b",
  /** datos-live-preview (used by `wrangler dev --remote` and preview tests) */
  previewId: "f8607cea56fd438c887fbaee1c8077b5",
} as const;
