import type { ApiError, EffectiveSettings, HealthResponse, McpResult, MemoryFile, Repo, RepoView, SessionDetail, SessionListItem } from '@hangar/shared'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiError | undefined
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  repos: () => request<RepoView[]>('/api/repos'),
  addRepo: (path: string) => request<Repo>('/api/repos', { method: 'POST', body: JSON.stringify({ path }) }),
  settings: (repoId: string) => request<EffectiveSettings>(`/api/repos/${repoId}/settings`),
  memory: (repoId: string) => request<MemoryFile[]>(`/api/repos/${repoId}/memory`),
  mcp: (repoId: string) => request<McpResult>(`/api/repos/${repoId}/mcp`),
  revealSetting: (repoId: string, key: string, scope: string) =>
    request<{ value: unknown }>(`/api/repos/${repoId}/settings/value?${new URLSearchParams({ key, scope })}`),
  sessions: () => request<SessionListItem[]>('/api/sessions'),
  session: (id: string) => request<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
  removeRepo: (id: string) => request<void>(`/api/repos/${id}`, { method: 'DELETE' }),
}
