'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { Gradient } from '@/lib/gradient'
import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { CHROME_WEB_STORE_URL } from '@/lib/links'

function AnnMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 170 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M30 110L70 0H40L0 110V200H30L60 110H30ZM140 110L100 0H130L170 110V200H140L110 110H140Z" fill="currentColor" />
    </svg>
  )
}

const Hero = () => {
  useEffect(() => {
    const gradient = new Gradient()

    gradient.initGradient('#gradient-canvas')
  }, [])

  const highlights = ['Exact highlights', 'Fast clipping', 'Vocabulary labels']

  return (
    <AnimatePresence>
      <section className="relative isolate overflow-hidden bg-[#F2F3F5] px-4 pb-8 pt-24 text-[#1E2B3A] sm:px-6 sm:pt-24 md:px-20 md:pb-14 md:pt-28 lg:min-h-[760px] xl:min-h-[820px]">
        <svg style={{ filter: 'contrast(125%) brightness(110%)' }} className="fixed inset-0 z-[1] h-full w-full opacity-[28%] pointer-events-none">
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" stitchTiles="stitch"></feTurbulence>
            <feColorMatrix type="saturate" values="0"></feColorMatrix>
          </filter>
          <rect width="100%" height="100%" filter="url(#noise)"></rect>
        </svg>

        <div
          className="absolute right-[-18%] top-0 z-20 hidden h-[82%] w-[62%] bg-[#1F2B3A]/10 md:block"
          style={{
            clipPath: 'polygon(16% 0,100% 0,88% 100%,0 100%)',
          }}
        />

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
            clipPath: 'polygon(16% 0,100% 0,88% 100%,0 100%)',
          }}
          id="gradient-canvas"
          data-transition-in
          className="absolute right-[-18%] top-0 z-30 hidden h-[82%] w-[62%] bg-[#c3e4ff] md:block"
        />

        <div className="relative z-[100] mx-auto grid max-w-7xl items-center gap-9 lg:grid-cols-[0.86fr_1.14fr] lg:gap-12">
          <div>
            <motion.h1
              aria-label="Annotation share anywhere."
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.15,
                duration: 0.95,
                ease: [0.165, 0.84, 0.44, 1],
              }}
              className="relative font-inter text-[52px] font-extrabold leading-[0.9] tracking-normal text-[#1E2B3A] sm:text-[78px] md:text-[96px] lg:text-[104px] xl:text-[112px]"
            >
              <span className="inline-flex items-baseline whitespace-nowrap">
                <AnnMark className="mr-[0.02em] inline-block h-[0.92em] w-auto flex-none align-[-0.08em] text-[#673AB8]" />
                <span>nnotation</span>
              </span>{' '}
              <br />
              share <span className="text-[#673AB8]">anywhere</span>
              <span className="font-inter text-[#673AB8]">.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.25,
                duration: 0.72,
                ease: [0.165, 0.84, 0.44, 1],
              }}
              className="mt-6 max-w-2xl text-[16px] leading-7 text-[#1E2B3A]/74 md:text-[18px] md:leading-8"
            >
              Highlight passages, collect clips, and label English vocabulary directly on the pages you read. AnnHub keeps the reading loop close to the browser instead of scattering it across tabs.
            </motion.p>

            <motion.div
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.35,
                duration: 0.72,
                ease: [0.165, 0.84, 0.44, 1],
              }}
              className="mt-5 grid max-w-xl gap-3 sm:grid-cols-3"
            >
              {highlights.map((item) => (
                <div key={item} className="border-l-2 border-[#673AB8] bg-white/58 px-3 py-2 text-[13px] font-extrabold text-[#1E2B3A] shadow-sm backdrop-blur">
                  {item}
                </div>
              ))}
            </motion.div>

            <div className="mt-6 flex flex-wrap gap-3">
              <motion.div
                initial={{ opacity: 1, y: 0 }}
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
                  className="group flex min-w-[180px] scale-100 items-center justify-center gap-x-2 rounded-full bg-[#673AB8] py-2 pl-[8px] pr-4 text-[13px] font-semibold text-white no-underline transition-all duration-75 active:scale-95"
                  style={{
                    boxShadow: '0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <span className="flex h-5 w-5 items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
                    </svg>
                  </span>
                  Star on Github
                </Link>
              </motion.div>
              <motion.div
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.65,
                  duration: 0.55,
                  ease: [0.075, 0.82, 0.965, 1],
                }}
              >
                <Link
                  href={CHROME_WEB_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex scale-100 items-center justify-center rounded-full bg-[#f5f7f9] px-4 py-2 text-[13px] font-semibold text-[#1E2B3A] no-underline transition-all duration-75 active:scale-95"
                  style={{
                    boxShadow: '0 1px 1px #0c192714, 0 1px 3px #0c192724',
                  }}
                >
                  <span className="mr-2"> Try it out </span>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M13.75 6.75L19.25 12L13.75 17.25" stroke="#1E2B3A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 12H4.75" stroke="#1E2B3A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </motion.div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 1, scale: 1, y: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              delay: 0.62,
              duration: 0.8,
              ease: [0.075, 0.82, 0.965, 1],
            }}
            className="relative z-[60]"
          >
            <div className="relative mx-auto max-w-2xl xl:max-w-3xl">
              <div className="absolute -left-4 top-10 hidden h-28 w-28 border-l-8 border-t-8 border-[#F5C542] md:block" />
              <div className="absolute -right-4 bottom-8 hidden h-28 w-28 border-b-8 border-r-8 border-[#2E7D62] md:block" />

              <div className="relative overflow-hidden rounded-lg border border-white/80 bg-white p-2 shadow-2xl shadow-[#1E2B3A]/18">
                <div className="flex items-center justify-between border-b border-[#1E2B3A]/8 px-3 py-2">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E46D4F]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F5C542]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#2E7D62]" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1E2B3A]/45">AnnHub reading flow</span>
                </div>
                <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-[#E8EDF0]">
                  <Image
                    src="/chrome-store/screenshot-1-highlight-any-page.svg"
                    alt="AnnHub highlighting passages on a webpage"
                    fill
                    sizes="(min-width: 1024px) 52vw, 100vw"
                    className="object-cover"
                    priority
                  />
                  <div className="absolute inset-0 bg-[#1E2B3A]/[0.03]" />
                </div>
              </div>

              <motion.div
                animate={{ y: [0, 8, 0], rotate: [1.2, 0.4, 1.2] }}
                transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-30 -mt-10 ml-auto w-[78%] overflow-hidden rounded-lg border border-white bg-white p-2 shadow-xl shadow-[#1E2B3A]/16 sm:w-[54%] md:absolute md:-bottom-8 md:-right-4 md:mt-0"
              >
                <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-[#E8EDF0]">
                  <Image
                    src="/chrome-store/screenshot-4-vocabulary-labels.svg"
                    alt="AnnHub vocabulary labels in context"
                    fill
                    sizes="(min-width: 1024px) 26vw, 78vw"
                    className="object-cover"
                  />
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </AnimatePresence>
  )
}

export default Hero
