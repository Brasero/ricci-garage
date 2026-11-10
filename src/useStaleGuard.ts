import { useEffect, useState } from 'react'

/**
 * Protège un formulaire d'édition contre une modification venue d'un autre appareil (synchro) :
 * - formulaire non touché : il se met à jour tout seul avec la version synchronisée ;
 * - formulaire déjà modifié : `stale` devient vrai et l'utilisateur choisit (recharger ou garder sa saisie),
 *   pour qu'un enregistrement n'écrase jamais silencieusement le travail de l'autre appareil.
 */
export function useStaleGuard<T extends { updatedAt: number }>(existing: T | undefined, reload: (e: T) => void) {
  const [base, setBase] = useState(existing?.updatedAt)
  const [touched, setTouched] = useState(false)
  const changed = !!existing && base !== undefined && existing.updatedAt !== base

  useEffect(() => {
    if (existing && changed && !touched) {
      reload(existing)
      setBase(existing.updatedAt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.updatedAt])

  return {
    stale: changed && touched,
    markTouched: () => setTouched(true),
    /** Après un enregistrement local : la version courante est la nôtre. */
    saved: (updatedAt: number) => {
      setBase(updatedAt)
      setTouched(false)
    },
    /** Abandonne la saisie et affiche la version à jour. */
    reloadNow: () => {
      if (!existing) return
      reload(existing)
      setBase(existing.updatedAt)
      setTouched(false)
    },
    /** Garde la saisie en connaissance de cause (l'enregistrement écrasera la version distante). */
    keepMine: () => setBase(existing?.updatedAt),
  }
}
