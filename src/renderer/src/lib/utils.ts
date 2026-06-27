import { type ClassValue, clsx } from 'clsx'
// tiny classnames merge without external deps beyond clsx (already minimal)
export function cn(...inputs: ClassValue[]): string {
  // twMerge equivalent: keep last conflicting class for common tailwind keys.
  return clsx(inputs)
}
