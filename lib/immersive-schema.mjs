/** Shared editor bounds. Zero width/height retains legacy hidden-photo slots. */
export const RANGES = Object.freeze({
  x: Object.freeze({ min: -50, max: 50 }),
  y: Object.freeze({ min: -60, max: 60 }),
  w: Object.freeze({ min: 10, max: 100 }),
  h: Object.freeze({ min: 8, max: 100 }),
  z: Object.freeze({ min: 0, max: 100 }),
  br: Object.freeze({ min: 0, max: 100 }),
  cropX: Object.freeze({ min: 0, max: 100 }),
  cropY: Object.freeze({ min: 0, max: 100 }),
  cropZoom: Object.freeze({ min: 1, max: 3 }),
})

const ROOT = 'home.immersiveGallery'
const ENUMS = {
  intensity: ['dramatic', 'balanced', 'subtle'],
  scrollLength: ['short', 'standard', 'long'],
  atmosphere: ['stars', 'vignette', 'none'],
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const has = (object, key) => Object.hasOwn(object, key)

/** Validate present fields so older saved galleries and partial config PUTs work. */
export function validateImmersive(gallery, stored) {
  if (!isObject(gallery)) return `${ROOT} must be an object`

  if (has(gallery, 'enabled') && typeof gallery.enabled !== 'boolean') {
    return `${ROOT}.enabled must be a boolean`
  }
  for (const [key, max] of [['text', 280], ['eyebrow', 80]]) {
    if (!has(gallery, key)) continue
    if (typeof gallery[key] !== 'string') return `${ROOT}.${key} must be a string`
    if (gallery[key].length > max && gallery[key] !== stored?.[key]) return `${ROOT}.${key} must be at most ${max} characters`
  }
  for (const [key, options] of Object.entries(ENUMS)) {
    if (has(gallery, key) && !options.includes(gallery[key])) {
      return `${ROOT}.${key} must be one of ${options.join(', ')}`
    }
  }

  for (const device of ['mobile', 'desktop']) {
    const photosKey = `${device}Photos`
    const photosPath = `${ROOT}.${photosKey}`
    const photos = gallery[photosKey]
    if (has(gallery, photosKey)) {
      if (!Array.isArray(photos)) return `${photosPath} must be an array`
      const unchanged = Array.isArray(stored?.[photosKey]) && photos.length === stored[photosKey].length
        && photos.every((photo, index) => photo === stored[photosKey][index])
      if (photos.length > 24 && !unchanged) return `${photosPath} must contain at most 24 photos`
      const seen = new Set()
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]
        if (typeof photo !== 'string' || !/^[^/\\\0]+\/[^/\\\0]+$/.test(photo) || photo.split('/').some(seg => seg === '..' || seg === '.')) {
          return `${photosPath}[${i}] must be a category/filename string without . or .. path segments or backslashes`
        }
        if (seen.has(photo)) return `${photosPath}[${i}] must be unique`
        seen.add(photo)
      }
    }

    const positionsKey = `${device}Positions`
    if (!has(gallery, positionsKey)) continue
    const positionsPath = `${ROOT}.${positionsKey}`
    const positions = gallery[positionsKey]
    if (positions === null) continue
    if (!Array.isArray(positions)) return `${positionsPath} must be null or an array`
    if (has(gallery, photosKey) && positions.length > photos.length) {
      return `${positionsPath} must not be longer than ${photosPath}`
    }
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i]
      if (position === null) continue
      const positionPath = `${positionsPath}[${i}]`
      if (!isObject(position)) return `${positionPath} must be null or an object`
      for (const [key, { min, max }] of Object.entries(RANGES)) {
        if (!has(position, key) && !['x', 'y', 'w', 'h', 'z'].includes(key)) continue
        const value = position[key]
        const fieldPath = `${positionPath}.${key}`
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return `${fieldPath} must be a finite number`
        }
        const hidden = position.w === 0 && position.h === 0
        if ((key === 'w' || key === 'h') && hidden) continue
        if (value < min || value > max) {
          return `${fieldPath} must be between ${min} and ${max}${key === 'w' || key === 'h' ? ' (or both w and h must be 0 for a hidden photo)' : ''}`
        }
        if ((key === 'z' || key === 'br') && !Number.isInteger(value)) {
          return `${fieldPath} must be an integer between ${min} and ${max}`
        }
      }
    }
  }
  return null
}
