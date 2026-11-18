import type { InsightsSummary, Suggestion, UsageInsightsResponse, ApiError, Dashboard, Prefs, InstallPreview, LiveState, EffectiveSettings, HealthResponse, McpResult, MemoryFile, Repo, RepoView, SessionDetail, SessionListItem } from '@hangar/shared'

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

export interface AllowBody {
  rule: string
  scope: 'global' | 'repo'
  repoId?: string
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
  sessions: (q = '') => request<SessionListItem[]>(q.trim() ? `/api/sessions?${new URLSearchParams({ q })}` : '/api/sessions'),
  session: (id: string) => request<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
  dashboard: () => request<Dashboard>('/api/dashboard'),
  prefs: () => request<Prefs>('/api/prefs'),
  setPrefs: (patch: Partial<Prefs>) => request<Prefs>('/api/prefs', { method: 'PUT', body: JSON.stringify(patch) }),
  live: () => request<LiveState[]>('/api/live'),
  hooksPreview: () => request<InstallPreview>('/api/hooks/install'),
  hooksApply: (action: 'install' | 'uninstall', token: string) =>
    request<{ backupPath?: string }>('/api/hooks/install', { method: 'POST', body: JSON.stringify({ action, token }) }),
  usage: (days = 14) => request<UsageInsightsResponse>(`/api/insights/usage?days=${days}`),
  insightsSummary: () => request<InsightsSummary>('/api/insights/summary'),
  allowlist: () => request<{ suggestions: Suggestion[] }>('/api/insights/allowlist'),
  allowPreview: (b: AllowBody) => request<{ path: string; diff: string; token: string }>('/api/insights/allowlist/preview', { method: 'POST', body: JSON.stringify(b) }),
  allowApply: (b: AllowBody & { token: string }) => request<{ backupPath?: string }>('/api/insights/allowlist/apply', { method: 'POST', body: JSON.stringify(b) }),
  removeRepo: (id: string) => request<void>(`/api/repos/${id}`, { method: 'DELETE' }),
}
