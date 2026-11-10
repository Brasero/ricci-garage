import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { serverAccepts } from '../shared/sync'
import type { RecordKind, SyncChange, SyncRequest, SyncResponse } from '../shared/types'
import { loginPage } from './loginPage'
import { sendMail, type MailEnv } from './mail'
import { getGcalStatus, parseServiceAccount, runGcalSync, type GcalEnv } from './gcal'
import { getStatus, loadAll, mailConfigured, runReminders } from './reminders'
import { sniffImage } from './photos'
import { SESSION_COOKIE, SESSION_MAX_AGE, createSession, safeEqual, verifySession } from './auth'

interface Env extends Partial<MailEnv>, Partial<Omit<GcalEnv, 'DB'>> {
  DB: D1Database
  /** Bucket R2 des photos (images compressées, ≤ 1 Mo). */
  PHOTOS: R2Bucket
  /** Fichiers de l'application (build Vite). Jamais servis sans session valide. */
  ASSETS: Fetcher
  /** Mot de passe de l'application (secret Cloudflare). */
  APP_PASSWORD: string
  /** Clé de signature des sessions (secret Cloudflare, longue chaîne aléatoire). */
  SESSION_SECRET: string
}

const KINDS: RecordKind[] = ['client', 'vehicle', 'intervention', 'photo', 'rdv', 'echeance', 'settings']
const MAX_PHOTO_BYTES = 1_500_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DATA_BYTES = 20_000
const MAX_CHANGES_PER_REQUEST = 200
const PAGE_SIZE = 500
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

/** Même valeur que dans wrangler.jsonc : synchronisation Google Agenda, 5 minutes après chaque vérification des rappels. */
const GCAL_CRON = '5,20,35,50 * * * *'

const app = new Hono<{ Bindings: Env }>()

// Protection CSRF : les écritures doivent être du JSON (un formulaire d'un autre site ne peut pas l'envoyer).
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'POST' && !c.req.header('content-type')?.startsWith('application/json')) {
    return c.json({ error: 'bad_content_type' }, 415)
  }
  await next()
})

app.post('/api/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  const now = Date.now()
  const { results } = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?')
    .bind(ip, now - WINDOW_MS)
    .all<{ n: number }>()
  if ((results[0]?.n ?? 0) >= MAX_ATTEMPTS) return c.json({ error: 'too_many_attempts' }, 429)

  const body = await c.req.json<{ password?: unknown }>().catch(() => ({}) as { password?: unknown })
  const password = typeof body.password === 'string' ? body.password : ''
  if (!c.env.APP_PASSWORD || !safeEqual(password, c.env.APP_PASSWORD)) {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, now),
      c.env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(now - WINDOW_MS),
    ])
    return c.json({ error: 'invalid_password' }, 401)
  }
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run()
  setCookie(c, SESSION_COOKIE, await createSession(c.env.SESSION_SECRET), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return c.json({ ok: true })
})

app.post('/api/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// Tout ce qui suit exige une session valide.
app.use('/api/*', async (c, next) => {
  if (!(await verifySession(c.env.SESSION_SECRET, getCookie(c, SESSION_COOKIE)))) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
})

app.get('/api/session', (c) => c.json({ ok: true }))

function parseChange(raw: unknown): SyncChange | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !UUID.test(r.id)) return null
  if (!KINDS.includes(r.kind as RecordKind)) return null
  if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt)) return null
  if (r.deletedAt !== null && (typeof r.deletedAt !== 'number' || !Number.isFinite(r.deletedAt))) return null
  if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return null
  if (JSON.stringify(r.data).length > MAX_DATA_BYTES) return null
  return { id: r.id, kind: r.kind as RecordKind, updatedAt: r.updatedAt, deletedAt: r.deletedAt as number | null, data: r.data as Record<string, unknown> }
}

