export interface CurrencyOption {
  code: string
  symbol: string
  name: string
  decimals: 0 | 2
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', decimals: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', decimals: 0 },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', decimals: 0 },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', decimals: 2 },
  { code: 'CHF', symbol: 'CHF ', name: 'Swiss Franc', decimals: 2 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', decimals: 2 },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2 },
]

export const DEFAULT_CURRENCY = 'USD'

export function normalizeCurrencyCode(code?: string): string {
  const upper = (code ?? '').trim().toUpperCase()
  if (CURRENCY_OPTIONS.some((c) => c.code === upper)) {
    return upper
  }
  return DEFAULT_CURRENCY
}

export function getCurrencyInfo(code?: string): CurrencyOption {
  const normalized = normalizeCurrencyCode(code)
  return (
    CURRENCY_OPTIONS.find((c) => c.code === normalized) ?? CURRENCY_OPTIONS[0]
  )
}

export function getCurrencyUnitStep(code?: string): number {
  return getCurrencyInfo(code).decimals === 0 ? 100 : 1
}

export const PERSON_COLORS = [
  '#0f766e', // pine emerald
  '#c2410c', // warm terracotta
  '#1d4ed8', // cobalt ink
  '#9333ea', // plum
  '#b45309', // amber ochre
  '#be123c', // crimson rose
  '#0369a1', // ocean slate
  '#4d7c0f', // moss olive
]

export function pickPersonColor(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length]
}

export function formatCents(cents: number, currencyCode?: string): string {
  const info = getCurrencyInfo(currencyCode)
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const value = abs / 100

  const formatted =
    info.decimals === 0
      ? Math.round(value).toLocaleString('en-US')
      : value.toFixed(2)

  return `${negative ? '-' : ''}${info.symbol}${formatted}`
}

export function centsToPlainAmount(cents: number, currencyCode?: string): string {
  const info = getCurrencyInfo(currencyCode)
  const abs = Math.max(0, Math.round(cents))
  const value = abs / 100
  return info.decimals === 0 ? String(Math.round(value)) : value.toFixed(2)
}

export function dollarsToCents(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0
    return Math.round(value * 100)
  }
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const parsed = Number.parseFloat(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 100)
}

export function todayIsoDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateLabel(dateStr: string): string {
  if (!dateStr) return ''
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (isoMatch) {
    const dt = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    )
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
  }
  return dateStr
}

export function generateId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatWeightFraction(weight: number, totalWeight: number): string {
  if (totalWeight <= 0 || weight >= totalWeight) return ''
  const clean = (n: number) =>
    Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString()
  return `${clean(weight)}/${clean(totalWeight)}`
}
