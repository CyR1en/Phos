import { useEffect, useRef } from 'preact/hooks'

/** Nested dialogs suspend the parent's trap and return focus to their opener. */
export function useModalFocus(open = true, suspended = false) {
  const ref = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement as HTMLElement | null
    return () => {
      const opener = openerRef.current
      // Unmount removes the trap and the parent's inert state before restoring.
      queueMicrotask(() => { if (opener?.isConnected && !opener.closest('[inert]')) opener.focus() })
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const dialog = ref.current
    if (!dialog) return
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    )).filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0)
    const focusFirst = () => (focusable()[0] ?? dialog).focus()
    if (!suspended && !dialog.contains(document.activeElement)) focusFirst()
    const onKey = (e: KeyboardEvent) => {
      if (suspended || e.key !== 'Tab') return
      const items = focusable()
      const first = items[0] ?? dialog
      const last = items[items.length - 1] ?? dialog
      if (!dialog.contains(document.activeElement) || (!e.shiftKey && document.activeElement === last)) {
        e.preventDefault(); first.focus()
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault(); last.focus()
      }
    }
    const onFocus = (e: FocusEvent) => {
      if (!suspended && !dialog.contains(e.target as Node)) focusFirst()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
    }
  }, [open, suspended])
  return ref
}
