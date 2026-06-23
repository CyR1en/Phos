import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import preact from '@astrojs/preact'
import tailwindcss from '@tailwindcss/postcss'

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  site: import.meta.env.PUBLIC_SITE_URL || 'https://yourdomain.com',
  redirects: {
    '/portfolio/':             '/galleries/',
    '/portfolio/[gallery]':    '/galleries/[gallery]',
    '/photo/all/':             '/photos/all/',
  },
  integrations: [sitemap(), preact({ compat: true })],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
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
        '@content': path.resolve(__dirname, 'src/content'),
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
