import { describe, expect, it } from 'vitest'
import { clipPolyline, clipSegment, inkToEditorAnnotations, inkToViewport, snapshotInk, type InkStroke } from '../ink'

/**
 * annotate.md §1.3: the page's ink becomes editor annotations over the frame
 * that was captured — fully-inside strokes keep their editor shape, fully
 * outside ones are out, crossing ones are cut at the boundary (a cut
 * rectangle is no longer a rectangle, so it travels as a polyline). The
 * conversion is the one place that maps viewport coordinates through a frame
 * origin and a device pixel ratio, so every case here is a pixel case.
 */

const pen = (points: [number, number][], extra: Partial<InkStroke> = {}): InkStroke => ({
  id: 's1',
  tool: 'pen',
  points: points.map(([x, y]) => ({ x, y })),
  color: '#e5484d',
  width: 'medium',
  ...extra,
})

describe('clipSegment', () => {
  const rect = { x: 10, y: 10, width: 100, height: 100 }

  it('keeps a segment entirely inside', () => {
    expect(clipSegment({ x: 20, y: 20 }, { x: 50, y: 60 }, rect)).toEqual([
      { x: 20, y: 20 },
      { x: 50, y: 60 },
    ])
  })

  it('returns null for a segment entirely outside', () => {
    expect(clipSegment({ x: 0, y: 0 }, { x: 5, y: 5 }, rect)).toBeNull()
    expect(clipSegment({ x: 200, y: 200 }, { x: 300, y: 300 }, rect)).toBeNull()
  })

  it('cuts both ends of a segment crossing the whole rect', () => {
    const [a, b] = clipSegment({ x: 0, y: 60 }, { x: 200, y: 60 }, rect)!
    expect(a.x).toBeCloseTo(10)
    expect(b.x).toBeCloseTo(110)
    expect(a.y).toBe(60)
    expect(b.y).toBe(60)
  })

  it('keeps the inside endpoint of a segment with one end in', () => {
    const [a, b] = clipSegment({ x: 50, y: 50 }, { x: 300, y: 50 }, rect)!
    expect(a).toEqual({ x: 50, y: 50 })
    expect(b.x).toBe(110)
  })
})

describe('clipPolyline', () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 }

  it('splits a polyline into its inside runs', () => {
    const runs = clipPolyline(
      [
        { x: -10, y: 50 },
        { x: 50, y: 50 },
        { x: 150, y: 50 },
        { x: 150, y: 20 },
        { x: 50, y: 20 },
      ],
      rect,
    )
    expect(runs).toHaveLength(2)
    expect(runs[0]).toEqual([
      { x: 0, y: 50 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ])
    expect(runs[1]).toEqual([
      { x: 100, y: 20 },
      { x: 50, y: 20 },
    ])
  })

  it('returns nothing for a polyline that never enters', () => {
    expect(
      clipPolyline(
        [
          { x: -10, y: -10 },
          { x: -10, y: 200 },
        ],
        rect,
      ),
    ).toEqual([])
  })

  it('keeps a segment that crosses the rect between two samples outside it', () => {
    expect(
      clipPolyline(
        [
          { x: -50, y: 50 },
          { x: 150, y: 50 },
        ],
        rect,
      ),
    ).toEqual([
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
    ])
  })
})

