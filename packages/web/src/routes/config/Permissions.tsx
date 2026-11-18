import type { EffectiveSettings, PermissionKind } from '@hangar/shared'
import { Section } from '../../components/Section'
import { ScopeTag } from '../../components/ScopeTag'
import type { View } from './Config'

const KINDS: { kind: PermissionKind; label: string; color: string }[] = [
  { kind: 'allow', label: 'Allow', color: 'text-running' },
  { kind: 'deny', label: 'Deny', color: 'text-error' },
  { kind: 'ask', label: 'Ask', color: 'text-waiting' },
]

/** What Claude may run without asking, what it may never run, and what it must ask about. */
export function PermissionsSection({ settings, view }: { settings: EffectiveSettings; view: View }) {
  return (
    <Section title="Permissions">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 min-[700px]:grid-cols-3">
        {KINDS.map(({ kind, label, color }) => {
          const rules = view === 'effective' ? settings.permissions[kind] : settings.permissions[kind].filter((r) => r.sources.includes(view))
          return (
            <div key={kind} className="flex min-w-0 flex-col gap-1.5">
              <h3 className={`m-0 text-[13px] font-semibold ${color}`}>{label}</h3>
              {rules.length === 0 && <span className="text-[13.5px] text-dim">None</span>}
              {rules.map((r) => (
                <span key={r.rule} className="flex items-center justify-between gap-2 font-mono text-[13px]">
                  <span className="break-all">{r.rule}</span>
                  <span className="flex gap-1">
                    {(view === 'effective' ? r.sources : [view]).map((s) => (
                      <ScopeTag key={s} scope={s} />
                    ))}
                  </span>
                </span>
              ))}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
