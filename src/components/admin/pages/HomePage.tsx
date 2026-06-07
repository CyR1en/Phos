import { ObjectField } from '../fields/ObjectField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'
import { useConfig } from '../../../lib/admin/store'

export function HomePage() {
  const { config } = useConfig()
  return (
    <div class="max-w-3xl">
      <div class="mb-8">
        <p class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-2">home</p>
        <h2 class="font-display text-phos-heading text-phos-ink">Home</h2>
        <p class="text-phos-body text-phos-muted mt-2">{config?.home?.page_description}</p>
      </div>
      <div class="space-y-6">
        <Section title="Open Graph">
          <TextField path="home.og_title" label="Title" />
          <TextField path="home.og_description" label="Description" />
        </Section>
        <ObjectField path="home" />
      </div>
    </div>
  )
}
