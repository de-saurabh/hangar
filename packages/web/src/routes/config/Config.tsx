import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { EffectiveSettings, SettingScope } from '@hangar/shared'
import { api } from '../../api'
import { Segmented } from '../../components/Controls'
import { PageHeader } from '../../components/PageHeader'
import { RepoAvatar } from '../../components/RepoAvatar'
import { useScope } from '../../scope'
import { HooksSection } from './Hooks'
import { InstructionsSection } from './Instructions'
import { McpSection } from './Mcp'
import { PermissionsSection } from './Permissions'
import { SecretsSection } from './Secrets'
import { LayerStatus, SettingsSection } from './Settings'

/** The merged result, or one settings file on its own. */
export type View = 'effective' | SettingScope

const VIEWS = [
  ['effective', 'Effective'],
  ['user', 'Global'],
  ['project', 'Project'],
  ['local', 'Local'],
] as const satisfies readonly (readonly [View, string])[]

/** What Claude Code actually uses in the selected repo, and which file each value comes from. */
export function ConfigPage() {
  const [scope, setScope] = useScope()
  const [view, setView] = useState<View>('effective')
  const repos = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  const repo = repos.data?.find((r) => r.id === scope)
  const first = repos.data?.[0]

  // Config is always about one repo: with "All repos" (or a repo that was removed) selected, use the first.
  useEffect(() => {
    if (repos.data && !repo && first) setScope(first.id)
  }, [repos.data, repo, first, setScope])

  const settings = useQuery({ queryKey: ['settings', repo?.id], queryFn: () => api.settings(repo!.id), enabled: !!repo })

  if (repos.isPending) return <p className="text-sm text-muted">Loading…</p>
  if (repos.data && repos.data.length === 0) return <p className="text-sm text-muted">Add a repo from "Manage repos" above to see its config.</p>
  if (!repo) return null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Config"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <RepoAvatar name={repo.name} size="sm" />
            {repo.name}: what Claude Code actually uses, and which file each value comes from.
          </span>
        }
      >
        <Segmented label="Settings file" value={view} options={VIEWS} onChange={setView} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {settings.isPending && <p className="m-0 text-sm text-muted">Loading…</p>}
          {settings.error && <p role="alert" className="m-0 text-sm text-error">Couldn't load settings: {settings.error.message}</p>}
          {settings.data && <ConfigBody settings={settings.data} view={view} repoId={repo.id} />}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <InstructionsSection repoId={repo.id} />
          <SecretsSection repoId={repo.id} />
        </div>
      </div>
    </div>
  )
}

function ConfigBody({ settings, view, repoId }: { settings: EffectiveSettings; view: View; repoId: string }) {
  const layer = view === 'effective' ? undefined : settings.layers.find((l) => l.scope === view)
  return (
    <>
      <LayerStatus layers={settings.layers} view={view} layer={layer} />
      <SettingsSection settings={settings} view={view} repoId={repoId} />
      <PermissionsSection settings={settings} view={view} />
      <div className="grid grid-cols-1 gap-6 min-[700px]:grid-cols-2">
        <HooksSection hooks={settings.hooks} view={view} />
        <McpSection repoId={repoId} view={view} />
      </div>
    </>
  )
}
