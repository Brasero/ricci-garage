import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface ToastItem {
  id: number
  text: string
}

const DURATION_MS = 3500
let counter = 0

const ToastContext = createContext<(text: string) => void>(() => undefined)

/** Affiche une confirmation brève (ex. « Client enregistré »). Elle survit au changement de page. */
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((l) => l.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (text: string) => {
      const id = ++counter
      setItems((l) => [...l.slice(-2), { id, text }]) // 3 confirmations au plus à l'écran
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION_MS))
    },
    [dismiss],
  )

  useEffect(() => {
    const t = timers.current
    return () => t.forEach((h) => clearTimeout(h))
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <button key={t.id} type="button" className="toast" onClick={() => dismiss(t.id)} aria-label={`${t.text} (fermer)`}>
            <span aria-hidden>✓</span> {t.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
