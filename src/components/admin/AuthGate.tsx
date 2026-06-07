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
    <div class="min-h-screen bg-phos-canvas flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        class="w-full max-w-sm bg-phos-canvas border border-phos-hairline rounded-phos-lg p-8 shadow-sm"
      >
        <p class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-2">
          Site Admin
        </p>
        <h1 class="font-display text-phos-card text-phos-ink mb-1">
          Sign in
        </h1>
        <p class="text-phos-caption text-phos-muted mb-6">
          Enter your admin password to manage site content.
        </p>
        <label class="block text-phos-caption font-medium text-phos-body-muted mb-1.5">
          Password
        </label>
        <input
          type="password"
          value={password}
          onInput={(e) =>
            setPassword((e.currentTarget as HTMLInputElement).value)
          }
          autoFocus
          class="w-full px-3 py-2.5 bg-phos-canvas border border-phos-hairline rounded-phos-xs text-phos-body font-body focus:outline-none focus:border-phos-form-focus focus:ring-2 focus:ring-phos-form-focus/20 mb-4"
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
