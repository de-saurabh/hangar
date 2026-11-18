/** A unified diff: file header lines dropped, added lines green, removed lines red. */
export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n').filter((l) => !l.startsWith('===') && !l.startsWith('---') && !l.startsWith('+++'))
  return (
    <pre className="m-0 max-h-[50vh] overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div key={i} className={l.startsWith('+') ? 'text-running' : l.startsWith('-') ? 'text-error' : l.startsWith('@@') ? 'text-done' : 'text-muted'}>
          {l || ' '}
        </div>
      ))}
    </pre>
  )
}
