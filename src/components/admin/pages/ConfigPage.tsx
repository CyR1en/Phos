import { useConfig } from '../../../lib/admin/store'
import { ObjectField } from '../fields/ObjectField'
import { Section } from '../ui/Section'

interface Props {
  path: string
  pageTitle: string
  pageDescription?: string
}

export function ConfigPage({ path, pageTitle, pageDescription }: Props) {
  const { getValue } = useConfig()
  const data = getValue(path) as Record<string, unknown> | undefined
  const desc =
    pageDescription ?? (data?.page_description as string | undefined) ?? ''

  return (
    <div class="max-w-3xl">
      <div class="mb-8">
        <h2 class="text-xs font-mono uppercase tracking-wider text-accent mb-2">
          {path}
        </h2>
        {desc && (
          <p class="text-base text-muted mt-2">{desc}</p>
        )}
      </div>
      <Section bare>
        <ObjectField path={path} />
      </Section>
    </div>
  )
}
