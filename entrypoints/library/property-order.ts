import { FIXED_PRESET_PROPERTIES } from '../../learning-core/properties'
import type { PropertyDefinition } from '../../learning-core/types'

/** `title` and `tags` are attached to every entry and their presets cannot be turned off (entry.md §5.4). */
export function isFixedProperty(name: string): boolean {
  return FIXED_PRESET_PROPERTIES.includes(name)
}

/**
 * The properties table's row order (extension.md §2.4): the fixed built-ins on top, then the other built-ins in
 * the order the registry lists them, then the user's own properties by name.
 */
export function orderRegistry(definitions: readonly PropertyDefinition[]): PropertyDefinition[] {
  const group = (def: PropertyDefinition): number => (isFixedProperty(def.name) ? 0 : def.builtin ? 1 : 2)
  return definitions
    .map((def, index) => ({ def, index }))
    .sort((a, b) => {
      const byGroup = group(a.def) - group(b.def)
      if (byGroup !== 0) return byGroup
      if (group(a.def) === 0) return FIXED_PRESET_PROPERTIES.indexOf(a.def.name) - FIXED_PRESET_PROPERTIES.indexOf(b.def.name)
      if (group(a.def) === 1) return a.index - b.index
      return a.def.name.localeCompare(b.def.name)
    })
    .map(({ def }) => def)
}
