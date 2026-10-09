import LandingPage from '@/components/landing/landing-page'
import { getLandingCopy } from '@/lib/copy'
import { setRequestLocale } from 'next-intl/server'

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  return <LandingPage copy={getLandingCopy(locale)} />
}
