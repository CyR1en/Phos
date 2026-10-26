import { describe, test } from 'node:test'
import { scenarios } from './helpers/scenario.mjs'
import { register as closePaths } from './scenarios/close-paths.mjs'
import { register as navigation } from './scenarios/navigation-regressions.mjs'
import { register as history } from './scenarios/history.mjs'
import { register as lifecycle } from './scenarios/lifecycle.mjs'

const cases = []
const collect = (name, run) => cases.push({ name, run })
closePaths(collect)
navigation(collect)
history(collect)
lifecycle(collect)

function concern(name) {
  if (/reduced motion/.test(name)) return 'Reduced motion'
  if (/filter|setPhotos|tileFor|reorder|removed-photo/.test(name)) return 'Filters'
  if (/close clears|media queries|detach|teardown/.test(name)) return 'Teardown'
  if (
    /Back|Forward|popstate|history|router|hash|page ownership|onOpen|push|navigate replaces|navigation before/.test(
      name
    )
  )
    return 'History and router'
  return 'Open, close and navigation paths'
}

for (const group of [
  'Open, close and navigation paths',
  'History and router',
  'Filters',
  'Reduced motion',
  'Teardown'
]) {
  describe(group, { concurrency: false }, () => {
    const check = scenarios(test)
    for (const { name, run } of cases.filter((item) => concern(item.name) === group))
      check(name, run)
  })
}
