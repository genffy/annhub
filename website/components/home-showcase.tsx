'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

type ShowcaseItem = {
  label: string
  title: string
  description: string
  image: string
  accent: string
  offset: string
}

const showcaseItems: ShowcaseItem[] = [
  {
    label: '01',
    title: 'Highlight any page',
    description: 'Capture exact passages with source context and restoreable highlights.',
    image: '/chrome-store/screenshot-1-highlight-any-page.png',
    accent: '#F5C542',
    offset: 'lg:translate-x-0 lg:translate-y-0',
  },
  {
    label: '02',
    title: 'Act from the hover menu',
    description: 'Clip, annotate, or switch into highlighter mode without leaving the article.',
    image: '/chrome-store/screenshot-2-mode-a-hover-menu.png',
    accent: '#673AB8',
    offset: 'lg:translate-x-8 lg:translate-y-10',
  },
  {
    label: '03',
    title: 'Sweep through reading',
    description: 'Mode B turns every selection into a saved clip, with a compact live counter.',
    image: '/chrome-store/screenshot-3-mode-b-fast-capture.png',
    accent: '#1E2B3A',
    offset: 'lg:-translate-x-8 lg:translate-y-20',
  },
  {
    label: '04',
    title: 'Label vocabulary inline',
    description: 'Unfamiliar words stay readable with local vocabulary and optional LLM glosses.',
    image: '/chrome-store/screenshot-4-vocabulary-labels.png',
    accent: '#2E7D62',
    offset: 'lg:translate-x-6 lg:translate-y-5',
  },
  {
    label: '05',
    title: 'Sync the reading system',
    description: 'Configure vocabulary, LLM, and reading lists from one focused settings surface.',
    image: '/chrome-store/screenshot-5-settings-sync.png',
    accent: '#E46D4F',
    offset: 'lg:-translate-x-4 lg:translate-y-14',
  },
]

const metrics = [
  { value: '5', label: 'Store visuals' },
  { value: '2', label: 'Capture modes' },
  { value: '1', label: 'Reading loop' },
]

