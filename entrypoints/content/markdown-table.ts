/** Expand HTML spans into a rectangular Markdown table without losing cell alignment. */
export function tableMarkdown(table: Element, cellText: (cell: Element) => string): string {
  const rows = [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table)
  const grid: string[][] = rows.map(() => [])
  rows.forEach((row, rowIndex) => {
    let column = 0
    for (const cell of [...row.children].filter(el => el.matches('th, td'))) {
      while (grid[rowIndex]![column] !== undefined) column++
      const span = Math.max(1, Math.min(1000, Number(cell.getAttribute('colspan')) || 1))
      const declaredRows = cell.getAttribute('rowspan') === '0' ? rows.length : Number(cell.getAttribute('rowspan')) || 1
      const height = Math.max(1, Math.min(rows.length - rowIndex, declaredRows))
      const text = cellText(cell).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').trim() || ' '
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < span; x++) grid[rowIndex + y]![column + x] = y === 0 && x === 0 ? text : ' '
      }
      column += span
    }
  })
  const width = Math.max(0, ...grid.map(row => row.length))
  if (!width) return ''
  const line = (row: string[]): string => `| ${Array.from({ length: width }, (_, index) => row[index] ?? ' ').join(' | ')} |`
  return [line(grid[0]!), line(Array.from({ length: width }, () => '---')), ...grid.slice(1).map(line)].join('\n')
}
