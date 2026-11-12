import type { ReactNode } from 'react'

/** Jeu d'icônes maison (traits arrondis, 24×24) : cohérentes entre elles, aucune dépendance, fonctionnent hors connexion. */
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>,
  users: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  'user-plus': <><circle cx="10" cy="8" r="4" /><path d="M2.5 21c0-4 3.2-7 7.5-7 1.6 0 3 .4 4.2 1.1M19 14v6M16 17h6" /></>,
  car: <><path d="M5 13l1.6-4.8A2 2 0 0 1 8.5 7h7a2 2 0 0 1 1.9 1.2L19 13" /><rect x="3" y="13" width="18" height="5" rx="1.8" /><circle cx="7.5" cy="18" r="1.4" /><circle cx="16.5" cy="18" r="1.4" /><path d="M3 15.5h2M19 15.5h2" /></>,
  'car-plus': <><path d="M5 13l1.6-4.8A2 2 0 0 1 8.5 7h5.5" /><rect x="3" y="13" width="14" height="5" rx="1.8" /><circle cx="7" cy="18" r="1.4" /><path d="M20 4v6M17 7h6" /></>,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  'calendar-plus': <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18M12 13v5M9.5 15.5h5" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7.5 8.5 6 8.5-6" /></>,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  check: <path d="m5 13 4 4L19 7" />,
  alert: <><path d="M12 3.5 22 20.5H2z" /><path d="M12 10v4.5M12 17.6h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />,
  camera: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-3h5L16 7" /></>,
  file: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  share: <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  download: <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />,
  upload: <path d="M12 16V5M8 9l4-4 4 4M5 20h14" />,
} as const satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, className = '', strokeWidth = 1.9 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}

/** Logo : carré arrondi bleu avec une clé à molette. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="rg-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6bb8" />
          <stop offset="1" stopColor="#14335f" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#rg-logo)" />
      <g transform="translate(8 8) scale(1)" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" transform="translate(-0.5 -0.5)" />
      </g>
    </svg>
  )
}
