/**
 * Label vocabulary.
 *
 * Kept out of the actions file because a 'use server' module may only export
 * async functions: a constant or a type guard there fails the build, and only
 * the build, since the typecheck is perfectly happy with it.
 */

/**
 * A fixed palette rather than a colour picker. Eight choices, each already
 * proven legible on both themes because they are the presence colours.
 */
export const LABEL_COLORS = [
  'red',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'magenta',
  'lime',
] as const

export type LabelColor = (typeof LABEL_COLORS)[number]

export function isLabelColor(value: string): value is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(value)
}

export interface LabelView {
  id: string
  name: string
  color: string
}
