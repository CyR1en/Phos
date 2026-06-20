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
        class="w-full max-w-sm bg-surface border border-border rounded-sm p-8 shadow-md space-y-6"
      >
        <div class="space-y-1.5 text-center">
          <div class="size-9 rounded-xs bg-primary flex items-center justify-center text-primary-text font-display font-bold text-lg shadow-sm mx-auto mb-3">
            Φ
          </div>
          <h1 class="font-display text-2xl font-bold text-ink tracking-tight">
            Sign In
          </h1>
          <p class="text-sm text-body-muted leading-relaxed">
            Enter your admin password to manage site content.
          </p>
        </div>

        <div class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-ink block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onInput={(e) =>
                setPassword((e.currentTarget as HTMLInputElement).value)
              }
              autoFocus
              class="flex h-10 w-full rounded-sm border border-border bg-canvas px-3 py-2 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !password}
            class="w-full h-10"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  )
}
