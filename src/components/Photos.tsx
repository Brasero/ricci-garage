import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, type PhotoRow } from '../db'
import { compressImage } from '../image'
import { addPhoto, deletePhoto } from '../repo'
import { useSyncState } from '../sync'

/** Affiche une photo : locale si on l'a, sinon téléchargée une fois puis gardée sur l'appareil. */
function usePhotoUrl(photo: PhotoRow): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  const { lastSync } = useSyncState()

  // Téléchargement échoué (hors connexion, ou image pas encore envoyée par l'autre appareil) : on réessaie
  // à chaque synchro réussie et au retour du réseau.
  useEffect(() => {
    if (failed) setTick((t) => t + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSync])
  useEffect(() => {
    const retry = () => setTick((t) => t + 1)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  useEffect(() => {
    let revoked = false
    setFailed(false)
    let objectUrl: string | null = null
    const show = (b: Blob) => {
      if (revoked) return
      objectUrl = URL.createObjectURL(b)
      setUrl(objectUrl)
    }
    if (photo.blob) show(photo.blob)
    else {
      fetch(`/api/photos/${photo.id}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status))
          const b = await r.blob()
          await db.photos.update(photo.id, { blob: b })
          show(b)
        })
        .catch(() => !revoked && setFailed(true))
    }
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id, photo.blob, tick])
  return { url, failed }
}

function Thumb({ photo, onOpen }: { photo: PhotoRow; onOpen: (url: string) => void }) {
  const { url, failed } = usePhotoUrl(photo)
  if (failed) return <div className="thumb thumb-empty" title="Photo non disponible hors connexion">📷<span>hors ligne</span></div>
  if (!url) return <div className="thumb thumb-empty">…</div>
  return (
    <button type="button" className="thumb" onClick={() => onOpen(url)} aria-label="Agrandir la photo">
      <img src={url} alt="Photo de l'intervention" loading="lazy" />
      {photo.uploaded === 0 && <span className="thumb-badge">en attente</span>}
    </button>
  )
}

export function PhotoGallery({ interventionId }: { interventionId: string }) {
  const photos = useLiveQuery(() => db.photos.where('interventionId').equals(interventionId).filter((p) => !p.deletedAt).sortBy('createdAt'), [interventionId], [])
  const [big, setBig] = useState<{ url: string; id: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError('')
    try {
      for (const f of Array.from(files)) await addPhoto(interventionId, await compressImage(f))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'ajouter la photo")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Photos ({photos.length})</h2>
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
          📷 {busy ? 'Traitement…' : 'Ajouter'}
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="thumbs">
        {photos.map((p) => (
          <Thumb key={p.id} photo={p} onOpen={(url) => setBig({ url, id: p.id })} />
        ))}
      </div>
      {photos.length === 0 && <p className="empty">Aucune photo.</p>}
      {big && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setBig(null)}>
          <img src={big.url} alt="Photo agrandie" />
          <div className="lightbox-actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn" onClick={() => setBig(null)}>Fermer</button>
            <button
              type="button"
              className="btn danger-solid"
              onClick={async () => {
                if (!window.confirm('Supprimer cette photo ?')) return
                await deletePhoto(big.id)
                setBig(null)
              }}
            >
              Supprimer
            </button>
          </div>
        </div>
      )}
    </>
  )
}
