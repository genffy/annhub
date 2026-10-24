import LandingPage from '@/components/landing/landing-page'
import { getLandingCopy } from '@/lib/copy'
import { faqJsonLd, jsonLdScript, softwareApplicationJsonLd } from '@/lib/structured-data'
import { setRequestLocale } from 'next-intl/server'

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const copy = getLandingCopy(locale)
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(softwareApplicationJsonLd(copy))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqJsonLd(copy))} />
      <LandingPage copy={copy} />
    </>
  )
}
