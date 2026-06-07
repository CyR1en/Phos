import {
  createContext,
  type ComponentChildren,
} from 'preact'
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  api,
  getToken,
  setToken as persistToken,
} from './api'
import type { CategoryData, PluginManifest, SiteConfig } from './types'

export type ToastKind = 'success' | 'error' | 'info'
export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ConfigCtx {
  token: string | null
  setToken: (t: string | null) => void
  config: SiteConfig | null
  categories: CategoryData[] | null
  selectedCategory: string | null
  setSelectedCategory: (slug: string) => void
  currentPage: string
  setCurrentPage: (p: string) => void
  saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  setSaveStatus: (s: 'idle' | 'dirty' | 'saving' | 'saved' | 'error') => void
  setValue: (path: string, value: unknown) => void
  getValue: (path: string) => unknown
  flushSave: () => Promise<void>
  pluginConfigs: PluginManifest[] | null
  setPluginValue: (name: string, path: string, value: unknown) => void
  getPluginValue: (name: string, path: string) => unknown
  flushPluginSaves: () => Promise<void>
  toasts: Toast[]
  pushToast: (kind: ToastKind, message: string) => void
  dismissToast: (id: number) => void
  republish: () => Promise<void>
  regenerate: () => Promise<void>
}

const Ctx = createContext<ConfigCtx | null>(null)

function getPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function setPath(obj: unknown, path: string, value: unknown): unknown {
  if (obj == null || typeof obj !== 'object') return obj
  const parts = path.split('.')
  const root = Array.isArray(obj) ? [...obj] : { ...(obj as object) }
  let cur: Record<string, unknown> = root as Record<string, unknown>
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const next = cur[key]
    if (next == null || typeof next !== 'object') {
      cur[key] = {}
    } else {
      cur[key] = Array.isArray(next) ? [...next] : { ...next }
    }
    cur = cur[key] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
  return root
}

