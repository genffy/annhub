import { describe, expect, it } from 'vitest'
import { PROPERTY_TYPES } from '../../../learning-core/types'
import { nextPropertyType } from '../property-type-picker'

// the grid the picker draws: three columns in the registry's order
//   text  list  number
//   checkbox  date  datetime
const [TEXT, LIST, NUMBER, CHECKBOX, DATE, DATETIME] = PROPERTY_TYPES

describe('the property-type picker’s keyboard grid', () => {
  it('orders the six types in the registry’s order, three to a row', () => {
    expect(PROPERTY_TYPES).toEqual(['text', 'list', 'number', 'checkbox', 'date', 'datetime'])
    expect(PROPERTY_TYPES.indexOf(DATETIME)).toBe(5)
  })

  it('moves and selects along the row: right and left step by one, wrapping at both ends', () => {
    expect(nextPropertyType(TEXT, 'ArrowRight')).toBe(LIST)
    expect(nextPropertyType(DATE, 'ArrowRight')).toBe(DATETIME)
    expect(nextPropertyType(DATETIME, 'ArrowRight')).toBe(TEXT)
    expect(nextPropertyType(LIST, 'ArrowLeft')).toBe(TEXT)
    expect(nextPropertyType(TEXT, 'ArrowLeft')).toBe(DATETIME)
  })

  it('moves and selects across rows: up and down jump three, wrapping', () => {
    expect(nextPropertyType(TEXT, 'ArrowDown')).toBe(CHECKBOX)
    expect(nextPropertyType(NUMBER, 'ArrowDown')).toBe(DATETIME)
    expect(nextPropertyType(DATETIME, 'ArrowDown')).toBe(NUMBER)
    expect(nextPropertyType(CHECKBOX, 'ArrowUp')).toBe(TEXT)
    expect(nextPropertyType(TEXT, 'ArrowUp')).toBe(CHECKBOX)
  })

  it('Home and End reach the two ends of the group', () => {
    expect(nextPropertyType(DATETIME, 'Home')).toBe(TEXT)
    expect(nextPropertyType(TEXT, 'End')).toBe(DATETIME)
  })

  it('answers nothing when disabled, whatever the key', () => {
    for (const key of ['ArrowRight', 'ArrowDown', 'Home', 'End']) {
      expect(nextPropertyType(TEXT, key, true)).toBeNull()
    }
  })

  it('answers nothing to keys that are not the group’s own, so Tab and typing pass through', () => {
    for (const key of ['a', 'Enter', ' ', 'Tab']) {
      expect(nextPropertyType(TEXT, key)).toBeNull()
    }
  })
})
