import type { AppSettings, ReceiptSplit } from '../types/receipt'
import { DEFAULT_CURRENCY, normalizeCurrencyCode } from './format'

const SETTINGS_KEY = 'pleasepayme_settings_v1'
const SPLITS_KEY = 'pleasepayme_recent_splits_v1'
const MAX_SAVED_SPLITS = 25

export const DEFAULT_SETTINGS: AppSettings = {
  userName: 'Me',
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash-lite',
  customGeminiModel: '',
  defaultCurrency: DEFAULT_CURRENCY,
  handles: {
    venmo: '',
    cashApp: '',
    paypal: '',
    zelle: '',
  },
  savedFriends: [],
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, handles: { ...DEFAULT_SETTINGS.handles }, savedFriends: [] }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      userName: typeof parsed.userName === 'string' && parsed.userName.trim() ? parsed.userName : 'Me',
      geminiApiKey: typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey : '',
      geminiModel:
        parsed.geminiModel === 'gemini-3.5-flash-lite' ||
        parsed.geminiModel === 'gemini-3.6-flash' ||
        parsed.geminiModel === 'gemini-2.5-flash-lite' ||
        parsed.geminiModel === 'custom'
          ? parsed.geminiModel
          : 'gemini-3.5-flash-lite',
      customGeminiModel:
        typeof parsed.customGeminiModel === 'string' ? parsed.customGeminiModel : '',
      defaultCurrency: normalizeCurrencyCode(parsed.defaultCurrency),
      handles: {
        venmo: typeof parsed.handles?.venmo === 'string' ? parsed.handles.venmo : '',
        cashApp: typeof parsed.handles?.cashApp === 'string' ? parsed.handles.cashApp : '',
        paypal: typeof parsed.handles?.paypal === 'string' ? parsed.handles.paypal : '',
        zelle: typeof parsed.handles?.zelle === 'string' ? parsed.handles.zelle : '',
      },
      savedFriends: Array.isArray(parsed.savedFriends) ? parsed.savedFriends : [],
    }
  } catch {
    return { ...DEFAULT_SETTINGS, handles: { ...DEFAULT_SETTINGS.handles }, savedFriends: [] }
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Ignore quota errors
  }
}

export function loadRecentSplits(): ReceiptSplit[] {
  try {
    const raw = localStorage.getItem(SPLITS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as ReceiptSplit[]
  } catch {
    return []
  }
}

export function upsertRecentSplit(split: ReceiptSplit): ReceiptSplit[] {
  const existing = loadRecentSplits()
  const updatedSplit: ReceiptSplit = {
    ...split,
    updatedAt: Date.now(),
  }
  const filtered = existing.filter((s) => s.id !== split.id)
  const next = [updatedSplit, ...filtered].slice(0, MAX_SAVED_SPLITS)
  try {
    localStorage.setItem(SPLITS_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota errors
  }
  return next
}

export function deleteRecentSplit(id: string): ReceiptSplit[] {
  const next = loadRecentSplits().filter((s) => s.id !== id)
  try {
    localStorage.setItem(SPLITS_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota errors
  }
  return next
}
