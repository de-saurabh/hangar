import { Fragment } from 'react'

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Text with every search term marked. With no query it renders the text as is. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return <>{text}</>
  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'ig')
  return (
    <>
      {text.split(re).map((part, i) =>
        // split() with one capture group puts the matches at the odd indexes.
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-waiting/35 px-px text-inherit">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
