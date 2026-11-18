import { useQuery } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { api } from '../api'

/** `/config` has no repo in the URL: jump to the first repo's config. */
export function ConfigIndex() {
  const { data: repos, isPending } = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  if (isPending) return <p className="text-sm text-muted">Loading…</p>
  const first = repos?.[0]
  if (first) return <Navigate to="/repos/$repoId/config" params={{ repoId: first.id }} replace />
  return <p className="text-sm text-muted">Add a repo on the Dashboard to see its config.</p>
}
