import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KM_ALERT, RECAP_HORIZON_DAYS } from '../../shared/reminders'
import { TIMEZONE } from '../../shared/settings'
import { addDays, addMonths, daysBetween, formatDateFr, localDate } from '../../shared/time'
import { ECHEANCE_TYPES, type Client, type Echeance, type Vehicle } from '../../shared/types'
import { db } from '../db'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/ui'
import { fullName, setEcheanceDone } from '../repo'

type View = 'a-venir' | 'jour' | 'semaine' | 'mois'
const VIEWS: [View, string][] = [['a-venir', 'À venir'], ['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']]

interface Item {
  key: string
  day: string
  at: number
  kind: 'rdv' | 'inter' | 'echeance'
  title: string
  sub: string
  to: string
  dim: boolean
}
const ICON = { rdv: 'calendar', inter: 'wrench', echeance: 'clock' } as const
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' })
export const echeanceName = (e: Echeance) => (e.type === 'autre' ? e.libelle || 'Échéance' : ECHEANCE_TYPES.find((t) => t[0] === e.type)![1] + (e.libelle ? ` (${e.libelle})` : ''))
const carName = (v: Vehicle | undefined) => (v ? `${v.marque} ${v.modele} (${v.plate})` : 'véhicule')

function useAgendaData() {
  const clients = useLiveQuery(() => db.clients.toArray(), [], [] as Client[])
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], [] as Vehicle[])
  const rdvs = useLiveQuery(() => db.rdvs.toArray(), [], [])
  const inters = useLiveQuery(() => db.interventions.toArray(), [], [])
  const echeances = useLiveQuery(() => db.echeances.toArray(), [], [])
  return useMemo(() => {
    const okClients = new Map(clients.filter((c) => !c.deletedAt).map((c) => [c.id, c]))
    const okCars = new Map(vehicles.filter((v) => !v.deletedAt && okClients.has(v.clientId)).map((v) => [v.id, v]))
    const items: Item[] = []
    for (const r of rdvs) {
      const c = okClients.get(r.clientId)
      if (r.deletedAt || !c) continue
      items.push({ key: `r${r.id}`, day: localDate(r.startAt, TIMEZONE), at: r.startAt, kind: 'rdv', title: `${hhmm(r.startAt)} · ${fullName(c)}`, sub: [r.motif, r.vehicleId ? carName(okCars.get(r.vehicleId)) : ''].filter(Boolean).join(' · ') + (r.statut !== 'prevu' ? ` — ${r.statut === 'annule' ? 'annulé' : 'honoré'}` : ''), to: `/rendez-vous/${r.id}`, dim: r.statut !== 'prevu' })
    }
    for (const i of inters) {
      const v = okCars.get(i.vehicleId)
      if (i.deletedAt || !v) continue
      items.push({ key: `i${i.id}`, day: localDate(i.startAt, TIMEZONE), at: i.startAt, kind: 'inter', title: `${hhmm(i.startAt)} · ${carName(v)}`, sub: i.description || 'Intervention', to: `/interventions/${i.id}`, dim: i.statut === 'terminee' })
    }
    for (const e of echeances) {
      const v = okCars.get(e.vehicleId)
      if (e.deletedAt || !v || !e.dateDue) continue
      items.push({ key: `e${e.id}`, day: e.dateDue, at: Date.parse(`${e.dateDue}T00:00:00Z`), kind: 'echeance', title: echeanceName(e), sub: `${carName(v)} · ${fullName(okClients.get(v.clientId))}`, to: `/echeances/${e.id}`, dim: e.statut === 'faite' })
    }
    items.sort((a, b) => a.at - b.at)
    const byDay = new Map<string, Item[]>()
    for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it])
    return { okClients, okCars, byDay, rdvs, inters, echeances }
  }, [clients, vehicles, rdvs, inters, echeances])
}

function ItemCard({ it }: { it: Item }) {
  return (
    <Link to={it.to} className={`card clickable agenda-item ${it.kind}${it.dim ? ' dim' : ''}`}>
      <span className={`ico ${it.kind}`} aria-hidden><Icon name={ICON[it.kind]} size={18} /></span>
      <div className="card-main">
        <strong>{it.title}</strong>
        <span className="muted">{it.sub}</span>
      </div>
    </Link>
  )
}

