/**
 * Canonical public origin for this deployment.
 *
 * Set `VITE_SITE_URL` (e.g. https://your-app.vercel.app or your custom domain)
 * in the hosting provider's environment variables. Everything SEO-related —
 * canonical links, Open Graph URLs, JSON-LD and the sitemap — reads from here,
 * so a new domain only needs to be configured in one place.
 */
const RAW = import.meta.env.VITE_SITE_URL || "http://localhost:3000";

export const SITE_URL = RAW.replace(/\/+$/, "");

/** Builds an absolute URL for a site-relative path. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
