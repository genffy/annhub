import LandingPage from '@/components/landing-page'
import { getLandingCopy } from '@/lib/landing-copy'

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return <LandingPage copy={getLandingCopy(locale)} />
}
