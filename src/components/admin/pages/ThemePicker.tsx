import { useEffect, useState } from 'preact/hooks'
import { useConfig } from '../../../lib/admin/store'

interface ThemeDef {
  id: string
  name: string
  description: string
  /** Light mode swatches: [canvas, surface, primary, accent, text] */
  light: string[]
  /** Dark mode swatches */
  dark: string[]
}

const THEMES: ThemeDef[] = [
  {
    id: 'theme-rose-pine',
    name: 'Rosé Pine',
    description: 'Warm rose & iris — soft, poetic',
    light: ['#faf4ed', '#fffaf3', '#b4637a', '#907aa9', '#575279'],
    dark: ['#191724', '#1f1d2e', '#eb6f92', '#c4a7e7', '#e0def4'],
  },
  {
    id: 'theme-modern-elegant',
    name: 'Modern Elegant',
    description: 'Neutral refined — warm greige, indigo accent',
    light: ['#f8f6f3', '#fefcf8', '#4338ca', '#7c3aed', '#1c1917'],
    dark: ['#1a1d23', '#21242b', '#818cf8', '#a78bfa', '#e5e7eb'],
  },
  {
    id: 'theme-noir',
    name: 'Noir',
    description: 'High drama — cream paper, blood red, true black',
    light: ['#f5f0eb', '#faf6f0', '#991b1b', '#5b21b6', '#1a1410'],
    dark: ['#0a0a0a', '#141414', '#dc2626', '#7c3aed', '#f5f0eb'],
  },
  {
    id: 'theme-nord',
    name: 'Nord',
    description: 'Arctic cool blues — crisp, calm',
    light: ['#ECEFF4', '#FFFFFF', '#5E81AC', '#B48EAD', '#2E3440'],
    dark: ['#2E3440', '#3B4252', '#88C0D0', '#B48EAD', '#ECEFF4'],
  },
  {
    id: 'theme-solarized',
    name: 'Solarized',
    description: 'Classic engineered — warm light, cool dark',
    light: ['#FDF6E3', '#EEE8D5', '#268BD2', '#6C71C4', '#073642'],
    dark: ['#002B36', '#073642', '#268BD2', '#6C71C4', '#FDF6E3'],
  },
  {
    id: 'theme-everforest',
    name: 'Everforest',
    description: 'Earthy woodland greens — natural, grounded',
    light: ['#FFF9E8', '#F6F0E2', '#3A94C5', '#DF69BA', '#4B4639'],
    dark: ['#2D353B', '#343F44', '#7FBBB3', '#D699B6', '#D3C6AA'],
  },
]

function SwatchStrip({ colors, label }: { colors: string[]; label: string }) {
  return (
    <div class="flex flex-1 overflow-hidden rounded-[3px]">
      {colors.map((c, i) => (
        <div
          key={i}
          class="flex-1 h-full"
          style={{ backgroundColor: c }}
          title={`${label} ${['Canvas', 'Surface', 'Primary', 'Accent', 'Text'][i]}: ${c}`}
        />
      ))}
    </div>
  )
}

export function ThemePicker() {
  const { config, getValue, setValue, flushSave } = useConfig()
  const currentTheme = (getValue('site.theme') as string) || 'theme-rose-pine'
  const [selected, setSelected] = useState(currentTheme)

  // Re-sync local state when the config loads from the API (async, after first render)
  useEffect(() => {
    const theme = (getValue('site.theme') as string) || 'theme-rose-pine'
    setSelected(theme)
  }, [config])

  // Sync data-theme on mount and when selection changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', selected)
  }, [selected])

  const handleSelect = (themeId: string) => {
    setSelected(themeId)
    setValue('site.theme', themeId)
    flushSave()
  }

  return (
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {THEMES.map((theme) => {
        const isActive = selected === theme.id
        return (
          <button
            type="button"
            key={theme.id}
            onClick={() => handleSelect(theme.id)}
            class={[
              'theme-card relative flex flex-col rounded-md border-2 bg-canvas text-left transition-all duration-200',
              isActive
                ? 'border-primary shadow-[0_0_0_1px_var(--primary)]'
                : 'border-border-light hover:border-border-hover hover:-translate-y-0.5 hover:shadow-md',
            ].join(' ')}
            aria-pressed={isActive}
          >
            {/* Swatch previews */}
            <div class="flex flex-col gap-[3px] p-3 pb-2">
              <div class="flex h-9 rounded-[3px] overflow-hidden border border-black/5">
                <SwatchStrip colors={theme.light} label="Light" />
              </div>
              <div class="flex h-9 rounded-[3px] overflow-hidden border border-white/10">
                <SwatchStrip colors={theme.dark} label="Dark" />
              </div>
            </div>

            {/* Theme info */}
            <div class="px-3 pb-3">
              <div class="flex items-center justify-between">
                <span class="font-display text-base font-medium text-ink">
                  {theme.name}
                </span>
                {isActive && (
                  <span class="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-text">
                    ✓
                  </span>
                )}
              </div>
              <p class="text-xs text-muted mt-0.5 leading-snug">
                {theme.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
