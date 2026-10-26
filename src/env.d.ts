/// <reference types="astro/client" />
/// <reference path="./types/preact-compat.d.ts" />

declare module '@content/site-config.json' {
  import type { SiteConfig } from './lib/admin/types'
  const config: SiteConfig
  export default config
}
