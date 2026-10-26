import assert from 'node:assert/strict'
import { bundle } from '../helpers/bundle.mjs'

const { createHistory } = await bundle('src/scripts/lightbox/history.ts')

export function register(check) {
  const routerState = { index: 8, scrollX: 34, scrollY: 987, app: { preserved: true } }
  const photos = [
    { category: 'wedding', filename: 'sample-01.jpg' },
    { category: 'wedding', filename: 'sample-02.jpg' },
    { category: 'portraits', filename: 'Été + & # 03.jpeg' }
  ]

  class FakeWindow {
    listeners = []

    addEventListener(type, callback, options = {}) {
      const capture = options === true || Boolean(options.capture)
      if (options.signal?.aborted) return
      if (
        this.listeners.some(
          (listener) =>
            listener.type === type && listener.callback === callback && listener.capture === capture
        )
      )
        return

      const listener = { type, callback, capture }
      this.listeners.push(listener)
      options.signal?.addEventListener(
        'abort',
        () => {
          this.listeners = this.listeners.filter((current) => current !== listener)
        },
        { once: true }
      )
    }

    dispatchEvent(event) {
      let stopped = false
      event.stopImmediatePropagation = () => {
        stopped = true
      }
      const listeners = [...this.listeners]
      for (const capture of [true, false]) {
        for (const listener of listeners) {
          if (stopped) return true
          if (
            listener.type === event.type &&
            listener.capture === capture &&
            this.listeners.includes(listener)
          )
            listener.callback(event)
        }
      }
      return true
    }
  }

  function setup({ hash = '', initialState = routerState } = {}) {
    const location = new URL(`https://phos.test/photos/all?filter=wedding${hash}`)
    const window = new FakeWindow()
    const entries = [{ state: structuredClone(initialState), url: location.href }]
    const pending = []
    const counts = { pushes: 0, replaces: 0, backs: 0, router: 0, closes: 0, opens: [] }
    let cursor = 0
    const emit = (state) =>
      window.dispatchEvent({ type: 'popstate', state: structuredClone(state) })
    const traverse = (delta) => {
      const destination = cursor + delta
      if (destination < 0 || destination >= entries.length) return
      pending.push(() => {
        cursor = destination
        location.href = entries[cursor].url
        emit(entries[cursor].state)
      })
    }
    const history = {
      get state() {
        return entries[cursor].state
      },
      pushState(state, _unused, url) {
        counts.pushes++
        location.href = new URL(url, location).href
        entries.splice(cursor + 1, entries.length, {
          state: structuredClone(state),
          url: location.href
        })
        cursor++
      },
      replaceState(state, _unused, url = location.href) {
        counts.replaces++
        location.href = new URL(url, location).href
        entries[cursor] = { state: structuredClone(state), url: location.href }
      },
      back() {
        counts.backs++
        traverse(-1)
      },
      forward() {
        traverse(1)
      }
    }
    Object.assign(globalThis, { location, window, history })
    // Register Astro first: capture must win even with later registration.
    window.addEventListener('popstate', () => {
      counts.router++
    })
    const state = { photos: structuredClone(photos), index: 0, open: false }
    const deps = {
      openSilently(index) {
        counts.opens.push(index)
        state.open = true
        state.index = index
      },
      closeSilently() {
        counts.closes++
        state.open = false
      }
    }
    const module = createHistory({ state }, deps)
    module.attach()
    const flush = () => {
      while (pending.length) pending.shift()()
    }
    const open = (index) => {
      state.index = index
      state.open = true
      module.onOpen(index)
    }
    const pop = (entryState, url = location.href) => {
      history.replaceState(entryState, '', url)
      emit(entryState)
    }
    return { module, deps, state, entries, counts, history, location, window, flush, open, pop }
  }

  check('1. open pushes one encoded photo entry and preserves all router state', () => {
    const f = setup()
    f.open(0)
    assert.equal(f.entries.length, 2)
    assert.equal(f.counts.pushes, 1)
    assert.deepEqual(f.history.state, { ...routerState, phosLightbox: 'wedding/sample-01' })
    assert.equal(f.location.hash, '#photo=wedding%2Fsample-01')
    assert.equal(f.location.search, '?filter=wedding')
    f.module.onOpen(0)
    assert.equal(f.counts.pushes, 1)
    assert.equal(f.counts.replaces, 0)
  })

  check('2. navigate replaces the one extra entry and keeps router state', () => {
    const f = setup()
    f.open(0)
    f.state.index = 1
    f.module.onNavigate(1)
    assert.equal(f.entries.length, 2)
    assert.equal(f.counts.pushes, 1)
    assert.equal(f.counts.replaces, 1)
    assert.deepEqual(f.history.state, { ...routerState, phosLightbox: 'wedding/sample-02' })
    assert.equal(f.location.hash, '#photo=wedding%2Fsample-02')
  })

  check('3. close consumes its asynchronous Back without router or duplicate close', () => {
    const f = setup()
    f.open(0)
    f.state.open = false
    f.module.onClose()
    f.module.onClose()
    assert.equal(f.counts.backs, 1)
    f.flush()
    assert.equal(f.counts.router, 0)
    assert.equal(f.counts.closes, 0)
    assert.equal(f.state.open, false)
    assert.equal(f.location.hash, '')
    assert.deepEqual(f.history.state, routerState)
  })

  check('4. user Back closes silently and bypasses the earlier router listener', () => {
    const f = setup()
    f.open(0)
    f.history.back()
    f.flush()
    assert.equal(f.counts.closes, 1)
    assert.equal(f.counts.router, 0)
    assert.equal(f.state.open, false)
    assert.equal(f.location.hash, '')
  })

  check('5. Forward silently restores the current photo and Close can go Back again', () => {
    const f = setup()
    f.open(0)
    f.state.index = 1
    f.module.onNavigate(1)
    f.history.back()
    f.flush()
    f.history.forward()
    f.flush()
    assert.deepEqual(f.counts.opens, [1])
    assert.equal(f.counts.router, 0)
    assert.equal(f.state.open, true)
    assert.equal(f.state.index, 1)
    f.state.open = false
    f.module.onClose()
    f.flush()
    assert.equal(f.location.hash, '')
    assert.equal(f.counts.router, 0)
    assert.equal(f.counts.closes, 1)
  })

  check('6. direct unescaped hash resolves, adopts without push, and closes by replacement', () => {
    const f = setup({ hash: '#photo=wedding/sample-02' })
    assert.equal(f.module.indexFromHash(), 1)
    f.deps.openSilently(f.module.indexFromHash())
    f.module.onOpen(1)
    f.module.onOpen(1)
    assert.equal(f.entries.length, 1)
    assert.equal(f.counts.pushes, 0)
    assert.equal(f.counts.replaces, 1)
    assert.deepEqual(f.history.state, { ...routerState, phosLightbox: 'wedding/sample-02' })
    f.state.open = false
    f.module.onClose()
    assert.equal(f.counts.backs, 0)
    assert.equal(f.location.hash, '')
    assert.deepEqual(f.history.state, { ...routerState, phosLightbox: undefined })
  })

  check('7. unrelated popstate while closed reaches Astro', () => {
    const f = setup()
    f.pop({ index: 7, scrollX: 0, scrollY: 21 }, '/galleries')
    assert.equal(f.counts.router, 1)
    assert.deepEqual(f.counts.opens, [])
    assert.equal(f.counts.closes, 0)
  })

  check('null history state is safely spread on push, replace, and direct-hash close', () => {
    const f = setup({ initialState: null })
    f.open(0)
    assert.deepEqual(f.history.state, { phosLightbox: 'wedding/sample-01' })
    f.state.index = 1
    f.module.onNavigate(1)
    assert.deepEqual(f.history.state, { phosLightbox: 'wedding/sample-02' })
    const direct = setup({ initialState: null, hash: '#photo=wedding%2Fsample-02' })
    direct.open(1)
    direct.state.open = false
    direct.module.onClose()
    assert.equal(direct.entries.length, 1)
    assert.deepEqual(direct.history.state, { phosLightbox: undefined })
  })

  check('navigation before open, closed navigation, and invalid indexes are inert', () => {
    const f = setup()
    f.state.open = true
    f.module.onNavigate(1)
    f.state.index = -1
    f.module.onOpen(0)
    f.state.index = 100
    f.module.onOpen(0)
    assert.equal(f.counts.pushes + f.counts.replaces, 0)
    f.open(0)
    f.module.onNavigate(100)
    f.state.open = false
    f.module.onNavigate(1)
    assert.equal(f.counts.replaces, 0)
  })

  check(
    'malformed, unrelated, and removed-photo hashes return null; special characters round trip',
    () => {
      for (const hash of ['#photo=%E0%A4%A', '#photo=missing', '#other=wedding/sample-02', '']) {
        const f = setup({ hash })
        assert.equal(f.module.indexFromHash(), null)
      }
      const f = setup()
      f.open(2)
      assert.equal(f.module.indexFromHash(), 2)
      assert.equal(f.history.state.phosLightbox, 'portraits/Été + & # 03')
      f.state.photos = [photos[0]]
      assert.equal(f.module.indexFromHash(), null)
    }
  )

  check(
    'popstate resolves reordered photos and shows only when index or open state changes',
    () => {
      const f = setup()
      f.state.photos.reverse()
      f.pop({ ...routerState, phosLightbox: 'wedding/sample-01' })
      assert.deepEqual(f.counts.opens, [2])
      f.pop({ ...routerState, phosLightbox: 'wedding/sample-01' })
      assert.deepEqual(f.counts.opens, [2])
      f.pop({ ...routerState, phosLightbox: 'wedding/sample-02' })
      assert.deepEqual(f.counts.opens, [2, 1])
      assert.equal(f.counts.router, 0)
    }
  )

  check('removed or invalid popstate keys close an open viewer and otherwise reach Astro', () => {
    const f = setup()
    f.open(0)
    f.state.photos = [photos[1]]
    f.pop({ ...routerState, phosLightbox: 'wedding/sample-01' })
    assert.equal(f.counts.closes, 1)
    assert.equal(f.counts.router, 0)
    f.pop({ ...routerState, phosLightbox: 'wedding/sample-01' })
    assert.equal(f.counts.router, 1)
    f.pop({ ...routerState, phosLightbox: { unexpected: true } })
    assert.equal(f.counts.router, 2)
    f.pop(null)
    assert.equal(f.counts.router, 3)
  })

  check('attach and detach are idempotent; detaching mid-close clears pending flags', () => {
    const f = setup()
    f.module.attach()
    assert.equal(f.window.listeners.filter((listener) => listener.capture).length, 1)
    f.open(0)
    f.state.open = false
    f.module.onClose()
    f.module.detach()
    f.module.detach()
    f.module.attach()
    f.flush()
    assert.equal(f.counts.router, 1)
    f.pop({ ...routerState, phosLightbox: 'wedding/sample-02' })
    assert.deepEqual(f.counts.opens, [1])
    assert.equal(f.counts.router, 1)
    f.module.detach()
    f.pop({ ...routerState, phosLightbox: 'wedding/sample-01' })
    assert.deepEqual(f.counts.opens, [1])
    assert.equal(f.counts.router, 2)
  })

  check('onOpen uses the current state.index rather than its stale argument', () => {
    const f = setup()
    f.state.index = 1
    f.module.onOpen(0)
    assert.equal(f.history.state.phosLightbox, 'wedding/sample-02')
  })
  check('cross-page Back closes silently and reaches Astro; inactive pops stay inert', () => {
    const f = setup()
    f.open(0)
    f.pop(null, '/galleries')
    assert.equal(f.counts.closes, 1)
    assert.equal(f.counts.router, 1)
    f.pop(null, '/another-page')
    assert.equal(f.counts.closes, 1)
    assert.equal(f.counts.router, 2)
  })
  check('page ownership includes the query string', () => {
    const f = setup()
    f.open(0)
    f.pop(null, '/photos/all?filter=street')
    assert.equal(f.counts.closes, 1)
    assert.equal(f.counts.router, 1)
  })
  check('same-page Back during a pending open closes despite state.open still being false', () => {
    const f = setup()
    f.open(0)
    f.state.open = false
    f.history.back()
    f.flush()
    assert.equal(f.counts.closes, 1)
    assert.equal(f.counts.router, 0)
  })
  check('Forward during a pending exit reopens even when the same index is still open', () => {
    const f = setup()
    f.open(0)
    f.deps.closeSilently = () => {
      f.counts.closes++
    }
    f.history.back()
    f.flush()
    assert.equal(f.state.open, true)
    f.history.forward()
    f.flush()
    assert.deepEqual(f.counts.opens, [0])
    assert.equal(f.counts.router, 0)
  })
}
