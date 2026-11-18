import { z } from 'zod'

export * from './hooks'
export * from './liveStatus'
export * from './mcp'
export * from './memory'
export * from './redact'
export * from './session'
export * from './sessionApi'
export * from './settings'

/**
 * Hangar's own config (~/.hangar/config.json). Unknown fields are preserved
 * (passthrough) so newer/older versions don't destroy each other's data.
 */
export const RepoSchema = z
  .object({
    id: z.string(),
    path: z.string(),
    name: z.string(),
    addedAt: z.string(),
  })
  .passthrough()
export type Repo = z.infer<typeof RepoSchema>

export const HangarConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    repos: z.array(RepoSchema).default([]),
  })
  .passthrough()
export type HangarConfig = z.infer<typeof HangarConfigSchema>

/** A repo as returned by the API: `exists` is false if the folder has gone missing. */
export type RepoView = Repo & { exists: boolean }

export const AddRepoBodySchema = z.object({ path: z.string().trim().min(1) })
export type AddRepoBody = z.infer<typeof AddRepoBodySchema>

export interface HealthResponse {
  ok: true
  version: string
  claudeHomeFound: boolean
}

export interface ApiError {
  error: string
}
