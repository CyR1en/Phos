import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import preact from '@astrojs/preact'
import tailwindcss from '@tailwindcss/postcss'

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Read at config-load time, where import.meta.env does not yet carry PUBLIC_* values.
  site: process.env.PUBLIC_SITE_URL || import.meta.env.PUBLIC_SITE_URL || 'https://yourdomain.com',
  redirects: {
    '/portfolio/':             '/galleries/',
    '/portfolio/[gallery]':    '/galleries/[gallery]',
    '/photo/all/':             '/photos/all/',
  },
  integrations: [sitemap({
    filter: page => !/\/admin(?:\/|$)/.test(new URL(page).pathname)
      && !/^\/404(?:\.html)?\/?$/.test(new URL(page).pathname),
  }), preact({ compat: true })],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  build: {
    assets: '_assets',
  },
  image: {
    service: {
      entrypoint: 'astro/assets/services/noop',
    },
  },
  vite: {
    cacheDir: './node_modules/.vite-cache',
    css: {
      postcss: {
        plugins: [tailwindcss()],
      },
    },
    resolve: {
      alias: {
        '@components': path.resolve(__dirname, 'src/components'),
        '@layouts': path.resolve(__dirname, 'src/layouts'),
        'react': 'preact/compat',
        'react-dom': 'preact/compat',
      },
    },
    server: {
      proxy: {
        '/api': 'http://localhost:3001',
        '/site-config.json': 'http://localhost:3001',
      },
    },
  },
})
