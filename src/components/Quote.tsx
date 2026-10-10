import { useData } from '../lib/store'
import { QUOTES, quoteOfDay } from '../lib/quotes'

export function QuoteLine() {
  const s = useData((st) => st.settings)
  if (!s.showQuotes) return null
  const i = quoteOfDay(s.hiddenQuotes, s.favoriteQuotes)
  if (i == null) return null
  const fav = s.favoriteQuotes.includes(i)
  return (
    <div className="group flex items-start gap-2 text-[12.5px] italic leading-relaxed text-mute">
      <span className="flex-1">« {QUOTES[i]} »</span>
      <span className="flex shrink-0 gap-1 not-italic opacity-0 transition group-hover:opacity-100 max-md:opacity-60">
        <button title="Favori" onClick={() => useData.getState().setSettings({ favoriteQuotes: fav ? s.favoriteQuotes.filter((x) => x !== i) : [...s.favoriteQuotes, i] })} className={fav ? 'text-[#f2b45a]' : ''}>{fav ? '★' : '☆'}</button>
        <button title="Ne plus afficher cette phrase" onClick={() => useData.getState().setSettings({ hiddenQuotes: [...s.hiddenQuotes, i] })}>×</button>
      </span>
    </div>
  )
}
