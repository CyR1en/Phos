/// <reference types="astro/client" />
/// <reference types="lenis" />

declare module '@content/site-config.json' {
  import type { SiteConfig } from './lib/admin/types'
  const config: SiteConfig
  export default config
}
