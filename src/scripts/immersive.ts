// No imports: Astro can inline this small, self-contained module.
let dispose: (() => void) | undefined

function initImmersive() {
  dispose?.()
  const root = document.querySelector<HTMLElement>('[data-immersive-gallery]')
  const html = document.documentElement
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const fallback = !CSS.supports('animation-timeline: scroll()') && !reduced.matches
  html.toggleAttribute('data-immersive-fallback', fallback)
  if (!root) return
  const stage = root.querySelector<HTMLElement>('.immersive-stage')!
  const stars = [...root.querySelectorAll<HTMLElement>('.immersive-stars')]
  const copy = root.dataset.atmosphere === 'vignette' ? root.querySelector<HTMLElement>('.immersive-copy') : null
  const planes = copy ? [copy] : stars
  let alive = true, near = false, top = 0, travel = 1, height = 1, raf = 0, pointerRaf = 0
  const upgraded = new WeakSet<HTMLImageElement>()
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const progress = () => clamp((scrollY - top) / travel)
  const upgrade = () => {
    if (reduced.matches || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return
    root.querySelectorAll<HTMLImageElement>('.immersive-scene img[data-sizes-peak]').forEach(img => {
      if (upgraded.has(img) || !img.getClientRects().length) return
      upgraded.add(img)
      const probe = new Image()
      probe.decoding = 'async'
      probe.sizes = img.dataset.sizesPeak!
      probe.srcset = img.srcset
      probe.src = img.src
      probe.decode().then(() => { if (alive && img.isConnected) img.sizes = probe.sizes }, () => { upgraded.delete(img) })
    })
  }
  const write = () => {
    raf = 0
    if (!fallback) return
    const p = progress()
    root.style.setProperty('--immersive-progress', String(p))
    root.style.setProperty('--immersive-exit', String(clamp((scrollY - top - travel) / height)))
    root.toggleAttribute('data-immersive-moving', near && p > 0 && p < 0.8)
  }
  const measure = () => {
    top = root.getBoundingClientRect().top + scrollY
    height = stage.offsetHeight || innerHeight
    travel = Math.max(1, root.offsetHeight - height)
    write()
    if (near) upgrade()
  }
  const scroll = () => { if (near && !raf) raf = requestAnimationFrame(write) }
  const observer = new IntersectionObserver(entries => {
    near = entries.some(entry => entry.isIntersecting)
    if (near) measure()
    else root.removeAttribute('data-immersive-moving')
  }, { rootMargin: '100% 0px' })
  observer.observe(root)
  const centre = () => planes.forEach(plane => { plane.style.translate = '0px 0px' })
  const pointerQuery = matchMedia('(width >= 768px) and (hover: hover) and (pointer: fine)')
  const pointer = (event: PointerEvent) => {
    if (!pointerQuery.matches || reduced.matches || !planes.length || pointerRaf) return
    pointerRaf = requestAnimationFrame(() => {
      pointerRaf = 0
      if (progress() < 0.5 || scrollY > top + travel + height || scrollY + innerHeight < top) return
      const rect = stage.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)))
      const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)))
      planes.forEach((plane, index) => { const depth = copy ? 6 : [6, 12, 20][index]; plane.style.translate = `${-x * depth}px ${-y * depth}px` })
    })
  }
  const leave = () => { cancelAnimationFrame(pointerRaf); pointerRaf = 0; centre() }
  if (fallback) addEventListener('scroll', scroll, { passive: true })
  addEventListener('resize', measure, { passive: true })
  reduced.addEventListener('change', initImmersive)
  pointerQuery.addEventListener('change', leave)
  if (!reduced.matches && planes.length) {
    stage.addEventListener('pointermove', pointer, { passive: true })
    stage.addEventListener('pointerleave', leave)
  }
  measure()
  root.setAttribute('data-immersive-ready', '')
  dispose = () => {
    alive = false
    observer.disconnect()
    cancelAnimationFrame(raf)
    leave()
    removeEventListener('scroll', scroll)
    removeEventListener('resize', measure)
    reduced.removeEventListener('change', initImmersive)
    pointerQuery.removeEventListener('change', leave)
    stage.removeEventListener('pointermove', pointer)
    stage.removeEventListener('pointerleave', leave)
    root.removeAttribute('data-immersive-moving')
    root.removeAttribute('data-immersive-ready')
    dispose = undefined
  }
}

initImmersive()
document.addEventListener('astro:after-swap', initImmersive)
document.addEventListener('astro:before-swap', () => dispose?.())
