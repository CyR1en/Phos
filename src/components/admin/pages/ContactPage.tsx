import { useConfig } from '../../../lib/admin/store'
import { ObjectField } from '../fields/ObjectField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'

export function ContactPage() {
  const { config } = useConfig()
  return (
    <div class="max-w-3xl">
      <div class="mb-8">
        <h2 class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-2">
          contact
        </h2>
        <p class="text-phos-body text-phos-muted mt-2">
          {config?.contact?.page_description}
        </p>
      </div>
      <div class="space-y-6">
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
