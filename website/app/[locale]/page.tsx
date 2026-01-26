import Footer from '@/components/footer'
import Hero from '@/components/hero'

export default function Home() {
  return (
    <div className="min-h-[100vh] sm:min-h-screen w-screen flex flex-col relative bg-[#F2F3F5] font-inter overflow-hidden">
      <Hero />
      <Footer />
    </div>
  )
}
