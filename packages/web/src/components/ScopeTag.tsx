import type { SettingScope } from '@hangar/shared'

/** "user" is shown as "Global". Class names are literal so Tailwind keeps them. */
export const SCOPE_LABEL: Record<SettingScope, string> = {
  managed: 'Managed',
  user: 'Global',
  project: 'Project',
  local: 'Local',
}

const SCOPE_BG: Record<SettingScope, string> = {
  managed: 'bg-scope-managed',
  user: 'bg-scope-user',
  project: 'bg-scope-project',
  local: 'bg-scope-local',
}

/** Which settings file a value, rule, hook or server comes from. */
export function ScopeTag({ scope }: { scope: SettingScope }) {
  return <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold text-bg ${SCOPE_BG[scope]}`}>{SCOPE_LABEL[scope]}</span>
}
