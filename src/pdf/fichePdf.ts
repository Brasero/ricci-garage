import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { FicheModel } from '../../shared/fiche'

/** Rend la fiche véhicule en PDF (A4). Texte vectoriel, polices standard : aucun téléchargement, fonctionne hors connexion. */

const W = 595.28
const H = 841.89
const M = 42 // marges
const BOTTOM = 64 // espace réservé au pied de page
const CW = W - 2 * M

const PRIMARY = rgb(0.094, 0.251, 0.439)
const TEXT = rgb(0.09, 0.13, 0.17)
const MUTED = rgb(0.36, 0.42, 0.48)
const FILL = rgb(0.94, 0.96, 0.98)
const LINE = rgb(0.84, 0.87, 0.9)
const LABEL_W = 122 // largeur de la colonne des libellés dans les cadres

export async function renderFichePdf(m: FicheModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const supported = new Set(regular.getCharacterSet())
  doc.setTitle(`Fiche véhicule — ${m.vehicule.titre}`)
  doc.setAuthor(m.garage.nom)
  doc.setCreator('Mitch depann')
  doc.setLanguage('fr-FR')

  /** Les polices standard ne connaissent que le latin-1 : on normalise les espaces spéciaux et on remplace le reste par « ? ». */
  const clean = (s: string): string =>
    [...s.replace(/[   ]/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ᵉ|ᵉ/g, 'e').replace(/ʳ/g, 'r')]
      .map((ch) => (ch === '\n' || supported.has(ch.codePointAt(0)!) ? ch : '?'))
      .join('')

  let page: PDFPage = doc.addPage([W, H])
  let y = H - M

  const width = (s: string, f: PDFFont, size: number) => f.widthOfTextAtSize(s, size)
  function wrap(raw: string, f: PDFFont, size: number, max: number): string[] {
    const out: string[] = []
    for (const para of clean(raw).split('\n')) {
      let line = ''
      for (const word of para.split(' ')) {
        const test = line ? `${line} ${word}` : word
        if (width(test, f, size) <= max || !line) line = test
        else {
          out.push(line)
          line = word
        }
      }
      out.push(line)
    }
    return out
  }
  function text(s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' } = {}) {
    const size = o.size ?? 10
    const f = o.font ?? regular
    const t = clean(s)
    const xx = o.align === 'right' ? x - width(t, f, size) : x
    page.drawText(t, { x: xx, y: yy, size, font: f, color: o.color ?? TEXT })
  }
  const rule = (yy: number, color = LINE, thickness = 0.6) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness, color })
  const newPage = () => {
    page = doc.addPage([W, H])
    y = H - M
  }
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage()
  }

  // ── En-tête : garage à gauche, titre du document à droite ──
  text(m.garage.nom, M, y - 16, { size: 18, font: bold, color: PRIMARY })
  let gy = y - 32
  for (const l of m.garage.lignes) {
    text(l, M, gy, { size: 9, color: MUTED })
    gy -= 12
  }
  text('FICHE VÉHICULE', W - M, y - 14, { size: 12, font: bold, color: PRIMARY, align: 'right' })
  text(`Éditée le ${m.editeLe}`, W - M, y - 29, { size: 9, color: MUTED, align: 'right' })
  y = Math.min(gy, y - 44) - 6
  rule(y, PRIMARY, 1.4)
  y -= 16

  // ── Cadres « Véhicule » et « Propriétaire » côte à côte ──
  const gap = 14
  const wL = CW * 0.6
  const wR = CW - wL - gap
  function boxLayout(w: number, title: string, head: string, rows: [string, string][], plain: string[]) {
    const pad = 10
    const inner = w - 2 * pad
    const items: { kind: 'head' | 'row' | 'plain'; lines: string[]; label?: string }[] = []
    items.push({ kind: 'head', lines: wrap(head, bold, 13, inner) })
    for (const [label, value] of rows) items.push({ kind: 'row', label, lines: wrap(value, regular, 9.5, inner - LABEL_W - 4) })
    for (const p of plain) items.push({ kind: 'plain', lines: wrap(p, regular, 9.5, inner) })
    let h = pad + 12 + 6
    for (const it of items) h += it.lines.length * (it.kind === 'head' ? 16 : 12.5) + 3
    return { title, items, h: h + pad - 3, pad }
  }
  const boxes = [
    boxLayout(wL, 'VÉHICULE', m.vehicule.titre, m.vehicule.rows, []),
    boxLayout(wR, 'PROPRIÉTAIRE', m.client.nom || '—', [], m.client.lignes),
  ]
  const boxH = Math.max(...boxes.map((b) => b.h))
  ensure(boxH + 20)
  boxes.forEach((b, idx) => {
    const x = M + (idx === 0 ? 0 : wL + gap)
    const w = idx === 0 ? wL : wR
    page.drawRectangle({ x, y: y - boxH, width: w, height: boxH, color: FILL })
    page.drawRectangle({ x, y: y - boxH, width: 3, height: boxH, color: PRIMARY })
    let by = y - b.pad - 8
    text(b.title, x + b.pad + 4, by, { size: 8, font: bold, color: PRIMARY })
    by -= 6
    for (const it of b.items) {
      if (it.kind === 'head') {
        for (const l of it.lines) {
          by -= 16
          text(l, x + b.pad + 4, by + 2, { size: 13, font: bold })
        }
      } else if (it.kind === 'row') {
        it.lines.forEach((l, k) => {
          by -= 12.5
          if (k === 0) text(it.label!, x + b.pad + 4, by, { size: 8.5, color: MUTED })
          text(l, x + b.pad + 4 + LABEL_W, by, { size: 9.5, font: it.label === 'Immatriculation' ? bold : regular })
        })
      } else {
        for (const l of it.lines) {
          by -= 12.5
          text(l, x + b.pad + 4, by, { size: 9.5 })
        }
      }
      by -= 3
    }
  })
  y -= boxH + 22

  // ── Historique des interventions ──
  text("Historique des interventions", M, y, { size: 12, font: bold, color: PRIMARY })
  y -= 8
  rule(y)
  y -= 14
  if (!m.interventions.length) {
    text('Aucune intervention terminée enregistrée pour ce véhicule.', M, y, { size: 10, color: MUTED })
    y -= 20
  }

  const cols = { ref: 0.4, qte: 0.5, pu: 0.76, tot: 1 }
  const colX = (f: number) => M + 10 + (CW - 20) * f
  for (const it of m.interventions) {
    const desc = it.description ? wrap(it.description, regular, 9.5, CW - 20) : []
    const first = it.lignes[0]
    ensure(26 + desc.length * 12.5 + (first ? 36 : 0) + 24)

    // bandeau : date · kilométrage, type à droite
    page.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: FILL })
    text([it.date, it.km].filter(Boolean).join('  ·  '), M + 10, y - 14, { size: 10, font: bold })
    if (it.type) text(it.type, W - M - 10, y - 14, { size: 9, color: MUTED, align: 'right' })
    y -= 20 + 6

    for (const l of desc) {
      ensure(14)
      y -= 12.5
      text(l, M + 10, y, { size: 9.5 })
    }
    if (it.duree) {
      y -= 12.5
      text(`Durée : ${it.duree}`, M + 10, y, { size: 9, color: MUTED })
    }
    y -= 6

    if (it.lignes.length) {
      ensure(16 + 16)
      text('Pièces', M + 10, y - 9, { size: 8, font: bold, color: MUTED })
      text('Réf.', colX(cols.ref - 0.22), y - 9, { size: 8, font: bold, color: MUTED })
      text('Qté', colX(cols.qte), y - 9, { size: 8, font: bold, color: MUTED, align: 'right' })
      text('Prix unit.', colX(cols.pu), y - 9, { size: 8, font: bold, color: MUTED, align: 'right' })
      text('Total', colX(cols.tot), y - 9, { size: 8, font: bold, color: MUTED, align: 'right' })
      y -= 13
      rule(y)
      for (const l of it.lignes) {
        const name = wrap(l.designation, regular, 9, colX(cols.ref - 0.22) - M - 16)
        ensure(name.length * 12 + 4)
        y -= 3
        name.forEach((ln, k) => {
          y -= 12
          text(ln, M + 10, y, { size: 9 })
          if (k === 0) {
            text(l.reference, colX(cols.ref - 0.22), y, { size: 8.5, color: MUTED })
            text(l.quantite, colX(cols.qte), y, { size: 9, align: 'right' })
            text(l.prixUnitaire, colX(cols.pu), y, { size: 9, align: 'right' })
            text(l.total, colX(cols.tot), y, { size: 9, align: 'right' })
          }
        })
        y -= 2
      }
      rule(y - 1)
      y -= 4
    }

    // totaux de l'intervention
    const sums: [string, string, boolean][] = []
    if (it.lignes.length) sums.push(['Pièces', it.piecesTotal, false])
    if (it.mainOeuvre) sums.push(["Main d'œuvre", it.mainOeuvre, false])
    sums.push(['Total', it.total, true])
    ensure(sums.length * 14 + 10)
    for (const [label, value, strong] of sums) {
      y -= 14
      text(label, colX(cols.pu) - 6, y, { size: strong ? 10 : 9, font: strong ? bold : regular, color: strong ? TEXT : MUTED, align: 'right' })
      text(value, colX(cols.tot), y, { size: strong ? 10.5 : 9.5, font: strong ? bold : regular, align: 'right' })
    }
    y -= 20
  }

  // ── Total général, mention, signature ──
  if (m.interventions.length > 1) {
    ensure(30)
    page.drawRectangle({ x: M, y: y - 22, width: CW, height: 22, color: PRIMARY })
    text('Total général des interventions', M + 10, y - 15, { size: 10, font: bold, color: rgb(1, 1, 1) })
    text(m.totalGeneral, W - M - 10, y - 15, { size: 11, font: bold, color: rgb(1, 1, 1), align: 'right' })
    y -= 36
  }
  const notes = [m.mention, m.signature].filter(Boolean).flatMap((n) => wrap(n, regular, 8.5, CW))
  ensure(notes.length * 11 + 10)
  for (const l of notes) {
    y -= 11
    text(l, M, y, { size: 8.5, color: MUTED })
  }

  // ── Pied de page sur chaque page ──
  const pages = doc.getPages()
  pages.forEach((p, idx) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.6, color: LINE })
    const left = clean(`${m.garage.nom}  ·  ${m.vehicule.titre}`)
    p.drawText(left, { x: M, y: 30, size: 8, font: regular, color: MUTED })
    const right = `Page ${idx + 1} / ${pages.length}`
    p.drawText(right, { x: W - M - width(right, regular, 8), y: 30, size: 8, font: regular, color: MUTED })
  })

  return doc.save()
}
