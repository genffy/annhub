/**
 * The production origin. Only what crawlers read uses it (metadataBase, the sitemap; public/robots.txt repeats it):
 * links inside the site stay paths, so a preview or localhost never sends a visitor to the live site.
 */
export const SITE_ORIGIN = 'https://annhub.org'
