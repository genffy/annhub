/**
 * The download settings card (extension.md §2.5, download.md §4.1): the form
 * a Markdown download lands in — one browser-download folder, or one ZIP —
 * and whether the run also fetches the page's media. The dialog can change
 * both per run; these are the defaults. The per-file prompt note is the
 * folder form's honest cost, with the ZIP advice (download.md §4.1).
 */
import type { ExtensionSettings, SettingsPatch } from '../../background-service/settings-schema'
import { uiText } from '../../utils/ui-text'
import { SettingsCard, SettingsRow } from './settings-card'
import { SettingsSegmentedControl } from './settings-seg'
import { SettingsSwitch } from './settings-switch'

export function DownloadCard({ settings, patch }: { settings: ExtensionSettings; patch(next: SettingsPatch): Promise<boolean> }) {
  return (
    <SettingsCard title={uiText('settings.download')} testId="download-card">
      <SettingsRow name={uiText('settings.downloadForm')} desc={uiText('settings.downloadFormHint')}>
        {() => (
          <SettingsSegmentedControl
            value={settings.downloadForm}
            onChange={next => void patch({ downloadForm: next })}
            ariaLabel={uiText('settings.downloadForm')}
            options={[
              { value: 'folder' as const, label: uiText('settings.downloadFolder') },
              { value: 'zip' as const, label: uiText('settings.downloadZip') },
            ]}
          />
        )}
      </SettingsRow>
      <SettingsRow name={uiText('settings.downloadMedia')} desc={uiText('settings.downloadMediaHint')}>
        {ids => (
          <SettingsSwitch
            checked={settings.downloadMedia}
            onChange={checked => void patch({ downloadMedia: checked })}
            nameId={ids.nameId}
            describedBy={ids.descId}
            testId="download-media-toggle"
          />
        )}
      </SettingsRow>
      {/* the folder form's cost (download.md §4.1): each file prompts when the browser asks where to save */}
      <p className="set-note">{uiText('settings.downloadAskNote')}</p>
    </SettingsCard>
  )
}
