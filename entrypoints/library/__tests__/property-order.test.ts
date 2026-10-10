import { describe, expect, it } from 'vitest'
import { BUILTIN_PROPERTY_DEFINITIONS } from '../../../learning-core/properties'
import type { PropertyDefinition } from '../../../learning-core/types'
import { isFixedProperty, orderRegistry } from '../property-order'

const custom = (name: string): PropertyDefinition => ({ name, type: 'text', builtin: false, presets: [] })

describe('the properties table order (extension.md §2.4)', () => {
  it('puts the fixed built-ins on top', () => {
    // the store lists the built-ins as title, author, published, tags, description: tags sits in the middle of them
    const names = orderRegistry([...BUILTIN_PROPERTY_DEFINITIONS]).map(def => def.name)
    expect(names.slice(0, 2)).toEqual(['title', 'tags'])
    expect(names.slice(2)).toEqual(['author', 'published', 'description'])
  })

  it('puts the user’s own properties after every built-in, by name', () => {
    const names = orderRegistry([custom('zeta'), ...BUILTIN_PROPERTY_DEFINITIONS, custom('alpha'), custom('Mid')]).map(def => def.name)
    expect(names).toEqual(['title', 'tags', 'author', 'published', 'description', 'alpha', 'Mid', 'zeta'])
  })

  it('does not reorder or drop anything it was given', () => {
    const input = [custom('b'), custom('a'), ...BUILTIN_PROPERTY_DEFINITIONS]
    const snapshot = input.map(def => def.name)
    expect(orderRegistry(input)).toHaveLength(input.length)
    expect(input.map(def => def.name)).toEqual(snapshot)
  })

  it('knows which built-ins are fixed', () => {
    expect(isFixedProperty('title')).toBe(true)
    expect(isFixedProperty('tags')).toBe(true)
    for (const name of ['author', 'published', 'description', 'project']) expect(isFixedProperty(name), name).toBe(false)
  })
})
