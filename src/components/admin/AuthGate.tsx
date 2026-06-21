import { useState } from 'preact/hooks'
import { api } from '../../lib/admin/api'
import { useConfig } from '../../lib/admin/store'
import { Button } from './ui/Button'

function EyeIcon({ size = 24, class: cls, className, ...props }: { size?: number, class?: string, className?: string } & any) {
  const finalClass = cls || className
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={finalClass} className={finalClass} {...props}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon({ size = 24, class: cls, className, ...props }: { size?: number, class?: string, className?: string } & any) {
  const finalClass = cls || className
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={finalClass} className={finalClass} {...props}>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

export function AuthGate() {
  const { setToken, pushToast } = useConfig()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (e?: Event) => {
    e?.preventDefault()
    if (!password || submitting) return
    setSubmitting(true)
    setHasError(false)
    try {
      const { token } = await api.login(password)
      setToken(token)
      setPassword('')
    } catch (err) {
      setHasError(true)
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
          <img
            src="/logo.svg"
            alt="Phos"
            class="h-10 w-auto dark:invert mx-auto mb-3"
          />
          <h1 class="font-display text-2xl font-bold text-ink tracking-tight">
            Sign In
          </h1>
          <p class="text-sm text-body-muted leading-relaxed">
            Enter your admin password to manage site content.
          </p>
        </div>

        <div class="space-y-4">
          <div class="space-y-1.5">
            <label for="admin-password" class="text-sm font-medium text-ink block">
              Password
            </label>
            <div class="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onInput={(e) =>
                  setPassword((e.currentTarget as HTMLInputElement).value)
                }
                autoFocus
                autocomplete="current-password"
                aria-invalid={hasError}
                class="flex h-10 w-full rounded-sm border border-border bg-canvas pl-3 pr-11 py-2 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:border-border-focus"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                class="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-body-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:rounded-xs before:absolute before:inset-[-6px]"
              >
                {showPassword ? (
                  <EyeOffIcon size={18} />
                ) : (
                  <EyeIcon size={18} />
                )}
              </button>
            </div>
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
