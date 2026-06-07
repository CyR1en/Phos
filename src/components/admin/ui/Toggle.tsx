interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  id?: string
}

export function Toggle({ checked, onChange, label, id }: Props) {
  return (
    <label class="inline-flex items-center gap-3 cursor-pointer select-none">
      <span class="relative inline-block w-10 h-[22px] flex-shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
          class="sr-only peer"
        />
        <span class="absolute inset-0 bg-phos-hairline rounded-phos-pill peer-checked:bg-phos-primary transition-colors" />
        <span class="absolute left-[3px] bottom-[3px] h-4 w-4 bg-phos-canvas rounded-full transition-transform peer-checked:translate-x-[18px]" />
      </span>
      {label && <span class="text-phos-caption text-phos-body-muted">{label}</span>}
    </label>
  )
}
