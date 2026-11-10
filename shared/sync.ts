/**
 * Règles de fusion : « le plus récent gagne », enregistrement par enregistrement.
 * Isolées ici pour être testées sans réseau ni base de données.
 */

/** Côté serveur : accepte-t-on la modification reçue ? (égalité acceptée → idempotent) */
export function serverAccepts(existingUpdatedAt: number | null, incomingUpdatedAt: number): boolean {
  return existingUpdatedAt === null || incomingUpdatedAt >= existingUpdatedAt
}

/**
 * Côté appareil : applique-t-on l'enregistrement venu du serveur ?
 * On garde la version locale seulement si elle est en attente d'envoi ET plus récente.
 */
export function deviceAccepts(local: { updatedAt: number; dirty: 0 | 1 } | undefined, incomingUpdatedAt: number): boolean {
  if (!local) return true
  if (local.dirty && local.updatedAt > incomingUpdatedAt) return false
  return true
}
