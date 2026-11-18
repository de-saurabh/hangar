/**
 * Allowlist suggestions: turn a tool call that needed manual approval into a
 * candidate permission rule, and flag the ones that should never be
 * auto-approved. Pure; the server counts approvals and persists them.
 */

export interface RuleCandidate {
  /** e.g. `Bash(npm test:*)` or `mcp__github__list_issues`. */
  rule: string
  /** Rules that can destroy data or publish things stay "keep asking". */
  risky: boolean
}

/** Commands whose meaning lives in the second word. */
const SUBCOMMAND_TOOLS = new Set(['git', 'npm', 'pnpm', 'yarn', 'npx', 'docker', 'kubectl', 'cargo', 'go', 'pip', 'pip3', 'gh', 'dotnet', 'composer', 'poetry', 'uv', 'make', 'terraform', 'helm', 'aws', 'gcloud', 'az'])

const RISKY_FIRST = new Set(['rm', 'rmdir', 'del', 'sudo', 'su', 'curl', 'wget', 'chmod', 'chown', 'dd', 'mkfs', 'kill', 'killall', 'shutdown', 'reboot', 'format', 'iex', 'invoke-expression', 'remove-item'])
const RISKY_PAIRS = new Set(['git push', 'git reset', 'git clean', 'git rebase', 'git checkout', 'git restore', 'git branch', 'npm publish', 'pnpm publish', 'yarn publish', 'npx publish', 'docker run', 'docker rm', 'docker rmi', 'docker system', 'kubectl delete', 'kubectl apply', 'terraform apply', 'terraform destroy', 'gh pr', 'gh release', 'gh repo', 'cargo publish', 'helm install', 'helm uninstall', 'aws s3'])

/** Shell syntax that makes a prefix rule meaningless or unsafe to suggest. */
const COMPOUND = /[|;&<>`\n\r]|\$\(|\$\{/

const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/

export function ruleCandidate(toolName: unknown, toolInput: unknown): RuleCandidate | undefined {
  if (typeof toolName !== 'string' || toolName === '') return undefined

  if (toolName.startsWith('mcp__')) {
    return { rule: toolName, risky: /(delete|remove|drop|destroy|send|publish|merge|write|update|create|post)/i.test(toolName) }
  }

  if (toolName !== 'Bash' && toolName !== 'PowerShell') return undefined
  const input = typeof toolInput === 'object' && toolInput !== null ? (toolInput as Record<string, unknown>) : {}
  const command = typeof input.command === 'string' ? input.command.trim() : ''
  if (command === '' || COMPOUND.test(command)) return undefined

  const words = command.split(/\s+/)
  while (words[0] && ENV_ASSIGN.test(words[0])) words.shift() // leading VAR=value
  const first = words[0]?.toLowerCase()
  if (!first) return undefined

  const takesSub = SUBCOMMAND_TOOLS.has(first)
  const second = words[1]
  const useTwo = takesSub && second !== undefined && !second.startsWith('-')
  const prefix = useTwo ? `${words[0]} ${second}` : (words[0] ?? '')
  // A bare word with a flag/argument (e.g. `ls -la`) is allowed by its first word only.
  const risky = RISKY_FIRST.has(first) || RISKY_PAIRS.has(`${first} ${second?.toLowerCase() ?? ''}`.trim())
  // Prefix must stay readable and free of characters that need quoting inside a rule.
  if (!/^[\w@./+-]+( [\w@./+-]+)?$/.test(prefix)) return undefined
  return { rule: `${toolName}(${prefix}:*)`, risky }
}

/** Strict check used before a rule string is written to a settings file. */
export function isValidRule(rule: string): boolean {
  return /^[A-Za-z0-9_]+(\([^()\r\n]{1,200}\))?$/.test(rule)
}

export interface Suggestion {
  rule: string
  risky: boolean
  approvals: number
  /** Repo names (or folder names) the approvals happened in, most approvals first. */
  repos: string[]
  /** `global`, or the id of the one repo that accounts for almost all approvals. */
  scope: 'global' | { repoId: string; repoName: string }
  lastAt: string
}
