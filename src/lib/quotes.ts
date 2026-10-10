// Bibliothèque locale de phrases — sobres, pas de citations de célébrités.
export const QUOTES = [
  "Tu n'as pas besoin de tout finir aujourd'hui. Tu dois simplement avancer.",
  'Une chose bien faite vaut mieux que dix commencées.',
  'Le plan est utile. Le premier pas l’est davantage.',
  'Ce que tu repousses te coûte deux fois : maintenant et plus tard.',
  'Avance sur ce qui compte, pas sur ce qui crie.',
  'La clarté vient en bougeant, pas en attendant.',
  'Petit progrès quotidien, grand écart dans un an.',
  'Tu construis plusieurs choses. Une à la fois.',
  'Protège ta première heure. Elle décide du reste.',
  'Termine avant de commencer autre chose.',
  'Les grandes trajectoires se jouent sur des journées ordinaires.',
  'Choisis trois choses. Laisse le reste attendre.',
  'Ce qui est mesuré avance. Ce qui est vu se fait.',
  'Pas besoin d’être prêt. Besoin d’être en route.',
  'Simplifie jusqu’à ce que l’action devienne évidente.',
  'Regarde d’où tu viens avant de juger où tu en es.',
  'Un système fiable vaut mieux qu’une motivation forte.',
  'Dis non à ce qui ne te rapproche de rien.',
  'Le rythme bat l’intensité.',
  'Aujourd’hui, rends demain plus facile.',
  'Une décision prise vaut mieux qu’une option ouverte qui pèse.',
  'Ton énergie est limitée. Ton attention aussi. Place-les bien.',
  'Fais d’abord la tâche qui rend les autres inutiles ou faciles.',
  'Le calme est une compétence. Pratique-la.',
  'Ce n’est pas la vitesse qui compte, c’est la direction.',
  'Ferme une boucle avant d’en ouvrir une nouvelle.',
  'Les fondations ne se voient pas. Elles tiennent tout.',
  'Tu n’es pas en retard. Tu es en chemin.',
  'Fais simple, fais régulier, fais vrai.',
  'Chaque tâche cochée est une preuve, pas un détail.'
]

export function quoteOfDay(hidden: number[], favorites: number[]) {
  const pool = QUOTES.map((q, i) => i).filter((i) => !hidden.includes(i))
  if (!pool.length) return null
  const day = Math.floor(Date.now() / 86400000)
  // un jour sur trois, une phrase favorite revient
  if (favorites.length && day % 3 === 0) {
    const fav = favorites.filter((f) => pool.includes(f))
    if (fav.length) return fav[day % fav.length]
  }
  return pool[day % pool.length]
}