export function ConfigProvider({ children }: { children: ComponentChildren }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [currentPage, setCurrentPage] = useState<string>('site')
  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [categories, setCategories] = useState<CategoryData[] | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [saveStatus, setSaveStatusState] = useState<ConfigCtx['saveStatus']>('idle')
  const [pluginConfigs, setPluginConfigs] = useState<PluginManifest[] | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pluginDebouncesRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pluginDirtyRef = useRef<Set<string>>(new Set())

  const queryClient = useQueryClient()

  const setToken = (t: string | null) => {
    persistToken(t)
    setTokenState(t)
    if (!t) {
      setConfig(null)
      setCategories(null)
      setPluginConfigs(null)
    }
  }

  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: api.getConfig,
    enabled: !!token,
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
    enabled: !!token,
  })

  const pluginsQuery = useQuery({
    queryKey: ['plugins'],
    queryFn: api.getPlugins,
    enabled: !!token,
  })

  useEffect(() => {
    if (configQuery.data) setConfig(configQuery.data)
  }, [configQuery.data])

  useEffect(() => {
    if (categoriesQuery.data) {
      setCategories(categoriesQuery.data.categories)
      setSelectedCategory((cur) =>
        cur && categoriesQuery.data!.categories.some((c) => c.slug === cur)
          ? cur
          : categoriesQuery.data!.categories[0]?.slug ?? null,
      )
    }
  }, [categoriesQuery.data])

  useEffect(() => {
    if (pluginsQuery.data) setPluginConfigs(pluginsQuery.data.plugins)
  }, [pluginsQuery.data])

  const putConfigMutation = useMutation({
    mutationFn: (next: SiteConfig) => api.putConfig(next),
    onMutate: () => setSaveStatusState('saving'),
    onSuccess: () => {
      setSaveStatusState('saved')
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (err: unknown) => {
      setSaveStatusState('error')
      const msg = err instanceof ApiError ? err.message : 'Save failed'
      pushToast('error', msg)
    },
  })

  const putPluginMutation = useMutation({
    mutationFn: ({ name, config: cfg }: { name: string; config: Record<string, unknown> }) =>
      api.putPlugin(name, cfg),
    onMutate: () => setSaveStatusState('saving'),
    onSuccess: () => {
      setSaveStatusState('saved')
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
    onError: (err: unknown) => {
      setSaveStatusState('error')
      const msg = err instanceof ApiError ? err.message : 'Plugin save failed'
      pushToast('error', msg)
    },
  })

  const setSaveStatus = (s: ConfigCtx['saveStatus']) => setSaveStatusState(s)

  const pushToast = (kind: ToastKind, message: string) => {
    const id = ++toastIdRef.current
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => dismissToast(id), 4000)
  }
  const dismissToast = (id: number) =>
    setToasts((t) => t.filter((x) => x.id !== id))

  const scheduleSave = (next: SiteConfig) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      putConfigMutation.mutate(next)
    }, 1500)
  }

  const setValue = (path: string, value: unknown) => {
    setConfig((cur) => {
      if (!cur) return cur
      const next = setPath(cur, path, value) as SiteConfig
      setSaveStatusState('dirty')
      scheduleSave(next)
      return next
    })
  }

  const getValue = (path: string) => getPath(config, path)

  const flushSave = async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (config && (saveStatus === 'dirty' || saveStatus === 'saving')) {
      await putConfigMutation.mutateAsync(config)
    }
  }

  const setPluginValue = (name: string, path: string, value: unknown) => {
    setPluginConfigs((cur) => {
      if (!cur) return cur
      const next = cur.map((p) => {
        if (p.name !== name) return p
        const newConfig = setPath(p.config, path, value) as Record<string, unknown>
        return { ...p, config: newConfig }
      })
      return next
    })
    pluginDirtyRef.current.add(name)
    setSaveStatusState('dirty')
    const existing = pluginDebouncesRef.current.get(name)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      pluginDebouncesRef.current.delete(name)
      const dirty = pluginDirtyRef.current
      const target = dirty.has(name) ? name : null
      dirty.delete(name)
      if (!target) return
      setPluginConfigs((cur) => {
        if (!cur) return cur
        const plugin = cur.find((p) => p.name === target)
        if (!plugin) return cur
        putPluginMutation.mutate({ name: target, config: plugin.config })
        return cur
      })
    }, 1500)
    pluginDebouncesRef.current.set(name, t)
  }

  const getPluginValue = (name: string, path: string) => {
    const plugin = pluginConfigs?.find((p) => p.name === name)
    if (!plugin) return undefined
    return getPath(plugin.config, path)
  }

  const flushPluginSaves = async () => {
    const dirty = pluginDirtyRef.current
    for (const name of dirty) {
      const t = pluginDebouncesRef.current.get(name)
      if (t) clearTimeout(t)
      pluginDebouncesRef.current.delete(name)
    }
    const names = Array.from(dirty)
    dirty.clear()
    if (names.length === 0) return
    const snapshots = pluginConfigs?.filter((p) => names.includes(p.name)) ?? []
    for (const p of snapshots) {
      await putPluginMutation.mutateAsync({ name: p.name, config: p.config })
    }
  }

  const republish = async () => {
    await flushSave()
    await flushPluginSaves()
    try {
      await api.republish()
      pushToast('success', 'Site republished')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Republish failed')
    }
  }

  const regenerate = async () => {
    try {
      await api.regenerate()
      pushToast('success', 'Photos regenerated')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Regenerate failed')
    }
  }

  const value = useMemo<ConfigCtx>(
    () => ({
      token,
      setToken,
      config,
      categories,
      selectedCategory,
      setSelectedCategory,
      currentPage,
      setCurrentPage,
      saveStatus,
      setSaveStatus,
      setValue,
      getValue,
      flushSave,
      pluginConfigs,
      setPluginValue,
      getPluginValue,
      flushPluginSaves,
      toasts,
      pushToast,
      dismissToast,
      republish,
      regenerate,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, config, categories, pluginConfigs, selectedCategory, currentPage, saveStatus, toasts],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConfig(): ConfigCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConfig must be used inside ConfigProvider')
  return v
}
