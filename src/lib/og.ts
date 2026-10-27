interface OpenGraphConfig {
  image?: string
  imageAlt?: string
  imageWidth?: number
  imageHeight?: number
}

interface OpenGraphHero {
  ogImage?: string
  full?: string
  title?: string
  titleIsAuto?: boolean
}

interface OpenGraphOptions {
  image?: string
  configOg?: OpenGraphConfig
  hero?: OpenGraphHero
  siteUrl?: string
}

/** Preserve image metadata by URL identity, including images passed through by the home page. */
export function resolveOpenGraph({ image, configOg, hero, siteUrl }: OpenGraphOptions) {
  const origin = siteUrl?.replace(/\/+$/, '')
  const absolute = (path: string | undefined) => path
    ? path.startsWith('http') ? path : origin ? `${origin}${path}` : undefined
    : undefined
  const configuredUrl = absolute(configOg?.image)
  const url = image ? absolute(image) : configuredUrl ?? absolute(hero?.ogImage)
  const usesConfigured = !!url && url === configuredUrl
  const usesHero = !!url && [hero?.ogImage, hero?.full].some(path => absolute(path) === url)
  const pathname = url ? new URL(url).pathname : ''
  const isPhotoOg = pathname.startsWith('/photos/og/')
  const usesConfiguredDimensions = usesConfigured && !pathname.startsWith('/photos/full/')
  const extension = pathname.split('.').pop()?.toLowerCase()
  const mimeTypes: Partial<Record<string, string>> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
  }

  return {
    url,
    alt: usesConfigured ? configOg?.imageAlt : usesHero && hero?.titleIsAuto === false ? hero.title : undefined,
    width: isPhotoOg ? 1200 : usesConfiguredDimensions ? configOg?.imageWidth : undefined,
    height: isPhotoOg ? 630 : usesConfiguredDimensions ? configOg?.imageHeight : undefined,
    type: mimeTypes[extension || ''],
  }
}
