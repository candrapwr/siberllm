import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<Tone, string> = {
  default: 'bg-secondary text-secondary-foreground',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  danger: 'bg-destructive/15 text-destructive border-destructive/30',
  info: 'bg-primary/15 text-primary border-primary/30'
}

export function Badge({
  tone = 'default',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className
      )}
      {...props}
    />
  )
}
