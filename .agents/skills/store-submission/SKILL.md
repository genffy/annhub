---
name: store-submission
description: Release the extension and submit it to the Chrome Web Store — build the attested zip, generate the listing screenshots in both languages, fill the Dashboard fields from their single sources, and run the pre-submission checklist. Use for /store-submission, "publish a new version", "submit to the store", or when preparing a release.
disable-model-invocation: true
---

# Store submission

Manual skill: run it only when asked to release or submit. Everything per-release (zips, screenshots, promos, per-version archives, the per-release SUBMIT.md) stays in the ignored `store-assets/` — this skill is what does not change between releases.

## 1. The release chain

1. Bump `version` in `package.json` (one PR; the version is the single source — see `scripts/README.md` 联动表). The PR's CI is the full gate.
2. After merge, tag the release commit `v<version>` and push the tag.
3. `release.yml` runs on the tag: the full CI gate, then the build; the published zip carries a build-provenance attestation.
4. Fetch and verify the artifact:

   ```bash
   gh release download v<version> --repo genffy/annhub --pattern '*.zip'
   gh attestation verify "annhub-<version>-chrome.zip" --repo genffy/annhub
   ```

   (`gh attestation verify` needs the Sigstore roots on the machine; the web API is the fallback check.)

5. Put the zip in `store-assets/` for the submission session.

## 2. Listing screenshots

The capture script and its demo pages live in this skill (`shots/capture.spec.ts`, `shots/content.ts`, `shots/demo-article*.html`, `shots/promo.html`, `shots/playwright.config.ts`) — they are versioned here; `store-assets/` keeps only the finished per-release sets. They run against the real extension build and the same fixture server as the E2E suite, from the repository root:

```bash
STORE_LOCALE=en pnpm exec playwright test -c .agents/skills/store-submission/shots
STORE_LOCALE=zh pnpm exec playwright test -c .agents/skills/store-submission/shots
```

Five images per language, 1280×800, in upload order, landing in `shots/en/` and `shots/zh/` (git-ignored — copy them into `store-assets/` for the submission session); promos come from `shots/promo.html`. If the UI changed, re-read what each shot frames in `shots/capture.spec.ts`'s header before re-shooting — the shots must come from the final build of the version being submitted.

## 3. The listing's fields and where each comes from

The structure and the source of every field are in [references/listing-structure.md](references/listing-structure.md). The rules that matter most:

- **Permissions and their justifications** come from `docs/product/permissions.md` — never from memory of a previous listing.
- **Privacy practices** match `website/public/privacy-policy.html` (the permission table there and the data boundaries; `tests/website/legal-pages.test.ts` keeps it in step with the manifest).
- **Name and summary** come from the manifest strings (`locales/en.yaml`, `locales/zh_CN.yaml`); changing them means shipping a new package, not editing the Dashboard.
- **Capability wording** follows `docs/product/` and the site's public copy — a feature the docs call in-progress is not in the listing.

The listing copy itself stays per-release in `store-assets/` (the product owner's standing decision; if that changes, the copy moves into this skill's `references/` and accepts `check:docs`).

## 4. Pre-submission checklist

- [ ] `package.json` version, the `v<version>` tag, the Release zip and its attestation all name the same version.
- [ ] Both languages' screenshots and promos come from the final build of that version.
- [ ] The permission list matches the manifest; a new permission means new justifications (permissions.md) and a new privacy-disclosure entry.
- [ ] The privacy policy page covers everything the new version does (legal-pages test green).
- [ ] Real-machine acceptance for whatever the version changed is done (roadmap §5).
- [ ] The website describes the same capabilities the listing claims.
- [ ] English copy read through by someone who reads English well before it goes public.
- [ ] After submitting: check the permission prompts in the Dashboard; after publishing, load the store version in `chrome://extensions` and confirm the permission list.

## 5. After the store accepts

- Move the shipped listing materials into `store-assets/archive-v<version>/` for the next submission to diff against.
- Fold the released work's roadmap §3 line into §2 (`docs/product/roadmap.md`).
- Keep the site and the listing telling the same story about capabilities; when the store version moves, the site's FAQ and trust sections follow `docs/product/website.md`.
