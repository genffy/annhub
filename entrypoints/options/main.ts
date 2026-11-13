import { optionsHandoverPath } from './handover'

// The entry is a bundled script on purpose. Extension pages carry `script-src 'self'` (wxt.config.ts), so an inline
// <script> is blocked and logs a CSP error on every open, and a <meta http-equiv="refresh"> cannot carry the query
// string to the settings view (extension.md §2.2). Its own small module keeps the page's first screen a stub
// (scripts/check-bundle.mjs): the shared page helpers would load with it.
location.replace(optionsHandoverPath(location.search))
