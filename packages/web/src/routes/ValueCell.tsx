import { useEffect, useState } from 'react'
import type { SettingScope } from '@hangar/shared'
import { api } from '../api'

const AUTO_HIDE_MS = 30_000
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

interface Props {
  repoId: string
  settingKey: string
  /** The layer this value lives in (used to fetch the real value on Reveal). */
  scope: SettingScope
  value: unknown
  masked?: boolean
  className?: string
}

/**
 * Renders a settings value. Masked values show bullets plus a Reveal button.
 * The revealed value is kept in local state only (never the query cache) and
 * hides itself after 30 s.
 */
export function ValueCell({ repoId, settingKey, scope, value, masked, className = '' }: Props) {
  const [revealed, setRevealed] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (revealed === undefined) return
    const t = setTimeout(() => setRevealed(undefined), AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [revealed])

  if (!masked) return <span className={className}>{show(value)}</span>

  const reveal = async () => {
    setBusy(true)
    setError(undefined)
    try {
      setRevealed(show((await api.revealSetting(repoId, settingKey, scope)).value))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={`${className} flex flex-wrap items-center gap-2`}>
      <span className={revealed === undefined ? 'text-muted' : ''}>{revealed ?? show(value)}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => (revealed === undefined ? void reveal() : setRevealed(undefined))}
        className="rounded border border-border px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted hover:text-text disabled:opacity-50"
        aria-label={`${revealed === undefined ? 'Reveal' : 'Hide'} value of ${settingKey}`}
      >
        {revealed === undefined ? 'Reveal' : 'Hide'}
      </button>
      {error && <span role="alert" className="font-sans text-xs text-error">{error}</span>}
    </span>
  )
}
