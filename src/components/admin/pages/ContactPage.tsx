import { useConfig } from '../../../lib/admin/store'
import { ObjectField } from '../fields/ObjectField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'

export function ContactPage() {
  const { config } = useConfig()
  return (
    <div class="max-w-3xl">
      <div class="admin-page-heading">
        <h1 class="font-display text-3xl font-bold text-ink">Contact Page</h1>
        <p class="text-base text-muted mt-2">
          {config?.contact?.page_description}
        </p>
      </div>
      <div class="space-y-8">
        <Section title="Open Graph">
          <TextField path="contact.og_title" label="Title" />
          <TextField path="contact.og_description" label="Description" />
        </Section>
        <Section title="Form">
          <ObjectField path="contact.format" />
        </Section>
        <Section title="SMTP" description="Email delivery settings. The contact form will fail silently if any of these are blank.">
          <ObjectField path="contact.smtp" />
        </Section>
      </div>
    </div>
  )
}
