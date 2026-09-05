import { ObjectField } from '../fields/ObjectField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'
import { useConfig } from '../../../lib/admin/store'

export function AboutPage() {
  const { config } = useConfig()
  return (
    <div class="max-w-3xl">
      <div class="admin-page-heading">
          <h1 class="font-display text-3xl font-bold text-ink">About Page</h1>
          <p class="text-base text-muted mt-2">{config?.about?.page_description}</p>
      </div>
      <div class="space-y-8">
        <Section title="Open Graph">
          <TextField path="about.og_title" label="Title" />
          <TextField path="about.og_description" label="Description" />
        </Section>
        <ObjectField path="about" />
      </div>
    </div>
  )
}
