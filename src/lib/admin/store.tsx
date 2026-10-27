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
  exiting?: boolean
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
  flushSave: () => Promise<boolean>
  pluginConfigs: PluginManifest[] | null
  setPluginValue: (name: string, path: string, value: unknown) => void
  getPluginValue: (name: string, path: string) => unknown
  flushPluginSaves: () => Promise<void>
  toasts: Toast[]
  pushToast: (kind: ToastKind, message: string) => void
  dismissToast: (id: number) => void
  republish: () => Promise<void>
  regenerate: () => Promise<void>
  buildStatus: 'idle' | 'running' | 'done' | 'error'
  buildLog: string[]
  clearBuildStatus: () => void
  errors: Record<string, boolean>
  setError: (id: string, hasError: boolean) => void
  hasErrors: boolean
}

const Ctx = createContext<ConfigCtx | null>(null)

export function getPath(obj: unknown, path: string): unknown {
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
  const [buildStatus, setBuildStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [buildLog, setBuildLog] = useState<string[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const hasErrors = useMemo(() => Object.values(errors).some(Boolean), [errors])

  const setError = (id: string, hasError: boolean) => {
    setErrors((prev) => {
      if (prev[id] === hasError) return prev
      return { ...prev, [id]: hasError }
    })
  }
  const toastIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pluginDebouncesRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pluginDirtyRef = useRef<Set<string>>(new Set())
  // Refs to avoid stale-closure bugs in flushSave / scheduleSave
  const configRef = useRef<SiteConfig | null>(config)
  const dirtyRef = useRef(false)
  const editVersionRef = useRef(0)
  const pluginConfigsRef = useRef<PluginManifest[] | null>(pluginConfigs)
  const pluginEditVersionsRef = useRef<Map<string, number>>(new Map())

  const hasUnsavedChanges = dirtyRef.current || pluginDirtyRef.current.size > 0
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Read refs so a completed save stops prompting before the next effect.
      if (!dirtyRef.current && pluginDirtyRef.current.size === 0) return
      event.preventDefault()
      // returnValue is deprecated, but older WebKit still needs it to show the prompt.
      ;(event as { returnValue: string }).returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  const queryClient = useQueryClient()

  const setToken = (t: string | null) => {
    persistToken(t)
    setTokenState(t)
    if (!t) {
      // Drop cached owner data with the session; a re-login then refetches and the config
      // effect sees a new reference (structural sharing would otherwise leave config null).
      queryClient.removeQueries()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      for (const timer of pluginDebouncesRef.current.values()) clearTimeout(timer)
      pluginDebouncesRef.current.clear()
      configRef.current = null
      dirtyRef.current = false
      editVersionRef.current++
      pluginConfigsRef.current = null
      pluginDirtyRef.current.clear()
      setConfig(null)
      setCategories(null)
      setPluginConfigs(null)
      setSaveStatusState('idle')
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
    if (configQuery.data && !dirtyRef.current) {
      setConfig(configQuery.data)
      configRef.current = configQuery.data
      dirtyRef.current = false
    }
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
    if (pluginsQuery.data && pluginDirtyRef.current.size === 0) {
      pluginConfigsRef.current = pluginsQuery.data.plugins
      setPluginConfigs(pluginsQuery.data.plugins)
    }
  }, [pluginsQuery.data])

  const putConfigMutation = useMutation({
    // Serialize snapshots so a slower, older request cannot replace a newer save.
    scope: { id: 'config-save' },
    mutationFn: ({ config: next }: { config: SiteConfig; version: number }) => api.putConfig(next),
    onMutate: () => setSaveStatusState('saving'),
    onSuccess: (_, { version }) => {
      if (!configRef.current) return
      if (editVersionRef.current === version) dirtyRef.current = false
      setSaveStatusState(dirtyRef.current || pluginDirtyRef.current.size > 0 ? 'dirty' : 'saved')
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (err: unknown) => {
      if (!configRef.current) return
      setSaveStatusState('error')
      dirtyRef.current = true
      if (err instanceof ApiError && err.status === 401) {
        // A rotated password or expired token: every save would fail, so end the session.
        pushToast('error', 'Session expired. Please sign in again.')
        setToken(null)
        return
      }
      const msg = err instanceof ApiError ? err.message : 'Save failed'
      pushToast('error', msg)
    },
  })

  const putPluginMutation = useMutation({
    scope: { id: 'plugin-save' },
    mutationFn: ({ name, config: cfg }: { name: string; config: Record<string, unknown>; version: number }) =>
      api.putPlugin(name, cfg),
    onMutate: () => setSaveStatusState('saving'),
    onSuccess: (_, { name, version }) => {
      if (!pluginConfigsRef.current) return
      if (pluginEditVersionsRef.current.get(name) === version) pluginDirtyRef.current.delete(name)
      setSaveStatusState(dirtyRef.current || pluginDirtyRef.current.size > 0 ? 'dirty' : 'saved')
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
    onError: (err: unknown, { name }) => {
      if (!pluginConfigsRef.current) return
      setSaveStatusState('error')
      pluginDirtyRef.current.add(name)
      if (err instanceof ApiError && err.status === 401) {
        pushToast('error', 'Session expired. Please sign in again.')
        setToken(null)
        return
      }
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
  const dismissToast = (id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }

  const scheduleSave = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (hasErrors) {
      setSaveStatusState('error')
      return
    }
    debounceRef.current = setTimeout(() => {
      if (dirtyRef.current && configRef.current) {
        putConfigMutation.mutate({ config: configRef.current, version: editVersionRef.current })
      }
    }, 1500)
  }

  const setValue = (path: string, value: unknown) => {
    if (!configRef.current) return
    const next = setPath(configRef.current, path, value) as SiteConfig
    configRef.current = next
    editVersionRef.current++
    dirtyRef.current = true
    setConfig(next)
    setSaveStatusState('dirty')
    scheduleSave()
  }

  const getValue = (path: string) => getPath(config, path)

  const flushSave = async (): Promise<boolean> => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (hasErrors) {
      pushToast('error', 'Cannot save: Please fix validation errors first.')
      setSaveStatusState('error')
      return false
    }
    try {
      if (dirtyRef.current && configRef.current) {
        await putConfigMutation.mutateAsync({ config: configRef.current, version: editVersionRef.current })
      }
      // Navigation/publishing must wait if the user edited again during this save.
      if (dirtyRef.current) return false
      return true
    } catch {
      // onError restores dirty state and reports the failure to the user.
      return false
    }
  }

  const setPluginValue = (name: string, path: string, value: unknown) => {
    const cur = pluginConfigsRef.current
    if (!cur?.some(p => p.name === name)) return
    const next = cur.map((p) => {
      if (p.name !== name) return p
      const newConfig = setPath(p.config, path, value) as Record<string, unknown>
      return { ...p, config: newConfig }
    })
    pluginConfigsRef.current = next
    setPluginConfigs(next)
    pluginEditVersionsRef.current.set(name, (pluginEditVersionsRef.current.get(name) ?? 0) + 1)
    pluginDirtyRef.current.add(name)
    setSaveStatusState('dirty')
    const existing = pluginDebouncesRef.current.get(name)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      pluginDebouncesRef.current.delete(name)
      if (!pluginDirtyRef.current.has(name)) return
      const plugin = pluginConfigsRef.current?.find(p => p.name === name)
      if (!plugin) return
      putPluginMutation.mutate({
        name,
        config: plugin.config,
        version: pluginEditVersionsRef.current.get(name) ?? 0,
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
    if (names.length === 0) return
    const snapshots = (pluginConfigsRef.current ?? []).filter(p => names.includes(p.name))
      .map(p => ({ name: p.name, config: p.config, version: pluginEditVersionsRef.current.get(p.name) ?? 0 }))
    for (const p of snapshots) {
      await putPluginMutation.mutateAsync(p)
    }
  }

  const pollTask = async (taskId: string) => {
    let attempts = 0
    const maxAttempts = 600 // 5 minutes at 500ms intervals
    while (attempts < maxAttempts) {
      attempts++
      await new Promise((r) => setTimeout(r, 500))
      try {
        const { status, lines, error } = await api.getTaskStatus(taskId)
        setBuildLog(lines)
        if (status === 'done') {
          setBuildStatus('done')
          return
        }
        if (status === 'error') {
          setBuildStatus('error')
          throw new Error(error || 'Task failed')
        }
      } catch (e) {
        setBuildStatus('error')
        throw e
      }
    }
    // Timeout reached
    setBuildStatus('error')
    setBuildLog((prev) => [...prev, 'Build timed out after 5 minutes'])
    throw new Error('Build timed out — please try again')
  }

  const republish = async () => {
    if (!await flushSave()) return
    await flushPluginSaves()
    setBuildStatus('running')
    setBuildLog(['Starting republish...'])
    try {
      const { taskId } = await api.startRepublish()
      await pollTask(taskId)
      pushToast('success', 'Site republished')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Republish failed')
    }
  }

  const regenerate = async () => {
    setBuildStatus('running')
    setBuildLog(['Regenerating photos...'])
    try {
      const { taskId } = await api.startRegenerate()
      await pollTask(taskId)
      pushToast('success', 'Photos regenerated')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Regenerate failed')
    }
  }

  const clearBuildStatus = () => setBuildStatus('idle')

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
      buildStatus,
      buildLog,
      clearBuildStatus,
      errors,
      setError,
      hasErrors,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, config, categories, pluginConfigs, selectedCategory, currentPage, saveStatus, toasts, buildStatus, buildLog, errors, hasErrors],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConfig(): ConfigCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConfig must be used inside ConfigProvider')
  return v
}