export function AgendaPage() {
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.find((v) => v[0] === params.get('vue'))?.[0] ?? 'a-venir') as View
  const today = localDate(Date.now(), TIMEZONE)
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today
  const data = useAgendaData()
  const go = (patch: Record<string, string>) => setParams({ vue: view, date: day, ...patch }, { replace: true })

  return (
    <>
      <div className="page-head">
        <h1>Agenda</h1>
        <Link className="btn primary" to={`/rendez-vous/nouveau${view !== 'a-venir' ? `?date=${day}` : ''}`}>+ Rendez-vous</Link>
      </div>
      <div className="segmented tabs scroll" role="tablist">
        {VIEWS.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => go({ vue: v })}>{l}</button>
        ))}
      </div>
      {view === 'a-venir' ? <Upcoming data={data} today={today} /> : <Calendar view={view} day={day} today={today} data={data} go={go} />}
    </>
  )
}

type AgendaData = ReturnType<typeof useAgendaData>

function Upcoming({ data, today }: { data: AgendaData; today: string }) {
  const { okCars, okClients, echeances, rdvs, inters, byDay } = data
  const open = echeances.filter((e) => !e.deletedAt && e.statut === 'ouverte' && okCars.has(e.vehicleId))
  const dated = open.filter((e) => e.dateDue).sort((a, b) => a.dateDue!.localeCompare(b.dateDue!))
  const overdue = dated.filter((e) => e.dateDue! < today)
  const soon = dated.filter((e) => e.dateDue! >= today && daysBetween(today, e.dateDue!) <= RECAP_HORIZON_DAYS)
  const kmBased = open.filter((e) => e.kmDue !== null).sort((a, b) => a.kmDue! - b.kmDue!)
  const upcomingRdv = [...rdvs]
    .filter((r) => !r.deletedAt && r.statut === 'prevu' && okClients.has(r.clientId) && r.startAt >= Date.now() - 3600_000 && localDate(r.startAt, TIMEZONE) <= addDays(today, 14))
    .sort((a, b) => a.startAt - b.startAt)
  const todo = inters.filter((i) => !i.deletedAt && i.statut !== 'terminee' && okCars.has(i.vehicleId)).sort((a, b) => a.startAt - b.startAt)
  const nothing = !overdue.length && !soon.length && !kmBased.length && !upcomingRdv.length && !todo.length

  const row = (e: Echeance, extra: string, tone?: 'bad' | 'warn') => {
    const v = okCars.get(e.vehicleId)
    return (
      <div className="card" key={e.id}>
        <Link to={`/echeances/${e.id}`} className="card-main" style={{ color: 'inherit', textDecoration: 'none' }}>
          <strong>{echeanceName(e)}</strong>
          <span className="muted">{carName(v)} · {fullName(okClients.get(v!.clientId))}</span>
          <span className={tone === 'bad' ? 'error' : tone === 'warn' ? 'warn-text' : 'muted'}>{extra}</span>
        </Link>
        <button type="button" className="btn" onClick={() => setEcheanceDone(e.id, true)} aria-label={`Marquer ${echeanceName(e)} comme faite`}>✓ Faite</button>
      </div>
    )
  }
  const section = (title: string, n: number, body: React.ReactNode) => n > 0 && (<><h2>{title} ({n})</h2>{body}</>)

  return (
    <>
      {section('En retard', overdue.length, overdue.map((e) => row(e, `Échue depuis ${-daysBetween(today, e.dateDue!)} jour(s) — ${formatDateFr(e.dateDue!)}`, 'bad')))}
      {section('Rendez-vous (14 prochains jours)', upcomingRdv.length, upcomingRdv.map((r) => byDay.get(localDate(r.startAt, TIMEZONE))?.find((i) => i.key === `r${r.id}`)).filter((i): i is Item => !!i).map((it) => (
        <Link key={it.key} to={it.to} className="card clickable agenda-item rdv">
          <span className="ico rdv" aria-hidden><Icon name="calendar" size={18} /></span>
          <div className="card-main"><strong>{formatDateFr(it.day)} · {it.title.split(' · ')[0]}</strong><span className="muted">{it.title.split(' · ').slice(1).join(' · ')}{it.sub ? ` — ${it.sub}` : ''}</span></div>
        </Link>
      )))}
      {section(`Échéances (${RECAP_HORIZON_DAYS} prochains jours)`, soon.length, soon.map((e) => row(e, `Dans ${daysBetween(today, e.dateDue!)} jour(s) — ${formatDateFr(e.dateDue!)}`, daysBetween(today, e.dateDue!) <= 7 ? 'warn' : undefined)))}
      {section('Échéances au kilométrage', kmBased.length, kmBased.map((e) => {
        const left = okCars.get(e.vehicleId)!.km === null ? null : e.kmDue! - okCars.get(e.vehicleId)!.km!
        return row(e, left === null ? `À ${e.kmDue!.toLocaleString('fr-FR')} km (km actuel inconnu)` : left <= 0 ? `Dépassée de ${(-left).toLocaleString('fr-FR')} km` : `Dans ${left.toLocaleString('fr-FR')} km (à ${e.kmDue!.toLocaleString('fr-FR')} km)`, left !== null && left <= 0 ? 'bad' : left !== null && left <= KM_ALERT ? 'warn' : undefined)
      }))}
      {section('Interventions à faire / en cours', todo.length, todo.map((i) => (
        <Link key={i.id} to={`/interventions/${i.id}`} className="card clickable agenda-item inter">
          <span className="ico inter" aria-hidden><Icon name="wrench" size={18} /></span>
          <div className="card-main"><strong>{carName(okCars.get(i.vehicleId))}</strong><span className="muted">{new Date(i.startAt).toLocaleDateString('fr-FR')} · {i.statut === 'en_cours' ? 'en cours' : 'à faire'} · {i.description || 'Sans description'}</span></div>
        </Link>
      )))}
      {nothing && <EmptyState icon="calendar">Rien à signaler. Les échéances et rendez-vous à venir apparaîtront ici.</EmptyState>}
    </>
  )
}

