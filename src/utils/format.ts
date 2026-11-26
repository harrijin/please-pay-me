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

export function formatCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const dollars = (abs / 100).toFixed(2)
  return `${negative ? '-' : ''}$${dollars}`
}

export function centsToPlainAmount(cents: number): string {
  const abs = Math.max(0, Math.round(cents))
  return (abs / 100).toFixed(2)
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
  // Format cleanly for integers or half-steps
  const clean = (n: number) =>
    Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString()
  return `${clean(weight)}/${clean(totalWeight)}`
}
