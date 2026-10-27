import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'

export function PortfolioPage() {
  return (
    <div class="max-w-3xl">
      <div class="admin-page-heading">
        <h1 class="font-display text-3xl font-bold text-ink">Portfolio</h1>
        <p class="text-base text-muted mt-2">Open Graph title and description for the /galleries/ index.</p>
      </div>
      <div class="space-y-6">
        <Section title="Open Graph">
          <TextField path="portfolio.og_title" label="Title" />
          <TextField path="portfolio.og_description" label="Description" />
        </Section>
      </div>
    </div>
  )
}
