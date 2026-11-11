/**
 * The ring around the selected step badge, with the × that deletes it; it never enters the ink.
 * Moved verbatim from layer.ts; the layer state arrives as the host.
 */
import { stepRadius } from '../screenshot/editor'
import { isUserInput } from '../user-input'
import { uiText } from '../ui-text'
import { ROOT_ATTR } from './annotation-roots'
import type { InkStroke } from './ink'

/** What the ring reads and keeps on the layer: where it lives, which badge is selected, and the delete path. */
export interface StepRingHost {
  doc: Document
  host: HTMLDivElement
  canvas: HTMLCanvasElement | null
  strokes: InkStroke[]
  selectedStep: InkStroke | null
  stepRingEl: HTMLDivElement | null
  scale(): number
  deleteSelectedStep(): void
}

export function ensureStepRing(host: StepRingHost): void {
  if (host.stepRingEl) return
  const ring = host.doc.createElement('div')
  ring.className = 'ann-annot-step-ring'
  ring.setAttribute(ROOT_ATTR, 'annotation-step-selection')
  ring.style.display = 'none'
  const remove = host.doc.createElement('button')
  remove.type = 'button'
  remove.textContent = '×'
  remove.setAttribute(ROOT_ATTR, 'annotation-step-delete')
  remove.addEventListener('click', event => {
    if (!isUserInput(event)) return
    host.deleteSelectedStep()
  })
  ring.appendChild(remove)
  host.host.appendChild(ring)
  host.stepRingEl = ring
}

export function positionStepRing(host: StepRingHost): void {
  const ring = host.stepRingEl
  if (!ring) return
  const step = host.selectedStep && host.strokes.includes(host.selectedStep) && host.selectedStep.tool === 'step' ? host.selectedStep : null
  if (!step) {
    ring.style.display = 'none'
    return
  }
  const scale = host.scale()
  const view = host.doc.defaultView!
  const radius = stepRadius(scale)
  const x = (step.points[0]!.x - view.scrollX) * scale
  const y = (step.points[0]!.y - view.scrollY) * scale
  Object.assign(ring.style, { display: 'block', left: `${x - radius}px`, top: `${y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px` })
  const sameGroup = host.strokes.filter(stroke => stroke.tool === 'step' && stroke.sequence === step.sequence)
  const number = sameGroup.indexOf(step) + 1
  const remove = ring.querySelector('button')!
  const label = uiText('shot.step.delete', { number })
  remove.title = label
  remove.setAttribute('aria-label', label)
}
