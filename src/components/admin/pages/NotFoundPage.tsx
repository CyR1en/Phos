import { ObjectField } from '../fields/ObjectField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'
import { useConfig } from '../../../lib/admin/store'

export function NotFoundPage() {
  const { config } = useConfig()
  return (
    <div class="max-w-3xl">
      <div class="mb-8">
          <p class="text-xs font-mono uppercase tracking-wider text-accent mb-2">notFound</p>
          <h1 class="font-display text-3xl font-bold text-ink">404 Page</h1>
          <p class="text-base text-muted mt-2">{config?.notFound?.page_description}</p>
      </div>
      <div class="space-y-6">
        <Section title="Open Graph">
          <TextField path="notFound.og_title" label="Title" />
          <TextField path="notFound.og_description" label="Description" />
        </Section>
        <ObjectField path="notFound" />
      </div>
    </div>
  )
}