describe('inkToEditorAnnotations', () => {
  // a 100×200 CSS frame captured at 2× → canvas 200×400
  const frame = { x: 50, y: 30, width: 100, height: 200 }
  const dpr = 2

  it('maps a fully inside pen stroke through the frame origin and the ratio', () => {
    const [annotation] = inkToEditorAnnotations(
      [
        pen([
          [60, 40],
          [80, 60],
        ]),
      ],
      frame,
      dpr,
    )
    expect(annotation).toMatchObject({
      tool: 'pen',
      start: { x: 20, y: 20 },
      end: { x: 60, y: 60 },
      width: 'medium',
    })
    expect(annotation.tool === 'pen' && annotation.points).toEqual([
      { x: 20, y: 20 },
      { x: 60, y: 60 },
    ])
  })

  it('drops a stroke fully outside the frame', () => {
    const out = inkToEditorAnnotations(
      [
        pen([
          [0, 0],
          [10, 10],
        ]),
      ],
      frame,
      dpr,
    )
    expect(out).toEqual([])
  })

  it('cuts a pen stroke crossing the boundary and keeps the piece inside', () => {
    const [first, ...rest] = inkToEditorAnnotations(
      [
        pen([
          [40, 40],
          [100, 40],
        ]),
      ],
      frame,
      dpr,
    )
    expect(rest).toEqual([])
    expect(first.tool).toBe('pen')
    if (first.tool !== 'pen') return
    // the stroke enters at frame.x = 50 → canvas x = 0
    expect(first.points[0]).toEqual({ x: 0, y: 20 })
    expect(first.points[first.points.length - 1]).toEqual({ x: 100, y: 20 })
  })

  it('splits a pen stroke that leaves and re-enters the frame', () => {
    const annotations = inkToEditorAnnotations(
      [
        pen([
          [60, 40],
          [200, 40],
          [200, 100],
          [70, 100],
        ]),
      ],
      frame,
      dpr,
    )
    expect(annotations).toHaveLength(2)
    expect(annotations.every(annotation => annotation.tool === 'pen')).toBe(true)
  })

  it('maps a fully inside rectangle to the editor shape, and a crossing one to polylines', () => {
    const inside = inkToEditorAnnotations(
      [
        {
          id: 'r1',
          tool: 'rectangle',
          points: [
            { x: 60, y: 40 },
            { x: 90, y: 80 },
          ],
          color: '#e5484d',
        },
      ],
      frame,
      dpr,
    )
    expect(inside).toHaveLength(1)
    expect(inside[0]).toMatchObject({ tool: 'rectangle', start: { x: 20, y: 20 }, end: { x: 80, y: 100 } })

    const crossing = inkToEditorAnnotations(
      [
        {
          id: 'r2',
          tool: 'rectangle',
          points: [
            { x: 40, y: 40 },
            { x: 90, y: 80 },
          ],
          color: '#e5484d',
        },
      ],
      frame,
      dpr,
    )
    // a cut rectangle is its clipped edges, not a smaller rectangle: top, right and bottom cross the
    // frame's left edge and come back as polylines; the left edge lies fully outside and is out
    expect(crossing.every(annotation => annotation.tool === 'polyline')).toBe(true)
    expect(crossing).toHaveLength(3)
    const widths = crossing.map(annotation => (annotation.tool === 'polyline' ? annotation.pixelWidth : 0))
    expect(widths).toEqual([6, 6, 6]) // 3 CSS px × 2
  })

  it('cuts a crossing ellipse into the runs inside the frame', () => {
    const annotations = inkToEditorAnnotations(
      [
        {
          id: 'e1',
          tool: 'ellipse',
          points: [
            { x: 40, y: 100 },
            { x: 140, y: 160 },
          ],
          color: '#e5484d',
        },
      ],
      frame,
      dpr,
    )
    expect(annotations.length).toBeGreaterThanOrEqual(2)
    expect(annotations.every(annotation => annotation.tool === 'polyline')).toBe(true)
  })

  it('maps a crossing line to a straight editor line ending on the boundary', () => {
    const [annotation] = inkToEditorAnnotations(
      [
        {
          id: 'l1',
          tool: 'line',
          points: [
            { x: 60, y: 40 },
            { x: 120, y: 40 },
          ],
          color: '#e5484d',
          width: 'thin',
        },
      ],
      frame,
      dpr,
    )
    expect(annotation).toMatchObject({ tool: 'line', start: { x: 20, y: 20 }, end: { x: 140, y: 20 }, width: 'thin' })
  })

  it('keeps a fully inside arrow as the editor shape, and cuts a crossing one to polylines', () => {
    const inside = inkToEditorAnnotations(
      [
        {
          id: 'a1',
          tool: 'arrow',
          points: [
            { x: 60, y: 100 },
            { x: 120, y: 100 },
          ],
          color: '#e5484d',
        },
      ],
      frame,
      dpr,
    )
    expect(inside).toHaveLength(1)
    expect(inside[0]).toMatchObject({ tool: 'arrow', start: { x: 20, y: 140 }, end: { x: 140, y: 140 } })

    // the tip sits past the frame's right edge: shaft and head strokes come back cut at the boundary
    const crossing = inkToEditorAnnotations(
      [
        {
          id: 'a2',
          tool: 'arrow',
          points: [
            { x: 60, y: 100 },
            { x: 154, y: 100 },
          ],
          color: '#e5484d',
        },
      ],
      frame,
      dpr,
    )
    expect(crossing.length).toBeGreaterThanOrEqual(2)
    expect(crossing.every(annotation => annotation.tool === 'polyline')).toBe(true)
    for (const annotation of crossing) {
      if (annotation.tool !== 'polyline') continue
      for (const point of annotation.points) {
        expect(point.x).toBeLessThanOrEqual(frame.width * dpr + 0.001)
      }
    }
  })

  it('keeps text and step badges only when their anchor is inside the frame', () => {
    const inside = inkToEditorAnnotations(
      [
        { id: 't1', tool: 'text', points: [{ x: 60, y: 40 }], text: '这里', color: '#e5484d' },
        { id: 'n1', tool: 'step', points: [{ x: 70, y: 50 }], color: '#e5484d', sequence: 1 },
      ],
      frame,
      dpr,
    )
    expect(inside).toHaveLength(2)
    expect(inside[0]).toMatchObject({ tool: 'text', start: { x: 20, y: 20 }, text: '这里' })
    expect(inside[1]).toMatchObject({ tool: 'step', at: { x: 40, y: 40 }, sequence: 1 })

    const outside = inkToEditorAnnotations(
      [
        { id: 't2', tool: 'text', points: [{ x: 10, y: 10 }], text: '外面', color: '#e5484d' },
        { id: 'n2', tool: 'step', points: [{ x: 10, y: 10 }], color: '#e5484d', sequence: 1 },
      ],
      frame,
      dpr,
    )
    expect(outside).toEqual([])
  })

  it('works at ratio 1 without shifting the origin', () => {
    const [annotation] = inkToEditorAnnotations(
      [
        pen([
          [60, 40],
          [80, 60],
        ]),
      ],
      frame,
      1,
    )
    expect(annotation.tool === 'pen' && annotation.points).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 30 },
    ])
  })
})

