import type { SettingScope } from '@hangar/shared'

/** "user" is shown as "Global" to match the design. Class names are literal so Tailwind keeps them. */
export const SCOPE_LABEL: Record<SettingScope, string> = {
  managed: 'Managed',
  user: 'Global',
  project: 'Project',
  local: 'Local',
}

export const SCOPE_CHIP: Record<SettingScope, string> = {
  managed: 'bg-scope-managed',
  user: 'bg-scope-user',
  project: 'bg-scope-project',
  local: 'bg-scope-local',
}
