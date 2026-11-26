import type {
  PersonBreakdown,
  PersonItemLine,
  ReceiptItem,
  ReceiptSplit,
  SplitSummary,
} from '../types/receipt'
import {
  formatWeightFraction,
  generateId,
  getCurrencyUnitStep,
} from './format'

/**
 * Largest-remainder (Hamilton) integer allocator.
 * Guarantees that the returned values sum strictly to `totalCents` (aligned to `unitStep`).
 */
export function allocateCents(
  totalCents: number,
  weights: number[],
  unitStep = 1
): number[] {
  const count = weights.length
  if (count === 0) return []

  const step = Math.max(1, Math.round(unitStep))
  const totalUnits = Math.round(totalCents / step)
  if (totalUnits === 0) return new Array(count).fill(0)

  const sign = totalUnits < 0 ? -1 : 1
  const absTotal = Math.abs(totalUnits)

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
  const weightSum = safeWeights.reduce((acc, w) => acc + w, 0)
  if (weightSum <= 0) return new Array(count).fill(0)

  const exact = safeWeights.map((w) => (absTotal * w) / weightSum)
  const floors = exact.map((val) => Math.floor(val))
  const remainder = absTotal - floors.reduce((acc, f) => acc + f, 0)

  const ranked = exact
    .map((val, index) => ({
      index,
      frac: val - floors[index],
      weight: safeWeights[index],
    }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => {
      if (Math.abs(b.frac - a.frac) > 1e-12) return b.frac - a.frac
      // Deterministic tie-break: higher weight first, then original index
      if (b.weight !== a.weight) return b.weight - a.weight
      return a.index - b.index
    })

  for (let i = 0; i < remainder && i < ranked.length; i++) {
    floors[ranked[i].index] += 1
  }

  return floors.map((v) => v * sign * step)
}

/**
 * Splits a multi-quantity item into N individual single-quantity items,
 * distributing exact minor units so the total never drifts.
 */
export function splitItemIntoCount(
  item: ReceiptItem,
  count: number,
  currencyCode?: string
): ReceiptItem[] {
  const n = Math.max(2, Math.min(20, Math.round(count)))
  const weights = new Array<number>(n).fill(1)
  const step = getCurrencyUnitStep(currencyCode)
  const parts = allocateCents(item.priceCents, weights, step)
  const baseName = item.name.replace(/^\d+\s*[x×]\s*/i, '').trim() || item.name

  return parts.map((partCents, idx) => ({
    id: generateId('item'),
    name: `${baseName} (${idx + 1}/${n})`,
    quantity: 1,
    priceCents: partCents,
    shares: {},
  }))
}

/**
 * Calculates full exact-unit breakdown for every person on a receipt.
 */
export function calculateSplit(receipt: ReceiptSplit): SplitSummary {
  const step = getCurrencyUnitStep(receipt.currency)
  const people = receipt.people
  const peopleIndex = new Map<string, number>()
  people.forEach((p, idx) => peopleIndex.set(p.id, idx))

  const perPersonItems: PersonItemLine[][] = people.map(() => [])
  const perPersonSubtotal: number[] = people.map(() => 0)

  let itemsSubtotalCents = 0
  let assignedSubtotalCents = 0
  let unassignedSubtotalCents = 0
  const unassignedItemIds: string[] = []

  for (const item of receipt.items) {
    const price = Math.round(item.priceCents / step) * step
    itemsSubtotalCents += price

    const activeEntries = people
      .map((p, idx) => ({
        personId: p.id,
        idx,
        weight: item.shares[p.id] ?? 0,
      }))
      .filter((entry) => entry.weight > 0)

    if (activeEntries.length === 0) {
      unassignedSubtotalCents += price
      unassignedItemIds.push(item.id)
      continue
    }

    assignedSubtotalCents += price
    const totalWeight = activeEntries.reduce((sum, e) => sum + e.weight, 0)
    const allocated = allocateCents(
      price,
      activeEntries.map((e) => e.weight),
      step
    )

    activeEntries.forEach((entry, i) => {
      const shareCents = allocated[i]
      perPersonSubtotal[entry.idx] += shareCents
      const splitLabel =
        activeEntries.length > 1
          ? formatWeightFraction(entry.weight, totalWeight)
          : ''
      perPersonItems[entry.idx].push({
        itemId: item.id,
        name: item.name,
        itemTotalCents: price,
        shareCents,
        splitLabel,
      })
    })
  }

  // Determine weights for Tax, Tip, Extra Fee, Discount
  const participatingMask = perPersonSubtotal.map((sub, idx) =>
    sub > 0 || perPersonItems[idx].length > 0 ? 1 : 0
  )
  const hasAnyParticipant = participatingMask.some((v) => v > 0)

  let adjustmentWeights: number[]
  if (receipt.taxTipMode === 'even') {
    adjustmentWeights = hasAnyParticipant
      ? participatingMask
      : people.map(() => 1)
  } else {
    const subtotalSum = perPersonSubtotal.reduce((a, b) => a + Math.max(0, b), 0)
    if (subtotalSum > 0) {
      adjustmentWeights = perPersonSubtotal.map((s) => Math.max(0, s))
    } else if (hasAnyParticipant) {
      adjustmentWeights = participatingMask
    } else {
      adjustmentWeights = people.map(() => 1)
    }
  }

  const taxCents = Math.max(0, Math.round(receipt.taxCents / step) * step)
  const tipCents = Math.max(0, Math.round(receipt.tipCents / step) * step)
  const extraFeeCents = Math.max(0, Math.round(receipt.extraFeeCents / step) * step)
  const discountCents = Math.max(0, Math.round(receipt.discountCents / step) * step)

  const taxAlloc = allocateCents(taxCents, adjustmentWeights, step)
  const tipAlloc = allocateCents(tipCents, adjustmentWeights, step)
  const feeAlloc = allocateCents(extraFeeCents, adjustmentWeights, step)
  const discountAlloc = allocateCents(discountCents, adjustmentWeights, step)

  const breakdowns: PersonBreakdown[] = people.map((person, idx) => {
    const sub = perPersonSubtotal[idx]
    const tax = taxAlloc[idx] ?? 0
    const tip = tipAlloc[idx] ?? 0
    const fee = feeAlloc[idx] ?? 0
    const discount = discountAlloc[idx] ?? 0
    const total = Math.max(0, sub + tax + tip + fee - discount)

    return {
      person,
      isPayer: person.id === receipt.payerId,
      items: perPersonItems[idx],
      subtotalCents: sub,
      taxCents: tax,
      tipCents: tip,
      extraFeeCents: fee,
      discountCents: discount,
      totalCents: total,
    }
  })

  const grandTotalCents = Math.max(
    0,
    itemsSubtotalCents + taxCents + tipCents + extraFeeCents - discountCents
  )
  const allocatedGrandTotalCents = breakdowns.reduce(
    (sum, b) => sum + b.totalCents,
    0
  )

  return {
    itemsSubtotalCents,
    assignedSubtotalCents,
    unassignedSubtotalCents,
    unassignedItemIds,
    taxCents,
    tipCents,
    extraFeeCents,
    discountCents,
    grandTotalCents,
    allocatedGrandTotalCents,
    breakdowns,
  }
}
