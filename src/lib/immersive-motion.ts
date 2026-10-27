import type { PhotoPosition } from '@lib/admin/types'
import { DEFAULT_POSITIONS } from '@lib/immersive-defaults'

export const STAGE = { scale: 0.9, offsetY: 2.5 }
export const ASPECT = { mobile: 9 / 19.5, desktop: 16 / 9 }
export const BREAKPOINT = 768
export type Intensity = 'dramatic' | 'balanced' | 'subtle'
export const INTENSITY: Record<Intensity, number> = { dramatic: 1, balanced: 0.75, subtle: 0.5 }
export type ScrollLength = 'short' | 'standard' | 'long'
export const RUNWAY: Record<ScrollLength, number> = { short: 140, standard: 200, long: 260 }
export type Atmosphere = 'stars' | 'vignette' | 'none'
export type Device = 'mobile' | 'desktop'

export interface Layer {
  index: number
  z: number
  /** 0 back … 1 front; equal depths use 0.5. */
  rank: number
  hidden: boolean
  pos: PhotoPosition
}

export function resolveLayers(positions: (Partial<PhotoPosition> | null)[] | null, count: number, device: Device): Layer[] {
  const layers = Array.from({ length: count }, (_, index) => {
    const stored = Object.fromEntries(Object.entries(positions?.[index] ?? {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)))
    const pos = { ...DEFAULT_POSITIONS[index % DEFAULT_POSITIONS.length][device], ...stored }
    // A 0×0 position hides the photo on either device, so it never takes a cap slot or skews the rank range.
    return { index, z: pos.z, rank: 0.5, hidden: pos.w === 0 && pos.h === 0, pos }
  })
  // Keep indices stable for photo/position pairing, but rank only the rendered top-z set.
  const visible = new Set(layers.filter(layer => !layer.hidden).sort((a, b) => b.z - a.z || a.index - b.index).slice(0, device === 'mobile' ? 6 : 8))
  for (const layer of layers) layer.hidden ||= !visible.has(layer)
  const depths = layers.filter(layer => !layer.hidden).map(layer => layer.z)
  const min = Math.min(...depths), max = Math.max(...depths)
  for (const layer of layers) layer.rank = max > min ? Math.max(0, Math.min(1, (layer.z - min) / (max - min))) : 0.5
  return layers
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smoothstep = (a: number, b: number, p: number) => {
  const t = clamp((p - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const flight = (p: number) => {
  const u = clamp((p - 0.06) / 0.74), a = 0.12
  return u < a ? u * u / (2 * a * (1 - a / 2)) : (u - a / 2) / (1 - a / 2)
}
const flightProgress = (t: number) => {
  const a = 0.12
  const u = t < a / (2 * (1 - a / 2)) ? Math.sqrt(t * 2 * a * (1 - a / 2)) : t * (1 - a / 2) + a / 2
  return 0.06 + 0.74 * u
}
const depthLog = (layer: Layer) => Math.log(4 * Math.pow(2.25, layer.rank))

export function layerScale(p: number, layer: Layer, intensity: number): number {
  // Cancel intensity in the freeze threshold: changing magnitude never shifts time.
  return Math.exp(intensity * depthLog(layer) * Math.min(flight(p), 0.90 * Math.log(4) / depthLog(layer)))
}

export function layerOpacity(p: number, layer: Layer, intensity: number): number {
  if (layer.hidden || p >= 0.8) return 0
  const band = Math.log(4) / depthLog(layer)
  const size = STAGE.scale * layerScale(p, layer, intensity) * Math.max(layer.pos.w / 100, layer.pos.h / 100)
  return (1 - smoothstep(0.57 * band, 0.88 * band, flight(p))) * (1 - smoothstep(1.2, 1.8, size))
}

export function taglineFrame(p: number): { opacity: number; scale: number } {
  return {
    opacity: 1 - Math.pow(1 - clamp((p - 0.56) / 0.18), 2),
    scale: 0.84 + 0.16 * (1 - Math.pow(1 - clamp((p - 0.56) / 0.30), 3)),
  }
}

export function starsFrame(p: number): { opacity: number; scale: [number, number, number] } {
  const approach = clamp((p - 0.5) / 0.5)
  return { opacity: smoothstep(0.5, 0.74, p), scale: [1 + 0.05 * approach, 1 + 0.10 * approach, 1 + 0.18 * approach] }
}

export function vignetteFrame(p: number): { opacity: number } {
  return { opacity: 0.6 * smoothstep(0.06, 0.40, p) * (1 - smoothstep(0.60, 0.80, p)) }
}

export function exitFrame(q: number): { taglineOpacity: number; taglineY: number; starsOpacity: number } {
  return { taglineOpacity: 1 - smoothstep(0.10, 0.55, q), taglineY: -6 * clamp(q), starsOpacity: 1 - smoothstep(0, 0.40, q) }
}

export function frameStyle(pos: PhotoPosition): Record<string, string> {
  return {
    left: `calc(50vw + ${pos.x - pos.w / 2}vw)`,
    top: `calc(50vh + ${pos.y - pos.h / 2}vh)`,
    width: `${pos.w}vw`, height: `${pos.h}vh`, 'z-index': String(pos.z),
    'transform-origin': `calc(${pos.w / 2}vw - ${pos.x}vw) calc(${pos.h / 2}vh - ${pos.y}vh)`,
    ...(pos.br != null ? { 'border-radius': `${pos.br}px` } : {}),
  }
}

const round = (n: number) => +n.toFixed(5)

/** Literal compositor keyframes; include choreography boundaries as well as uniform samples. */
export function sceneKeyframes(layers: Layer[], intensity: number, stops = 32): string {
  const points = [...new Set([
    ...Array.from({ length: Math.max(32, stops) + 1 }, (_, i) => i / Math.max(32, stops)),
    0.06, 0.06 + 0.74 * 0.12, 0.1, 0.4, 0.45, 0.5, 0.53, 0.55, 0.56, 0.6, 0.71, 0.74, 0.8, 0.83, 0.86,
  ])].sort((a, b) => a - b)
  const photoStops = (layer: Layer) => {
    const boundaries = [0.57, 0.88, 0.90].map(band => flightProgress(band * Math.log(4) / depthLog(layer)))
    const samples = [...new Set([...points, ...boundaries])].sort((a, b) => a - b)
    // Refine steep fades (including the large-photo guard) to <0.3% interpolation error.
    const refine = (a: number, b: number): number[] => {
      const sa = layerScale(a, layer, intensity), sb = layerScale(b, layer, intensity)
      const oa = layerOpacity(a, layer, intensity), ob = layerOpacity(b, layer, intensity)
      const needsSample = [0.25, 0.5, 0.75].some(t => {
        const p = a + (b - a) * t
        return Math.abs((sa + (sb - sa) * t) / layerScale(p, layer, intensity) - 1) > 0.002
          || Math.abs(oa + (ob - oa) * t - layerOpacity(p, layer, intensity)) > 0.002
      })
      const mid = (a + b) / 2
      return needsSample && b - a > 0.00001 ? [...refine(a, mid), mid, ...refine(mid, b)] : []
    }
    return samples.flatMap((p, i) => i ? [...refine(samples[i - 1], p), p] : [p])
  }
  const sample = (name: string, value: (p: number) => string, boundaries: number[] = []) =>
    `@keyframes immersive-${name}{${[...new Set([...points, ...boundaries])].sort((a, b) => a - b).map(p => `${round(p * 100)}%{${value(p)}}`).join('')}}`
  return [
    ...layers.map(layer => sample(`layer-${layer.index}`, p => `transform:scale(${round(layerScale(p, layer, intensity))});opacity:${round(layerOpacity(p, layer, intensity))}`,
      photoStops(layer))),
    sample('tagline', p => { const f = taglineFrame(p); return `opacity:${round(f.opacity)};transform:scale(${round(f.scale)})` }),
    sample('eyebrow', p => { const f = taglineFrame(p + 0.03); return `opacity:${round(f.opacity)};transform:scale(${round(f.scale)})` }),
    ...['far', 'mid', 'near'].map((name, i) => sample(`stars-${name}`, p => { const f = starsFrame(p); return `opacity:calc(${round(f.opacity)} * var(--immersive-star-alpha));transform:scale(${round(f.scale[i])})` })),
    sample('vignette', p => `opacity:${round(vignetteFrame(p).opacity)}`),
    sample('exit-copy', q => { const f = exitFrame(q); return `opacity:${round(f.taglineOpacity)};transform:translateY(${round(f.taglineY)}vh);transform:translateY(${round(f.taglineY)}lvh)` }),
    sample('exit-stars', q => `opacity:${round(exitFrame(q).starsOpacity)}`),
    '@keyframes immersive-plane{0%,79.999%{visibility:visible}80%,100%{visibility:hidden}}',
  ].join('\n')
}

/** Responsive width of the photo box, including its crop and the static stage transform. */
export function peakSizes(layer: Layer, intensity: number, device: Device): { first: string; peak: string } {
  const width = layer.pos.w * STAGE.scale * (layer.pos.cropZoom ?? 1)
  const opaqueScale = Math.min(2.2, Math.pow(4, 0.57 * intensity))
  const cap = device === 'mobile' ? 1100 : 2200
  const sizes = (width: number) => `min(${cap}px, ${Math.ceil(width)}vw)`
  return { first: sizes(width), peak: sizes(width * opaqueScale) }
}

/** Crop transform shared by the live scene and the admin canvas: pan the overflow created by the
 *  zoom so dragging the crop point moves the image on both axes (object-position alone cannot). */
export function cropImageStyle(cropX = 50, cropY = 50, zoom = 1) {
  const z = Math.min(3, Math.max(1, Number.isFinite(zoom) ? zoom : 1))
  return {
    objectPosition: `${cropX}% ${cropY}%`,
    transform: `translate(${(50 - cropX) * (z - 1)}%, ${(50 - cropY) * (z - 1)}%) scale(${z})`,
    transformOrigin: 'center',
  }
}
