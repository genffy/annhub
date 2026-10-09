import type { CSSProperties, ReactNode } from 'react'
import { Bookmark, Calendar, CalendarClock, Check as CheckIcon, Hash, Highlighter, List, Scan, SquareCheck, Text as TextLines } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { EntryType, HighlightColor, PropertyType, ThumbKind } from './types'

/** A lucide icon drawn the way the design draws them: 2px stroke, 16px, never read out by a screen reader. */
export function Ic({ icon: Icon, size = 16, className }: { icon: LucideIcon; size?: number; className?: string }) {
  return <Icon aria-hidden="true" size={size} strokeWidth={2} className={className ? `ah-i ${className}` : 'ah-i'} />
}

export const TYPE_ICON: Record<EntryType | 'highlight', LucideIcon> = { clip: Bookmark, screenshot: Scan, highlight: Highlighter }

export const PROPERTY_ICON: Record<PropertyType, LucideIcon> = {
  text: TextLines,
  list: List,
  number: Hash,
  checkbox: SquareCheck,
  date: Calendar,
  datetime: CalendarClock,
}

export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

/** "共 {n} 条" -> "共 95 条" */
export function fmt(template: string, n: number | string): string {
  return template.replace('{n}', String(n))
}

/** English needs "1 entry" but "2 entries"; Chinese passes the same string twice. */
export function plural(n: number, many: string, one: string): string {
  return fmt(n === 1 ? one : many, n)
}

export function TypeChip({ type, label, small }: { type: EntryType | 'highlight'; label: string; small?: boolean }) {
  return (
    <span className={`ah-tchip ah-t-${type}${small ? ' sm' : ''}`}>
      <Ic icon={TYPE_ICON[type]} />
      {label}
    </span>
  )
}

export function TypeTile({ type }: { type: EntryType | 'highlight' }) {
  return (
    <span className={`ah-ttile ah-t-${type}`}>
      <Ic icon={TYPE_ICON[type]} />
    </span>
  )
}

export function Tags({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map(tag => (
        <span key={tag} className="ah-tag">
          #{tag}
        </span>
      ))}
    </>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ah-kbd">{children}</kbd>
}

export function HlDot({ color, on }: { color: HighlightColor; on?: boolean }) {
  return <i className={`ah-hl-dot ah-c-${color}${on ? ' is-on' : ''}`} />
}

export function Checkbox({ on, label }: { on: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <i className={`ah-cb${on ? ' on' : ''}`}>{on ? <Ic icon={CheckIcon} /> : null}</i>
      {label ? <span>{label}</span> : null}
    </span>
  )
}

/** Numbered amber pin from the design boards; the parent must be `position: relative`. */
export function Pin({ n, style }: { n: number; style?: CSSProperties }) {
  return (
    <i className="ah-pin" style={style} aria-hidden="true">
      {n}
    </i>
  )
}

// ── thumbnails of a saved screenshot (docs/design/v2/js/app-parts.js) ────────────────────────────
function Chart() {
  return (
    <svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="168" height="112" fill="#fff" />
      <path d="M10 24H160M10 52H160M10 80H160" stroke="#e6e8ee" strokeWidth="1" />
      <path d="M10 88 L38 86 L62 87 L84 84 L96 58 L108 30 L124 22 L142 26 L160 24" fill="none" stroke="#3b6fe0" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M96 12 V98" stroke="#e5484d" strokeWidth="1.6" strokeDasharray="3 3" />
      <circle cx="108" cy="30" r="7" fill="none" stroke="#e5484d" strokeWidth="1.8" />
      <text x="14" y="15" fontSize="8" fill="#6b7280" fontFamily="sans-serif">
        downstream p99
      </text>
    </svg>
  )
}

function Diagram() {
  return (
    <svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="168" height="112" fill="#fff" />
      <g fill="#eef2ff" stroke="#6b7bd6" strokeWidth="1.6">
        <rect x="14" y="40" width="40" height="30" rx="6" />
        <rect x="64" y="14" width="40" height="30" rx="6" />
        <rect x="64" y="66" width="40" height="30" rx="6" />
        <rect x="114" y="40" width="40" height="30" rx="6" />
      </g>
      <g stroke="#9aa1b2" strokeWidth="1.6" fill="none">
        <path d="M54 52 L64 34" />
        <path d="M54 58 L64 78" />
        <path d="M104 32 L114 48" />
        <path d="M104 80 L114 62" />
      </g>
      <g fontSize="7" fill="#4b5563" fontFamily="sans-serif">
        <text x="20" y="58">
          closed
        </text>
        <text x="70" y="32">
          open
        </text>
        <text x="68" y="84">
          half-open
        </text>
        <text x="120" y="58">
          probe
        </text>
      </g>
    </svg>
  )
}

function Table() {
  return (
    <svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="168" height="112" fill="#fff" />
      <rect x="10" y="12" width="148" height="16" fill="#f3f4f8" />
      <path d="M10 44H158M10 60H158M10 76H158M10 92H158" stroke="#e6e8ee" strokeWidth="1" />
      <g fontSize="7" fill="#4b5563" fontFamily="sans-serif">
        <text x="16" y="23">
          service
        </text>
        <text x="66" y="23">
          budget
        </text>
        <text x="116" y="23">
          used
        </text>
        <text x="16" y="55">
          gateway
        </text>
        <text x="66" y="55">
          10%
        </text>
        <text x="116" y="55">
          7%
        </text>
        <text x="16" y="71">
          ledger
        </text>
        <text x="66" y="71">
          5%
        </text>
        <text x="116" y="71">
          9%
        </text>
        <text x="16" y="87">
          notify
        </text>
        <text x="66" y="87">
          20%
        </text>
        <text x="116" y="87">
          3%
        </text>
      </g>
    </svg>
  )
}

function Bars() {
  return (
    <svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="168" height="112" fill="#fff" />
      <path d="M12 92H156" stroke="#d6d9e2" />
      <g fill="#7c8be0">
        <rect x="22" y="62" width="16" height="30" />
        <rect x="48" y="48" width="16" height="44" />
        <rect x="74" y="30" width="16" height="62" />
        <rect x="100" y="52" width="16" height="40" />
        <rect x="126" y="70" width="16" height="22" />
      </g>
      <text x="14" y="16" fontSize="8" fill="#6b7280" fontFamily="sans-serif">
        error rate by hour
      </text>
    </svg>
  )
}

export function ThumbArt({ kind }: { kind: ThumbKind }) {
  return { chart: <Chart />, diagram: <Diagram />, table: <Table />, bars: <Bars /> }[kind]
}

export function Thumb({ kind }: { kind: ThumbKind }) {
  return (
    <div className="ah-thumb">
      <ThumbArt kind={kind} />
    </div>
  )
}
