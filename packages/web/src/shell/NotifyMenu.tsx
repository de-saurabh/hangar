import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { Menu } from '../components/Menu'
import { notifyEnabled, setNotify } from '../live'
import { HooksSetup } from '../routes/HooksSetup'

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md p-2 text-[13.5px] hover:bg-hover">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-accent" />
      {label}
    </label>
  )
}

function DesktopAlerts() {
  const qc = useQueryClient()
  const { data: prefs } = useQuery({ queryKey: ['prefs'], queryFn: api.prefs })
  const set = useMutation({
    mutationFn: (on: boolean) => api.setPrefs({ desktopAlerts: on }),
    onSuccess: (p) => qc.setQueryData(['prefs'], p),
  })
  return <Switch checked={prefs?.desktopAlerts ?? false} onChange={(on) => set.mutate(on)} label="Desktop alert when a session needs me" />
}

function BrowserAlerts() {
  const [on, setOn] = useState(notifyEnabled)
  const [blocked, setBlocked] = useState(false)
  const change = async (want: boolean) => {
    const next = await setNotify(want)
    setOn(next)
    setBlocked(want && !next)
  }
  return (
    <>
      <Switch checked={on} onChange={change} label="Browser alert while this tab is open" />
      {blocked && <p className="m-0 px-2 pb-1 text-xs text-waiting">The browser blocked notifications. Allow them for this site, then try again.</p>}
    </>
  )
}

/** The bell in the header: every way Hangar can tell you a session needs you. */
export function NotifyMenu() {
  return (
    <Menu
      label="Alerts"
      trigger={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      }
    >
      <DesktopAlerts />
      <BrowserAlerts />
      <div className="px-2 pt-1.5">
        <HooksSetup />
      </div>
    </Menu>
  )
}
