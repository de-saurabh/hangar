import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  valuesForScope,
  type EffectiveSettings,
  type LayerInfo,
  type PermissionKind,
  type RuleEntry,
  type SettingScope,
} from '@hangar/shared'
import { api } from '../api'
import { SCOPE_CHIP, SCOPE_LABEL } from '../scopes'
import { ClaudeMdPanel } from './ClaudeMdPanel'
import { SecretsPanel } from './SecretsPanel'
import { HooksPanel } from './HooksPanel'
import { McpPanel } from './McpPanel'
import { ValueCell } from './ValueCell'

type Tab = 'effective' | SettingScope
const TABS: { id: Tab; label: string }[] = [
  { id: 'effective', label: 'Effective' },
  { id: 'user', label: 'Global' },
  { id: 'project', label: 'Project' },
  { id: 'local', label: 'Local' },
]

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

function Chip({ scope }: { scope: SettingScope }) {
  return (
    <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold text-bg ${SCOPE_CHIP[scope]}`}>
      {SCOPE_LABEL[scope]}
    </span>
  )
}

export function ConfigPage({ repoId }: { repoId: string }) {
  const [tab, setTab] = useState<Tab>('effective')
  const repos = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  const settings = useQuery({ queryKey: ['settings', repoId], queryFn: () => api.settings(repoId) })
  const repo = repos.data?.find((r) => r.id === repoId)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold">Config{repo ? ` · ${repo.name}` : ''}</h1>
          <span className="text-sm text-muted">What Claude Code actually uses in this repo, and which file each value comes from.</span>
        </div>
        <div role="tablist" aria-label="Scope" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-10 rounded-lg border px-3.5 text-sm font-semibold ${
                tab === t.id ? 'border-accent bg-selected text-text' : 'border-border text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          {settings.isPending && <p className="text-sm text-muted">Loading…</p>}
          {settings.error && (
            <p role="alert" className="text-sm text-error">
              Couldn't load settings: {settings.error.message}
            </p>
          )}
          {settings.data && <ConfigBody settings={settings.data} tab={tab} repoId={repoId} />}
        </div>
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-5">
          <ClaudeMdPanel repoId={repoId} />
          <SecretsPanel repoId={repoId} />
        </div>
      </div>
    </div>
  )
}

function ConfigBody({ settings, tab, repoId }: { settings: EffectiveSettings; tab: Tab; repoId: string }) {
  const layer = tab === 'effective' ? undefined : settings.layers.find((l) => l.scope === tab)
  return (
    <>
      <LayerStatus layers={settings.layers} tab={tab} layer={layer} />
      <section className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-surface p-[18px]">
        <h2 className="mb-1.5 text-[17px] font-bold">Settings</h2>
        <SettingsRows settings={settings} tab={tab} repoId={repoId} />
      </section>
      <section className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-[18px]">
        <h2 className="text-[17px] font-bold">Permissions</h2>
        <div className="flex flex-wrap gap-4">
          <RuleColumn kind="allow" settings={settings} tab={tab} />
          <RuleColumn kind="deny" settings={settings} tab={tab} />
          <RuleColumn kind="ask" settings={settings} tab={tab} />
        </div>
      </section>
      <div className="flex flex-wrap gap-5">
        <HooksPanel hooks={settings.hooks} tab={tab} />
        <McpPanel repoId={repoId} tab={tab} />
      </div>
    </>
  )
}

/** Fail-soft status line: shows where the data comes from and any file we couldn't read. */
function LayerStatus({ layers, tab, layer }: { layers: LayerInfo[]; tab: Tab; layer?: LayerInfo }) {
  if (layer) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted">{layer.path}</span>
        {layer.error && <span role="alert" className="text-sm text-waiting">Couldn't read this file: {layer.error}</span>}
        {!layer.exists && <span className="text-sm text-muted">File not found. Nothing is set at this level.</span>}
      </div>
    )
  }
  const present = layers.filter((l) => l.exists && !l.error)
  const broken = layers.filter((l) => l.error)
  return (
    <div className="flex flex-col gap-1" data-tab={tab}>
      <span className="font-mono text-xs text-muted">
        Merged result · {present.map((l) => SCOPE_LABEL[l.scope]).reverse().join(' → ') || 'no settings files found'}
      </span>
      {broken.map((l) => (
        <span key={l.scope} role="alert" className="text-sm text-waiting">
          Couldn't read {SCOPE_LABEL[l.scope]} settings ({l.error}). Its values are missing below.
        </span>
      ))}
    </div>
  )
}

function SettingsRows({ settings, tab, repoId }: { settings: EffectiveSettings; tab: Tab; repoId: string }) {
  if (tab === 'effective') {
    if (settings.values.length === 0) return <p className="text-sm text-muted">No settings found.</p>
    return (
      <>
        {settings.values.map((v) => (
          <div key={v.key} className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-subtle py-2.5">
            <span className="basis-[220px] font-mono text-[13px]">{v.key}</span>
            <ValueCell
              repoId={repoId}
              settingKey={v.key}
              scope={v.source}
              value={v.value}
              masked={v.masked}
              className="min-w-40 flex-1 break-all font-mono text-[13px]"
            />
            <Chip scope={v.source} />
            {v.overrides.length > 0 && (
              <span className="basis-full text-xs text-muted">
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
  const rows = valuesForScope(settings.values, tab)
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing set at this level.</p>
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-subtle py-2.5">
          <span className="basis-[220px] font-mono text-[13px]">{r.key}</span>
          <ValueCell
            repoId={repoId}
            settingKey={r.key}
            scope={tab}
            value={r.value}
            masked={r.masked}
            className={`min-w-40 flex-1 break-all font-mono text-[13px] ${r.overriddenBy ? 'text-muted line-through' : ''}`}
          />
          {r.overriddenBy ? (
            <span className="text-xs text-muted">Overridden by {SCOPE_LABEL[r.overriddenBy]}</span>
          ) : (
            <Chip scope={tab} />
          )}
        </div>
      ))}
    </>
  )
}

const RULE_STYLE: Record<PermissionKind, { label: string; color: string }> = {
  allow: { label: 'ALLOW', color: 'text-running' },
  deny: { label: 'DENY', color: 'text-error' },
  ask: { label: 'ASK', color: 'text-waiting' },
}

function RuleColumn({ kind, settings, tab }: { kind: PermissionKind; settings: EffectiveSettings; tab: Tab }) {
  const all: RuleEntry[] = settings.permissions[kind]
  const rules = tab === 'effective' ? all : all.filter((r) => r.sources.includes(tab))
  const { label, color } = RULE_STYLE[kind]
  return (
    <div className="flex flex-1 basis-60 flex-col gap-1.5">
      <span className={`text-xs font-bold tracking-wider ${color}`}>{label}</span>
      {rules.length === 0 && <span className="text-sm text-muted">None</span>}
      {rules.map((r) => (
        <span key={r.rule} className="flex items-center justify-between gap-2 font-mono text-[13px]">
          <span className="break-all">{r.rule}</span>
          <span className="flex gap-1">
            {(tab === 'effective' ? r.sources : [tab]).map((s) => (
              <Chip key={s} scope={s} />
            ))}
          </span>
        </span>
      ))}
    </div>
  )
}
