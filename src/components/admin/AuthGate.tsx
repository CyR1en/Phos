import { useState } from 'preact/hooks'
import { api } from '../../lib/admin/api'
import { useConfig } from '../../lib/admin/store'
import { Button } from './ui/Button'

export function AuthGate() {
  const { setToken, pushToast } = useConfig()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e?: Event) => {
    e?.preventDefault()
    if (!password || submitting) return
    setSubmitting(true)
    try {
      const { token } = await api.login(password)
      setToken(token)
      setPassword('')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div class="min-h-screen bg-canvas flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        class="w-full max-w-sm bg-canvas border border-border rounded-lg p-8 shadow-sm"
      >
        <p class="text-xs font-mono uppercase tracking-wider text-accent mb-2">
          Site Admin
        </p>
        <h1 class="font-display font-display text-2xl text-ink mb-1">
          Sign in
        </h1>
        <p class="text-sm text-muted mb-6">
          Enter your admin password to manage site content.
        </p>
        <label class="block text-sm font-medium text-body-muted mb-1.5">
          Password
        </label>
        <input
          type="password"
          value={password}
          onInput={(e) =>
            setPassword((e.currentTarget as HTMLInputElement).value)
          }
          autoFocus
          class="w-full px-3 py-2.5 bg-canvas border border-border rounded-xs text-base font-body focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 mb-4"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={submitting || !password}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
