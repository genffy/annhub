import Footer from '@/components/footer'
import HomeShowcase from '@/components/home-showcase'
import Image from 'next/image'
import Link from 'next/link'

export default function Showcase() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F2F3F5] text-[#1E2B3A]">
      <section className="relative overflow-hidden px-4 pb-16 pt-10 md:px-20 md:pb-24">
        <div className="absolute right-[-12%] top-0 h-full w-1/2 skew-x-[-12deg] bg-[#673AB8]/10" />
        <nav className="relative z-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-2xl font-extrabold text-[#1E2B3A]">
            <Image src="/ann.svg" alt="AnnHub" width={40} height={48} className="h-12 w-auto" priority />
            AnnHub
          </Link>
          <Link
            href="/"
            className="rounded-full bg-[#673AB8] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#56309b]"
          >
            Home
          </Link>
        </nav>
        <div className="relative z-10 mx-auto mt-20 max-w-6xl">
          <p className="mb-6 text-[13px] font-extrabold uppercase tracking-[0.22em] text-[#673AB8]">Showcase</p>
          <h1 className="max-w-5xl text-[14vw] font-extrabold leading-[0.9] text-[#1E2B3A] md:text-[108px]">
            AnnHub in motion.
          </h1>
          <p className="mt-8 max-w-2xl text-[20px] leading-8 text-[#1E2B3A]/75">
            A closer look at the capture, highlight, vocabulary, and store artwork flows behind the browser extension.
          </p>
        </div>
      </section>
      <HomeShowcase />
      <Footer />
    </main>
  )
}
