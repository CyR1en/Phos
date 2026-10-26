import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scenarios } from './helpers/scenario.mjs'
import { makeWorld } from './helpers/world.mjs'

const check = scenarios(test)

check('finished forwards and both animations remain observable until cancelled', async () => {
  const world = makeWorld()
  const target = world.$('lightbox-img-a')
  const animations = ['none', 'backwards', 'forwards', 'both'].map((fill) =>
    target.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'scale(2)' }], {
      duration: 32,
      fill
    })
  )
  assert.deepEqual(target.getAnimations(), animations)
  await world.advance(64)
  assert.ok(animations.every((animation) => animation.playState === 'finished'))
  assert.deepEqual(target.getAnimations(), animations.slice(2))
  animations[2].cancel()
  assert.deepEqual(target.getAnimations(), [animations[3]])
  assert.equal(world.opacityOf(target), 1)
  assert.equal(world.transformOf(target), 'scale(2)')
  assert.equal(world.liveAnims().length, 1)
  animations[3].cancel()
  assert.deepEqual(target.getAnimations(), [])
  assert.equal(world.liveAnims().length, 0)
})
