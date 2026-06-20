interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  id?: string
}

export function Toggle({ checked, onChange, label, id }: Props) {
  return (
    <label class="inline-flex items-center gap-3 cursor-pointer select-none">
      <span class="relative inline-block w-9 h-5 flex-shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
          class="sr-only peer"
        />
        <span class="absolute inset-0 bg-border rounded-full peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-border-focus peer-focus-visible:ring-offset-2 transition-all duration-200" />
        <span class="absolute left-[2px] top-[2px] h-4 w-4 bg-canvas rounded-full shadow-xs transition-transform duration-200 peer-checked:translate-x-[16px]" />
      </span>
      {label && <span class="text-sm font-medium text-ink">{label}</span>}
    </label>
  )
}
