// `npm run check:full`: build fresh output without syncing config from the local DB, then run
// every check. A script instead of a `VAR=1 npm run …` prefix so it also works on Windows.
import { spawnSync } from 'node:child_process'

const steps = [
  ['build', { PHOS_SKIP_CONFIG_SYNC: '1' }],
  ['check', {}],
]
for (const [script, env] of steps) {
  const options = { stdio: 'inherit', env: { ...process.env, ...env } }
  const result = process.env.npm_execpath
    ? spawnSync(process.execPath, [process.env.npm_execpath, 'run', script], options)
    : spawnSync('npm', ['run', script], { ...options, shell: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
