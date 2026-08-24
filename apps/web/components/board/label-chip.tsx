import { cn } from '@/lib/utils'

export function LabelChip({
  name,
  color,
  className,
}: {
  name: string
  color: string
  className?: string
}) {
  return (
    <span
      data-color={color}
      className={cn(
        'label-chip text-2xs inline-flex items-center rounded px-1.5 py-0.5 font-medium',
        className,
      )}
    >
      {name}
    </span>
  )
}
