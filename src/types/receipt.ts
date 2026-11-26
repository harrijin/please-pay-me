export type TaxTipMode = 'proportional' | 'even'

export type QRDestination = 'breakdown' | 'venmo' | 'cashapp' | 'paypal'

export type GeminiModelOption =
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.6-flash'
  | 'gemini-2.5-flash-lite'
  | 'custom'

export interface PaymentHandles {
  venmo: string
  cashApp: string
  paypal: string
  zelle: string
}

export interface SavedFriend {
  id: string
  name: string
  venmo?: string
  cashApp?: string
  paypal?: string
  zelle?: string
}

export interface AppSettings {
  userName: string
  geminiApiKey: string
  geminiModel: GeminiModelOption
  customGeminiModel: string
  handles: PaymentHandles
  savedFriends: SavedFriend[]
}

export interface Person {
  id: string
  name: string
  color: string
  venmo?: string
  cashApp?: string
  paypal?: string
  zelle?: string
  paid?: boolean
  /** True when this person entry represents the current user ("Me") */
  isSelf?: boolean
}

export interface ReceiptItem {
  id: string
  name: string
  quantity: number
  /** Total line price in integer cents */
  priceCents: number
  /** Map of personId -> positive share weight (default 1) */
  shares: Record<string, number>
}

export interface ReceiptSplit {
  id: string
  merchant: string
  date: string
  items: ReceiptItem[]
  taxCents: number
  tipCents: number
  extraFeeCents: number
  discountCents: number
  taxTipMode: TaxTipMode
  people: Person[]
  payerId: string
  createdAt: number
  updatedAt: number
}

export interface PersonItemLine {
  itemId: string
  name: string
  itemTotalCents: number
  shareCents: number
  /** e.g., "1/2", "2/3", or "" when sole owner */
  splitLabel: string
}

export interface PersonBreakdown {
  person: Person
  isPayer: boolean
  items: PersonItemLine[]
  subtotalCents: number
  taxCents: number
  tipCents: number
  extraFeeCents: number
  discountCents: number
  totalCents: number
}

export interface SplitSummary {
  itemsSubtotalCents: number
  assignedSubtotalCents: number
  unassignedSubtotalCents: number
  unassignedItemIds: string[]
  taxCents: number
  tipCents: number
  extraFeeCents: number
  discountCents: number
  grandTotalCents: number
  allocatedGrandTotalCents: number
  breakdowns: PersonBreakdown[]
}

/**
 * Compact zero-DB payload serialized into URL hash #s=<lz-string>.
 * IMPORTANT: Never includes Gemini API key or other friends' data.
 */
export interface SharePayload {
  v: 1
  m: string // merchant
  d: string // date
  p: string // payer name
  f: string // friend name
  /** [itemName, itemTotalCents, friendShareCents, splitLabel] */
  i: Array<[string, number, number, string]>
  s: number // subtotalCents
  x: number // taxCents
  t: number // tipCents
  e?: number // extraFeeCents
  k?: number // discountCents
  g: number // grand totalCents
  h: {
    v?: string // venmo
    c?: string // cashApp
    p?: string // paypal
    z?: string // zelle
  }
}

export interface ScannedReceiptRaw {
  merchant: string
  date: string
  items: Array<{
    name: string
    quantity: number
    totalPrice: number
  }>
  tax: number
  tip: number
  extraFee: number
  discount: number
}
