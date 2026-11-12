import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Retour à la page précédente de l'historique (utilisé après un enregistrement).
 * Si la page a été ouverte directement (lien, rechargement : aucune page précédente dans l'application),
 * on évite de sortir de l'application et on se replie sur `fallback`.
 */
export function useGoBack(fallback: string): () => void {
  const nav = useNavigate()
  const { key } = useLocation()
  return useCallback(() => {
    if (key === 'default') nav(fallback, { replace: true })
    else nav(-1)
  }, [nav, key, fallback])
}
