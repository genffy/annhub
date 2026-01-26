import { Inter } from 'next/font/google'
import ThemeProvider from './theme-provider'
import { i18n } from '@/i18n/config'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { notFound } from 'next/navigation'
import Webcomponents from '@/components/webcomponent'

import './globals.css'

export async function generateStaticParams() {
  return i18n.locales.map(locale => ({ locale }))
}

const inter = Inter({
  weight: ['400', '700'],
  display: 'swap',
  subsets: ['latin'],
})
// TODO
// export async function generateMetadata({ params: { locale } }: any) {
//   const messages = (await import(`@/i18n/messages/${locale}.json`)).default;

//   // You can use the core (non-React) APIs when you
//   // have to use next-intl outside of components.
//   const t = createTranslator({ locale, messages });

//   return {
//     // title: t('LocaleLayout.title')
//     title: 'Annhub',
//     description: 'Annotation, comment, capture, and share anywhere',
//   };
// }

export const metadata = {
  title: 'AnnHub',
  description: 'Annotation, comment, capture, and share anywhere',
}

type RootLayoutProps = {
  params: {
    locale: string
  }
  children: React.ReactNode
}

export default async function RootLayout({ params: { locale }, children }: RootLayoutProps) {
  // Show a 404 error if the user requests an unknown locale
  let messages
  try {
    messages = (await import(`@/i18n/messages/${locale}.json`)).default
  } catch (error) {
    notFound()
  }
  return (
    <html lang={locale}>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
          <Webcomponents />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
