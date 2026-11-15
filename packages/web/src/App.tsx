import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from './api'

export function App() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-7 border-b border-border bg-surface-2 px-7 py-3">
        <span className="flex items-center gap-2.5 text-lg font-bold">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
            <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
          </svg>
          Hangar
        </span>
        <HealthBadge />
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-7 pb-12 pt-6">
        <Repos />
      </main>
    </div>
  )
}

function HealthBadge() {
  const { data, isError } = useQuery({ queryKey: ['health'], queryFn: api.health })
  if (isError) return <span className="text-sm text-error">Server unreachable</span>
  if (!data) return null
  return (
    <span className="text-sm text-muted">
      v{data.version} · {data.claudeHomeFound ? '~/.claude found' : '~/.claude not found'}
    </span>
  )
}

function Repos() {
  const qc = useQueryClient()
  const [path, setPath] = useState('')
  const { data: repos, isPending, error } = useQuery({ queryKey: ['repos'], queryFn: api.repos })

  const add = useMutation({
    mutationFn: api.addRepo,
    onSuccess: () => {
      setPath('')
      return qc.invalidateQueries({ queryKey: ['repos'] })
    },
  })
  const remove = useMutation({
    mutationFn: api.removeRepo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (path.trim()) add.mutate(path.trim())
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-bold">Repos</h2>

      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <label htmlFor="repo-path" className="sr-only">
          Repo folder path
        </label>
        <input
          id="repo-path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Absolute path to a repo, e.g. D:\code\my-app"
          className="min-h-10 flex-1 basis-80 rounded-lg border border-border bg-bg px-3 font-mono text-sm text-text placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={add.isPending || !path.trim()}
          className="min-h-10 rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold disabled:opacity-50"
        >
          + Add repo
        </button>
      </form>
      {add.error && <p role="alert" className="text-sm text-error">{add.error.message}</p>}

      {isPending && <p className="text-sm text-muted">Loading…</p>}
      {error && <p role="alert" className="text-sm text-error">Couldn't load repos: {error.message}</p>}
      {repos?.length === 0 && <p className="text-sm text-muted">No repos yet. Add one to get started.</p>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {repos?.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[15px] font-bold">{r.name}</span>
              <button
                type="button"
                onClick={() => remove.mutate(r.id)}
                className="text-xs text-muted hover:text-error"
                aria-label={`Remove ${r.name}`}
              >
                Remove
              </button>
            </div>
            <span className="break-all font-mono text-xs text-muted">{r.path}</span>
            {!r.exists && <span className="text-xs text-waiting">Folder not found</span>}
          </div>
        ))}
      </div>
    </section>
  )
}
