import { useEffect, useState } from 'preact/hooks'
import { SunIcon, MoonIcon } from './Icons'
import { Tooltip } from './Tooltip'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const hasDarkClass = document.documentElement.classList.contains('dark')
    const initialDark = stored === 'dark' || (stored !== 'light' && hasDarkClass)
    setIsDark(initialDark)
    if (initialDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const nextDark = !isDark
    setIsDark(nextDark)
    if (nextDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  return (
    <Tooltip text={isDark ? "Use light theme" : "Use dark theme"}>
      <button
        type="button"
        onClick={toggleTheme}
        class="flex h-8 w-8 items-center justify-center rounded-sm text-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
    </Tooltip>
  )
}