app.post('/api/sync', async (c) => {
  const body = await c.req.json<Partial<SyncRequest>>().catch(() => null)
  if (!body || typeof body.cursor !== 'number' || !Array.isArray(body.changes)) return c.json({ error: 'bad_request' }, 400)
  if (body.changes.length > MAX_CHANGES_PER_REQUEST) return c.json({ error: 'too_many_changes' }, 413)
  const changes = body.changes.map(parseChange)
  if (changes.some((x) => x === null)) return c.json({ error: 'invalid_change' }, 400)

  const db = c.env.DB
  if (changes.length) {
    // Un seul « lot » : tout est appliqué ou rien (transaction D1).
    const ids = (changes as SyncChange[]).map((x) => x.id)
    const existing = await db
      .prepare(`SELECT id, updated_at FROM records WHERE id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all<{ id: string; updated_at: number }>()
    const known = new Map(existing.results.map((r) => [r.id, r.updated_at]))
    const stmts: D1PreparedStatement[] = []
    for (const ch of changes as SyncChange[]) {
      if (!serverAccepts(known.get(ch.id) ?? null, ch.updatedAt)) continue
      stmts.push(db.prepare("UPDATE meta SET v = v + 1 WHERE k = 'seq'"))
      stmts.push(
        db
          .prepare(
            `INSERT INTO records (id, kind, data, updated_at, deleted_at, seq)
             VALUES (?1, ?2, ?3, ?4, ?5, (SELECT v FROM meta WHERE k = 'seq'))
             ON CONFLICT(id) DO UPDATE SET
               kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at, seq = excluded.seq
             WHERE excluded.updated_at >= records.updated_at`,
          )
          .bind(ch.id, ch.kind, JSON.stringify(ch.data), ch.updatedAt, ch.deletedAt),
      )
    }
    if (stmts.length) await db.batch(stmts)
  }

  const { results } = await db
    .prepare('SELECT id, kind, data, updated_at, deleted_at, seq FROM records WHERE seq > ? ORDER BY seq LIMIT ?')
    .bind(body.cursor, PAGE_SIZE + 1)
    .all<{ id: string; kind: RecordKind; data: string; updated_at: number; deleted_at: number | null; seq: number }>()
  const hasMore = results.length > PAGE_SIZE
  const page = results.slice(0, PAGE_SIZE)
  const res: SyncResponse = {
    changes: page.map((r) => ({
      id: r.id,
      kind: r.kind,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      data: JSON.parse(r.data) as Record<string, unknown>,
      seq: r.seq,
    })),
    cursor: page.length ? page[page.length - 1].seq : body.cursor,
    hasMore,
  }
  return c.json(res)
})

app.put('/api/photos/:id', async (c) => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'bad_id' }, 400)
  const declared = Number(c.req.header('content-length') ?? 0)
  if (declared > MAX_PHOTO_BYTES) return c.json({ error: 'too_large' }, 413)
  const buf = await c.req.arrayBuffer()
  if (buf.byteLength === 0) return c.json({ error: 'empty' }, 400)
  if (buf.byteLength > MAX_PHOTO_BYTES) return c.json({ error: 'too_large' }, 413)
  const mime = sniffImage(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)))
  if (!mime) return c.json({ error: 'not_an_image' }, 415)
  const key = `photos/${id}`
  // Les photos sont immuables : si elle existe déjà (envoi répété), rien à refaire.
  if (!(await c.env.PHOTOS.head(key))) await c.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: mime } })
  return c.json({ ok: true })
})

app.get('/api/photos/:id', async (c) => {
  const id = c.req.param('id')
  if (!UUID.test(id)) return c.json({ error: 'bad_id' }, 400)
  const obj = await c.env.PHOTOS.get(`photos/${id}`)
  if (!obj) return c.json({ error: 'not_found' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// État de l'envoi d'emails (affiché dans les Réglages).
app.get('/api/mail/status', async (c) => {
  const recent = await c.env.DB.prepare('SELECT sent_at, to_addr, subject FROM reminder_log ORDER BY sent_at DESC LIMIT 5').all()
  return c.json({ configured: mailConfigured(c.env), lastRun: await getStatus(c.env.DB), recent: recent.results })
})

// Google Agenda (sens unique : application → Google).
app.get('/api/gcal/status', async (c) => {
  const sa = parseServiceAccount(c.env.GOOGLE_SA_JSON)
  const { settings } = await loadAll(c.env.DB)
  const pending = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM gcal_sync').first<{ n: number }>()
  return c.json({ configured: !!sa, serviceAccountEmail: sa?.client_email ?? null, calendarId: settings.googleCalendarId, synced: pending?.n ?? 0, lastRun: await getGcalStatus(c.env.DB) })
})

app.post('/api/gcal/sync', async (c) => {
  const status = await runGcalSync(c.env as GcalEnv)
  return c.json({ ok: !!status && !status.error, status })
})

// Email de test vers l'adresse du récapitulatif : sert à vérifier la configuration SMTP (Gmail).
app.post('/api/mail/test', async (c) => {
  if (!mailConfigured(c.env)) return c.json({ error: 'smtp_not_configured' }, 503)
  const { settings } = await loadAll(c.env.DB)
  try {
    await sendMail(c.env as MailEnv, {
      fromName: settings.garageNom,
      to: settings.emailRecap,
      replyTo: settings.garageEmail || undefined,
      subject: `Test d'envoi — ${settings.garageNom}`,
      text: "Si vous lisez ce message, l'envoi d'emails fonctionne.",
      html: "<p>Si vous lisez ce message, l'envoi d'emails fonctionne.</p>",
    })
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: 'send_failed', detail: e instanceof Error ? e.message : String(e) }, 502)
  }
})

app.notFound(async (c) => c.json({ error: 'not_found' }, 404))

// Une route d'API inconnue répond 404 en JSON (et ne retombe jamais sur les fichiers de l'application).
app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

/** Seules exceptions publiques : les icônes (un « RG » sur fond bleu), que le navigateur réclame sans cookie pour installer l'appli. */
const PUBLIC_FILES = new Set(['/icon-192.png', '/icon-512.png'])

/**
 * Tout le reste (pages, scripts, images, manifeste…) : l'application n'est livrée qu'avec une session valide.
 * Sans session, la seule réponse possible est la page de code (ou une 401 pour les autres ressources).
 */
app.all('*', async (c) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.text('Method Not Allowed', 405)
  if (PUBLIC_FILES.has(new URL(c.req.url).pathname) || (await verifySession(c.env.SESSION_SECRET, getCookie(c, SESSION_COOKIE)))) {
    const res = await c.env.ASSETS.fetch(c.req.raw)
    const out = new Response(res.body, res)
    out.headers.set('X-Content-Type-Options', 'nosniff')
    out.headers.set('Referrer-Policy', 'no-referrer')
    out.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return out
  }
  const accept = c.req.header('accept') ?? ''
  const headers = {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  }
  if (!accept.includes('text/html')) return new Response('Unauthorized', { status: 401, headers })
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  return new Response(loginPage(nonce), {
    status: 401,
    headers: {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    },
  })
})

export default {
  fetch: app.fetch,
  // Déclenché par le cron de wrangler.jsonc (toutes les 15 minutes).
  scheduled(controller, env, ctx) {
    // Deux déclencheurs décalés (wrangler.jsonc) : chacun dispose de son propre budget de sous-requêtes.
    ctx.waitUntil(controller.cron === GCAL_CRON ? runGcalSync(env as GcalEnv) : runReminders(env))
  },
} satisfies ExportedHandler<Env>
