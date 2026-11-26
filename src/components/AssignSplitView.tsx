import { useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Crown,
  Divide,
  Image as ImageIcon,
  Maximize2,
  Minus,
  Pin,
  Plus,
  Scale,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type {
  AppSettings,
  Person,
  ReceiptItem,
  ReceiptSplit,
  SavedFriend,
  SplitSummary,
  TaxTipMode,
} from '../types/receipt'
import {
  CURRENCY_OPTIONS,
  dollarsToCents,
  formatCents,
  formatWeightFraction,
  generateId,
  getCurrencyInfo,
  getCurrencyUnitStep,
  getInitials,
  pickPersonColor,
} from '../utils/format'
import {
  cleanCashAppHandle,
  cleanPayPalHandle,
  cleanVenmoHandle,
  cleanZelleHandle,
} from '../utils/paymentLinks'
import { allocateCents, splitItemIntoCount } from '../utils/splitMath'
import { ZoomableReceiptImage } from './ZoomableReceiptImage'

interface AssignSplitViewProps {
  receipt: ReceiptSplit
  summary: SplitSummary
  settings: AppSettings
  receiptImageUrl: string | null
  onChange: (next: ReceiptSplit) => void
  onSaveFriendToSettings: (
    name: string,
    handles?: { venmo?: string; cashApp?: string; paypal?: string; zelle?: string }
  ) => void
  onGoCollect: () => void
  onNotify: (msg: string) => void
}

function MoneyInput({
  id,
  cents,
  onChangeCents,
  decimals = 2,
  placeholder,
  ariaLabel,
  compact = false,
}: {
  id?: string
  cents: number
  onChangeCents: (cents: number) => void
  decimals?: 0 | 2
  placeholder?: string
  ariaLabel: string
  compact?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  const formatted =
    cents === 0
      ? ''
      : decimals === 0
        ? String(Math.round(cents / 100))
        : (cents / 100).toFixed(2)
  const displayValue = focused ? draft : formatted
  const inputPlaceholder = placeholder ?? (decimals === 0 ? '0' : '0.00')

  return (
    <input
      id={id}
      type="text"
      inputMode={decimals === 0 ? 'numeric' : 'decimal'}
      aria-label={ariaLabel}
      placeholder={inputPlaceholder}
      className={`input input-money ${compact ? 'input-compact' : ''}`}
      value={displayValue}
      onFocus={() => {
        setFocused(true)
        setDraft(formatted)
      }}
      onChange={(e) => {
        const val = e.target.value
        const pattern =
          decimals === 0 ? /^[0-9]*$/ : /^[0-9]*\.?[0-9]{0,2}$/
        if (pattern.test(val)) {
          setDraft(val)
          onChangeCents(val === '' ? 0 : dollarsToCents(val))
        }
      }}
      onBlur={() => {
        setFocused(false)
      }}
    />
  )
}

export function AssignSplitView({
  receipt,
  summary,
  settings,
  receiptImageUrl,
  onChange,
  onSaveFriendToSettings,
  onGoCollect,
  onNotify,
}: AssignSplitViewProps) {
  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonVenmo, setNewPersonVenmo] = useState('')
  const [newPersonCashApp, setNewPersonCashApp] = useState('')
  const [newPersonPayPal, setNewPersonPayPal] = useState('')
  const [newPersonZelle, setNewPersonZelle] = useState('')
  const [showMoreHandles, setShowMoreHandles] = useState(false)
  const [saveNewPersonToFriends, setSaveNewPersonToFriends] = useState(false)
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  const [expandedWeightsItemId, setExpandedWeightsItemId] = useState<string | null>(null)
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false)
  const [receiptPinned, setReceiptPinned] = useState(false)
  const [receiptZoom, setReceiptZoom] = useState(1)

  const updateReceipt = (patch: Partial<ReceiptSplit>) => {
    onChange({ ...receipt, ...patch, updatedAt: Date.now() })
  }

  const handleAddPerson = (e?: React.FormEvent) => {
    e?.preventDefault()
    const name = newPersonName.trim()
    if (!name) return

    const venmo = cleanVenmoHandle(newPersonVenmo)
    const cashApp = cleanCashAppHandle(newPersonCashApp)
    const paypal = cleanPayPalHandle(newPersonPayPal)
    const zelle = cleanZelleHandle(newPersonZelle)

    const person: Person = {
      id: generateId('p'),
      name,
      color: pickPersonColor(receipt.people.length),
      ...(venmo ? { venmo } : {}),
      ...(cashApp ? { cashApp } : {}),
      ...(paypal ? { paypal } : {}),
      ...(zelle ? { zelle } : {}),
    }

    updateReceipt({ people: [...receipt.people, person] })

    if (
      saveNewPersonToFriends &&
      name.toLowerCase() !== (settings.userName || 'me').toLowerCase()
    ) {
      onSaveFriendToSettings(name, {
        venmo: venmo || undefined,
        cashApp: cashApp || undefined,
        paypal: paypal || undefined,
        zelle: zelle || undefined,
      })
      onNotify(`Added ${name} and saved to Saved Friends`)
    }

    setNewPersonName('')
    setNewPersonVenmo('')
    setNewPersonCashApp('')
    setNewPersonPayPal('')
    setNewPersonZelle('')
    setShowMoreHandles(false)
    setSaveNewPersonToFriends(false)
  }

  const handleQuickAddSavedFriend = (sf: SavedFriend) => {
    if (receipt.people.some((p) => p.name.toLowerCase() === sf.name.toLowerCase())) {
      onNotify(`${sf.name} is already on this bill`)
      return
    }
    const person: Person = {
      id: generateId('p'),
      name: sf.name,
      color: pickPersonColor(receipt.people.length),
      ...(sf.venmo ? { venmo: sf.venmo } : {}),
      ...(sf.cashApp ? { cashApp: sf.cashApp } : {}),
      ...(sf.paypal ? { paypal: sf.paypal } : {}),
      ...(sf.zelle ? { zelle: sf.zelle } : {}),
    }
    updateReceipt({ people: [...receipt.people, person] })
  }

  const handleRemovePerson = (personId: string) => {
    if (receipt.people.length <= 1) {
      onNotify('Keep at least one person on the receipt')
      return
    }
    const nextPeople = receipt.people.filter((p) => p.id !== personId)
    const nextPayerId =
      receipt.payerId === personId ? nextPeople[0].id : receipt.payerId
    const nextItems = receipt.items.map((item) => {
      if (!(personId in item.shares)) return item
      const nextShares = { ...item.shares }
      delete nextShares[personId]
      return { ...item, shares: nextShares }
    })
    updateReceipt({
      people: nextPeople,
      payerId: nextPayerId,
      items: nextItems,
    })
    if (editingPersonId === personId) setEditingPersonId(null)
  }

  const handleUpdatePerson = (personId: string, patch: Partial<Person>) => {
    updateReceipt({
      people: receipt.people.map((p) =>
        p.id === personId ? { ...p, ...patch } : p
      ),
    })
  }

  const handleUpdateItem = (itemId: string, patch: Partial<ReceiptItem>) => {
    updateReceipt({
      items: receipt.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      ),
    })
  }

  const handleToggleAssign = (item: ReceiptItem, personId: string) => {
    const nextShares = { ...item.shares }
    if ((nextShares[personId] ?? 0) > 0) {
      delete nextShares[personId]
    } else {
      nextShares[personId] = 1
    }
    handleUpdateItem(item.id, { shares: nextShares })
  }

  const handleToggleAll = (item: ReceiptItem) => {
    const allAssigned = receipt.people.every((p) => (item.shares[p.id] ?? 0) > 0)
    if (allAssigned) {
      handleUpdateItem(item.id, { shares: {} })
    } else {
      const shares: Record<string, number> = {}
      receipt.people.forEach((p) => {
        shares[p.id] = 1
      })
      handleUpdateItem(item.id, { shares })
    }
  }

  const handleSetWeight = (item: ReceiptItem, personId: string, delta: number) => {
    const current = item.shares[personId] ?? 0
    const nextVal = Math.max(0, current + delta)
    const nextShares = { ...item.shares }
    if (nextVal <= 0) {
      delete nextShares[personId]
    } else {
      nextShares[personId] = nextVal
    }
    handleUpdateItem(item.id, { shares: nextShares })
  }

  const currencyInfo = getCurrencyInfo(receipt.currency)
  const currencyUnitStep = getCurrencyUnitStep(receipt.currency)
  const fmt = (cents: number) => formatCents(cents, currencyInfo.code)

  const handleSplitByQty = (item: ReceiptItem, count: number) => {
    const parts = splitItemIntoCount(item, count, currencyInfo.code)
    const idx = receipt.items.findIndex((it) => it.id === item.id)
    if (idx === -1) return
    const nextItems = [
      ...receipt.items.slice(0, idx),
      ...parts,
      ...receipt.items.slice(idx + 1),
    ]
    updateReceipt({ items: nextItems })
    onNotify(`Split "${item.name}" into ${parts.length} items`)
  }

  const handleAddItem = () => {
    const newItem: ReceiptItem = {
      id: generateId('item'),
      name: '',
      quantity: 1,
      priceCents: 0,
      shares: {},
    }
    updateReceipt({ items: [...receipt.items, newItem] })
  }

  const handleDeleteItem = (itemId: string) => {
    updateReceipt({
      items: receipt.items.filter((i) => i.id !== itemId),
    })
  }

  const applyTipPercent = (pct: number) => {
    const rawCents = (summary.itemsSubtotalCents * pct) / 100
    const tipCents =
      Math.round(rawCents / currencyUnitStep) * currencyUnitStep
    updateReceipt({ tipCents })
  }

  const currentTipPct =
    summary.itemsSubtotalCents > 0
      ? Math.round((receipt.tipCents / summary.itemsSubtotalCents) * 100)
      : 0

  const unusedSavedFriends = settings.savedFriends.filter(
    (sf) => !receipt.people.some((p) => p.name.toLowerCase() === sf.name.toLowerCase())
  )

  const editingPerson = receipt.people.find((p) => p.id === editingPersonId) ?? null

  return (
    <div className="section-stack">
      <div className="step-bar">
        <div className="step-tabs" role="tablist">
          <button type="button" role="tab" aria-selected="true" className="step-tab active">
            1. Assign Items
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            className="step-tab"
            onClick={onGoCollect}
          >
            2. Collect &amp; Share
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {receiptImageUrl && (
            <button
              type="button"
              id="view-receipt-img-btn"
              className={`btn btn-xs ${receiptPinned ? 'btn-primary' : 'btn-soft'}`}
              onClick={() => {
                setReceiptZoom(1)
                setReceiptViewerOpen(true)
              }}
            >
              <ImageIcon size={14} />
              <span>View Receipt</span>
            </button>
          )}

          {summary.unassignedItemIds.length > 0 && (
            <span className="status-chip warn">
              <AlertCircle size={13} />
              {summary.unassignedItemIds.length} unassigned
            </span>
          )}
        </div>
      </div>

      {/* Pinned Receipt Reference Bar (zoomable split-screen while editing items) */}
      {receiptImageUrl && receiptPinned && (
        <section className="receipt-pin-bar" aria-label="Pinned receipt photo">
          <div className="receipt-pin-head">
            <span className="receipt-pin-title">
              <ImageIcon size={14} />
              <span>Receipt</span>
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                id="pin-zoom-out-btn"
                className="btn btn-secondary btn-xs"
                style={{ padding: '4px 7px' }}
                disabled={receiptZoom <= 1}
                onClick={() =>
                  setReceiptZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))))
                }
                aria-label="Zoom out pinned receipt"
              >
                <ZoomOut size={13} />
              </button>
              <button
                type="button"
                id="pin-zoom-reset-btn"
                className="btn btn-secondary btn-xs mono"
                style={{ padding: '4px 7px' }}
                onClick={() => setReceiptZoom(1)}
                title="Reset zoom to 100%"
              >
                {Math.round(receiptZoom * 100)}%
              </button>
              <button
                type="button"
                id="pin-zoom-in-btn"
                className="btn btn-secondary btn-xs"
                style={{ padding: '4px 7px' }}
                disabled={receiptZoom >= 4}
                onClick={() =>
                  setReceiptZoom((z) => Math.min(4, Number((z + 0.5).toFixed(2))))
                }
                aria-label="Zoom in pinned receipt"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                style={{ padding: '4px 8px' }}
                onClick={() => setReceiptViewerOpen(true)}
                aria-label="Expand receipt full screen"
                title="Expand full screen"
              >
                <Maximize2 size={13} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{ padding: '4px 7px' }}
                onClick={() => setReceiptPinned(false)}
                aria-label="Hide pinned receipt"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <ZoomableReceiptImage
            src={receiptImageUrl}
            alt="Cropped receipt reference"
            scale={receiptZoom}
            minScale={1}
            maxScale={4}
            onScaleChange={setReceiptZoom}
            className="receipt-pin-viewport"
            showHint
          />
        </section>
      )}

      {/* Merchant & Date */}
      <section className="card">
        <div className="receipt-meta-grid">
          <div>
            <label htmlFor="merchant-input" className="field-label">
              Merchant / Restaurant
            </label>
            <input
              id="merchant-input"
              type="text"
              className="input"
              placeholder="e.g., Marigold Bistro"
              value={receipt.merchant}
              onChange={(e) => updateReceipt({ merchant: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="date-input" className="field-label">
              Date
            </label>
            <input
              id="date-input"
              type="date"
              className="input mono"
              value={receipt.date}
              onChange={(e) => updateReceipt({ date: e.target.value })}
            />
          </div>
        </div>

        <details className="advanced-inline">
          <summary className="advanced-inline-summary">
            <span>
              Advanced
              {currencyInfo.code !== 'USD' && (
                <span className="mono" style={{ marginLeft: 6, color: 'var(--accent)' }}>
                  · {currencyInfo.code} ({currencyInfo.symbol.trim()})
                </span>
              )}
            </span>
          </summary>
          <div style={{ marginTop: 10 }}>
            <label htmlFor="receipt-currency-select" className="field-label">
              Receipt Currency
            </label>
            <select
              id="receipt-currency-select"
              className="select input-compact"
              value={currencyInfo.code}
              onChange={(e) => updateReceipt({ currency: e.target.value })}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol.trim()}) — {c.name}
                </option>
              ))}
            </select>
          </div>
        </details>
      </section>

      {/* People & Who Paid */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Users size={17} />
            <span>People ({receipt.people.length})</span>
          </h2>
          <span style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
            Tap a name to set who paid
          </span>
        </div>

        <div className="people-wrap">
          {receipt.people.map((person) => {
            const isPayer = person.id === receipt.payerId
            return (
              <div
                key={person.id}
                className={`person-chip ${isPayer ? 'payer' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    updateReceipt({ payerId: person.id })
                    onNotify(`${person.name} set as payer`)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontWeight: 'inherit',
                    color: 'inherit',
                  }}
                  title={`Set ${person.name} as who paid the bill`}
                >
                  <span
                    className="person-avatar"
                    style={{ backgroundColor: person.color }}
                  >
                    {getInitials(person.name)}
                  </span>
                  <span>{person.name}</span>
                  {isPayer && (
                    <span className="payer-tag">
                      <Crown size={10} style={{ verticalAlign: '-1px', marginRight: 2 }} />
                      Paid
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="chip-action-btn"
                  onClick={() =>
                    setEditingPersonId((prev) => (prev === person.id ? null : person.id))
                  }
                  aria-label={`Edit ${person.name}`}
                  title="Edit name / Venmo handle"
                >
                  <SlidersHorizontal size={13} />
                </button>
                {receipt.people.length > 1 && (
                  <button
                    type="button"
                    className="chip-action-btn"
                    onClick={() => handleRemovePerson(person.id)}
                    aria-label={`Remove ${person.name}`}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {editingPerson && (
          <div
            style={{
              padding: 12,
              marginBottom: 12,
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border-strong)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 750 }}>
                Edit {editingPerson.name}&apos;s Info &amp; Handles
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setEditingPersonId(null)}
              >
                <X size={13} />
                <span>Done</span>
              </button>
            </div>

            <div>
              <label className="field-label">Name</label>
              <input
                type="text"
                className="input input-compact"
                value={editingPerson.name}
                onChange={(e) =>
                  handleUpdatePerson(editingPerson.id, { name: e.target.value })
                }
              />
            </div>

            <div className="handles-grid">
              <div>
                <label className="field-label">Venmo</label>
                <input
                  type="text"
                  className="input input-compact mono"
                  placeholder="@username"
                  value={editingPerson.venmo ?? ''}
                  onChange={(e) =>
                    handleUpdatePerson(editingPerson.id, { venmo: e.target.value })
                  }
                  onBlur={(e) =>
                    handleUpdatePerson(editingPerson.id, {
                      venmo: cleanVenmoHandle(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <label className="field-label">Cash App</label>
                <input
                  type="text"
                  className="input input-compact mono"
                  placeholder="$cashtag"
                  value={editingPerson.cashApp ?? ''}
                  onChange={(e) =>
                    handleUpdatePerson(editingPerson.id, { cashApp: e.target.value })
                  }
                  onBlur={(e) =>
                    handleUpdatePerson(editingPerson.id, {
                      cashApp: cleanCashAppHandle(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <label className="field-label">PayPal.Me</label>
                <input
                  type="text"
                  className="input input-compact mono"
                  placeholder="username"
                  value={editingPerson.paypal ?? ''}
                  onChange={(e) =>
                    handleUpdatePerson(editingPerson.id, { paypal: e.target.value })
                  }
                  onBlur={(e) =>
                    handleUpdatePerson(editingPerson.id, {
                      paypal: cleanPayPalHandle(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <label className="field-label">Zelle</label>
                <input
                  type="text"
                  className="input input-compact mono"
                  placeholder="email or phone"
                  value={editingPerson.zelle ?? ''}
                  onChange={(e) =>
                    handleUpdatePerson(editingPerson.id, { zelle: e.target.value })
                  }
                  onBlur={(e) =>
                    handleUpdatePerson(editingPerson.id, {
                      zelle: cleanZelleHandle(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            {!editingPerson.isSelf && editingPerson.name.trim() && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-soft btn-xs"
                  onClick={() => {
                    onSaveFriendToSettings(editingPerson.name.trim(), {
                      venmo: cleanVenmoHandle(editingPerson.venmo) || undefined,
                      cashApp: cleanCashAppHandle(editingPerson.cashApp) || undefined,
                      paypal: cleanPayPalHandle(editingPerson.paypal) || undefined,
                      zelle: cleanZelleHandle(editingPerson.zelle) || undefined,
                    })
                    onNotify(`Saved ${editingPerson.name.trim()} to Saved Friends`)
                  }}
                >
                  <UserPlus size={13} />
                  <span>
                    {settings.savedFriends.some(
                      (sf) =>
                        sf.name.toLowerCase() ===
                        editingPerson.name.trim().toLowerCase()
                    )
                      ? 'Update Saved Friend'
                      : 'Save to Saved Friends'}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleAddPerson} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="add-person-form">
            <input
              id="add-person-name"
              type="text"
              className="input input-compact"
              placeholder="Add person (e.g., Alex)"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
            />
            <input
              id="add-person-venmo"
              type="text"
              className="input input-compact mono"
              placeholder="Venmo @handle (opt.)"
              value={newPersonVenmo}
              onChange={(e) => setNewPersonVenmo(e.target.value)}
            />
            <button
              type="submit"
              id="add-person-btn"
              className="btn btn-secondary btn-sm"
              disabled={!newPersonName.trim()}
            >
              <UserPlus size={15} />
              <span>Add</span>
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              style={{ padding: '2px 6px' }}
              onClick={() => setShowMoreHandles((s) => !s)}
            >
              <Plus size={12} />
              <span>
                {showMoreHandles
                  ? 'Hide Cash App / PayPal / Zelle'
                  : 'Add Cash App / PayPal / Zelle'}
              </span>
            </button>

            <label
              htmlFor="save-friend-checkbox"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--ink-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                id="save-friend-checkbox"
                type="checkbox"
                checked={saveNewPersonToFriends}
                onChange={(e) => setSaveNewPersonToFriends(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
              />
              <span>Save to Saved Friends</span>
            </label>
          </div>

          {showMoreHandles && (
            <div className="handles-grid">
              <input
                type="text"
                className="input input-compact mono"
                placeholder="Cash App $cashtag (opt.)"
                value={newPersonCashApp}
                onChange={(e) => setNewPersonCashApp(e.target.value)}
              />
              <input
                type="text"
                className="input input-compact mono"
                placeholder="PayPal.Me username (opt.)"
                value={newPersonPayPal}
                onChange={(e) => setNewPersonPayPal(e.target.value)}
              />
              <input
                type="text"
                className="input input-compact mono"
                placeholder="Zelle email or phone (opt.)"
                value={newPersonZelle}
                onChange={(e) => setNewPersonZelle(e.target.value)}
              />
            </div>
          )}
        </form>

        {unusedSavedFriends.length > 0 && (
          <div className="saved-friends-row">
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
              Quick add:
            </span>
            {unusedSavedFriends.map((sf) => (
              <button
                key={sf.id}
                type="button"
                className="saved-friend-pill"
                onClick={() => handleQuickAddSavedFriend(sf)}
              >
                <Plus size={12} />
                <span>{sf.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Line Items */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Items ({receipt.items.length})</h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {receiptImageUrl && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setReceiptPinned((p) => !p)}
                title="Pin receipt photo above items while verifying prices"
              >
                <Pin size={13} />
                <span>{receiptPinned ? 'Unpin Photo' : 'Pin Photo'}</span>
              </button>
            )}
            <button
              type="button"
              id="add-item-btn"
              className="btn btn-soft btn-xs"
              onClick={handleAddItem}
            >
              <Plus size={14} />
              <span>Add Item</span>
            </button>
          </div>
        </div>

        <div className="items-list">
          {receipt.items.map((item) => {
            const activePeople = receipt.people.filter(
              (p) => (item.shares[p.id] ?? 0) > 0
            )
            const isUnassigned = activePeople.length === 0 && item.priceCents > 0
            const allAssigned =
              receipt.people.length > 0 &&
              receipt.people.every((p) => (item.shares[p.id] ?? 0) > 0)
            const hasCustomWeights = activePeople.some(
              (p) => (item.shares[p.id] ?? 1) !== 1
            )
            const weightsOpen = expandedWeightsItemId === item.id

            const totalWeight = activePeople.reduce(
              (sum, p) => sum + (item.shares[p.id] ?? 0),
              0
            )
            const previewShares =
              activePeople.length > 0
                ? allocateCents(
                    item.priceCents,
                    activePeople.map((p) => item.shares[p.id] ?? 1),
                    currencyUnitStep
                  )
                : []

            return (
              <div
                key={item.id}
                className={`item-card ${isUnassigned ? 'unassigned' : ''}`}
              >
                <div className="item-top-row">
                  <input
                    type="text"
                    className="input input-compact"
                    aria-label="Item name"
                    placeholder="Item description"
                    value={item.name}
                    onChange={(e) =>
                      handleUpdateItem(item.id, { name: e.target.value })
                    }
                  />
                  <MoneyInput
                    cents={item.priceCents}
                    decimals={currencyInfo.decimals}
                    onChangeCents={(priceCents) =>
                      handleUpdateItem(item.id, { priceCents })
                    }
                    ariaLabel={`Price for ${item.name || 'item'}`}
                    compact
                  />
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-xs"
                    onClick={() => handleDeleteItem(item.id)}
                    aria-label={`Delete ${item.name || 'item'}`}
                    title="Delete item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="item-assign-row">
                  <div className="assign-pills">
                    <button
                      type="button"
                      className={`assign-pill all-pill ${allAssigned ? 'selected' : ''}`}
                      onClick={() => handleToggleAll(item)}
                    >
                      All
                    </button>

                    {receipt.people.map((person) => {
                      const weight = item.shares[person.id] ?? 0
                      const selected = weight > 0
                      return (
                        <button
                          key={person.id}
                          type="button"
                          className={`assign-pill ${selected ? 'selected' : ''}`}
                          style={
                            selected
                              ? { backgroundColor: person.color }
                              : undefined
                          }
                          onClick={() => handleToggleAssign(item, person.id)}
                        >
                          <span>{person.name}</span>
                          {selected && weight > 1 && (
                            <span className="mono" style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                              ×{weight}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <div className="item-tools">
                    {item.quantity > 1 && (
                      <button
                        type="button"
                        className="btn btn-soft btn-xs"
                        onClick={() => handleSplitByQty(item, item.quantity)}
                        title={`Split into ${item.quantity} separate items`}
                      >
                        <Divide size={13} />
                        <span className="mono">Split ×{item.quantity}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className={`btn btn-xs ${
                        weightsOpen || hasCustomWeights ? 'btn-soft' : 'btn-ghost'
                      }`}
                      onClick={() =>
                        setExpandedWeightsItemId((prev) =>
                          prev === item.id ? null : item.id
                        )
                      }
                      title="Custom share weights or split item"
                    >
                      <Scale size={13} />
                      <span>Weights</span>
                    </button>
                  </div>
                </div>

                {weightsOpen && (
                  <div className="weights-drawer">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: 'var(--ink-secondary)',
                        }}
                      >
                        Custom Share Weights
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[2, 3, 4].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="btn btn-secondary btn-xs mono"
                            onClick={() => handleSplitByQty(item, n)}
                          >
                            Split ×{n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {receipt.people.map((person) => {
                      const weight = item.shares[person.id] ?? 0
                      const activeIdx = activePeople.findIndex(
                        (p) => p.id === person.id
                      )
                      const shareCents =
                        activeIdx >= 0 ? previewShares[activeIdx] : 0
                      const frac =
                        weight > 0 && activePeople.length > 1
                          ? formatWeightFraction(weight, totalWeight)
                          : weight > 0
                            ? '100%'
                            : '0%'

                      return (
                        <div key={person.id} className="weight-row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              className="person-avatar"
                              style={{
                                width: 20,
                                height: 20,
                                fontSize: '0.62rem',
                                backgroundColor: person.color,
                              }}
                            >
                              {getInitials(person.name)}
                            </span>
                            <span style={{ fontWeight: 600 }}>{person.name}</span>
                            <span
                              className="mono"
                              style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}
                            >
                              {frac} · {fmt(shareCents)}
                            </span>
                          </div>

                          <div className="weight-stepper">
                            <button
                              type="button"
                              className="weight-step-btn"
                              onClick={() => handleSetWeight(item, person.id, -1)}
                              disabled={weight <= 0}
                              aria-label={`Decrease ${person.name} share`}
                            >
                              <Minus size={13} />
                            </button>
                            <span
                              className="mono"
                              style={{
                                minWidth: 24,
                                textAlign: 'center',
                                fontWeight: 700,
                              }}
                            >
                              {weight}×
                            </span>
                            <button
                              type="button"
                              className="weight-step-btn"
                              onClick={() => handleSetWeight(item, person.id, 1)}
                              aria-label={`Increase ${person.name} share`}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Tax, Tip, Fees, Discounts */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Tax, Tip &amp; Adjustments</h2>
          <div className="segmented" role="group" aria-label="Tax and tip split mode">
            {(['proportional', 'even'] as TaxTipMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`segmented-btn ${receipt.taxTipMode === m ? 'active' : ''}`}
                style={{ minHeight: 30, padding: '4px 10px', fontSize: '0.76rem' }}
                onClick={() => updateReceipt({ taxTipMode: m })}
              >
                {m === 'proportional' ? 'Proportional' : 'Even'}
              </button>
            ))}
          </div>
        </div>

        <div className="adjustments-grid">
          <div>
            <label htmlFor="tax-input" className="field-label">
              Tax ({currencyInfo.symbol.trim()})
            </label>
            <MoneyInput
              id="tax-input"
              cents={receipt.taxCents}
              decimals={currencyInfo.decimals}
              onChangeCents={(taxCents) => updateReceipt({ taxCents })}
              ariaLabel="Tax amount"
            />
          </div>

          <div>
            <label htmlFor="tip-input" className="field-label">
              Tip ({currencyInfo.symbol.trim()}){' '}
              {summary.itemsSubtotalCents > 0 && receipt.tipCents > 0 && (
                <span className="mono" style={{ color: 'var(--accent)', marginLeft: 4 }}>
                  ~{currentTipPct}%
                </span>
              )}
            </label>
            <MoneyInput
              id="tip-input"
              cents={receipt.tipCents}
              decimals={currencyInfo.decimals}
              onChangeCents={(tipCents) => updateReceipt({ tipCents })}
              ariaLabel="Tip amount"
            />
          </div>
        </div>

        <div className="tip-presets" aria-label="Tip percentage presets">
          {[0, 15, 18, 20, 25].map((pct) => {
            const presetCents =
              Math.round(((summary.itemsSubtotalCents * pct) / 100) / currencyUnitStep) *
              currencyUnitStep
            const isActive =
              summary.itemsSubtotalCents > 0 && receipt.tipCents === presetCents
            return (
              <button
                key={pct}
                type="button"
                className={`preset-btn ${isActive ? 'active' : ''}`}
                onClick={() => applyTipPercent(pct)}
              >
                {pct === 0 ? 'No tip' : `${pct}%`}
              </button>
            )
          })}
        </div>

        <hr className="receipt-divider" />

        <div className="adjustments-grid">
          <div>
            <label htmlFor="fee-input" className="field-label">
              Extra Fee / Service ({currencyInfo.symbol.trim()})
            </label>
            <MoneyInput
              id="fee-input"
              cents={receipt.extraFeeCents}
              decimals={currencyInfo.decimals}
              onChangeCents={(extraFeeCents) => updateReceipt({ extraFeeCents })}
              ariaLabel="Extra fee amount"
            />
          </div>
          <div>
            <label htmlFor="discount-input" className="field-label">
              Discount / Coupon ({currencyInfo.symbol.trim()})
            </label>
            <MoneyInput
              id="discount-input"
              cents={receipt.discountCents}
              decimals={currencyInfo.decimals}
              onChangeCents={(discountCents) => updateReceipt({ discountCents })}
              ariaLabel="Discount amount"
            />
          </div>
        </div>

        <hr className="receipt-divider" />

        <div className="totals-summary-list">
          <div className="totals-row">
            <span>Items Subtotal</span>
            <span className="mono">{fmt(summary.itemsSubtotalCents)}</span>
          </div>
          {summary.taxCents > 0 && (
            <div className="totals-row">
              <span>Tax ({receipt.taxTipMode})</span>
              <span className="mono">{fmt(summary.taxCents)}</span>
            </div>
          )}
          {summary.tipCents > 0 && (
            <div className="totals-row">
              <span>Tip ({receipt.taxTipMode})</span>
              <span className="mono">{fmt(summary.tipCents)}</span>
            </div>
          )}
          {summary.extraFeeCents > 0 && (
            <div className="totals-row">
              <span>Extra Fee</span>
              <span className="mono">{fmt(summary.extraFeeCents)}</span>
            </div>
          )}
          {summary.discountCents > 0 && (
            <div className="totals-row">
              <span>Discount</span>
              <span className="mono" style={{ color: 'var(--success)' }}>
                -{fmt(summary.discountCents)}
              </span>
            </div>
          )}
          <div className="totals-row grand">
            <span>Receipt Total</span>
            <span className="mono">{fmt(summary.grandTotalCents)}</span>
          </div>
        </div>
      </section>

      {/* Sticky Footer CTA */}
      <div className="sticky-bottom-bar">
        <div className="sticky-bottom-inner">
          <div>
            <div className="sticky-total-label">
              {summary.unassignedItemIds.length > 0
                ? `${fmt(summary.unassignedSubtotalCents)} unassigned`
                : 'Exact split ready'}
            </div>
            <div className="sticky-total-amount">
              {fmt(summary.grandTotalCents)}
            </div>
          </div>

          <button
            type="button"
            id="go-collect-btn"
            className="btn btn-primary btn-lg"
            onClick={onGoCollect}
          >
            <span>Collect &amp; Share</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Full-Screen Zoomable Receipt Image Viewer */}
      {receiptViewerOpen && receiptImageUrl && (
        <div
          className="fullscreen-overlay qr-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Uploaded receipt image"
        >
          <div className="fullscreen-header">
            <div className="fullscreen-header-inner">
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                Receipt Photo
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="qr-nav-btn"
                  style={{ minHeight: 36, padding: '6px 10px', fontSize: '0.8rem' }}
                  onClick={() => {
                    setReceiptPinned(true)
                    setReceiptViewerOpen(false)
                  }}
                >
                  <Pin size={14} />
                  <span>Pin While Editing</span>
                </button>
                <button
                  type="button"
                  id="close-receipt-viewer-btn"
                  className="qr-nav-btn"
                  style={{ minHeight: 36, padding: '6px 10px' }}
                  onClick={() => setReceiptViewerOpen(false)}
                  aria-label="Close receipt viewer"
                >
                  <X size={17} />
                  <span>Done</span>
                </button>
              </div>
            </div>
          </div>

          <div className="receipt-viewer-toolbar">
            <button
              type="button"
              className="qr-nav-btn"
              style={{ minHeight: 36, padding: '6px 12px' }}
              disabled={receiptZoom <= 1}
              onClick={() =>
                setReceiptZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))))
              }
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              className="qr-nav-btn mono"
              style={{ minHeight: 36, padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={() => setReceiptZoom(1)}
            >
              {Math.round(receiptZoom * 100)}%
            </button>
            <button
              type="button"
              className="qr-nav-btn"
              style={{ minHeight: 36, padding: '6px 12px' }}
              disabled={receiptZoom >= 4}
              onClick={() =>
                setReceiptZoom((z) => Math.min(4, Number((z + 0.5).toFixed(2))))
              }
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <ZoomableReceiptImage
            src={receiptImageUrl}
            alt="Cropped and redacted receipt"
            scale={receiptZoom}
            minScale={1}
            maxScale={4}
            onScaleChange={setReceiptZoom}
            className="receipt-fullscreen-viewport"
            showHint
          />
        </div>
      )}
    </div>
  )
}
