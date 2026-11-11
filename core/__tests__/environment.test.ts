import { expect, it } from 'vitest'

it('runs the domain core without a DOM (RV-TEST-08)', () => {
  expect(typeof document).toBe('undefined')
  expect(typeof window).toBe('undefined')
})
