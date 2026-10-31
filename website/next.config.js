const withNextIntl = require('next-intl/plugin')(
  // This is the default (also the `src` folder is supported out of the box)
  './i18n/index.ts',
)

module.exports = withNextIntl({
  output: 'export',
  // The root layout lives under the [locale] segment, so a 404 for a path outside it needs its own document (docs: file-conventions/not-found).
  experimental: { globalNotFound: true },
  // The repository root has its own lockfile; keep Turbopack from picking it as the workspace root.
  turbopack: { root: __dirname },
  images: {
    // Static hosting serves the original assets; there is no image optimization server.
    unoptimized: true,
    remotePatterns: [],
  },
})
