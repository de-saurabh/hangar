import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Button } from '../components/Button'
import { Menu } from '../components/Menu'
import { RepoAvatar } from '../components/RepoAvatar'
import { useScope } from '../scope'

/** Add or remove the repos Hangar watches. Removing only forgets the repo; it never touches the folder. */
export function ManageRepos() {
  const qc = useQueryClient()
  const [scope, setScope] = useScope()
  const [path, setPath] = useState('')
  const { data: repos = [] } = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard })
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['repos'] }), qc.invalidateQueries({ queryKey: ['dashboard'] }), qc.invalidateQueries({ queryKey: ['sessions'] })])

  const add = useMutation({
    mutationFn: api.addRepo,
    onSuccess: () => {
      setPath('')
      return refresh()
    },
  })
  const remove = useMutation({
    mutationFn: api.removeRepo,
    onSuccess: (_, id) => {
      if (scope === id) setScope(null)
      return refresh()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (path.trim()) add.mutate(path.trim())
  }
  const warningsOf = (id: string) => dashboard?.repos.find((r) => r.id === id)?.warnings ?? []

  return (
    <Menu label="Manage repos" triggerClassName="ml-auto rounded-[7px] px-2.5 text-[13px] text-muted hover:bg-surface hover:text-text" width="w-80" trigger="Manage repos ▾">
      <ul className="m-0 list-none p-0">
        {repos.map((r) => (
          <li key={r.id} className="flex items-start gap-2.5 rounded-md p-2">
            <RepoAvatar name={r.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[13.5px]">{r.name}</p>
              {!r.exists && <p className="m-0 text-xs text-waiting">Folder not found</p>}
              {warningsOf(r.id).map((w) => (
                <p key={w} className="m-0 text-xs text-waiting">
                  {w}
                </p>
              ))}
            </div>
            <Button variant="quiet" className="min-h-6 px-1.5 text-xs" aria-label={`Remove ${r.name}`} onClick={() => remove.mutate(r.id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-1 flex flex-col gap-2 border-t border-border p-2 pt-3">
        <label htmlFor="repo-path" className="text-[13px] text-muted">
          Add a repo by folder path
        </label>
        <input
          id="repo-path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="D:\code\my-app"
          className="min-h-9 rounded-lg border border-border bg-bg px-2.5 font-mono text-[13px] text-text placeholder:text-dim"
        />
        <Button type="submit" variant="primary" disabled={add.isPending || !path.trim()}>
          Add repo
        </Button>
        {(add.error || remove.error) && (
          <p role="alert" className="m-0 text-xs text-error">
            {(add.error ?? remove.error)?.message}
          </p>
        )}
      </form>
    </Menu>
  )
}
