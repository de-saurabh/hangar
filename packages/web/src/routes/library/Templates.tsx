import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type TemplateBody } from '../../api'
import { Button } from '../../components/Button'
import { Section } from '../../components/Section'
import { Select } from '../../components/Select'
import { FilesDialog } from './FilesDialog'

/** A ready-made .claude/ folder and CLAUDE.md for a project; existing files are never overwritten. */
export function Templates() {
  const { data } = useQuery({ queryKey: ['templates'], queryFn: api.templates })
  const { data: repos = [] } = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  const [templateId, setTemplateId] = useState('')
  const [repoId, setRepoId] = useState('')
  const [body, setBody] = useState<TemplateBody>()
  const name = data?.templates.find((t) => t.id === body?.templateId)?.name ?? ''

  return (
    <Section title="Repo templates">
      <p className="m-0 mb-2.5 text-[13px] text-muted">A ready-made .claude/ folder and CLAUDE.md for a project. Existing files are never overwritten.</p>
      <div role="radiogroup" aria-label="Template" className="flex flex-col gap-1.5">
        {data?.templates.map((t) => (
          <label key={t.id} className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 ${templateId === t.id ? 'border-accent bg-selected' : 'border-border'}`}>
            <span className="flex items-center gap-2 font-medium">
              <input type="radio" name="template" checked={templateId === t.id} onChange={() => setTemplateId(t.id)} className="accent-accent" />
              {t.name}
            </span>
            <span className="pl-6 text-xs text-muted">{t.summary}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select aria-label="Apply to which repo?" placeholder="Choose a repo…" value={repoId} onChange={(e) => setRepoId(e.target.value)} options={repos.map((r) => ({ value: r.id, label: r.name }))} />
        <Button disabled={!templateId || !repoId} onClick={() => setBody({ templateId, repoId })}>
          Preview template
        </Button>
      </div>
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
    </Section>
  )
}
