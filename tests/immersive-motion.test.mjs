import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundle } from './helpers/bundle.mjs'

import postcss from 'postcss'
import { keyframeStops } from './helpers/immersive-contracts.mjs'
const motion = () => bundle('src/lib/immersive-motion.ts')
const position = (z, extra = {}) => ({ x: 12, y: -9, w: 20, h: 18, z, ...extra })
const crossing = (fn, target) => {
  for (let i = 0; i <= 10000; i++) if (fn(i / 10000) <= target) return i / 10000
  assert.fail('curve never reaches ' + target)
}
const layers = m => m.resolveLayers([position(10), position(20), position(30)], 3, 'desktop')

test('immersive constants preserve stage, aspect, breakpoint, intensity and runway', async () => {
  const m = await motion()
  assert.deepEqual(m.STAGE, { scale: 0.9, offsetY: 2.5 })
  assert.deepEqual(m.ASPECT, { mobile: 9 / 19.5, desktop: 16 / 9 })
  assert.equal(m.BREAKPOINT, 768)
  assert.deepEqual(m.INTENSITY, { dramatic: 1, balanced: 0.75, subtle: 0.5 })
  assert.deepEqual(m.RUNWAY, { short: 140, standard: 200, long: 260 })
})

test('photo fade windows are invariant across all three intensities at back, middle and front depths', async () => {
  const m = await motion()
  for (const layer of layers(m)) {
    const half = Object.values(m.INTENSITY).map(I => crossing(p => m.layerOpacity(p, layer, I), 0.5))
    assert.deepEqual(half, half.map(() => half[0]), `depth ${layer.rank}: opacity crosses 0.5 at the same progress`)
  }
})

test('every default and synthetic photo finishes its fade strictly before .80 without a cutoff pop', async () => {
  const m = await motion()
  for (const device of ['mobile', 'desktop']) {
    const sets = [m.resolveLayers(null, 7, device), layers(m), m.resolveLayers([position(1, { w: 1, h: 1 }), position(2, { w: 100, h: 100 })], 2, device)]
    for (const list of sets) for (const I of Object.values(m.INTENSITY)) {
      const css = m.sceneKeyframes(list, I)
      for (const layer of list) {
        const opacity = p => m.layerOpacity(p, layer, I)
        assert.ok(crossing(opacity, 0) < 0.8, `${device}[${layer.index}], I=${I}: natural fade ends before .80`)
        const last = keyframeStops(css, `immersive-layer-${layer.index}`).filter(s => s.p < 0.8).at(-1)
        assert.equal(Number(last.props.get('opacity')), 0, 'last keyframe before 80% is already transparent')
        assert.equal(opacity(0.7999), 0)
        assert.ok(Math.abs(opacity(0.799) - opacity(0.8)) <= 0.02, 'continuous across hard cutoff')
        for (const p of [0.8, 0.9, 1, 2]) assert.equal(opacity(p), 0)
      }
    }
  }
})

test('SPEC fade table at I=1 pins back .501→.717, middle .411→.578 and front .355→.491', async () => {
  const m = await motion()
  // smoothstep reaches 1% at t=.058903; the .99 crossing is just after the table's fade start.
  const fraction = 0.058903135778195
  for (const [i, [start, end]] of [[0.501, 0.717], [0.411, 0.578], [0.355, 0.491]].entries()) {
    const layer = layers(m)[i]
    const almostOpaque = crossing(p => m.layerOpacity(p, layer, 1), 0.99)
    const gone = crossing(p => m.layerOpacity(p, layer, 1), 0)
    assert.ok(Math.abs(almostOpaque - (start + fraction * (end - start))) <= 0.002, `${i}: .99 crossing ${almostOpaque}`)
    assert.ok(Math.abs((almostOpaque - fraction * gone) / (1 - fraction) - start) <= 0.002, `${i}: fade start`)
    assert.ok(Math.abs(gone - end) <= 0.002, `${i}: zero crossing ${gone}`)
  }
})

