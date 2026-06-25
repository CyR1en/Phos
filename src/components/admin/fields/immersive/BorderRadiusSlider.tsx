import { RANGES } from './utils'

interface Props {
  /** Current value, or undefined when photos have differing br values. */
  value: number | undefined
  isMulti: boolean
  isMixed: boolean
  onChange: (v: number) => void
}

/**
 * Range slider with a numeric readout. Used for both single-select and bulk
 * border-radius editing. In bulk mode with mixed values, the slider renders at
 * 0 with a "mixed" label until the user drags it (at which point all selected
 * photos adopt the dragged value).
 *
 * Sliders only emit valid integers, so we commit directly to state on every
 * change (no draft/commit split needed, unlike text number inputs where
 * "-" / "." are valid intermediate states).
 */
export function BorderRadiusSlider({ value, isMulti, isMixed, onChange }: Props) {
  // Render 0 for the thumb position when mixed; the label shows "mixed".
  // Once the user drags, onChange fires and all selected photos adopt the new
  // value, so isMixed becomes false and the thumb tracks normally.
  const sliderVal = isMixed ? 0 : (value ?? 0)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted uppercase tracking-wide">
          Border Radius (px){isMulti ? ' (bulk)' : ''}
        </label>
        <span className="text-xs font-mono text-ink tabular-nums">
          {isMixed ? 'mixed' : `${sliderVal}px`}
        </span>
      </div>
      <input
        type="range"
        min={RANGES.br.min}
        max={RANGES.br.max}
        step={1}
        value={sliderVal}
        // Preact/React wire `onChange` for range inputs to the input event
        // (continuous), so a single handler is enough and the thumb tracks the
        // cursor.
        onChange={(e) => onChange(Number((e.currentTarget as HTMLInputElement).value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-canvas border border-border accent-primary"
      />
    </div>
  )
}
