/**
 * The published address of Ramus, without a trailing slash (e.g. "https://ramus.lovable.app").
 * Share previews (og:image) need an absolute address; until this is set they fall back to a path on the same site,
 * which some apps (LinkedIn, X, Facebook) do not follow. Set it once the site is published.
 */
export const SITE_URL = "";

/** The share image for public pages: the landing page's tree and its line, 1200×630. */
export const SHARE_IMAGE = `${SITE_URL}/og-ramus.jpg`;
