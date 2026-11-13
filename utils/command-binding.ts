/**
 * The key the browser has bound to one of the extension's commands, or "" when it has none. The browser
 * alone holds this: it hands out a suggested key at install when no other record holds it, and the user
 * can move or clear it. A hint that names a key reads it here and drops the key when there is none,
 * rather than naming the default (extension.md §7.1).
 */
export async function readCommandBinding(command: string): Promise<string> {
  const commands = await chrome.commands.getAll()
  return commands.find(entry => entry.name === command)?.shortcut ?? ''
}

/** One keycap per key of a binding: the browser reports either "+"-joined names ("Ctrl+Shift+S") or bare glyphs ("⌘⇧S"). */
export function keyCaps(binding: string): string[] {
  if (binding.includes('+'))
    return binding
      .split('+')
      .map(key => key.trim())
      .filter(Boolean)
  return [...binding]
}
