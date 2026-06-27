import { cn } from '../../lib/utils'

interface SpinnerProps {
  size?: number
  className?: string
  /** Optional label shown to the right of the spinner. */
  label?: string
}

/** A small CSS-only spinner with an optional label. */
export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        className="animate-spin text-primary"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </span>
  )
}
