import { describe, test } from 'node:test'
import { scenarios } from './helpers/scenario.mjs'
import { register as dialog } from './scenarios/dialog.mjs'
import { register as zoom } from './scenarios/zoom.mjs'
import { register as gestures } from './scenarios/gestures.mjs'
import { register as morph } from './scenarios/morph.mjs'
import { register as history } from './scenarios/history.mjs'
import { register as navigation } from './scenarios/navigation.mjs'
import { register as loader } from './scenarios/loader.mjs'

for (const [name, register] of Object.entries({
  dialog,
  zoom,
  gestures,
  morph,
  history,
  navigation,
  loader
})) {
  describe(name, { concurrency: false }, () => register(scenarios(test)))
}
