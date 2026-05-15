import Footer from '@/components/footer'
import Hero from '@/components/hero'
import HomeShowcase from '@/components/home-showcase'

export default function Home() {
  return (
    <div className="min-h-[100vh] sm:min-h-screen w-full max-w-full flex flex-col relative bg-[#F2F3F5] font-inter overflow-x-hidden">
      <Hero />
      <HomeShowcase />
      <Footer />
    </div>
  )
}
