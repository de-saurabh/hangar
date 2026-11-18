import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type TemplateBody } from '../api'
import { timeAgo } from '../time'
import { FilesDialog } from './FilesDialog'

const card = 'flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-4'
const btn = 'min-h-10 cursor-pointer rounded-lg border border-border bg-[#1E222B] px-3 text-sm font-semibold text-text disabled:opacity-50'

export function LibraryAside() {
  return (
    <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
      <Templates />
      <Backup />
    </aside>
  )
}

function Templates() {
  const { data } = useQuery({ queryKey: ['templates'], queryFn: api.templates })
  const { data: repos } = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  const [templateId, setTemplateId] = useState('')
  const [repoId, setRepoId] = useState('')
  const [body, setBody] = useState<TemplateBody>()
  const name = data?.templates.find((t) => t.id === body?.templateId)?.name ?? ''

  return (
    <section className={card} aria-label="Repo templates">
      <h2 className="m-0 text-base font-bold">Repo templates</h2>
      <span className="text-[13px] text-muted">A ready-made .claude/ folder and CLAUDE.md for a project. Existing files are never overwritten.</span>
      {data?.templates.map((t) => (
        <label key={t.id} className={`flex cursor-pointer flex-col gap-0.5 rounded-[10px] border px-3 py-2.5 ${templateId === t.id ? 'border-accent bg-[#1E2738]' : 'border-transparent bg-surface-2'}`}>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <input type="radio" name="template" checked={templateId === t.id} onChange={() => setTemplateId(t.id)} />
            {t.name}
          </span>
          <span className="pl-6 text-xs text-muted">{t.summary}</span>
        </label>
      ))}
      <select aria-label="Apply to which repo?" value={repoId} onChange={(e) => setRepoId(e.target.value)} className="min-h-10 rounded-lg border border-border bg-surface-2 px-2 text-sm text-text">
        <option value="">Choose a repo…</option>
        {repos?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button type="button" disabled={!templateId || !repoId} onClick={() => setBody({ templateId, repoId })} className={btn}>
        Preview template…
      </button>
      {body && (
        <FilesDialog
          title={`Apply ${name}`}
          intro="Adds the files below to the repo. Anything already there is kept as it is, and permission rules are merged into .claude/settings.json."
          load={() => api.templatePreview(body)}
          apply={(token) => api.templateApply({ ...body, token })}
          confirmLabel="Apply template"
          onClose={() => setBody(undefined)}
        />
      )}
    </section>
  )
}

function Backup() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['backup'], queryFn: api.backup })
  const [open, setOpen] = useState(false)
  const run = useMutation({
    mutationFn: api.runBackup,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['backup'] }),
  })

  return (
    <section className={card} aria-label="Backup">
      <h2 className="m-0 text-base font-bold">Backup</h2>
      <span className="text-[13px] leading-normal text-muted">
        Your CLAUDE.md, settings, commands, agents and skills, versioned in a git repo on this machine (<code className="font-mono">~/.hangar/claude-backup</code>). Sessions, history and credentials are excluded, and
        settings.json is saved with secrets masked, so it's for history rather than restoring.
      </span>
      {data?.exists && data.lastAt ? (
        <span className="text-[13px]">
          <b className="text-running">Backed up</b> {timeAgo(data.lastAt)} · {data.versions} version{data.versions === 1 ? '' : 's'}
        </span>
      ) : (
        <span className="text-[13px] text-muted">No backup yet.</span>
      )}
      {run.isSuccess && <span className="text-[13px] text-muted">{run.data.changed ? 'Saved a new version.' : 'No changes since the last backup.'}</span>}
      {run.error && <span role="alert" className="text-[13px] text-error">{run.error.message}</span>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={run.isPending} onClick={() => run.mutate()} className={btn}>
          {run.isPending ? 'Backing up…' : 'Back up now'}
        </button>
        {data && data.history.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline">
            {open ? 'Hide history' : 'View history →'}
          </button>
        )}
      </div>
      {open && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-muted">
          {data?.history.map((h) => (
            <li key={h.commit}>
              <code className="font-mono">{h.commit}</code> {timeAgo(h.date)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
