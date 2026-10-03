import { redirect } from 'next/navigation'

export default function Showcase({ params: { locale } }: { params: { locale: string } }) {
  redirect(`/${locale}`)
}
