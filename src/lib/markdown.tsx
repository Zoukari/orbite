import { Fragment, type ReactNode } from 'react'

// Rendu markdown minimal et sûr (pas de HTML injecté) :
// titres, gras, italique, listes, cases à cocher, liens, citations.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${i++}`
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k} className="rounded bg-ink/10 px-1 font-mono text-[0.9em]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const mm = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!
      out.push(<a key={k} href={safe(mm[2])} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2">{mm[1]}</a>)
    } else if (t.startsWith('http')) out.push(<a key={k} href={safe(t)} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 break-all">{t}</a>)
    else out.push(<em key={k}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
const safe = (u: string) => (/^(https?:|mailto:|tel:)/i.test(u) ? u : '#')

export function Markdown({ text, onToggle }: { text: string; onToggle?: (lineIndex: number) => void }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let list: ReactNode[] = []
  const flush = () => {
    if (list.length) blocks.push(<ul key={`ul-${blocks.length}`} className="my-1.5 space-y-1">{list}</ul>)
    list = []
  }
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    const task = line.match(/^\s*[-*] \[( |x|X)\] (.*)$/)
    const bullet = line.match(/^\s*[-*] (.*)$/)
    const num = line.match(/^\s*\d+[.)] (.*)$/)
    if (task) {
      const done = task[1] !== ' '
      list.push(
        <li key={idx} className="flex items-start gap-2">
          <button type="button" onClick={() => onToggle?.(idx)} className={`mt-[3px] h-4 w-4 shrink-0 rounded-[5px] border ${done ? 'border-accent bg-accent' : 'border-line'}`} aria-label="cocher">
            {done && <svg viewBox="0 0 16 16" className="h-4 w-4 text-bg"><path d="M4 8.5l2.5 2.5L12 5.5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
          </button>
          <span className={done ? 'text-mute line-through' : ''}>{inline(task[2], `t${idx}`)}</span>
        </li>
      )
      return
    }
    if (bullet || num) {
      list.push(<li key={idx} className="flex gap-2"><span className="text-mute">{num ? '›' : '•'}</span><span>{inline((bullet || num)![1], `b${idx}`)}</span></li>)
      return
    }
    flush()
    if (!line.trim()) { blocks.push(<div key={idx} className="h-2" />); return }
    const h = line.match(/^(#{1,3}) (.*)$/)
    if (h) {
      const cls = h[1].length === 1 ? 'text-lg font-semibold mt-3' : h[1].length === 2 ? 'text-base font-semibold mt-2.5' : 'text-sm font-semibold uppercase tracking-wide text-mute mt-2'
      blocks.push(<div key={idx} className={`font-display ${cls}`}>{inline(h[2], `h${idx}`)}</div>)
      return
    }
    if (line.startsWith('> ')) { blocks.push(<blockquote key={idx} className="border-l-2 border-accent/50 pl-3 text-mute">{inline(line.slice(2), `q${idx}`)}</blockquote>); return }
    blocks.push(<p key={idx} className="leading-relaxed">{inline(line, `p${idx}`)}</p>)
  })
  flush()
  return <Fragment>{blocks}</Fragment>
}

export function toggleCheckboxLine(text: string, lineIndex: number) {
  const lines = text.split('\n')
  const l = lines[lineIndex]
  if (!l) return text
  lines[lineIndex] = l.replace(/\[( |x|X)\]/, (m) => (m === '[ ]' ? '[x]' : '[ ]'))
  return lines.join('\n')
}

export function plainExcerpt(md?: string, n = 120) {
  if (!md) return ''
  const s = md.replace(/[#*_`>\[\]]/g, '').replace(/\(([^)]+)\)/g, '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n) + '…' : s
}
