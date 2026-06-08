import type { CategoriesResponse, PluginManifest, PluginsResponse, SiteConfig } from './types'

const TOKEN_KEY = 'phos-admin-token'

export function getToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (typeof localStorage === 'undefined') return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(data?.error || res.statusText || 'Request failed', res.status)
  }
  return data as T
}

export const api = {
  login: (password: string) =>
    request<{ token: string }>('POST', '/api/login', { password }),
  getConfig: () => request<SiteConfig>('GET', '/api/config'),
  putConfig: (config: SiteConfig) =>
    request<{ ok: true }>('PUT', '/api/config', config),
  getCategories: () => request<CategoriesResponse>('GET', '/api/categories'),
  putCategory: (slug: string, meta: unknown) =>
    request<{ ok: true }>('PUT', `/api/categories/${slug}`, meta),
  getPlugins: () => request<PluginsResponse>('GET', '/api/plugins'),
  getPlugin: (name: string) =>
    request<PluginManifest>('GET', `/api/plugins/${name}`),
  putPlugin: (name: string, config: Record<string, unknown>) =>
    request<{ ok: true }>('PUT', `/api/plugins/${name}`, { config }),
  startRegenerate: () => request<{ taskId: string }>('POST', '/api/regenerate'),
  startRepublish: () => request<{ taskId: string }>('POST', '/api/republish'),
  getTaskStatus: (taskId: string) =>
    request<{ status: 'running' | 'done' | 'error'; lines: string[]; error?: string }>(
      'GET', `/api/tasks/${taskId}`,
    ),
}
