import { FileText, Folder, Image as ImageIcon } from 'lucide-react'
import { Ic } from './parts'
import type { Sample } from './sample'
import type { ProductUi } from './types'

/**
 * What "Export content" produces (docs/v2/storage.md §6): one Markdown file per entry, properties as frontmatter,
 * highlights written as ==…==, images stored once. It reads in Obsidian and anything else that reads Markdown.
 */
export default function ExportFile({ file, ui, className = '' }: { file: Sample['exportFile']; ui: ProductUi; className?: string }) {
  return (
    <div className={`ah ah-file-wrap ${className}`}>
      <div className="ah-file">
        <div className="ah-file-tree" aria-hidden="true">
          <div className="grp">
            <Ic icon={Folder} />
            {ui.file.folder}
          </div>
          {file.files.map((f, i) => (
            <div key={f} className={`f${i === 0 ? ' on' : ''}`}>
              <Ic icon={f.startsWith('assets/') ? ImageIcon : FileText} />
              {f}
            </div>
          ))}
        </div>
        <div className="ah-file-body">
          <span className="dim">---</span>
          {'\n'}
          {file.frontmatter.map(([key, value]) => (
            <span key={key}>
              <span className="key">{key}</span>
              <span className="dim">: </span>
              <span className="val">{value}</span>
              {'\n'}
            </span>
          ))}
          <span className="dim">---</span>
          {'\n\n'}
          <span className="h">{file.body.heading}</span>
          {'\n'}
          {file.body.lines.map((line, i) => (
            <span key={i}>
              {renderLine(line)}
              {'\n'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** `==text==` becomes a highlight mark; everything else is shown as the file has it. */
function renderLine(line: string) {
  const parts = line.split(/(==[^=]+==)/g)
  return parts.map((part, i) =>
    part.startsWith('==') && part.endsWith('==') ? (
      <mark key={i}>
        <span className="dim">==</span>
        {part.slice(2, -2)}
        <span className="dim">==</span>
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}
