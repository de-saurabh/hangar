import { valuesForScope, type EffectiveSettings, type LayerInfo } from '@hangar/shared'
import { EmptyLine, Section } from '../../components/Section'
import { SCOPE_LABEL, ScopeTag } from '../../components/ScopeTag'
import type { View } from './Config'
import { show, ValueCell } from './ValueCell'

const ROW = 'grid grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-border py-2.5 first:border-t-0'
const VALUE = 'break-all font-mono text-[13px]'

/** Says where the data comes from, and which files couldn't be read. Fails soft: nothing here can crash the page. */
export function LayerStatus({ layers, view, layer }: { layers: LayerInfo[]; view: View; layer?: LayerInfo }) {
  if (layer) {
    return (
      <div className="flex flex-col gap-1">
        <span className="break-all font-mono text-xs text-muted">{layer.path}</span>
        {layer.error && <span role="alert" className="text-sm text-waiting">Couldn't read this file: {layer.error}</span>}
        {!layer.exists && <span className="text-sm text-muted">File not found. Nothing is set at this level.</span>}
      </div>
    )
  }
  const present = layers.filter((l) => l.exists && !l.error)
  return (
    <div className="flex flex-col gap-1" data-view={view}>
      <span className="font-mono text-xs text-muted">Merged result · {present.map((l) => SCOPE_LABEL[l.scope]).reverse().join(' → ') || 'no settings files found'}</span>
      {layers
        .filter((l) => l.error)
        .map((l) => (
          <span key={l.scope} role="alert" className="text-sm text-waiting">
            Couldn't read {SCOPE_LABEL[l.scope]} settings ({l.error}). Its values are missing below.
          </span>
        ))}
    </div>
  )
}

/** Every setting as a key, a value and the file it comes from. */
export function SettingsSection({ settings, view, repoId }: { settings: EffectiveSettings; view: View; repoId: string }) {
  return (
    <Section title="Settings">
      {view === 'effective' ? <EffectiveRows settings={settings} repoId={repoId} /> : <LayerRows settings={settings} scope={view} repoId={repoId} />}
    </Section>
  )
}

function EffectiveRows({ settings, repoId }: { settings: EffectiveSettings; repoId: string }) {
  if (settings.values.length === 0) return <EmptyLine>No settings found.</EmptyLine>
  return (
    <>
      {settings.values.map((v) => (
        <div key={v.key} className={ROW}>
          <span className="break-all font-mono text-[13px]">{v.key}</span>
          <ValueCell repoId={repoId} settingKey={v.key} scope={v.source} value={v.value} masked={v.masked} className={VALUE} />
          <ScopeTag scope={v.source} />
          {v.overrides.length > 0 && (
            <span className="col-span-3 text-xs text-muted">
              Overrides{' '}
              {v.overrides.map((o, i) => (
                <span key={o.source}>
                  {i > 0 && ', '}
                  <span className="font-mono line-through">
                    {SCOPE_LABEL[o.source]}: {show(o.value)}
                  </span>
                </span>
              ))}
            </span>
          )}
        </div>
      ))}
    </>
  )
}

function LayerRows({ settings, scope, repoId }: { settings: EffectiveSettings; scope: Exclude<View, 'effective'>; repoId: string }) {
  const rows = valuesForScope(settings.values, scope)
  if (rows.length === 0) return <EmptyLine>Nothing set at this level.</EmptyLine>
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className={ROW}>
          <span className="break-all font-mono text-[13px]">{r.key}</span>
          <ValueCell repoId={repoId} settingKey={r.key} scope={scope} value={r.value} masked={r.masked} className={`${VALUE} ${r.overriddenBy ? 'text-muted line-through' : ''}`} />
          {r.overriddenBy ? <span className="text-xs text-muted">Overridden by {SCOPE_LABEL[r.overriddenBy]}</span> : <ScopeTag scope={scope} />}
        </div>
      ))}
    </>
  )
}
