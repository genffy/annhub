// Relative, not '@/': the root tests import this file, and their '@' is the repository root.
import type { Locale } from '../../i18n/config'

// Shared destinations for the product tour and site links.
export const REPO_URL = 'https://github.com/genffy/annhub'
export const LIBRARY_URL = '#library'
export const WORKFLOW_URL = '#story'
export const PRIVACY_URL = '/privacy-policy.html'
export const TERMS_URL = '/terms-of-service.html'

/** The privacy policy's section on this website, in the page's language (the anchors are ids in public/privacy-policy.html). */
export const PRIVACY_WEBSITE_URL: Record<Locale, string> = { 'zh-CN': `${PRIVACY_URL}#zh-website`, 'en': `${PRIVACY_URL}#website` }
