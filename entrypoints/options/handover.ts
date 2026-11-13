/**
 * Where the options entry (extension.md §2.2) hands over to: the settings view of the application page. The query
 * string goes along, because the settings view reads from it the tab that wanted the microphone (annotate.md §2.1):
 * what `extensionPagePath('settings', ...)` puts in the entry's address must come out on the page that reads it.
 */
export function optionsHandoverPath(search: string): string {
  return `/library.html${search}#/settings`
}
