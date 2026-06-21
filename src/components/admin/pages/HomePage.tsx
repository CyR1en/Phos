import { ObjectField } from '../fields/ObjectField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'
import { useConfig } from '../../../lib/admin/store'
import { ShowcaseSection } from './ShowcaseSection'

export function HomePage() {
  const { config } = useConfig()
  return (
    <div class="max-w-3xl">
      <div class="mb-8">
          <p class="text-xs font-mono uppercase tracking-wider text-accent mb-2">home</p>
          <h1 class="font-display text-3xl font-bold text-ink">Home Page</h1>
          <p class="text-base text-muted mt-2">{config?.home?.page_description}</p>
      </div>
      <div class="space-y-8">
        <Section title="Open Graph">
          <TextField path="home.og_title" label="Title" />
          <TextField path="home.og_description" label="Description" />
        </Section>
        <ShowcaseSection />
        <ObjectField path="home" />
      </div>
    </div>
  )
}
