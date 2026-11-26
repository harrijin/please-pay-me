import { describe, expect, it } from 'vitest'
import type { AppSettings, PaymentHandles, ReceiptSplit } from '../../types/receipt'
import { formatCents } from '../format'
import {
  buildCashAppPayUrl,
  buildPaymentNote,
  buildPayPalPayUrl,
  buildVenmoChargeUrl,
  buildVenmoPayUrl,
  resolveDestinationUrl,
  resolvePayerHandles,
} from '../paymentLinks'
import {
  buildShareUrl,
  createSharePayload,
  decodeShareHash,
  SHARE_HASH_PREFIX,
} from '../shareCodec'
import { allocateCents, calculateSplit, splitItemIntoCount } from '../splitMath'

describe('allocateCents (largest-remainder exact-cent math)', () => {
  it('splits $10.00 three ways to exact cents summing to 1000', () => {
    const res = allocateCents(1000, [1, 1, 1])
    expect(res).toEqual([334, 333, 333])
    expect(res.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('handles custom weights faithfully', () => {
    const res = allocateCents(1000, [2, 1])
    expect(res).toEqual([667, 333])
    expect(res.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('splits multi-quantity item without losing a penny', () => {
    const parts = splitItemIntoCount(
      { id: 'i1', name: '3x Street Tacos', quantity: 3, priceCents: 1000, shares: {} },
      3
    )
    expect(parts).toHaveLength(3)
    expect(parts.reduce((sum, p) => sum + p.priceCents, 0)).toBe(1000)
    expect(parts[0].name).toBe('Street Tacos (1/3)')
  })
})

describe('calculateSplit', () => {
  const baseReceipt: ReceiptSplit = {
    id: 'split_1',
    merchant: 'Cafe Sol',
    date: '2026-11-26',
    people: [
      { id: 'p1', name: 'Harrison', color: '#0f766e' },
      { id: 'p2', name: 'Maya', color: '#c2410c', venmo: 'maya-c' },
      { id: 'p3', name: 'Devon', color: '#1d4ed8' },
    ],
    payerId: 'p1',
    items: [
      {
        id: 'i1',
        name: 'Shared Nachos',
        quantity: 1,
        priceCents: 1000,
        shares: { p1: 1, p2: 1, p3: 1 },
      },
      {
        id: 'i2',
        name: 'Steak Bowl',
        quantity: 1,
        priceCents: 2000,
        shares: { p2: 1 },
      },
      {
        id: 'i3',
        name: 'Ramen',
        quantity: 1,
        priceCents: 1500,
        shares: { p1: 1 },
      },
    ],
    taxCents: 405,
    tipCents: 900,
    extraFeeCents: 150,
    discountCents: 300,
    taxTipMode: 'proportional',
    createdAt: 1,
    updatedAt: 1,
  }

  it('allocates proportional tax, tip, fee, and discount so totals sum strictly to grandTotalCents', () => {
    const summary = calculateSplit(baseReceipt)
    expect(summary.itemsSubtotalCents).toBe(4500)
    expect(summary.grandTotalCents).toBe(4500 + 405 + 900 + 150 - 300)
    expect(summary.allocatedGrandTotalCents).toBe(summary.grandTotalCents)
    expect(summary.unassignedItemIds).toEqual([])
  })

  it('allocates evenly when taxTipMode is even', () => {
    const summary = calculateSplit({ ...baseReceipt, taxTipMode: 'even' })
    expect(summary.allocatedGrandTotalCents).toBe(summary.grandTotalCents)
    // 405 / 3 = 135 exact each
    expect(summary.breakdowns.map((b) => b.taxCents)).toEqual([135, 135, 135])
    // 900 / 3 = 300 exact each
    expect(summary.breakdowns.map((b) => b.tipCents)).toEqual([300, 300, 300])
  })
})

describe('paymentLinks', () => {
  it('formats Venmo pay, Venmo charge, Cash App, and PayPal.Me links correctly', () => {
    expect(buildVenmoPayUrl('@harrijin', 1845, 'Marigold Bistro (2026-11-26)')).toBe(
      'https://venmo.com/?txn=pay&recipients=harrijin&amount=18.45&note=Marigold%20Bistro%20(2026-11-26)'
    )
    expect(buildVenmoChargeUrl('maya-c', 1845, 'Dinner')).toBe(
      'https://venmo.com/?txn=charge&recipients=maya-c&amount=18.45&note=Dinner'
    )
    expect(buildVenmoChargeUrl(undefined, 1845, 'Dinner')).toBe(
      'https://venmo.com/?txn=charge&amount=18.45&note=Dinner'
    )
    expect(buildCashAppPayUrl('$harrijin', 1845)).toBe(
      'https://cash.app/$harrijin/18.45'
    )
    expect(buildPayPalPayUrl('harrijin', 1845)).toBe(
      'https://paypal.me/harrijin/18.45USD'
    )
    expect(buildPaymentNote('Marigold Bistro', '2026-11-26')).toBe(
      'Marigold Bistro (2026-11-26)'
    )
    expect(buildPaymentNote('Marigold Bistro')).toBe('Marigold Bistro')
  })

  it('resolves direct QR destination and falls back cleanly when handle missing', () => {
    const handles: PaymentHandles = {
      venmo: 'harrijin',
      cashApp: '',
      paypal: '',
      zelle: '',
    }
    const direct = resolveDestinationUrl({
      destination: 'venmo',
      breakdownUrl: 'https://harrijin.github.io/please-pay-me/#s=abc',
      handles,
      amountCents: 2500,
      note: 'Lunch',
    })
    expect(direct.isFallback).toBe(false)
    expect(direct.url).toBe(
      'https://venmo.com/?txn=pay&recipients=harrijin&amount=25.00&note=Lunch'
    )

    const fallback = resolveDestinationUrl({
      destination: 'cashapp',
      breakdownUrl: 'https://harrijin.github.io/please-pay-me/#s=abc',
      handles,
      amountCents: 2500,
      note: 'Lunch',
    })
    expect(fallback.isFallback).toBe(true)
    expect(fallback.url).toBe('https://harrijin.github.io/please-pay-me/#s=abc')
  })

  it('uses friend handle (never user settings handles) when a friend is marked as payer', () => {
    const settings: AppSettings = {
      userName: 'Harrison',
      geminiApiKey: '',
      geminiModel: 'gemini-3.5-flash-lite',
      customGeminiModel: '',
      defaultCurrency: 'USD',
      handles: {
        venmo: 'my-own-venmo',
        cashApp: 'mycash',
        paypal: 'mypaypal',
        zelle: 'me@example.com',
      },
      savedFriends: [],
    }
    const receipt: ReceiptSplit = {
      id: 's_payer',
      merchant: 'Taco Spot',
      date: '2026-11-26',
      people: [
        { id: 'me', name: 'Harrison', color: '#0f766e', isSelf: true },
        {
          id: 'friend',
          name: 'Alex',
          color: '#c2410c',
          venmo: '@alex-friend',
          cashApp: '$alexcash',
          paypal: 'alexpp',
          zelle: 'alex@example.com',
        },
      ],
      payerId: 'friend',
      items: [],
      taxCents: 0,
      tipCents: 0,
      extraFeeCents: 0,
      discountCents: 0,
      taxTipMode: 'proportional',
      createdAt: 1,
      updatedAt: 1,
    }

    const friendResult = resolvePayerHandles(receipt.people[1], receipt, settings)
    expect(friendResult.isPayerSelf).toBe(false)
    expect(friendResult.handles).toEqual({
      venmo: 'alex-friend',
      cashApp: 'alexcash',
      paypal: 'alexpp',
      zelle: 'alex@example.com',
    })

    const selfResult = resolvePayerHandles(receipt.people[0], receipt, settings)
    expect(selfResult.isPayerSelf).toBe(true)
    expect(selfResult.handles).toEqual({
      venmo: 'my-own-venmo',
      cashApp: 'mycash',
      paypal: 'mypaypal',
      zelle: 'me@example.com',
    })
  })

  it('supports non-USD and 0-decimal currencies (JPY, EUR) accurately', () => {
    expect(formatCents(1250, 'EUR')).toBe('€12.50')
    expect(formatCents(100000, 'JPY')).toBe('¥1,000')
    expect(buildPayPalPayUrl('harrijin', 2550, 'EUR')).toBe(
      'https://paypal.me/harrijin/25.50EUR'
    )
    expect(buildPayPalPayUrl('harrijin', 150000, 'JPY')).toBe(
      'https://paypal.me/harrijin/1500JPY'
    )

    // ¥1,000 split 3 ways must allocate whole yen: 334, 333, 333 (sum = 1000)
    const jpyReceipt: ReceiptSplit = {
      id: 's_jpy',
      merchant: 'Ichiran Ramen',
      date: '2026-11-26',
      currency: 'JPY',
      people: [
        { id: 'p1', name: 'A', color: '#0f766e' },
        { id: 'p2', name: 'B', color: '#c2410c' },
        { id: 'p3', name: 'C', color: '#1d4ed8' },
      ],
      payerId: 'p1',
      items: [
        {
          id: 'i1',
          name: 'Gyoza Platter',
          quantity: 1,
          priceCents: 100000, // ¥1,000
          shares: { p1: 1, p2: 1, p3: 1 },
        },
      ],
      taxCents: 0,
      tipCents: 0,
      extraFeeCents: 0,
      discountCents: 0,
      taxTipMode: 'proportional',
      createdAt: 1,
      updatedAt: 1,
    }
    const summary = calculateSplit(jpyReceipt)
    expect(summary.breakdowns.map((b) => b.totalCents)).toEqual([
      33400, 33300, 33300,
    ])
    expect(summary.breakdowns.map((b) => formatCents(b.totalCents, 'JPY'))).toEqual([
      '¥334',
      '¥333',
      '¥333',
    ])

    const payload = createSharePayload(
      jpyReceipt,
      summary.breakdowns[1],
      'A',
      { venmo: '', cashApp: '', paypal: 'a_pay', zelle: '' }
    )
    const url = buildShareUrl(payload, 'https://harrijin.github.io/please-pay-me/')
    const decoded = decodeShareHash(url.slice(url.indexOf('#')))
    expect(decoded?.c).toBe('JPY')
    expect(decoded?.g).toBe(33300)
  })
})

describe('shareCodec (#s= zero-DB serialization & privacy)', () => {
  it('round-trips a friend breakdown through #s= and NEVER leaks Gemini API keys', () => {
    const receipt: ReceiptSplit = {
      id: 's1',
      merchant: 'Marigold Bistro',
      date: '2026-11-26',
      people: [
        { id: 'p1', name: 'Harrison', color: '#0f766e' },
        { id: 'p2', name: 'Maya', color: '#c2410c' },
      ],
      payerId: 'p1',
      items: [
        {
          id: 'i1',
          name: 'Burrata Flatbread',
          quantity: 1,
          priceCents: 1950,
          shares: { p1: 1, p2: 1 },
        },
      ],
      taxCents: 170,
      tipCents: 390,
      extraFeeCents: 0,
      discountCents: 0,
      taxTipMode: 'proportional',
      createdAt: 1,
      updatedAt: 1,
    }
    const summary = calculateSplit(receipt)
    const maya = summary.breakdowns.find((b) => b.person.id === 'p2')!
    const secretKey = 'AIzaSySUPER_SECRET_KEY_NEVER_SHARE'

    const payload = createSharePayload(receipt, maya, 'Harrison', {
      venmo: '@harrijin',
      cashApp: '$harrijin',
      paypal: 'harrijin',
      zelle: 'h@example.com',
    })

    const url = buildShareUrl(payload, 'https://harrijin.github.io/please-pay-me/')
    expect(url.startsWith(`https://harrijin.github.io/please-pay-me/${SHARE_HASH_PREFIX}`)).toBe(true)
    expect(url).not.toContain(secretKey)

    const hash = url.slice(url.indexOf('#'))
    const decoded = decodeShareHash(hash)
    expect(decoded).not.toBeNull()
    expect(decoded?.m).toBe('Marigold Bistro')
    expect(decoded?.f).toBe('Maya')
    expect(decoded?.p).toBe('Harrison')
    expect(decoded?.g).toBe(maya.totalCents)
    expect(decoded?.h).toEqual({
      v: 'harrijin',
      c: 'harrijin',
      p: 'harrijin',
      z: 'h@example.com',
    })
    expect(JSON.stringify(decoded)).not.toContain('gemini')
    expect(JSON.stringify(decoded)).not.toContain(secretKey)
  })
})
