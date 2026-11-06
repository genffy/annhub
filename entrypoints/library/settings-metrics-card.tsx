/**
 * The settings page's local-metrics card (metrics.md §5, §10): the aggregate numbers as they come
 * back from GET_METRICS. Moved verbatim from settings-view.tsx when that file went over its byte
 * budget.
 */
import type { ReactNode } from 'react'
import type { CaptureTimingSummary, HabitSummary, MetricsPanelData } from '../../core/metrics'
import { uiText } from '../../utils/ui-text'
import { SettingsCard } from './settings-card'

export function MetricRow({ id, name, value, testId }: { id: string; name: string; value: ReactNode; testId?: string }) {
  return (
    <div className="set-r metric-row">
      <div className="set-l">
        <b>{name}</b>
      </div>
      <div className="set-ctl metric-val">
        <span className="cv-tag">{id}</span>
        <span data-testid={testId}>{value}</span>
      </div>
    </div>
  )
}

export function MetricsCard({ panel, loadMetrics }: { panel: MetricsPanelData | null; loadMetrics(): void }) {
  const summaries = panel?.summaries
  const timingValue = (timing: CaptureTimingSummary, guard: boolean) =>
    timing.count === 0 ? (
      uiText('metrics.m03.none')
    ) : (
      <>
        {uiText('metrics.m03.value', { count: timing.count, median: timing.median ?? '', p95: timing.p95 ?? '' })}
        {guard && <span className="metric-guard"> · {uiText(timing.within300ms ? 'metrics.m03.guard.pass' : 'metrics.m03.guard.fail')}</span>}
      </>
    )
  const habitValue = (habit: HabitSummary, support: string) =>
    habit.satisfied === null ? uiText('metrics.none') : `${habit.satisfied ? uiText('metrics.yes') : uiText('metrics.no')} · ${support}`
  const rateValue = (rate: { rate: number | null }, support: string) =>
    rate.rate === null ? uiText('metrics.none') : uiText('metrics.rate', { pct: Math.round(rate.rate * 100), support })

  return (
    <SettingsCard title={uiText('settings.metrics')}>
      <div className="set-r set-r-bare">
        <p className="banner banner-info">{uiText('settings.metricsHint')}</p>
        <button type="button" className="ghost sm" onClick={loadMetrics}>
          {uiText('settings.metricsRefresh')}
        </button>
      </div>
      {summaries && (
        <div data-testid="metrics-summary">
          <MetricRow id="M-03" name={uiText('metrics.m03.selection')} value={timingValue(summaries.timing.selection, true)} />
          <MetricRow id="M-03" name={uiText('metrics.m03.block')} value={timingValue(summaries.timing.block, true)} />
          <MetricRow id="M-03" name={uiText('metrics.m03.screenshot')} value={timingValue(summaries.timing.screenshot, false)} />
          <MetricRow
            id="M-11"
            name={uiText('metrics.m11.name')}
            value={
              summaries.activation.firstSaveDay === null
                ? uiText('metrics.m11.noSaves')
                : `${summaries.activation.activated ? uiText('metrics.m11.activated') : uiText('metrics.m11.notYet')} · ${uiText('metrics.m11.firstSave', { day: summaries.activation.firstSaveDay })}`
            }
          />
          <MetricRow id="M-20" name={uiText('metrics.m20.name')} value={habitValue(summaries.propertyUse, uiText('metrics.m20.support', { n: summaries.propertyUse.numerator }))} />
          <MetricRow
            id="M-21"
            name={uiText('metrics.m21.name')}
            value={habitValue(summaries.highlightUse, uiText('metrics.m21.support', { n: summaries.highlightUse.numerator, m: summaries.highlightUse.denominator }))}
          />
          <MetricRow
            id="M-22"
            name={uiText('metrics.m22.name')}
            value={habitValue(
              summaries.screenshotExternalUse,
              uiText('metrics.m22.support', { n: summaries.screenshotExternalUse.numerator, m: summaries.screenshotExternalUse.denominator }),
            )}
          />
          <MetricRow
            id="M-23"
            name={uiText('metrics.m23.name')}
            value={rateValue(
              summaries.blockFirstHit,
              uiText('metrics.m23.support', { a: summaries.blockFirstHit.unchangedLevels, u: summaries.blockFirstHit.undos, d: summaries.blockFirstHit.denominator }),
            )}
          />
          <MetricRow
            id="M-24"
            name={uiText('metrics.m24.name')}
            value={habitValue(summaries.beautifyUse, uiText('metrics.m24.support', { n: summaries.beautifyUse.numerator, m: summaries.beautifyUse.denominator }))}
          />
          <MetricRow
            id="M-25"
            name={uiText('metrics.m25.name')}
            value={rateValue(summaries.frameReuse, uiText('metrics.m25.support', { n: summaries.frameReuse.numerator, d: summaries.frameReuse.denominator }))}
          />
          <MetricRow
            id="M-31"
            name={uiText('metrics.m31.name')}
            testId="metrics-m31"
            value={
              summaries.recordingUse.downloads === 0
                ? uiText('metrics.m31.none')
                : uiText('metrics.m31.value', {
                    n: summaries.recordingUse.downloads,
                    mic: summaries.recordingUse.withMic,
                    user: summaries.recordingUse.stoppedBy.user,
                    tab: summaries.recordingUse.stoppedBy.tab_closed,
                    limit: summaries.recordingUse.stoppedBy.limit,
                  })
            }
          />
          <MetricRow
            id="M-32"
            name={uiText('metrics.m32.name')}
            testId="metrics-m32"
            value={
              summaries.downloadUse.downloads === 0
                ? uiText('metrics.m32.none')
                : uiText('metrics.m32.value', {
                    n: summaries.downloadUse.downloads,
                    page: summaries.downloadUse.bySource.page,
                    library: summaries.downloadUse.bySource.library,
                    folder: summaries.downloadUse.byForm.folder,
                    zip: summaries.downloadUse.byForm.zip,
                  })
            }
          />
        </div>
      )}
      {panel && (
        <>
          <h3 className="set-tbl-h">{uiText('metrics.m19')}</h3>
          <div className="props-scroll">
            <table className="props-table metric-weeks" data-testid="metrics-weeks" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">
                    {uiText('metrics.week')}
                  </th>
                  <th scope="col" role="columnheader" className="num">
                    {uiText('metrics.m19.reopens')}
                  </th>
                  <th scope="col" role="columnheader" className="num">
                    {uiText('metrics.m19.exports')}
                  </th>
                  <th scope="col" role="columnheader" className="num">
                    {uiText('metrics.m19.retrieved')}
                  </th>
                  <th scope="col" role="columnheader" className="num">
                    {uiText('metrics.queried')}
                  </th>
                  <th scope="col" role="columnheader">
                    {uiText('metrics.m19.sought')}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {summaries!.weeks.map(week => (
                  <tr key={week.weekStart} role="row">
                    <td role="cell">{week.weekStart}</td>
                    <td role="cell" className="num">
                      {week.reopens}
                    </td>
                    <td role="cell" className="num">
                      {week.exports}
                    </td>
                    <td role="cell" className="num">
                      {week.retrieved}
                    </td>
                    <td role="cell" className="num">
                      {week.queried}
                    </td>
                    <td role="cell">{week.soughtBack ? uiText('metrics.yes') : uiText('metrics.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="set-tbl-h">{uiText('metrics.events')}</h3>
          <div className="props-scroll">
            <table className="props-table metric-events" data-testid="metrics-table" role="table">
              <tbody role="rowgroup">
                {Object.entries(panel.events)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([name, bucket]) => (
                    <tr key={name} role="row">
                      <td role="cell">{name}</td>
                      <td role="cell" className="num">
                        {bucket.total}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SettingsCard>
  )
}
