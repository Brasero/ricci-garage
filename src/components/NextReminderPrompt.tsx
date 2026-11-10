import { useState } from 'react'
import { addMonths, localDate } from '../../shared/time'
import { TIMEZONE } from '../../shared/settings'
import type { Intervention } from '../../shared/types'
import { saveEcheance } from '../repo'
import { Field } from './ui'

/** Valeurs proposées selon le type de travaux (modifiables avant validation). */
const PRESETS: Partial<Record<Intervention['type'], { libelle: string; months: number | null; km: number | null; type: 'vidange' | 'autre' }>> = {
  vidange: { libelle: 'Prochaine vidange', months: 12, km: 15_000, type: 'vidange' },
  freins: { libelle: 'Contrôle des freins', months: 24, km: null, type: 'autre' },
  distribution: { libelle: 'Contrôle de la distribution', months: null, km: 60_000, type: 'autre' },
  pneus: { libelle: 'Contrôle des pneus', months: 12, km: null, type: 'autre' },
}

/**
 * Proposé à la clôture d'une intervention : planifier le prochain rappel (ex. vidange dans 12 mois ou 15 000 km).
 * Rien n'est créé sans validation.
 */
export function NextReminderPrompt({ intervention, onDone }: { intervention: Intervention; onDone: () => void }) {
  const preset = PRESETS[intervention.type] ?? { libelle: '', months: null, km: null, type: 'autre' as const }
  const base = localDate(intervention.startAt, TIMEZONE)
  const [libelle, setLibelle] = useState(preset.libelle)
  const [date, setDate] = useState(preset.months ? addMonths(base, preset.months) : '')
  const [km, setKm] = useState(preset.km && intervention.km != null ? String(intervention.km + preset.km) : '')
  const [error, setError] = useState('')

  async function create() {
    const kmDue = km.trim() ? Number(km) : null
    if (!libelle.trim()) return setError('Donnez un nom au rappel.')
    if (!date && kmDue === null) return setError('Indiquez une date et/ou un kilométrage.')
    if (kmDue !== null && (!Number.isInteger(kmDue) || kmDue < 0)) return setError('Kilométrage invalide.')
    await saveEcheance({ vehicleId: intervention.vehicleId, type: preset.type, libelle: libelle.trim(), dateDue: date || null, kmDue, statut: 'ouverte', notes: '', sourceInterventionId: intervention.id })
    onDone()
  }

  return (
    <section className="prompt" aria-label="Prochain rappel">
      <h2>Planifier le prochain rappel ?</h2>
      <Field label="Quoi">
        <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex. Prochaine vidange" />
      </Field>
      <div className="row2">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="ou kilométrage"><input type="number" inputMode="numeric" min={0} value={km} onChange={(e) => setKm(e.target.value)} /></Field>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn primary" onClick={create}>Créer le rappel</button>
        <button type="button" className="btn" onClick={onDone}>Pas maintenant</button>
      </div>
    </section>
  )
}
