import { join } from 'node:path'
import { computeAddRule } from './allowlist.js'
import type { FileEdit } from './settingsWrite.js'

export interface Template {
  id: string
  name: string
  summary: string
  /** Plain files; an existing file is always kept, never overwritten. */
  files: { path: string; content: string }[]
  /** Rules merged into `.claude/settings.json` permissions.allow. */
  allow: string[]
}

export const TEMPLATES: Template[] = [
  {
    id: 'node-service',
    name: 'Node service',
    summary: 'CLAUDE.md · 2 commands · test allowlist',
    files: [
      {
        path: 'CLAUDE.md',
        content: `# Project guide

## Commands
- Install: \`npm install\`
- Test: \`npm test\`
- Lint: \`npm run lint\`

## Conventions
- Keep changes small and focused; one concern per commit.
- Add or update a test with every behaviour change.
- Never commit secrets or \`.env\` files.

## Before you finish
Run the tests and the linter, and say what you could not verify.
`,
      },
      { path: '.claude/commands/test.md', content: '---\ndescription: Run the test suite and fix failures\n---\nRun `npm test`. If anything fails, find the cause, fix it, and run the tests again. Report what changed.\n' },
      { path: '.claude/commands/review.md', content: '---\ndescription: Review the current diff\n---\nReview the uncommitted changes. List bugs first, then risky spots, then style nits. Be specific with file and line.\n' },
    ],
    allow: ['Bash(npm test:*)', 'Bash(npm run lint:*)', 'Bash(git status:*)', 'Bash(git diff:*)'],
  },
  {
    id: 'learning-project',
    name: 'Learning project',
    summary: 'Teaching-mode CLAUDE.md · LEARNING.md · review agent',
    files: [
      {
        path: 'CLAUDE.md',
        content: `# Learning project

I am learning here. Prefer explaining over just doing.

## How to work with me
- Explain the why before the how, in a few short sentences.
- Make one small change at a time and tell me what to look at.
- When there are options, name the trade-off and recommend one.
- Point out mistakes you notice in my approach, kindly and directly.

## Notes
Add what I learn to \`LEARNING.md\` at the end of each session.
`,
      },
      { path: 'LEARNING.md', content: '# Learning log\n\nOne entry per session: what I tried, what I learned, what is still unclear.\n' },
      {
        path: '.claude/agents/reviewer.md',
        content: '---\nname: reviewer\ndescription: Reviews my code as a patient teacher\n---\nReview the code I point you at. Explain each issue and why it matters, suggest the fix, and name one thing done well.\n',
      },
    ],
    allow: [],
  },
]

/** The file edits that apply a template to a repo. Existing plain files are kept as they are. */
export function planTemplate(t: Template, repoPath: string): FileEdit[] {
  const edits: FileEdit[] = t.files.map((f) => ({ path: join(repoPath, f.path), compute: (cur) => cur ?? f.content }))
  if (t.allow.length > 0) {
    edits.push({
      path: join(repoPath, '.claude', 'settings.json'),
      compute: (cur) => {
        let text = cur ?? ''
        for (const rule of t.allow) text = computeAddRule(text, rule)
        return text
      },
    })
  }
  return edits
}
