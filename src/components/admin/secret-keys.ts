// Keep this heuristic in sync with scripts/discover-plugins.mjs.
export function isSecretKey(path: string): boolean {
  const words = path
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return words.some((word, index) =>
    /^(?:pass|password|passwd|secret|token|credential|credentials|auth|bearer)$/.test(word) ||
    (word === 'key' && /^(?:api|private|secret|access)$/.test(words[index - 1] ?? '')),
  )
}
