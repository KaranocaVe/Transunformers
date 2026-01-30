const UNITS = ['', 'K', 'M', 'B', 'T']

export const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }
  const abs = Math.abs(value)
  if (abs < 1000) {
    return value.toLocaleString()
  }
  let unitIndex = 0
  let scaled = abs
  while (scaled >= 1000 && unitIndex < UNITS.length - 1) {
    scaled /= 1000
    unitIndex += 1
  }
  const sign = value < 0 ? '-' : ''
  return `${sign}${scaled.toFixed(scaled >= 10 ? 1 : 2)}${UNITS[unitIndex]}`
}

export const formatBytes = (bytes?: number | null) => {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) {
    return '-'
  }
  if (bytes === 0) {
    return '0 B'
  }
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${sizes[i]}`
}
