/**
 * The production origin. Only what crawlers read uses it (metadataBase, the sitemap; public/robots.txt repeats it):
 * links inside the site stay paths, so a preview or localhost never sends a visitor to the live site.
 */
export const SITE_ORIGIN = 'https://annhub.org'

/**
 * The Cloudflare Web Analytics site token, from netlify.toml's [context.production.environment]; Next.js writes it into
 * the page at build time. Without it the page loads no analytics script, shows no consent card and no "Analytics
 * settings" button, so local builds and previews never count (docs/v2/permissions.md §8).
 */
export const ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN ?? ''
