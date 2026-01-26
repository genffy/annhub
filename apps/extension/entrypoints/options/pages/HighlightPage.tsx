import HighlightList from '../../../components/ui/highlight-list'

export default function HighlightPage() {
    return (
        <div className="content-section">
            <h2>{i18n.t("options.highlight.name")}</h2>
            <p className="section-description">{i18n.t("options.highlight.description")}</p>

            <div className="highlight-page-container">
                <HighlightList
                    className="highlight-page-list"
                    alwaysNewTab={true}
                    showHeader={true}
                    showPagination={true}
                    initialPageSize={20}
                />
            </div>
        </div>
    )
} 