test('size guard fades a 100×100 photo at A=1.2→1.8 and is zero once .9·scale≥1.8', async () => {
  const m = await motion()
  const small = layers(m)[0], big = { ...small, pos: { ...small.pos, w: 100, h: 100 } }
  let guardedSamples = 0
  for (const I of Object.values(m.INTENSITY)) for (let i = 0; i < 800; i++) {
    const p = i / 1000, size = 0.9 * m.layerScale(p, big, I)
    const t = Math.max(0, Math.min(1, (size - 1.2) / 0.6))
    assert.ok(Math.abs(m.layerOpacity(p, big, I) - m.layerOpacity(p, small, I) * (1 - t * t * (3 - 2 * t))) < 1e-9)
    if (size >= 1.8) { guardedSamples++; assert.equal(m.layerOpacity(p, big, I), 0) }
  }
  assert.ok(guardedSamples > 0, 'positive guard branch was exercised')
})

test('tagline is fully opaque by 0.74 and within 0.03 of the back photo fading out', async () => {
  const m = await motion()
  const back = layers(m)[0]
  const full = crossing(p => 1 - m.taglineFrame(p).opacity, 0)
  assert.ok(full <= 0.74)
  for (const I of Object.values(m.INTENSITY)) {
    const end = crossing(p => m.layerOpacity(p, back, I), 0)
    assert.ok(full <= end + 0.03, `tagline ${full}; back fade ends ${end}`)
  }
  assert.equal(m.taglineFrame(0).opacity, 0)
  assert.equal(m.taglineFrame(0.86).scale, 1)
})

test('photo scales grow monotonically and front depth flies faster than middle and back', async () => {
  const m = await motion()
  const [back, middle, front] = layers(m)
  for (const I of Object.values(m.INTENSITY)) {
    for (const layer of [back, middle, front]) {
      let previous = 1
      for (let i = 0; i <= 1000; i++) {
        const scale = m.layerScale(i / 1000, layer, I)
        assert.ok(Number.isFinite(scale) && scale >= previous - 1e-12)
        previous = scale
      }
    }
    assert.ok(m.layerScale(0.35, front, I) > m.layerScale(0.35, middle, I))
    assert.ok(m.layerScale(0.35, middle, I) > m.layerScale(0.35, back, I))
  }
})

test('photo scales freeze right after each fade (SPEC: .90·L cap, fade ends at .88·L)', async () => {
  const m = await motion()
  for (const layer of layers(m)) for (const I of Object.values(m.INTENSITY)) {
    const end = crossing(p => m.layerOpacity(p, layer, I), 0)
    const atEnd = m.layerScale(end, layer, I)
    assert.ok(m.layerScale(end - 0.005, layer, I) < atEnd, 'still growing just before invisibility')
    const final = m.layerScale(1, layer, I)
    assert.ok(Math.abs(final - 4 ** (0.9 * I)) < 1e-9, '.90·L freeze cap')
    // Growth after full transparency is bounded by the .02·L slack between the fade end and the freeze cap.
    const slack = Math.pow(4, 0.02 * I) + 1e-6
    assert.ok(final >= atEnd - 1e-9 && final / atEnd <= slack, `depth ${layer.rank}, intensity ${I}: ${atEnd} → ${final}`)
    assert.ok(Math.abs(m.layerScale(0.8, layer, I) - final) < 1e-9, 'frozen by the end of the flight (p = 0.80)')
  }
})

test('resolveLayers preserves indices, z ranks, equal-depth midpoint and per-entry defaults', async () => {
  const m = await motion()
  const { DEFAULT_POSITIONS } = await bundle('src/lib/immersive-defaults.ts')
  for (const device of ['mobile', 'desktop']) {
    for (const input of [null, [], [null], [position(22), null]]) {
      const result = m.resolveLayers(input, 8, device)
      assert.equal(result.length, 8)
      for (const layer of result) {
        assert.equal(layer.index, result.indexOf(layer))
        assert.deepEqual(layer.pos, input?.[layer.index] ?? DEFAULT_POSITIONS[layer.index % DEFAULT_POSITIONS.length][device])
        assert.equal(layer.z, layer.pos.z)
      }
    }
    assert.deepEqual(layers(m).map(layer => layer.rank), [0, 0.5, 1])
    assert.deepEqual(m.resolveLayers([position(5), position(5)], 2, device).map(l => l.rank), [0.5, 0.5])
    assert.deepEqual(m.resolveLayers(null, 0, device), [])
  }
})