function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // lundi = 0
  return addDays(date, -dow)
}

function Calendar({ view, day, today, data, go }: { view: View; day: string; today: string; data: AgendaData; go: (p: Record<string, string>) => void }) {
  const nav = useNavigate()
  const { byDay } = data
  const step = (dir: 1 | -1) => go({ date: view === 'mois' ? addMonths(day, dir) : addDays(day, dir * (view === 'semaine' ? 7 : 1)) })
  const label =
    view === 'mois'
      ? new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
      : view === 'semaine'
        ? `Semaine du ${formatDateFr(weekStart(day)).replace(/^\w+ /, '')}`
        : formatDateFr(day)

  const dayBlock = (d: string, showEmpty: boolean) => {
    const its = byDay.get(d) ?? []
    return (
      <section key={d} aria-label={formatDateFr(d)}>
        <h2 className={d === today ? 'today' : ''}>{formatDateFr(d)}{d === today ? ' · aujourd’hui' : ''}</h2>
        {its.map((it) => <ItemCard key={it.key} it={it} />)}
        {!its.length && showEmpty && <p className="muted" style={{ margin: '0 0 8px' }}>Rien de prévu.</p>}
        {view !== 'jour' && <Link className="link" to={`/rendez-vous/nouveau?date=${d}`}>+ Rendez-vous ce jour</Link>}
      </section>
    )
  }

  let body: React.ReactNode
  if (view === 'jour') body = dayBlock(day, true)
  else if (view === 'semaine') body = Array.from({ length: 7 }, (_, i) => dayBlock(addDays(weekStart(day), i), true))
  else {
    const first = `${day.slice(0, 8)}01`
    const start = weekStart(first)
    const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i))
    body = (
      <>
        <div className="month" role="grid">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="month-head">{d}</div>)}
          {cells.map((d) => {
            const its = byDay.get(d) ?? []
            const kinds = new Set(its.filter((i) => !i.dim).map((i) => i.kind))
            return (
              <button key={d} type="button" role="gridcell" aria-label={`${formatDateFr(d)}, ${its.length} élément(s)`} className={`month-cell${d.slice(0, 7) !== day.slice(0, 7) ? ' other' : ''}${d === today ? ' today' : ''}${d === day ? ' selected' : ''}`} onClick={() => go({ date: d })}>
                <span>{Number(d.slice(8))}</span>
                <span className="dots">{[...kinds].map((k) => <i key={k} className={`dot ${k}`} />)}</span>
              </button>
            )
          })}
        </div>
        <div className="actions"><button type="button" className="btn" onClick={() => nav(`/rendez-vous/nouveau?date=${day}`)}>+ Rendez-vous le {Number(day.slice(8))}</button></div>
        {dayBlock(day, true)}
      </>
    )
  }

  return (
    <>
      <div className="cal-nav">
        <button type="button" className="btn" onClick={() => step(-1)} aria-label="Précédent"><Icon name="chevron-right" size={18} className="flip" /></button>
        <strong className="cal-label">{label}</strong>
        <button type="button" className="btn" onClick={() => step(1)} aria-label="Suivant"><Icon name="chevron-right" size={18} /></button>
        <button type="button" className="btn" onClick={() => go({ date: today })}>Aujourd'hui</button>
      </div>
      {body}
    </>
  )
}
