import type { SelectHTMLAttributes } from 'react'

export interface Option {
  value: string
  label: string
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** The first, unselectable prompt: "Choose a repo…". */
  placeholder: string
  options: readonly Option[]
}

/** A native select with the app's look, so keyboard and screen-reader behaviour come from the browser. */
export function Select({ placeholder, options, className = '', ...rest }: Props) {
  return (
    <select className={`min-h-8 cursor-pointer rounded-[7px] border border-border bg-surface px-2 text-[13.5px] text-text hover:border-accent disabled:cursor-default disabled:opacity-50 ${className}`} {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