test('zero-size photos hide on both devices; only mobile hides the seventh default slot', async () => {
  const m = await motion()
  assert.equal(m.resolveLayers(null, 7, 'mobile')[6].hidden, true)
  assert.equal(m.resolveLayers(null, 7, 'desktop')[6].hidden, false)
  for (const device of ['mobile', 'desktop']) {
    const result = m.resolveLayers([position(1, { w: 0, h: 0 }), position(2, { w: 0 }), position(3, { h: 0 })], 3, device)
    assert.deepEqual(result.map(l => l.hidden), [true, false, false], device)
  }
  // A cloned mobile layout can carry a hidden top-z slot: it must not take a desktop cap slot or skew the rank range.
  const nine = [...Array.from({ length: 8 }, (_, i) => position(10 + i)), position(99, { w: 0, h: 0 })]
  const desktop = m.resolveLayers(nine, 9, 'desktop')
  assert.equal(desktop[8].hidden, true)
  assert.equal(desktop.filter(l => !l.hidden).length, 8, 'all eight sized photos render')
  assert.deepEqual(desktop.filter(l => !l.hidden).map(l => +l.rank.toFixed(6)), Array.from({ length: 8 }, (_, i) => +(i / 7).toFixed(6)))
})

test('frameStyle matches CanvasPhoto centre offsets and flies about the viewport centre', async () => {
  const m = await motion()
  // Convert simple emitted calc expressions to px, independently of their formatting.
  const pixels = (value, vw, vh) => {
    const expression = value.replace(/calc\(|\)/g, '').replace(/(-?[\d.]+)vw/g, (_, n) => String(Number(n) * vw))
      .replace(/(-?[\d.]+)vh/g, (_, n) => String(Number(n) * vh))
    assert.match(expression, /^[\d.\s+\-]+$/)
    return new Function('return ' + expression)()
  }
  for (const [width, height] of [[1440, 900], [393, 852]]) {
    for (const pos of [position(1), position(4, { x: -22, y: -28, w: 44, h: 22, br: 7 })]) {
      const f = m.frameStyle(pos), vw = width / 100, vh = height / 100
      const left = pixels(f.left, vw, vh), top = pixels(f.top, vw, vh)
      assert.ok(Math.abs(left - (width / 2 + (pos.x - pos.w / 2) * vw)) < 1e-8)
      assert.ok(Math.abs(top - (height / 2 + (pos.y - pos.h / 2) * vh)) < 1e-8)
      assert.equal(f.width, `${pos.w}vw`)
      assert.equal(f.height, `${pos.h}vh`)
      assert.equal(String(f['z-index'] ?? f.zIndex), String(pos.z))
      const origins = (f['transform-origin'] ?? f.transformOrigin).match(/calc\([^)]*\)/g)
      assert.equal(origins?.length, 2)
      const ox = pixels(origins[0], vw, vh), oy = pixels(origins[1], vw, vh), scale = 2.1
      assert.ok(Math.abs(left + ox + scale * (pos.w / 2 * vw - ox) - (width / 2 + scale * pos.x * vw)) < 1e-8)
      assert.ok(Math.abs(top + oy + scale * (pos.h / 2 * vh - oy) - (height / 2 + scale * pos.y * vh)) < 1e-8)
      if (pos.br != null) assert.equal(f['border-radius'] ?? f.borderRadius, `${pos.br}px`)
    }
  }
})

