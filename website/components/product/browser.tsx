import type { CSSProperties, ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Lock, Plus, Puzzle, RotateCcw, X } from 'lucide-react'
import Logo from '../logo'
import { Ic } from './parts'

/** A Chrome window with the AnnHub icon in its toolbar. `height` is the whole window, so scenes can be placed by pixel. */
export function BrowserFrame({
  title,
  url,
  tab2,
  width,
  height,
  children,
  className = '',
  style,
}: {
  title: string
  url: string
  tab2?: string
  width?: number
  /** Omit to size the window with CSS. */
  height?: number
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`ah ah-bf ${className}`} style={{ width, height, ...style }}>
      <div className="ah-bf-tabs">
        <div className="ah-bf-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="ah-bf-tab">
          <span className="ah-favicon" />
          <span className="ah-truncate ah-grow">{title}</span>
          <Ic icon={X} size={13} />
        </div>
        {tab2 ? (
          <div className="ah-bf-tab">
            <span className="ah-favicon b" />
            <span className="ah-truncate ah-grow">{tab2}</span>
            <Ic icon={X} size={13} />
          </div>
        ) : (
          <div className="ah-bf-tab off">
            <Ic icon={Plus} size={13} />
          </div>
        )}
      </div>
      <div className="ah-bf-bar">
        <Ic icon={ArrowLeft} />
        <Ic icon={ArrowRight} />
        <Ic icon={RotateCcw} />
        <div className="ah-bf-url">
          <Ic icon={Lock} size={13} />
          <span className="ah-truncate">{url}</span>
        </div>
        <div className="ah-bf-ext">
          <Ic icon={Puzzle} />
          <Logo className="ah-i ah-brandmark" />
        </div>
      </div>
      <div className="ah-bf-view">{children}</div>
    </div>
  )
}
