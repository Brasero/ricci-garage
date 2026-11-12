import { useMemo, useState } from 'react'
import { buildFicheModel } from '../../shared/fiche'
import { SETTINGS_ID, withDefaults } from '../../shared/settings'
import type { Client, Vehicle } from '../../shared/types'
import { db } from '../db'
import { useToast } from './Toast'

/** Génère la fiche véhicule en PDF (à remettre au client : prix de vente et main d'œuvre, jamais le prix d'achat). */
export function FicheButton({ vehicle, owner }: { vehicle: Vehicle; owner: Client | undefined }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Le partage de fichiers (WhatsApp, email…) n'existe que sur certains appareils, surtout mobiles.
  const canShare = useMemo(() => {
    try {
      return !!navigator.canShare?.({ files: [new File([''], 'fiche.pdf', { type: 'application/pdf' })] })
    } catch {
      return false
    }
  }, [])

  async function build(): Promise<File> {
    const [interventions, settings] = await Promise.all([
      db.interventions.where('vehicleId').equals(vehicle.id).toArray(),
      db.settings.get(SETTINGS_ID),
    ])
    const model = buildFicheModel({ now: Date.now(), settings: withDefaults(settings && !settings.deletedAt ? settings : undefined), client: owner, vehicle, interventions })
    // Chargé à la demande : la bibliothèque PDF n'alourdit pas le démarrage de l'application.
    const { renderFichePdf } = await import('../pdf/fichePdf')
    const bytes = await renderFichePdf(model)
    const day = new Date().toISOString().slice(0, 10)
    return new File([bytes as unknown as BlobPart], `Fiche-${vehicle.plateNorm}-${day}.pdf`, { type: 'application/pdf' })
  }

  async function run(action: 'download' | 'share') {
    setBusy(true)
    setError('')
    try {
      const file = await build()
      if (action === 'share') {
        await navigator.share({ files: [file], title: `Fiche véhicule ${vehicle.plate}` })
        return
      }
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast('Fiche PDF créée')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return // partage annulé par l'utilisateur
      setError(e instanceof Error ? e.message : 'Impossible de créer la fiche PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void run('download')}>
          📄 {busy ? 'Création…' : 'Fiche PDF'}
        </button>
        {canShare && (
          <button type="button" className="btn" disabled={busy} onClick={() => void run('share')}>
            📤 Partager la fiche
          </button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}
