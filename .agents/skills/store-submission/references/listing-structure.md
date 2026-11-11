# The store listing, field by field

The Chrome Web Store Developer Dashboard fields, in the order they are touched, each with its single source. Work top to bottom; a field without a source below does not change without a new package.

## Identity

| Field                | Source                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Extension name (≤75) | `locales/en.yaml` `extName` — comes with the package, not edited in the Dashboard                  |
| Category             | Productivity (unchanged)                                                                           |
| Language             | English is the default listing; Chinese is added as a zh-CN language version                       |
| Website              | `https://annhub.org/`                                                                              |
| Support URL          | `https://github.com/genffy/annhub/issues`                                                          |
| Privacy policy       | `https://annhub.org/privacy-policy.html` — the page itself is `website/public/privacy-policy.html` |

## Summary (≤132 characters)

From `locales/en.yaml` / `locales/zh_CN.yaml` — ships with the package.

## Detailed description

Structured as: one opening sentence (what it is, local-first), the five capabilities as short sections (clip, screenshot, annotate, record, download — the order of `docs/product/README.md`), then the local-first/privacy paragraph. Capabilities and their boundaries follow `docs/product/` (`product.md`, `capture.md`, `screenshot.md`, `annotate.md`, `download.md`); the public wording tone follows `website/lib/copy/*`. Never claim a capability the docs call in-progress.

## What's new

Per release, in `store-assets/listing-*.md`: only what users can see, no internal work. The line between "new" and the standing description is the release's roadmap section: fold the shipped line into the delivered section, as roadmap.md's own rule says.

## Screenshots

Five per language, 1280×800, upload order is the numbering (see `store-assets/capture.spec.ts` header for what each frame shows). One set per listing language: English shots for the English listing, Chinese shots for the Chinese listing (the extension UI language follows the browser).

## Promo tiles

One English set shared by both listings: small tile 440×280 and marquee 1400×560, from `store-assets/promo.html`.

## Privacy practices

- **Single purpose**: one sentence, from the manifest's `description` intent.
- **Permission justifications**: each permission's reason from `docs/product/permissions.md` (it has the user-facing wording per permission, including `<all_urls>` host justification and why `tabCapture`/`offscreen` need each other for recording).
- **Data usage**: check only _Website content_; the disclosure must match `website/public/privacy-policy.html`'s data-boundaries section — nothing leaves the device, no analytics on content.

## Test instructions (when the Dashboard offers the column)

A short reviewer walkthrough: install, open the demo article (`store-assets/demo-article.html`), one clip from the menu, one screenshot with the editor, one highlight in the library's reading view — steps a reviewer can do without an account. Point at the same flow `e2e/real-chrome-scenarios.md` uses, so what the reviewer sees is what the tests prove.

## Length checks

Name ≤75, summary ≤132, each description within the Dashboard's limit; the per-release `SUBMIT.md` in `store-assets/` carries the counted numbers for the copy it ships.
