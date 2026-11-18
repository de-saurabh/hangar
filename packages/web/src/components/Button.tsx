import { useState, type ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'

const BASE = 'inline-flex min-h-8 cursor-pointer items-center justify-center whitespace-nowrap rounded-[7px] border px-3 text-[13.5px] no-underline disabled:cursor-default disabled:opacity-50'
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent font-semibold text-bg',
  secondary: 'border-border bg-subtle font-medium text-text hover:border-accent',
  quiet: 'border-transparent bg-transparent font-medium text-accent hover:underline',
}

/** Class names for anything that should look like a button (also used on router links). */
export const buttonClass = (variant: ButtonVariant = 'secondary') => `${BASE} ${VARIANT[variant]}`

export function Button({ variant = 'secondary', className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...rest} />
}

/** Copies `text` to the clipboard and says so for a moment. */
export function CopyButton({ text, label, variant = 'secondary' }: { text: string; label: string; variant?: ButtonVariant }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked: nothing to do
    }
  }
  return (
    <Button variant={variant} onClick={copy}>
      {copied ? 'Copied' : label}
    </Button>
  )
}
