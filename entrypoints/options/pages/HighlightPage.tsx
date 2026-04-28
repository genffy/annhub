import { i18n } from '#i18n'
import HighlightList from '../../../components/ui/highlight-list'
import { Card, PageHeader } from '../components/ui'

export default function HighlightPage() {
  return (
    <Card>
      <PageHeader title={i18n.t('options.highlight.name')} description={i18n.t('options.highlight.description')} />
      <div className="h-[calc(100vh-220px)] min-h-[520px] overflow-hidden rounded-xl border border-slate-200">
        <HighlightList className="h-full" alwaysNewTab={true} showHeader={true} showPagination={true} initialPageSize={20} />
      </div>
    </Card>
  )
}
