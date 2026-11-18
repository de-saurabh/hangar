import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Suggestion } from '@hangar/shared'
import { api, type AllowBody } from '../../api'
import { Button } from '../../components/Button'
import { DiffView } from '../../components/DiffView'
import { ModalDialog } from '../../components/ModalDialog'
import { EmptyLine, Section } from '../../components/Section'
import { Tag } from '../../components/Tag'

/** Commands you keep approving by hand, offered as permission rules. Risky ones are flagged, never offered. */
export function Allowlist() {
  const { data, isError } = useQuery({ queryKey: ['allowlist'], queryFn: api.allowlist, refetchInterval: 30_000 })
  const [pending, setPending] = useState<AllowBody>()
  return (
    <Section title="Allowlist suggestions">
      <p className="m-0 mb-2 text-[13px] text-muted">Commands you approved by hand 3 or more times. Needs live hooks to learn.</p>
      {isError && <EmptyLine>Couldn't load suggestions.</EmptyLine>}
      {data?.suggestions.length === 0 && <EmptyLine>Nothing to suggest yet.</EmptyLine>}
      {data?.suggestions.map((s) => (
        <SuggestionRow key={s.rule} s={s} onAdd={setPending} />
      ))}
      {pending && <AllowDialog body={pending} onClose={() => setPending(undefined)} />}
    </Section>
  )
}

function SuggestionRow({ s, onAdd }: { s: Suggestion; onAdd: (b: AllowBody) => void }) {
  const repo = s.scope !== 'global' ? s.scope : undefined
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border py-2.5 first:border-t-0">
      <div className="min-w-0 flex-[1_1_200px]">
        <code className="break-all font-mono text-[13px]">{s.rule}</code>
        <p className="m-0 flex items-center gap-2 text-xs text-muted">
          approved {s.approvals}× in {s.repos.join(', ') || 'unknown'}
          {s.risky && <Tag tone="error">risky: keep asking</Tag>}
        </p>
      </div>
      {!s.risky && (
        <Button onClick={() => onAdd(repo ? { rule: s.rule, scope: 'repo', repoId: repo.repoId } : { rule: s.rule, scope: 'global' })}>
          {repo ? `Add to ${repo.repoName}` : 'Add to global allowlist'}
        </Button>
      )}
    </div>
  )
}

/** Diff first; the write happens only on the confirm button, with a backup. */
function AllowDialog({ body, onClose }: { body: AllowBody; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: p, error } = useQuery({ queryKey: ['allow-preview', body], queryFn: () => api.allowPreview(body), gcTime: 0, retry: false })
  const [done, setDone] = useState<string>()
  const apply = useMutation({
    mutationFn: () => api.allowApply({ ...body, token: p!.token }),
    onSuccess: (r) => {
      setDone(r.backupPath ? `Done. Backup saved to ${r.backupPath}` : 'Done.')
      void qc.invalidateQueries({ queryKey: ['allowlist'] })
    },
  })
  return (
    <ModalDialog
      title="Add permission rule"
      onClose={onClose}
      actions={(close) => (
        <>
          <Button autoFocus onClick={close}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {p?.diff && !done && (
            <Button variant="primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? 'Writing…' : 'Add rule'}
            </Button>
          )}
        </>
      )}
    >
      {!p && !error && <p className="m-0 text-sm text-muted">Reading settings…</p>}
      {error && <p role="alert" className="m-0 text-sm text-error">{error.message}</p>}
      {p && (
        <>
          <p className="m-0 text-sm text-muted">
            Adds <code className="font-mono text-text">{body.rule}</code> to <code className="break-all font-mono text-text">{p.path}</code>. Nothing else changes, and a backup is saved first.
          </p>
          {p.diff ? <DiffView diff={p.diff} /> : <p className="m-0 text-sm text-muted">Already allowed. Nothing to change.</p>}
        </>
      )}
      {apply.error && <p role="alert" className="m-0 text-sm text-error">{apply.error.message}</p>}
      {done && <p className="m-0 break-all text-sm text-running">{done}</p>}
    </ModalDialog>
  )
}
