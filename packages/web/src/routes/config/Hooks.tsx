import type { HookEntry } from '@hangar/shared'
import { EmptyLine, Section } from '../../components/Section'
import { ScopeTag } from '../../components/ScopeTag'
import { Tag } from '../../components/Tag'
import type { View } from './Config'

export function HooksSection({ hooks, view }: { hooks: HookEntry[]; view: View }) {
  const shown = view === 'effective' ? hooks : hooks.filter((h) => h.sources.includes(view))
  return (
    <Section title="Hooks" count={shown.length}>
      {shown.length === 0 && <EmptyLine>{view === 'effective' ? 'No hooks configured.' : 'No hooks at this level.'}</EmptyLine>}
      {shown.map((h) => (
        <div key={`${h.event}|${h.matcher ?? ''}|${h.type}|${h.summary}`} className="flex flex-col gap-0.5 border-t border-border py-2 first:border-t-0">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold">
              {h.event}
              {h.matcher ? ` · ${h.matcher}` : ''}
            </span>
            <span className="flex gap-1">
              {(view === 'effective' ? h.sources : [view]).map((s) => (
                <ScopeTag key={s} scope={s} />
              ))}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5 break-all font-mono text-xs text-muted">
            {h.type !== 'command' && <Tag>{h.type}</Tag>}
            {h.summary}
          </span>
        </div>
      ))}
    </Section>
  )
}
