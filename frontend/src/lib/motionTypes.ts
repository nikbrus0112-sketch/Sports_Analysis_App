export interface MotionTypeOption {
  value: string
  label: string
}

// Fixed list per spec V1 item 1 ("User picks a sport + motion from a fixed
// list, not auto-detected"). Deliberately flat — no per-motion config beyond
// value/label, no i18n, no icons. Extend this array (and nothing else) if a
// third motion is ever added.
export const MOTION_TYPES: MotionTypeOption[] = [
  { value: 'freestyle', label: 'Freestyle' },
  { value: 'butterfly', label: 'Butterfly' },
]

export const DEFAULT_MOTION_TYPE = MOTION_TYPES[0].value
