import { useState } from 'preact/hooks'
import { ArrowLeft, Eye, EyeOff } from 'lucide-preact'
import { api } from '../../lib/admin/api'
import { useConfig } from '../../lib/admin/store'
import { Button } from './ui/Button'

export function AuthGate() {
  const { setToken } = useConfig()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (e?: Event) => {
    e?.preventDefault()
    if (!password || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const { token } = await api.login(password)
      setToken(token)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div class="admin-auth">
      <div class="w-full max-w-[400px]">
        <form onSubmit={submit} class="admin-auth-form" aria-busy={submitting}>
          <div class="flex items-center gap-3">
            <img src="/logo.svg" alt="" class="h-8 w-auto dark:invert" />
            <span class="font-semibold text-base text-ink">Phos Admin</span>
          </div>
          <h1 class="text-ink">Welcome back</h1>
          <p class="mt-3">Sign in to manage your photographs and website.</p>
          <div class="mt-8">
            <label for="admin-password" class="text-sm font-medium text-ink block">Password</label>
            <div class="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)}
                autoFocus
                autocomplete="current-password"
                aria-invalid={!!error}
                aria-describedby={error ? 'auth-error' : undefined}
                class="w-full h-11 rounded-sm border px-3 pr-12 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                class="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted hover:text-ink rounded-sm"
              >
                {showPassword ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
              </button>
            </div>
            {error && <p id="auth-error" class="auth-error" role="alert">{error}</p>}
            <Button type="submit" disabled={submitting || !password} class="mt-6 w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>
        </form>
        <a href="/" class="admin-auth-back"><ArrowLeft size={16} strokeWidth={1.75} />Back to website</a>
      </div>
    </div>
  )
}