const fadeUp = {
  initial: { opacity: 0, y: 36 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-90px' },
  transition: { duration: 0.72, ease: [0.075, 0.82, 0.965, 1] },
}

function ShowcaseCard({ item, index }: { item: ShowcaseItem; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 30, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay: index * 0.08, duration: 0.64, ease: [0.075, 0.82, 0.965, 1] }}
      whileHover={{ y: -10, rotate: index % 2 === 0 ? -0.6 : 0.6 }}
      className={`group relative min-w-0 overflow-hidden rounded-lg border border-[#1E2B3A]/10 bg-white p-2 shadow-xl shadow-[#1E2B3A]/10 transition-shadow hover:shadow-2xl hover:shadow-[#1E2B3A]/18 ${item.offset}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-[#E8EDF0]">
        <Image
          src={item.image}
          alt={item.title}
          fill
          sizes="(min-width: 1024px) 34vw, (min-width: 768px) 45vw, 100vw"
          className="object-cover transition duration-700 group-hover:scale-[1.045]"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#1E2B3A]/22 via-transparent to-white/18 opacity-70 transition-opacity duration-500 group-hover:opacity-35" />
        <motion.div
          aria-hidden
          animate={{ x: ['-140%', '150%'] }}
          transition={{ duration: 4.8, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-y-0 w-1/3 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/35 to-transparent"
        />
      </div>

      <div className="grid gap-3 px-2 pb-3 pt-4 sm:grid-cols-[56px_1fr] sm:px-3">
        <div>
          <span className="block text-xs font-extrabold text-[#1E2B3A]/45">{item.label}</span>
          <span className="mt-3 block h-2 w-10 rounded-full" style={{ backgroundColor: item.accent }} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[19px] font-extrabold leading-tight text-[#1E2B3A] md:text-xl">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#1E2B3A]/68">{item.description}</p>
        </div>
      </div>
    </motion.article>
  )
}

export default function HomeShowcase() {
  return (
    <section className="relative z-[90] overflow-hidden bg-[#F2F3F5] px-4 pb-20 pt-14 text-[#1E2B3A] sm:px-6 md:px-20 md:pb-36 md:pt-20">
      <div className="absolute left-0 top-20 h-px w-full bg-[#1E2B3A]/10" />
      <div className="absolute right-[-8%] top-0 hidden h-[62%] w-[42%] skew-x-[-12deg] bg-[#673AB8]/10 md:block" />
      <div className="absolute bottom-0 left-0 hidden h-[40%] w-full bg-gradient-to-t from-[#1E2B3A]/7 to-transparent md:block" />

      <div className="relative mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="grid items-end gap-8 lg:grid-cols-[1fr_0.82fr]">
          <div>
            <p className="mb-5 text-[13px] font-extrabold uppercase tracking-[0.22em] text-[#673AB8]">Showcase</p>
            <h2 className="max-w-5xl text-[38px] font-extrabold leading-[0.96] sm:text-[60px] md:text-[86px] lg:text-[96px]">
              Store visuals, built into the product story.
            </h2>
          </div>
          <div className="max-w-xl lg:justify-self-end">
            <p className="text-[15px] leading-7 text-[#1E2B3A]/74 sm:text-[16px] md:text-[18px] md:leading-8">
              AnnHub now reuses the Chrome Web Store artwork as a richer website journey: highlight, clip, label vocabulary, and tune the reading workflow before the footer closes the page.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-md border border-[#1E2B3A]/10 bg-white/72 px-2 py-4 text-center shadow-sm backdrop-blur sm:px-3">
                  <div className="text-[26px] font-extrabold leading-none text-[#673AB8] md:text-2xl">{metric.value}</div>
                  <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1E2B3A]/55 sm:text-[11px]">{metric.label}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          {...fadeUp}
          className="mt-12 overflow-hidden rounded-lg border border-[#1E2B3A]/10 bg-[#1E2B3A] shadow-2xl shadow-[#1E2B3A]/20 md:mt-16"
        >
          <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
            <div className="flex flex-col justify-between gap-7 p-6 text-white sm:gap-8 md:p-10">
              <div>
                <p className="mb-4 text-[13px] font-extrabold uppercase tracking-[0.22em] text-[#F5C542]">Chrome ready</p>
                <h3 className="max-w-xl text-[30px] font-extrabold leading-tight sm:text-[44px] md:text-[56px]">
                  A consistent install moment.
                </h3>
                <p className="mt-5 max-w-lg text-[15px] leading-7 text-white/72 sm:text-base">
                  The marquee and promo tiles stay visible as the anchor, while the screenshots unpack the real extension surfaces around them.
                </p>
              </div>

              <div className="grid gap-3 text-sm font-bold text-white/78">
                {showcaseItems.slice(0, 4).map((item) => (
                  <div key={item.title} className="flex items-center gap-3 rounded-md bg-white/7 px-3 py-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.accent }} />
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[340px] overflow-hidden bg-[#E8EDF0] p-4 sm:min-h-[430px] sm:p-6 md:p-8">
              <motion.div
                animate={{ y: [0, 9, 0], rotate: [-0.45, 0.25, -0.45] }}
                transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-20 overflow-hidden rounded-lg border border-white bg-white p-2 shadow-2xl"
              >
                <Image
                  src="/chrome-store/marquee-promo-tile-1400x560.png"
                  alt="AnnHub Chrome Web Store marquee promo tile"
                  width={1400}
                  height={560}
                  className="w-full rounded-md"
                  priority
                />
              </motion.div>

              <motion.div
                animate={{ x: [0, -10, 0], y: [0, 8, 0] }}
                transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-30 ml-auto mt-4 w-[62%] overflow-hidden rounded-lg border border-white bg-white p-2 shadow-xl sm:absolute sm:bottom-7 sm:right-8 sm:mt-0 sm:w-[42%]"
              >
                <Image src="/chrome-store/small-promo-tile-440x280.png" alt="AnnHub small Chrome Web Store promo tile" width={440} height={280} className="w-full rounded-md" />
              </motion.div>

              <motion.div
                aria-hidden
                animate={{ scaleX: [0.72, 1, 0.72], opacity: [0.18, 0.34, 0.18] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute bottom-10 left-10 h-2 w-44 origin-left rounded-full bg-[#673AB8]"
              />
            </div>
          </div>
        </motion.div>

        <div className="relative mt-12 md:mt-16">
          <div className="absolute left-1/2 top-10 hidden h-[calc(100%-5rem)] w-px -translate-x-1/2 bg-[#1E2B3A]/12 lg:block" />
          <div className="grid gap-5 md:grid-cols-2 lg:gap-x-10 lg:gap-y-12">
            {showcaseItems.map((item, index) => (
              <ShowcaseCard key={item.title} item={item} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
