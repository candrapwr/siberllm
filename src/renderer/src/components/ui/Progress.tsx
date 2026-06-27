import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Progress({
  value,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-secondary',
        className
      )}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${v}%` }}
      />
    </div>
  )
}
