import type { AppSettings, Person, ReceiptSplit, ScannedReceiptRaw } from '../types/receipt'
import {
  CURRENCY_OPTIONS,
  dollarsToCents,
  generateId,
  normalizeCurrencyCode,
  pickPersonColor,
  todayIsoDate,
} from './format'

export function createSampleReceipt(settings: AppSettings): ReceiptSplit {
  const now = Date.now()
  const meId = generateId('p')
  const mayaId = generateId('p')
  const devonId = generateId('p')
  const priyaId = generateId('p')

  return {
    id: generateId('split'),
    merchant: 'Marigold Woodfire Bistro',
    date: todayIsoDate(),
    people: [
      { id: meId, name: settings.userName.trim() || 'Me', color: pickPersonColor(0), isSelf: true },
      { id: mayaId, name: 'Maya', color: pickPersonColor(1), venmo: 'maya-chen' },
      { id: devonId, name: 'Devon', color: pickPersonColor(2), venmo: 'devon_r' },
      { id: priyaId, name: 'Priya', color: pickPersonColor(3) },
    ],
    payerId: meId,
    items: [
      {
        id: generateId('item'),
        name: 'Truffle Fries & Aioli',
        quantity: 1,
        priceCents: 1400,
        shares: { [meId]: 1, [mayaId]: 1, [devonId]: 1, [priyaId]: 1 },
      },
      {
        id: generateId('item'),
        name: 'Burrata Flatbread',
        quantity: 1,
        priceCents: 1950,
        shares: { [meId]: 1, [mayaId]: 1 },
      },
      {
        id: generateId('item'),
        name: 'Spicy Vodka Rigatoni',
        quantity: 1,
        priceCents: 2400,
        shares: { [mayaId]: 1 },
      },
      {
        id: generateId('item'),
        name: 'Woodfire Ribeye Frites',
        quantity: 1,
        priceCents: 3800,
        shares: { [devonId]: 1 },
      },
      {
        id: generateId('item'),
        name: 'Miso Glazed Salmon',
        quantity: 1,
        priceCents: 2900,
        shares: { [priyaId]: 1 },
      },
      {
        id: generateId('item'),
        name: 'Crispy Chicken Milanese',
        quantity: 1,
        priceCents: 2550,
        shares: { [meId]: 1 },
      },
      {
        id: generateId('item'),
        name: 'Yuzu Spritz',
        quantity: 3,
        priceCents: 4200,
        shares: { [meId]: 1, [mayaId]: 1, [priyaId]: 1 },
      },
      {
        id: generateId('item'),
        name: 'Craft IPA Pitchers',
        quantity: 1,
        priceCents: 1800,
        shares: { [devonId]: 2, [meId]: 1 },
      },
    ],
    taxCents: 1838,
    tipCents: 4200,
    extraFeeCents: 0,
    discountCents: 0,
    taxTipMode: 'proportional',
    createdAt: now,
    updatedAt: now,
  }
}

export function createBlankReceipt(settings: AppSettings): ReceiptSplit {
  const now = Date.now()
  const meId = generateId('p')

  return {
    id: generateId('split'),
    merchant: '',
    date: todayIsoDate(),
    currency: normalizeCurrencyCode(settings.defaultCurrency),
    people: [
      { id: meId, name: settings.userName.trim() || 'Me', color: pickPersonColor(0), isSelf: true },
    ],
    payerId: meId,
    items: [
      {
        id: generateId('item'),
        name: '',
        quantity: 1,
        priceCents: 0,
        shares: {},
      },
    ],
    taxCents: 0,
    tipCents: 0,
    extraFeeCents: 0,
    discountCents: 0,
    taxTipMode: 'proportional',
    createdAt: now,
    updatedAt: now,
  }
}

export function createReceiptFromScan(
  raw: ScannedReceiptRaw,
  settings: AppSettings
): ReceiptSplit {
  const now = Date.now()
  const meId = generateId('p')
  const people: Person[] = [
    { id: meId, name: settings.userName.trim() || 'Me', color: pickPersonColor(0), isSelf: true },
  ]

  const detected = raw.currency?.trim().toUpperCase()
  const isKnownDetected = Boolean(
    detected && CURRENCY_OPTIONS.some((c) => c.code === detected)
  )
  const currency = isKnownDetected
    ? (detected as string)
    : normalizeCurrencyCode(settings.defaultCurrency)

  return {
    id: generateId('split'),
    merchant: raw.merchant || 'Scanned Receipt',
    date: raw.date || todayIsoDate(),
    currency,
    people,
    payerId: meId,
    items:
      raw.items.length > 0
        ? raw.items.map((item) => ({
            id: generateId('item'),
            name: item.name,
            quantity: item.quantity,
            priceCents: dollarsToCents(item.totalPrice),
            shares: {},
          }))
        : [
            {
              id: generateId('item'),
              name: 'Receipt Item',
              quantity: 1,
              priceCents: 0,
              shares: {},
            },
          ],
    taxCents: dollarsToCents(raw.tax),
    tipCents: dollarsToCents(raw.tip),
    extraFeeCents: dollarsToCents(raw.extraFee),
    discountCents: dollarsToCents(raw.discount),
    taxTipMode: 'proportional',
    createdAt: now,
    updatedAt: now,
  }
}
