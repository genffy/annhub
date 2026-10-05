/**
 * A page's own script can dispatch any DOM event, so an event counts as the user's only when the
 * browser says so: `isTrusted` is set for real input and cannot be set from script. What reaches a
 * privileged extension API (tab capture, cross-origin fetch) must start from such an event or from a
 * message of the extension itself, never from an event the page could have made up.
 *
 * A function rather than an inline check so that jsdom tests, whose events are never trusted, can
 * stand in for a person.
 */
export function isUserInput(event: Pick<Event, 'isTrusted'>): boolean {
  return event.isTrusted === true
}
