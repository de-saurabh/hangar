import type { HookEntry, SettingScope } from '@hangar/shared'
import { SCOPE_CHIP, SCOPE_LABEL } from '../scopes'

export function HooksPanel({ hooks, tab }: { hooks: HookEntry[]; tab: 'effective' | SettingScope }) {
  const shown = tab === 'effective' ? hooks : hooks.filter((h) => h.sources.includes(tab))
  return (
    <section className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-[18px]">
      <h2 className="text-[17px] font-bold">Hooks</h2>
      {shown.length === 0 && <p className="text-sm text-muted">{tab === 'effective' ? 'No hooks configured.' : 'No hooks at this level.'}</p>}
      {shown.map((h) => (
        <div key={`${h.event}|${h.matcher ?? ''}|${h.type}|${h.summary}`} className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold">
              {h.event}
              {h.matcher ? ` · ${h.matcher}` : ''}
            </span>
            <span className="flex gap-1">
              {(tab === 'effective' ? h.sources : [tab]).map((s) => (
                <span key={s} className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold text-bg ${SCOPE_CHIP[s]}`}>
                  {SCOPE_LABEL[s]}
                </span>
              ))}
            </span>
          </span>
          <span className="break-all font-mono text-xs text-muted">
            {h.type !== 'command' && <span className="mr-1.5 rounded border border-border px-1 text-[10px] uppercase">{h.type}</span>}
            {h.summary}
          </span>
        </div>
      ))}
    </section>
  )
}
