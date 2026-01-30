const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const resolveDevFsBase = () => {
  if (!import.meta.env.DEV) {
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
  const envBase = import.meta.env.VITE_DATA_BASE_URL
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
