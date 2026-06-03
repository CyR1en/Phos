import type { APIRoute } from 'astro'

export const GET: APIRoute = () => {
  const siteUrl = import.meta.env.PUBLIC_SITE_URL || 'https://yourdomain.com'
  const body = `User-agent: *
Allow: /
Sitemap: ${siteUrl}/sitemap-index.xml
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain' },
  })
}
