import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { LibraryItem } from '@hangar/shared'
import { api, type CopyBody } from '../../api'
import { Button } from '../../components/Button'
import { RepoAvatar } from '../../components/RepoAvatar'
import { Select } from '../../components/Select'
import { Tag } from '../../components/Tag'
import { FilesDialog } from './FilesDialog'

/** One command, agent, skill or hook: what it is, where it lives, and how to share it. */
export function ItemRow({ item }: { item: LibraryItem }) {
  const qc = useQueryClient()
  const { data: repos = [] } = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  const [copy, setCopy] = useState<CopyBody>()
  const targets = repos.filter((r) => item.scope === 'user' || r.id !== item.repoId)
  const targetName = repos.find((r) => r.id === copy?.repoId)?.name ?? 'repo'

  return (
    <li className="flex flex-wrap items-start gap-x-6 gap-y-2 border-t border-border py-3 first:border-t-0">
      <div className="min-w-0 flex-[1_1_320px]">
        <p className="m-0 break-all font-mono text-[15px] font-semibold">{item.kind === 'commands' ? `/${item.name}` : item.name}</p>
        {item.description && <p className="m-0 mt-0.5 line-clamp-3 text-sm text-soft">{item.description}</p>}
        <p className="m-0 mt-1 break-all text-xs text-dim">
          {item.path}
          {item.detail ? ` · ${item.detail}` : ''}
        </p>
      </div>
      <div className="flex flex-none items-center gap-2 text-[13px] text-muted">
        <span className="text-dim">Lives in</span>
        {item.scope === 'user' ? (
          <Tag>Global</Tag>
        ) : (
          <span className="flex items-center gap-1.5">
            <RepoAvatar name={item.repoName ?? ''} size="sm" />
            {item.repoName}
          </span>
        )}
      </div>
      {item.copyable && (
        <div className="flex flex-none items-center gap-2">
          <Select
            aria-label={`Copy ${item.name} to which repo?`}
            placeholder="Copy to…"
            value=""
            disabled={targets.length === 0}
            options={targets.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(e) => e.target.value && setCopy({ itemId: item.id, scope: 'repo', repoId: e.target.value })}
          />
          {item.scope === 'repo' && <Button onClick={() => setCopy({ itemId: item.id, scope: 'global' })}>Make global</Button>}
        </div>
      )}
      {copy && (
        <FilesDialog
          title={copy.scope === 'global' ? `Make ${item.name} global` : `Copy ${item.name} to ${targetName}`}
          intro={copy.scope === 'global' ? 'Copies into ~/.claude so every repo can use it. The original stays where it is.' : "Copies into the repo's .claude folder. The original stays where it is."}
          load={() => api.copyPreview(copy)}
          apply={(token) => api.copyApply({ ...copy, token })}
          confirmLabel="Copy"
          onClose={(changed) => {
            setCopy(undefined)
            if (changed) void qc.invalidateQueries({ queryKey: ['library'] })
          }}
        />
      )}
    </li>
  )
}