describe('inkToViewport', () => {
  it('moves page ink by the scroll; pinned ink stays where it is', () => {
    const strokes: InkStroke[] = [
      { id: 'a', tool: 'pen', points: [{ x: 900, y: 500 }], color: '#e5484d' },
      { id: 'b', tool: 'pen', points: [{ x: 30, y: 20 }], color: '#e5484d', pinned: true },
    ]
    const onScreen = inkToViewport(strokes, 400, 300)
    expect(onScreen[0]!.points).toEqual([{ x: 500, y: 200 }])
    expect(onScreen[1]!.points).toEqual([{ x: 30, y: 20 }])
    // the stored ink is untouched: the conversion is a view, not a move
    expect(strokes[0]!.points).toEqual([{ x: 900, y: 500 }])
  })

  it('round-trips: scrolling back puts the ink where it was', () => {
    const strokes: InkStroke[] = [
      {
        id: 'a',
        tool: 'line',
        points: [
          { x: 600, y: 800 },
          { x: 700, y: 900 },
        ],
        color: '#e5484d',
        width: 'thin',
      },
    ]
    const moved = inkToViewport(strokes, 100, 200)
    const back = inkToViewport(moved, -100, -200)
    expect(back[0]!.points).toEqual(strokes[0]!.points)
  })
})

describe('snapshotInk', () => {
  it('hands out a copy the sender can mutate freely', () => {
    const strokes = [
      pen([
        [1, 1],
        [2, 2],
      ]),
    ]
    strokes[0]!.pinned = true
    const copy = snapshotInk(strokes)
    copy[0]!.points[0]!.x = 99
    copy[0]!.color = '#ffffff'
    expect(copy[0]!.pinned).toBe(true)
    expect(strokes[0]!.points[0]!.x).toBe(1)
    expect(strokes[0]!.color).toBe('#e5484d')
  })
})
