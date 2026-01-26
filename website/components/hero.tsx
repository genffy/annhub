'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { Gradient } from '@/lib/gradient'
import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const Hero = () => {
  useEffect(() => {
    const gradient = new Gradient()

    gradient.initGradient('#gradient-canvas')
  }, [])
  return (
    <AnimatePresence>
      <svg style={{ filter: 'contrast(125%) brightness(110%)' }} className="fixed z-[1] w-full h-full opacity-[35%]">
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" stitchTiles="stitch"></feTurbulence>
          <feColorMatrix type="saturate" values="0"></feColorMatrix>
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)"></rect>
      </svg>
      <main className="flex flex-col justify-center h-[90%] static md:fixed w-screen overflow-hidden grid-rows-[1fr_repeat(3,auto)_1fr] z-[100] pt-[30px] pb-[320px] px-4 md:px-20 md:py-0">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.15,
            duration: 0.95,
            ease: [0.165, 0.84, 0.44, 1],
          }}
          className="relative md:ml-[-10px] md:mb-[37px] font-extrabold text-[16vw] md:text-[130px] font-inter text-[#1E2B3A] leading-[0.9] tracking-[-2px] z-[100]"
        >
          <svg className="inline-block w-[82px] row-start-2 mb-8 md:mb-6" viewBox="0 0 170 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M30 110L70 0H40L0 110V200H30L60 110H30ZM140 110L100 0H130L170 110V200H140L110 110H140Z" fill="#673AB8" />
          </svg>
          nnotation <br />
          share <span className="text-[#673AB8]">anywhere</span>
          <span className="font-inter text-[#673AB8]">.</span>
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.15,
            duration: 0.95,
            ease: [0.165, 0.84, 0.44, 1],
          }}
          className="flex flex-row justify-center z-20 mx-0 mb-0 mt-8 md:mt-0 md:mb-[35px] max-w-2xl md:space-x-8"
        >
          <div className="w-1/2">
            <h2 className="flex items-center font-semibold text-[1em] text-[#1a2b3b]">Platform</h2>
            <p className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal">Full access to our platform, including all questions and solutions.</p>
          </div>
          <div className="w-1/2">
            <h2 className="flex items-center font-semibold text-[1em] text-[#1a2b3b]">Community</h2>
            <p className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal">Join a community of like-minded individuals, and learn from each other.</p>
          </div>
        </motion.div>

        <div className="flex gap-[15px] mt-8 md:mt-0">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.55,
              duration: 0.55,
              ease: [0.075, 0.82, 0.965, 1],
            }}
          >
            <Link
              href="https://github.com/genffy/annhub"
              target="_blank"
              className="group rounded-full pl-[8px] min-w-[180px] pr-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#673AB8] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
              style={{
                boxShadow: '0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)',
              }}
            >
              <span className="w-5 h-5 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star-icon lucide-star">
                  <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
                </svg>
              </span>
              Star on Github
            </Link>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.65,
              duration: 0.55,
              ease: [0.075, 0.82, 0.965, 1],
            }}
          >
            <Link
              href="https://github.com/genffy/annhub/releases"
              aria-disabled
              className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#f5f7f9] text-[#1E2B3A] no-underline active:scale-95 scale-100 duration-75"
              style={{
                boxShadow: '0 1px 1px #0c192714, 0 1px 3px #0c192724',
              }}
            >
              <span className="mr-2"> Try it out </span>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.75 6.75L19.25 12L13.75 17.25" stroke="#1E2B3A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 12H4.75" stroke="#1E2B3A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </motion.div>
        </div>

        {/* Preview Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            delay: 0.8,
            duration: 0.8,
            ease: [0.075, 0.82, 0.965, 1],
          }}
          className="mt-8 md:mt-12 max-w-2xl z-[60]"
        >
          <div className="relative w-full aspect-[16/10] rounded-lg overflow-hidden shadow-2xl">
            <Image
              src="/preview/highlight.png"
              alt="Annotation Preview"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-white/10"></div>
          </div>
        </motion.div>
      </main>

      <div
        className="fixed top-0 right-0 w-[80%] md:w-1/2 h-screen bg-[#1F2B3A]/20"
        style={{
          clipPath: 'polygon(100px 0,100% 0,calc(100% + 225px) 100%, 480px 100%)',
        }}
      ></div>

      <motion.canvas
        initial={{
          filter: 'blur(20px)',
        }}
        animate={{
          filter: 'blur(0px)',
        }}
        transition={{
          duration: 1,
          ease: [0.075, 0.82, 0.965, 1],
        }}
        style={{
          clipPath: 'polygon(100px 0,100% 0,calc(100% + 225px) 100%, 480px 100%)',
        }}
        id="gradient-canvas"
        data-transition-in
        className="z-50 fixed top-0 right-[-2px] w-[80%] md:w-1/2 h-screen bg-[#c3e4ff]"
      ></motion.canvas>
    </AnimatePresence>
  )
}

export default Hero
