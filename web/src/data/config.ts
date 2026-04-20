const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env

const resolveDevFsBase = () => {
  if (!viteEnv?.DEV) {
    return null
  }
  if (viteEnv.VITE_DATA_USE_FS !== 'true') {
    return null
  }
  if (typeof __DATA_FS_ROOT__ !== 'string' || __DATA_FS_ROOT__.length === 0) {
    return null
  }
  const normalizedRoot = __DATA_FS_ROOT__.replace(/^\/+/, '')
  return `/@fs/${normalizedRoot}`
}

export const resolveDataBaseUrl = () => {
  const runtimeOverride =
    typeof window !== 'undefined' ? window.__TRANSUNFORMERS_DATA_BASE__ : undefined
  const envBase = typeof viteEnv?.VITE_DATA_BASE_URL === 'string' ? viteEnv.VITE_DATA_BASE_URL : undefined
  const devBase = resolveDevFsBase()
  const baseUrl = runtimeOverride ?? envBase ?? devBase ?? '/data/models'

  return trimTrailingSlash(baseUrl)
}

export const joinUrl = (base: string, path: string) => {
  const normalizedBase = trimTrailingSlash(base)
  const normalizedPath = path.replace(/^\/+/, '')
  if (!normalizedBase.length) {
    return `/${normalizedPath}`
  }
  return `${normalizedBase}/${normalizedPath}`
}
