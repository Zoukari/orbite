// Point d'extension IA — désactivé par défaut, aucun coût API.
// Pour brancher un modèle plus tard : implémenter AIProvider et
// l'enregistrer via setAIProvider(). Le Command Center et la capture
// rapide l'utiliseront en repli quand les règles locales ne suffisent pas.

import type { Entity } from './types'

export interface AIProvider {
  name: string
  parseCapture?(text: string, context: Entity[]): Promise<Partial<Entity> | null>
  answer?(question: string, context: Entity[]): Promise<string | null>
}

let provider: AIProvider | null = null
export const setAIProvider = (p: AIProvider | null) => { provider = p }
export const getAIProvider = () => provider
