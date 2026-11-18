import { useEffect, useState } from 'react'
import type { SettingScope } from '@hangar/shared'
import { api } from '../../api'
import { Button } from '../../components/Button'

const AUTO_HIDE_MS = 30_000
export const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

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

  const hidden = revealed === undefined
  return (
    <span className={`${className} flex flex-wrap items-center gap-2`}>
      <span className={hidden ? 'text-muted' : ''}>{revealed ?? show(value)}</span>
      <Button className="min-h-6 px-2 text-xs" disabled={busy} aria-label={`${hidden ? 'Reveal' : 'Hide'} value of ${settingKey}`} onClick={() => (hidden ? void reveal() : setRevealed(undefined))}>
        {hidden ? 'Reveal' : 'Hide'}
      </Button>
      {error && <span role="alert" className="font-sans text-xs text-error">{error}</span>}
    </span>
  )
}
