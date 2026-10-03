import LandingPage from '@/components/landing-page'
import { getLandingCopy } from '@/lib/landing-copy'

export default function Home({ params: { locale } }: { params: { locale: string } }) {
  return <LandingPage copy={getLandingCopy(locale)} />
}
