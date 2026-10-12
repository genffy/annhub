import LandingPage from '@/components/landing/landing-page'
import { getLandingCopy } from '@/lib/copy'
import { setRequestLocale } from 'next-intl/server'

/** The semantic layer for other search engines and AI tools (docs/v2/seo-geo.md §5.1): the words are the page's own FAQ,
 * including the date a competitor description was checked; backticks are RichText markup, not visible characters. */
function faqJsonLd(copy: ReturnType<typeof getLandingCopy>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': copy.faq.items.map(item => ({
      '@type': 'Question',
      'name': item.q,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': [item.a, item.note].filter(Boolean).join(' ').replaceAll('`', ''),
      },
    })),
  }
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const copy = getLandingCopy(locale)
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(copy)) }} />
      <LandingPage copy={copy} />
    </>
  )
}
