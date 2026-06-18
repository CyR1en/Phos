function deepMerge(target, source, options = {}) {
  const { skipUnknownKeys = false } = options
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (skipUnknownKeys && !(key in target)) continue
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key], options)
    } else {
      if (source[key] !== undefined) {
        result[key] = source[key]
      }
    }
  }
  return result
}

export { deepMerge }
