const fallbacks = {
  'out-expo': 'cubic-bezier(.16,1,.3,1)',
  sheet: 'cubic-bezier(.32,.72,0,1)',
  'in-out-sine': 'cubic-bezier(.37,0,.63,1)',
  exit: 'cubic-bezier(.4,0,1,1)',
} as const

const cache = new Map<keyof typeof fallbacks, string>()

/** Read each public motion token once, with the same curve when styles are unavailable. */
export function easing(name: 'out-expo' | 'sheet' | 'in-out-sine' | 'exit'): string {
  const cached = cache.get(name)
  if (cached) return cached

  let value = ''
  try {
    value = getComputedStyle(document.documentElement).getPropertyValue('--ease-' + name).trim()
    if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('transition-timing-function', value)) value = ''
  } catch {
    // Non-browser environments and partial DOMs may not expose computed custom properties.
  }
  value = value || fallbacks[name]
  cache.set(name, value)
  return value
}