test('generated scene keyframes parse with at least 24 compositor stops per photo', async () => {
  const m = await motion(), list = layers(m)
  for (const requested of [undefined, 8, 48]) {
    const css = m.sceneKeyframes(list, 0.75, requested)
    assert.doesNotThrow(() => postcss.parse(css))
    for (const layer of list) {
      const name = `immersive-layer-${layer.index}`
      const block = css.match(new RegExp('@keyframes\\s+' + name + '\\s*\\{((?:[^{}]|\\{[^{}]*\\})*)\\}'))?.[1]
      assert.ok(block, name)
      const stops = [...block.matchAll(/([\d.]+)%\s*\{([^}]*)\}/g)]
      assert.ok(stops.length >= 24, `${name}: ${stops.length} stops`)
      assert.equal(Number(stops[0][1]), 0)
      assert.equal(Number(stops.at(-1)[1]), 100)
      for (const [, at, declarations] of stops) {
        const props = declarations.split(';').filter(Boolean).map(decl => decl.split(':')[0].trim())
        assert.deepEqual([...props].sort(), ['opacity', 'transform'])
        assert.match(declarations, /transform\s*:\s*scale\(/)
        const scale = Number(declarations.match(/transform\s*:\s*scale\(([-\d.]+)\)/)?.[1])
        const opacity = Number(declarations.match(/opacity\s*:\s*([-\d.]+)/)?.[1])
        assert.ok(Math.abs(scale - m.layerScale(Number(at) / 100, layer, 0.75)) < 1e-4)
        assert.ok(Math.abs(opacity - m.layerOpacity(Number(at) / 100, layer, 0.75)) < 1e-4)
      }
    }
    for (const name of ['tagline', 'stars', 'vignette', 'exit']) assert.match(css, new RegExp('@keyframes\\s+immersive-' + name))
  }
})

test('responsive peak sizes never undershoot first paint sizes', async () => {
  const m = await motion()
  for (const device of ['mobile', 'desktop']) for (const layer of m.resolveLayers(null, 7, device)) {
    for (const I of Object.values(m.INTENSITY)) {
      const { first, peak } = m.peakSizes(layer, I, device)
      const cap = device === 'mobile' ? 1100 : 2200
      const shape = new RegExp(`^min\\(${cap}px, [\\d.]+vw\\)$`)
      assert.match(first, shape)
      assert.match(peak, shape)
      const vw = value => Number(value.match(/([\d.]+)vw/)[1])
      assert.ok(vw(peak) >= vw(first))
    }
  }
})

test('atmosphere and exit frames stay bounded and finish their choreography', async () => {
  const m = await motion()
  assert.equal(m.starsFrame(0).opacity, 0)
  assert.equal(m.starsFrame(0.74).opacity, 1)
  assert.equal(m.vignetteFrame(0).opacity, 0)
  assert.equal(m.vignetteFrame(0.8).opacity, 0)
  for (let i = 0; i <= 100; i++) {
    const p = i / 100
    for (const frame of [m.taglineFrame(p), m.starsFrame(p), m.vignetteFrame(p)]) assert.ok(frame.opacity >= 0 && frame.opacity <= 1)
  }
  const start = m.exitFrame(0), end = m.exitFrame(1)
  assert.equal(start.taglineOpacity, 1)
  assert.equal(end.taglineOpacity, 0)
  assert.equal(end.starsOpacity, 0)
  assert.equal(end.taglineY, -6)
})

test('hidden default layers retain normalized ranks between zero and one', async () => {
  const m = await motion()
  for (const device of ['mobile', 'desktop']) for (const layer of m.resolveLayers(null, 7, device)) {
    assert.ok(layer.rank >= 0 && layer.rank <= 1, `${device}[${layer.index}] has rank ${layer.rank}`)
  }
})

test('default-photo opacity half crossings stay within the size-guard tolerance across intensities', async () => {
  // The large-photo guard (SPEC §b, factor A) is intentionally intensity-dependent: it only ever
  // fades a big photo EARLIER. For the shipped defaults that shift must stay small.
  const m = await motion()
  for (const device of ['mobile', 'desktop']) for (const layer of m.resolveLayers(null, 7, device).filter(l => !l.hidden)) {
    const half = Object.values(m.INTENSITY).map(I => crossing(p => m.layerOpacity(p, layer, I), 0.5))
    assert.ok(Math.max(...half) - Math.min(...half) <= 0.002, `${device}[${layer.index}]: ${half.join(', ')}`)
  }
})


