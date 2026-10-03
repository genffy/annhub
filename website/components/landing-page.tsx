'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpenCheck,
  Bookmark,
  Brain,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  GitBranch,
  Github,
  Highlighter,
  History,
  Laptop,
  Link2,
  LockKeyhole,
  MonitorUp,
  Network,
  PanelLeft,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
  X,
} from 'lucide-react'
import AnnMark from './ann-mark'
import type { LandingCopy } from '@/lib/landing-copy'

const ROADMAP_URL = 'https://github.com/genffy/annhub'

function WindowChrome({ label }: { label: string }) {
  return (
    <div className="flex h-9 items-center justify-between border-b border-[#1b2921]/10 bg-[#f4f3ed] px-3">
      <div className="flex gap-1.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#d7644d]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e4a832]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#2f7352]" />
      </div>
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1b2921]/50">{label}</span>
      <span className="w-10" />
    </div>
  )
}

function CaptureScene({ locale, compact = false }: { locale: string; compact?: boolean }) {
  const zh = locale === 'zh-CN'

  return (
    <div className={`relative overflow-hidden border border-[#1b2921]/14 bg-white shadow-[0_28px_70px_rgba(20,36,27,0.16)] ${compact ? 'rounded-md' : 'rounded-lg'}`}>
      <WindowChrome label={zh ? '浏览器 · 系统可靠性文档' : 'Browser · Reliability notes'} />
      <div className="grid min-h-[300px] grid-cols-[42px_1fr] bg-[#fbfaf6] sm:grid-cols-[128px_1fr]">
        <aside className="border-r border-[#1b2921]/8 bg-[#eef0e8] p-3">
          <div className="mb-4 hidden text-[10px] font-bold uppercase tracking-[0.16em] text-[#1f5d42] sm:block">Reliability</div>
          <div className="space-y-2">
            {[78, 92, 64, 86, 58].map((width, index) => (
              <div key={width} className={`h-1.5 bg-[#1b2921]/10 ${index === 2 ? 'bg-[#3157d5]/35' : ''}`} style={{ width: `${width}%` }} />
            ))}
          </div>
        </aside>

        <div className="relative p-5 sm:p-7">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1f5d42]">Distributed systems</div>
          <h3 className="max-w-lg text-[22px] font-bold leading-tight text-[#18211b] sm:text-[28px]">Backpressure and bounded queues</h3>
          <div className="mt-5 max-w-xl space-y-3 text-[11px] leading-5 text-[#24332a]/64 sm:text-[13px] sm:leading-6">
            <p>
              {zh
                ? '当消费者处理速度下降时，无边界队列会把短期压力转化为持续的内存增长。'
                : 'When consumers slow down, unbounded queues turn temporary pressure into sustained memory growth.'}
            </p>
            <p className="relative bg-[#f3dc7d]/72 px-1.5 py-1 text-[#18211b]">
              {zh
                ? 'Backpressure 让下游把可接收量反馈给上游，使生产速度与实际处理能力保持一致。'
                : 'Backpressure lets downstream consumers communicate available demand upstream, aligning production with actual capacity.'}
            </p>
            <p>
              {zh
                ? '关键不只是限制速率，还包括缓冲边界、暂停、丢弃策略和恢复语义。'
                : 'The key is not only rate limiting, but also buffer boundaries, pausing, dropping, and recovery semantics.'}
            </p>
          </div>

          <div className="absolute left-[22%] top-[48%] z-20 flex items-center border border-[#18211b]/15 bg-[#18211b] p-1.5 text-white shadow-xl sm:left-[32%] sm:top-[52%]">
            {[
              { Icon: Brain, label: zh ? 'Fragment' : 'Fragment', active: true },
              { Icon: Highlighter, label: zh ? '高亮' : 'Highlight' },
              { Icon: Bookmark, label: zh ? '剪藏' : 'Clip' },
            ].map(({ Icon, label, active }) => (
              <div key={label} className={`flex h-8 items-center gap-1.5 px-2 text-[10px] font-semibold ${active ? 'bg-[#3157d5]' : 'text-white/72'}`}>
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </div>
            ))}
          </div>

          <div className="absolute bottom-3 right-3 z-30 w-[68%] max-w-[310px] border border-[#1b2921]/14 bg-white shadow-[0_18px_45px_rgba(18,36,25,0.2)] sm:bottom-5 sm:right-5">
            <div className="flex items-center justify-between border-b border-[#1b2921]/9 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center bg-[#e9edf9] text-[#3157d5]">
                  <Brain size={13} />
                </span>
                <span className="text-[11px] font-bold text-[#18211b]">{zh ? '保存为概念' : 'Save as concept'}</span>
              </div>
              <X size={13} className="text-[#18211b]/38" />
            </div>
            <div className="space-y-2.5 p-3">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#18211b]/42">{zh ? '我的理解' : 'My interpretation'}</div>
                <div className="mt-1 border border-[#1b2921]/10 bg-[#f7f6f1] px-2 py-1.5 text-[10px] leading-4 text-[#18211b]/76">
                  {zh ? '下游把实际可接收量反馈给上游。' : 'Downstream communicates the amount it can actually accept.'}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#18211b]/42">{zh ? '准备如何使用' : 'Intended application'}</div>
                <div className="mt-1 border border-[#1b2921]/10 bg-[#f7f6f1] px-2 py-1.5 text-[10px] leading-4 text-[#18211b]/76">
                  {zh ? '检查事件管道为何在消费者变慢后耗尽内存。' : 'Diagnose why the event pipeline exhausts memory when consumers slow down.'}
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[9px] font-semibold text-[#1f5d42]">{zh ? '本地保存' : 'Saved locally'}</span>
                <span className="bg-[#3157d5] px-3 py-1.5 text-[9px] font-bold text-white">{zh ? '保存 Fragment' : 'Save Fragment'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DesktopTodayScene({ locale }: { locale: string }) {
  const zh = locale === 'zh-CN'
  return (
    <div className="overflow-hidden rounded-lg border border-[#1b2921]/16 bg-white shadow-[0_30px_80px_rgba(14,30,21,0.18)]">
      <WindowChrome label={zh ? 'AnnHub Desktop · 今日' : 'AnnHub Desktop · Today'} />
      <div className="grid min-h-[350px] grid-cols-[112px_1fr] sm:grid-cols-[150px_1fr]">
        <aside className="border-r border-[#1b2921]/10 bg-[#18211b] p-3 text-white">
          <div className="mb-5 flex items-center gap-2 text-sm font-bold">
            <AnnMark className="h-6 w-auto text-[#f3dc7d]" />
            <span>AnnHub</span>
          </div>
          <div className="space-y-1.5">
            {[
              { Icon: Target, label: zh ? '今日' : 'Today', active: true },
              { Icon: FileText, label: zh ? '碎片库' : 'Library' },
              { Icon: BookOpenCheck, label: zh ? '输出工坊' : 'Output' },
              { Icon: GitBranch, label: zh ? '关系' : 'Relations' },
              { Icon: MonitorUp, label: zh ? '系统' : 'System' },
            ].map(({ Icon, label, active }) => (
              <div key={label} className={`flex items-center gap-2 px-2 py-2 text-[10px] font-semibold ${active ? 'bg-white/12 text-white' : 'text-white/54'}`}>
                <Icon size={13} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </aside>
        <main className="bg-[#f7f6f1] p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#1f5d42]">Wednesday · Sep 23</p>
              <h3 className="mt-1 text-[24px] font-bold text-[#18211b]">{zh ? '今天需要完成什么' : 'What needs your attention today'}</h3>
            </div>
            <div className="border border-[#1b2921]/12 bg-white px-2 py-1.5 text-[9px] font-semibold text-[#1b2921]/62">{zh ? '刚刚同步' : 'Synced now'}</div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="border-l-4 border-[#3157d5] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#3157d5]">{zh ? '到期复习' : 'Due review'}</span>
                <span className="text-[10px] text-[#18211b]/46">{zh ? '约 6 分钟' : 'about 6 min'}</span>
              </div>
              <div className="mt-2 text-[30px] font-bold text-[#18211b]">8</div>
              <div className="mt-3 bg-[#3157d5] px-3 py-2 text-center text-[10px] font-bold text-white">{zh ? '开始复习' : 'Start review'}</div>
            </div>
            <div className="border-l-4 border-[#e4a832] bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#a76d00]">{zh ? '继续输出' : 'Continue output'}</div>
              <div className="mt-2 text-sm font-bold text-[#18211b]">{zh ? '设计支付系统失败重试策略' : 'Design a payment retry strategy'}</div>
              <div className="mt-3 flex items-center gap-2 text-[9px] text-[#18211b]/54">
                <History size={12} /> 3 / 5 Fragments
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <div className="bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1f5d42]">{zh ? '最近同步' : 'Recently synced'}</span>
                <Search size={13} className="text-[#18211b]/38" />
              </div>
              {['Backpressure', 'Retry storm', 'Idempotency'].map((item, index) => (
                <div key={item} className="mt-2 flex items-center justify-between border-t border-[#1b2921]/8 pt-2 text-[10px]">
                  <span className="font-semibold text-[#18211b]">{item}</span>
                  <span className="text-[#18211b]/42">{index === 0 ? 'concept' : index === 1 ? 'claim' : 'concept'}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#e8eee9] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1f5d42]">{zh ? '待确认关系' : 'Relation suggestions'}</div>
              <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-[#18211b]">
                <Network size={14} /> Backpressure
              </div>
              <div className="my-2 h-px bg-[#1b2921]/12" />
              <div className="flex items-center gap-2 text-[10px] font-semibold text-[#18211b]">
                <Link2 size={14} /> Bounded queues
              </div>
              <div className="mt-3 text-[9px] leading-4 text-[#18211b]/58">{zh ? '建议：prerequisite · 需要确认' : 'Suggested: prerequisite · needs confirmation'}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function ReviewScene({ locale }: { locale: string }) {
  const zh = locale === 'zh-CN'
  return (
    <div className="overflow-hidden rounded-lg border border-[#1b2921]/15 bg-white shadow-[0_24px_60px_rgba(18,35,25,0.14)]">
      <WindowChrome label={zh ? 'AnnHub Desktop · 复习 3/8' : 'AnnHub Desktop · Review 3/8'} />
      <div className="grid min-h-[310px] bg-[#f7f6f1] p-5 sm:p-8">
        <div className="mx-auto flex w-full max-w-xl flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] font-semibold text-[#18211b]/48">
              <span>concept</span>
              <span>3 / 8</span>
            </div>
            <h3 className="mt-6 text-[24px] font-bold leading-tight text-[#18211b] sm:text-[30px]">
              {zh ? '用自己的话解释 Backpressure，并给出一个适用边界。' : 'Explain Backpressure in your own words and name one boundary.'}
            </h3>
            <div className="mt-5 min-h-[74px] border border-[#1b2921]/12 bg-white p-3 text-[11px] leading-5 text-[#18211b]/52">{zh ? '输入你的回答…' : 'Write your answer…'}</div>
            <div className="mt-3 flex gap-2">
              <span className="border border-[#1b2921]/10 bg-[#eef0e8] px-2 py-1 text-[9px] text-[#18211b]/60">{zh ? '显示结构提示' : 'Show structure hint'}</span>
              <span className="border border-[#1b2921]/10 bg-[#eef0e8] px-2 py-1 text-[9px] text-[#18211b]/60">{zh ? '显示来源' : 'Show source'}</span>
            </div>
          </div>
          <div className="mt-7 grid grid-cols-4 gap-2">
            {[
              [zh ? '重来' : 'Again', '#d7644d'],
              [zh ? '困难' : 'Hard', '#c98516'],
              [zh ? '良好' : 'Good', '#3157d5'],
              [zh ? '简单' : 'Easy', '#1f5d42'],
            ].map(([label, color]) => (
              <div key={label} className="border px-2 py-2 text-center text-[9px] font-bold" style={{ borderColor: color, color }}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function OutputScene({ locale }: { locale: string }) {
  const zh = locale === 'zh-CN'
  return (
    <div className="overflow-hidden rounded-lg border border-[#1b2921]/15 bg-white shadow-[0_24px_60px_rgba(18,35,25,0.14)]">
      <WindowChrome label={zh ? 'AnnHub Desktop · 输出工坊' : 'AnnHub Desktop · Output Workshop'} />
      <div className="grid min-h-[320px] grid-cols-[0.72fr_1.28fr] bg-[#f7f6f1]">
        <aside className="border-r border-[#1b2921]/10 bg-[#eef0e8] p-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#1f5d42]">{zh ? '目标 Fragment' : 'Target Fragments'}</div>
          {[
            ['Backpressure', true],
            ['Retry storm', true],
            ['Idempotency', false],
          ].map(([label, used]) => (
            <div key={String(label)} className="mt-3 border-b border-[#1b2921]/10 pb-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-[#18211b]">
                {used ? <Check size={12} className="text-[#1f5d42]" /> : <CircleHelp size={12} className="text-[#a76d00]" />}
                {label}
              </div>
              <div className="ml-5 mt-1 text-[8px] text-[#18211b]/48">{used ? (zh ? '可能已使用' : 'possibly used') : zh ? '尚未检测到' : 'not detected'}</div>
            </div>
          ))}
        </aside>
        <main className="p-4 sm:p-5">
          <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#3157d5]">{zh ? '真实任务' : 'Real task'}</div>
          <h3 className="mt-1 text-[17px] font-bold text-[#18211b]">{zh ? '为支付系统设计失败重试策略' : 'Design a failure retry strategy for payments'}</h3>
          <div className="mt-4 border border-[#1b2921]/10 bg-white p-3 text-[10px] leading-5 text-[#18211b]/72">
            {zh
              ? '当下游依赖已经饱和时，固定次数重试会放大流量。客户端应使用带抖动的指数退避，并让队列容量和 Backpressure 信号共同限制并发…'
              : 'When a downstream dependency is saturated, fixed retries amplify load. Clients should use exponential backoff with jitter while bounded queues and Backpressure signals limit concurrency…'}
          </div>
          <div className="mt-4 border-l-4 border-[#d7644d] bg-[#f6e9e5] p-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#a43e2b]">Backpressure · {zh ? '需要修正' : 'needs revision'}</div>
            <p className="mt-1 text-[9px] leading-4 text-[#18211b]/66">
              {zh
                ? '这里描述的是固定限流。请说明消费者如何把可接收量反馈给生产者。'
                : 'This describes fixed rate limiting. Explain how the consumer communicates available demand upstream.'}
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

function WorkflowVisual({ id, locale }: { id: string; locale: string }) {
  if (id === 'capture' || id === 'process') return <CaptureScene locale={locale} compact />
  if (id === 'review') return <ReviewScene locale={locale} />
  return <OutputScene locale={locale} />
}

function SectionHeading({ eyebrow, title, description, light = false }: { eyebrow: string; title: string; description?: string; light?: boolean }) {
  return (
    <div className="max-w-3xl">
      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${light ? 'text-[#f4ce72]' : 'text-[#6f5ce7]'}`}>{eyebrow}</p>
      <h2 className={`mt-4 text-[34px] font-semibold leading-[1.08] tracking-normal sm:text-[44px] lg:text-[50px] ${light ? 'text-white' : 'text-[#25232b]'}`}>{title}</h2>
      {description ? <p className={`mt-5 max-w-2xl text-[15px] leading-7 ${light ? 'text-white/68' : 'text-[#403d49]/66'}`}>{description}</p> : null}
    </div>
  )
}

export default function LandingPage({ copy }: { copy: LandingCopy }) {
  const [activeWorkflow, setActiveWorkflow] = useState<string>(copy.workflow.steps[0].id)
  const currentYear = useMemo(() => new Date().getFullYear(), [])

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f2f7] text-[#25232b]">
      <header className="absolute inset-x-3 top-3 z-50 text-[#25232b] sm:inset-x-5 sm:top-5">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center justify-between rounded-lg border border-[#292631]/10 bg-white/94 px-4 shadow-[0_14px_40px_rgba(48,41,70,0.12)] backdrop-blur-md sm:px-5">
          <Link href={`/${copy.locale}`} className="flex items-center gap-2.5 font-bold no-underline">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#6f5ce7] text-white">
              <AnnMark className="h-5 w-auto" />
            </span>
            <span className="text-[15px]">AnnHub</span>
          </Link>
          <nav className="hidden items-center gap-6 text-[12px] font-semibold text-[#403d49]/66 md:flex">
            <a href="#workflow" className="transition hover:text-[#6f5ce7]">
              {copy.nav.workflow}
            </a>
            <a href="#use-case" className="transition hover:text-[#6f5ce7]">
              {copy.nav.useCase}
            </a>
            <a href="#product" className="transition hover:text-[#6f5ce7]">
              {copy.nav.product}
            </a>
            <a href="#principles" className="transition hover:text-[#6f5ce7]">
              {copy.nav.principles}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={copy.languageHref}
              className="flex h-9 items-center rounded-md border border-[#292631]/12 px-3 text-[10px] font-bold text-[#403d49]/70 transition hover:border-[#6f5ce7]/40 hover:text-[#6f5ce7]"
            >
              {copy.languageLabel}
            </Link>
            <Link
              href={ROADMAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center rounded-md bg-[#6f5ce7] px-4 text-[10px] font-bold text-white transition hover:bg-[#5d4acb] sm:flex"
            >
              {copy.hero.cta}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative min-h-[720px] overflow-hidden bg-[#f4f2f7] px-4 pb-10 pt-24 sm:px-6 sm:pt-28 lg:min-h-[860px] lg:px-10">
        <div className="absolute left-[4%] top-[24%] h-[52%] w-[34%] rounded-lg bg-[#e9e4f6]" />
        <div className="absolute right-[6%] top-[15%] h-[38%] w-[28%] rounded-lg bg-[#dfece8]" />
        <div className="relative z-10 mx-auto max-w-[1320px]">
          <div className="max-w-[850px]">
            <p className="inline-flex items-center gap-2 rounded-md border border-[#6f5ce7]/20 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#6f5ce7] shadow-sm">
              <Sparkles size={13} /> {copy.hero.eyebrow}
            </p>
            <h1 className="mt-5 max-w-[850px] text-[42px] font-semibold leading-[1.02] tracking-normal text-[#25232b] sm:text-[58px] lg:text-[66px]">
              <span className="text-[#6f5ce7]">AnnHub</span>
              <span className="mx-2 text-[#25232b]/24">/</span>
              {copy.locale === 'zh-CN' ? '把网页中的知识，用在真实工作里' : 'Turn web knowledge into real work'}
            </h1>
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-2xl text-[15px] leading-7 text-[#403d49]/68 sm:text-[17px]">{copy.hero.description}</p>
              <div className="flex flex-none gap-2">
                <Link
                  href={ROADMAP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-[#6f5ce7] px-4 text-[11px] font-bold text-white transition hover:bg-[#5d4acb]"
                >
                  {copy.hero.cta} <ArrowRight size={16} />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-[#292631]/14 bg-white px-4 text-[11px] font-bold text-[#403d49] transition hover:border-[#6f5ce7]/36 hover:text-[#6f5ce7]"
                >
                  {copy.hero.secondary} <ChevronRight size={16} />
                </a>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 text-[10px] text-[#403d49]/50">
              <ShieldCheck size={14} className="text-[#4f856e]" />
              {copy.hero.note}
            </div>
          </div>

          <div className="relative mt-10 hidden min-h-[485px] md:block">
            <div className="absolute left-0 top-8 z-20 w-[58%] rotate-[-0.8deg]">
              <CaptureScene locale={copy.locale} />
            </div>
            <div className="absolute right-0 top-0 z-10 w-[47%] rotate-[0.8deg]">
              <DesktopTodayScene locale={copy.locale} />
            </div>
            <div className="absolute bottom-[-18px] right-[6%] z-30 w-[34%] rotate-[-1deg]">
              <ReviewScene locale={copy.locale} />
            </div>
            <div className="absolute bottom-4 left-[48%] z-40 rounded-md bg-[#f3c86b] px-4 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#40331a] shadow-lg">
              {copy.hero.preview}
            </div>
          </div>

          <div className="relative mt-8 h-[250px] overflow-hidden rounded-lg border border-[#292631]/10 bg-white md:hidden">
            <div className="absolute left-3 top-3 w-[112%] rotate-[-1deg] opacity-95">
              <CaptureScene locale={copy.locale} compact />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-[1280px]">
          <SectionHeading eyebrow={copy.problem.eyebrow} title={copy.problem.title} />
          <div className="mt-12 grid border-y border-[#1b2921]/14 md:grid-cols-3">
            {copy.problem.items.map((item, index) => (
              <article key={item.title} className={`py-7 md:px-7 ${index > 0 ? 'border-t border-[#1b2921]/14 md:border-l md:border-t-0' : ''}`}>
                <div className="flex items-start gap-4">
                  <span className="text-[12px] font-bold text-[#d7644d]">0{index + 1}</span>
                  <div>
                    <h3 className="text-[19px] font-bold">{item.title}</h3>
                    <p className="mt-2 text-[14px] leading-6 text-[#24332a]/64">{item.body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="bg-[#ece9f2] px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1280px]">
          <SectionHeading eyebrow={copy.workflow.eyebrow} title={copy.workflow.title} description={copy.workflow.description} />
          <div className="mt-12 grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div className="border-y border-[#1b2921]/14">
              {copy.workflow.steps.map(step => {
                const active = step.id === activeWorkflow
                return (
                  <button
                    key={step.id}
                    onClick={() => setActiveWorkflow(step.id)}
                    className={`grid w-full grid-cols-[42px_1fr_24px] items-start gap-3 border-b border-[#1b2921]/10 px-2 py-5 text-left transition last:border-b-0 ${active ? 'bg-white' : 'hover:bg-white/50'}`}
                  >
                    <span className={`pt-1 text-[10px] font-bold ${active ? 'text-[#3157d5]' : 'text-[#18211b]/34'}`}>{step.index}</span>
                    <span>
                      <span className={`block text-[17px] font-bold ${active ? 'text-[#18211b]' : 'text-[#18211b]/68'}`}>{step.title}</span>
                      <span className="mt-1.5 block text-[13px] leading-6 text-[#24332a]/58">{step.body}</span>
                    </span>
                    <ChevronRight size={16} className={`mt-1 transition ${active ? 'translate-x-0 text-[#3157d5]' : '-translate-x-1 text-[#18211b]/22'}`} />
                  </button>
                )
              })}
            </div>
            <motion.div key={activeWorkflow} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <WorkflowVisual id={activeWorkflow} locale={copy.locale} />
            </motion.div>
          </div>
        </div>
      </section>

      <section id="use-case" className="bg-white px-4 py-20 text-[#25232b] sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1280px]">
          <SectionHeading eyebrow={copy.story.eyebrow} title={copy.story.title} description={copy.story.description} />
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:items-start">
            {copy.story.stages.map((stage, index) => (
              <article
                key={stage.title}
                className={`relative min-h-[230px] rounded-lg border border-[#292631]/8 p-5 ${
                  ['bg-[#eee9fb]', 'bg-[#e2efea] lg:translate-y-8', 'bg-[#f7edcf]', 'bg-[#e3edf8] lg:translate-y-4'][index]
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6f5ce7]">{stage.label}</span>
                  <span className="text-[11px] font-semibold text-[#403d49]/35">0{index + 1}</span>
                </div>
                <h3 className="mt-8 text-[19px] font-semibold leading-snug">{stage.title}</h3>
                <p className="mt-3 text-[13px] leading-6 text-[#403d49]/62">{stage.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-20 grid gap-6 lg:grid-cols-[0.28fr_0.72fr] lg:items-end">
            <div className="pb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6f5ce7]">Selected output</p>
              <p className="mt-3 text-[14px] leading-7 text-[#403d49]/64">
                {copy.locale === 'zh-CN'
                  ? '知识只有进入真实方案、分析或复盘，才暴露出理解错误和适用边界。'
                  : 'Knowledge reveals its gaps only when it enters a real design, analysis, or retrospective.'}
              </p>
            </div>
            <OutputScene locale={copy.locale} />
          </div>
        </div>
      </section>

      <section id="product" className="bg-[#f4f2f7] px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1280px]">
          <SectionHeading eyebrow={copy.product.eyebrow} title={copy.product.title} />
          <div className="mt-14 grid gap-16 lg:gap-24">
            <div className="grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <div className="flex h-10 w-10 items-center justify-center bg-[#e9edf9] text-[#3157d5]">
                  <PanelLeft size={20} />
                </div>
                <h3 className="mt-5 text-[28px] font-bold">{copy.product.extension.title}</h3>
                <p className="mt-4 text-[15px] leading-7 text-[#24332a]/66">{copy.product.extension.body}</p>
                <ul className="mt-6 space-y-3">
                  {copy.product.extension.bullets.map(item => (
                    <li key={item} className="flex gap-3 text-[13px] text-[#18211b]/72">
                      <Check size={15} className="mt-0.5 flex-none text-[#1f5d42]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <CaptureScene locale={copy.locale} />
            </div>
            <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="lg:order-2">
                <div className="flex h-10 w-10 items-center justify-center bg-[#e8eee9] text-[#1f5d42]">
                  <Laptop size={20} />
                </div>
                <h3 className="mt-5 text-[28px] font-bold">{copy.product.desktop.title}</h3>
                <p className="mt-4 text-[15px] leading-7 text-[#24332a]/66">{copy.product.desktop.body}</p>
                <ul className="mt-6 space-y-3">
                  {copy.product.desktop.bullets.map(item => (
                    <li key={item} className="flex gap-3 text-[13px] text-[#18211b]/72">
                      <Check size={15} className="mt-0.5 flex-none text-[#1f5d42]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:order-1">
                <DesktopTodayScene locale={copy.locale} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="principles" className="bg-white px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1280px]">
          <SectionHeading eyebrow={copy.principles.eyebrow} title={copy.principles.title} />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[Target, Workflow, Sparkles, LockKeyhole].map((Icon, index) => {
              const item = copy.principles.items[index]
              return (
                <article key={item.title} className={`min-h-[240px] rounded-lg p-6 ${['bg-[#eee9fb]', 'bg-[#e2efea]', 'bg-[#f7edcf]', 'bg-[#e3edf8]'][index]}`}>
                  <Icon size={20} className={index % 2 === 0 ? 'text-[#3157d5]' : 'text-[#1f5d42]'} />
                  <h3 className="mt-5 text-[17px] font-bold leading-snug">{item.title}</h3>
                  <p className="mt-3 text-[13px] leading-6 text-[#24332a]/62">{item.body}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#ebe7f5] px-4 py-20 text-[#25232b] sm:px-6 lg:px-10 lg:py-24">
        <div className="mx-auto grid max-w-[1280px] gap-10 lg:grid-cols-[1fr_0.72fr] lg:items-end">
          <SectionHeading eyebrow={copy.trust.eyebrow} title={copy.trust.title} description={copy.trust.body} />
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[#292631]/10 bg-white/72 shadow-[0_16px_40px_rgba(48,41,70,0.08)]">
            {copy.trust.items.map((item, index) => (
              <div
                key={item}
                className={`flex min-h-[92px] items-center gap-3 p-4 text-[12px] font-semibold text-[#403d49]/76 ${index % 2 === 1 ? 'border-l border-[#292631]/10' : ''} ${index > 1 ? 'border-t border-[#292631]/10' : ''}`}
              >
                <ShieldCheck size={17} className="flex-none text-[#6f5ce7]" /> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f4f2f7] px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[980px]">
          <SectionHeading eyebrow={copy.faq.eyebrow} title={copy.faq.title} />
          <div className="mt-10 overflow-hidden rounded-lg border border-[#292631]/10 bg-white px-5 shadow-[0_16px_44px_rgba(48,41,70,0.08)] sm:px-7">
            {copy.faq.items.map(item => (
              <details key={item.q} className="group border-b border-[#292631]/9 last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[16px] font-semibold marker:hidden">
                  {item.q}
                  <ChevronRight size={18} className="flex-none text-[#6f5ce7] transition group-open:rotate-90" />
                </summary>
                <p className="max-w-3xl pb-6 text-[14px] leading-7 text-[#403d49]/66">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#292631]/10 bg-[#ece9f2] px-4 py-12 text-[#25232b] sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5 text-lg font-bold">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#6f5ce7] text-white">
                <AnnMark className="h-6 w-auto" />
              </span>
              AnnHub
            </div>
            <p className="mt-4 max-w-md text-[13px] leading-6 text-[#403d49]/58">{copy.footer.line}</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-[11px] font-semibold text-[#403d49]/58">
            <Link href={ROADMAP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-[#6f5ce7]">
              <Github size={13} />
              {copy.footer.roadmap}
            </Link>
            <Link href="https://github.com/genffy/annhub" target="_blank" rel="noopener noreferrer" className="hover:text-[#6f5ce7]">
              {copy.footer.github}
            </Link>
            <Link href="/privacy-policy.html" className="hover:text-[#6f5ce7]">
              {copy.footer.privacy}
            </Link>
            <Link href="/terms-of-service.html" className="hover:text-[#6f5ce7]">
              {copy.footer.terms}
            </Link>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-[1280px] border-t border-[#292631]/10 pt-5 text-[10px] text-[#403d49]/38">© {currentYear} AnnHub</div>
      </footer>
    </main>
  )
}