test('all copy, eyebrow, stars, vignette, exit and plane keyframes follow their models', async () => {
  const m = await motion(), css = m.sceneKeyframes(layers(m), 1)
  const near = (a, b, name) => assert.ok(Math.abs(a - b) < 0.00002, `${name}: ${a} ≠ ${b}`)
  const numeric = value => Number(value?.match(/-?[\d.]+/)?.[0])
  const cases = [
    ['tagline', p => ({ opacity: m.taglineFrame(p).opacity, scale: m.taglineFrame(p).scale })],
    ['eyebrow', p => ({ opacity: m.taglineFrame(p + 0.03).opacity, scale: m.taglineFrame(p + 0.03).scale })],
    ...['far', 'mid', 'near'].map((name, i) => [`stars-${name}`, p => ({ opacity: m.starsFrame(p).opacity, scale: m.starsFrame(p).scale[i] })]),
    ['vignette', p => m.vignetteFrame(p)],
    ['exit-copy', p => ({ opacity: m.exitFrame(p).taglineOpacity, y: m.exitFrame(p).taglineY })],
    ['exit-stars', p => ({ opacity: m.exitFrame(p).starsOpacity })],
  ]
  for (const [name, frame] of cases) {
    const stops = keyframeStops(css, 'immersive-' + name)
    assert.ok(stops.length >= 5, name)
    for (const { p, props } of stops) {
      const expected = frame(p)
      near(numeric(props.get('opacity')), expected.opacity, `${name} ${p} opacity`)
      if (name.startsWith('stars-')) assert.match(props.get('opacity'), /var\(--immersive-star-alpha\)/)
      if ('scale' in expected) { assert.match(props.get('transform'), /^scale\(/); near(numeric(props.get('transform')), expected.scale, name + ' scale') }
      if ('y' in expected) { assert.match(props.get('transform'), /^translateY\([^)]*l?vh\)$/); near(numeric(props.get('transform')), expected.y, name + ' y') }
    }
  }
  const plane = keyframeStops(css, 'immersive-plane')
  assert.ok(plane.some(s => s.p === 0.8 && s.props.get('visibility') === 'hidden'))
  for (const p of [0, 0.2, 0.5, 0.799, 0.8, 0.85, 1]) {
    assert.equal(plane.filter(s => s.p <= p).at(-1)?.props.get('visibility'), p >= 0.8 ? 'hidden' : 'visible')
  }
})

test('peakSizes includes STAGE, crop zoom and the 2.2 opaque-scale cap', async () => {
  const m = await motion()
  for (const device of ['mobile', 'desktop']) for (const zoom of [1, 1.7, 3]) for (const I of Object.values(m.INTENSITY)) {
    const layer = { ...layers(m)[0], pos: position(1, { w: 27, cropZoom: zoom }) }
    assert.deepEqual(m.peakSizes(layer, I, device), {
      first: `min(${device === 'mobile' ? 1100 : 2200}px, ${Math.ceil(27 * 0.9 * zoom)}vw)`,
      peak: `min(${device === 'mobile' ? 1100 : 2200}px, ${Math.ceil(27 * 0.9 * zoom * Math.min(2.2, 4 ** (0.57 * I)))}vw)`,
    })
  }
})

test('hidden layers are excluded from the visible rank range', async () => {
  const m = await motion()
  const list = m.resolveLayers([position(-100, { w: 0, h: 0 }), position(20), position(30)], 3, 'mobile')
  assert.deepEqual(list.filter(l => !l.hidden).map(l => l.rank), [0, 1])
})

test('partial saved positions merge fields with their device default', async () => {
  const m = await motion(), { DEFAULT_POSITIONS } = await bundle('src/lib/immersive-defaults.ts')
  for (const device of ['mobile', 'desktop']) assert.deepEqual(m.resolveLayers([{ x: 4, cropZoom: 2 }], 1, device)[0].pos, { ...DEFAULT_POSITIONS[0][device], x: 4, cropZoom: 2 })
})


test('ranks are computed after the top-z device cap while original photo indices survive', async () => {
  const m = await motion()
  for (const [device, cap] of [['mobile', 6], ['desktop', 8]]) {
    const list = m.resolveLayers(Array.from({ length: 10 }, (_, i) => position(i * 10)), 10, device)
    const visible = list.filter(l => !l.hidden)
    assert.deepEqual(visible.map(l => l.index), Array.from({ length: cap }, (_, i) => 10 - cap + i))
    assert.deepEqual(visible.map(l => l.rank), visible.map((_, i) => i / (cap - 1)))
  }
})
