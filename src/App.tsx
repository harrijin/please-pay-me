import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { AssignSplitView } from './components/AssignSplitView'
import { BreakdownView } from './components/BreakdownView'
import { CollectView } from './components/CollectView'
import { Header } from './components/Header'
import { HomeView } from './components/HomeView'
import { PrivacyCropView } from './components/PrivacyCropView'
import { SettingsView } from './components/SettingsView'
import { Toast } from './components/Toast'
import type {
  AppSettings,
  ReceiptSplit,
  ScannedReceiptRaw,
  SharePayload,
} from './types/receipt'
import { generateId } from './utils/format'
import { hasAnyPaymentHandle } from './utils/paymentLinks'
import {
  createBlankReceipt,
  createReceiptFromScan,
  createSampleReceipt,
} from './utils/sampleReceipt'
import { decodeShareHash, SHARE_HASH_PREFIX } from './utils/shareCodec'
import { calculateSplit } from './utils/splitMath'
import {
  deleteRecentSplit,
  loadRecentSplits,
  loadSettings,
  saveSettings,
  upsertRecentSplit,
} from './utils/storage'

type AppRoute = 'home' | 'crop' | 'assign' | 'collect'

function parseInitialHash(): {
  isShareHash: boolean
  payload: SharePayload | null
} {
  if (typeof window === 'undefined') {
    return { isShareHash: false, payload: null }
  }
  const hash = window.location.hash
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return { isShareHash: false, payload: null }
  }
  return {
    isShareHash: true,
    payload: decodeShareHash(hash),
  }
}

export default function App() {
  const [hashState, setHashState] = useState(parseInitialHash)
  const [route, setRoute] = useState<AppRoute>('home')
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [recentSplits, setRecentSplits] = useState<ReceiptSplit[]>(() =>
    loadRecentSplits()
  )
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
  const [activeReceipt, setActiveReceipt] = useState<ReceiptSplit | null>(null)
  const [previewPayload, setPreviewPayload] = useState<SharePayload | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const notify = useCallback((msg: string) => {
    setToastMsg(msg)
  }, [])

  useEffect(() => {
    if (!toastMsg) return
    const timer = window.setTimeout(() => setToastMsg(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toastMsg])

  useEffect(() => {
    const onHashChange = () => {
      setHashState(parseInitialHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const handleSettingsChange = useCallback((next: AppSettings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const handleSaveFriendToSettings = useCallback(
    (name: string, venmo?: string) => {
      setSettings((prev) => {
        if (
          prev.savedFriends.some(
            (sf) => sf.name.toLowerCase() === name.toLowerCase()
          )
        ) {
          return prev
        }
        const next: AppSettings = {
          ...prev,
          savedFriends: [
            ...prev.savedFriends,
            { id: generateId('sf'), name, ...(venmo ? { venmo } : {}) },
          ],
        }
        saveSettings(next)
        return next
      })
    },
    []
  )

  const persistActiveReceipt = useCallback((next: ReceiptSplit) => {
    setActiveReceipt(next)
    const updatedList = upsertRecentSplit(next)
    setRecentSplits(updatedList)
  }, [])

  const handleSelectPhoto = (file: File) => {
    setPendingPhoto(file)
    setRoute('crop')
  }

  const handleScanComplete = (raw: ScannedReceiptRaw) => {
    const receipt = createReceiptFromScan(raw, settings)
    setPendingPhoto(null)
    persistActiveReceipt(receipt)
    setRoute('assign')
    notify(`Scanned ${receipt.items.length} item(s) from ${receipt.merchant}`)
  }

  const handleTrySample = () => {
    const sample = createSampleReceipt(settings)
    persistActiveReceipt(sample)
    setRoute('assign')
    notify('Loaded sample receipt — try editing or collecting!')
  }

  const handleEnterManual = () => {
    const blank = createBlankReceipt(settings)
    setPendingPhoto(null)
    persistActiveReceipt(blank)
    setRoute('assign')
  }

  const handleOpenRecent = (split: ReceiptSplit) => {
    setActiveReceipt(split)
    setRoute('assign')
  }

  const handleDeleteRecent = (id: string) => {
    const next = deleteRecentSplit(id)
    setRecentSplits(next)
    notify('Removed from history')
  }

  const handleTogglePaid = (personId: string) => {
    if (!activeReceipt) return
    const next: ReceiptSplit = {
      ...activeReceipt,
      people: activeReceipt.people.map((p) =>
        p.id === personId ? { ...p, paid: !p.paid } : p
      ),
      updatedAt: Date.now(),
    }
    persistActiveReceipt(next)
  }

  const handleExitShareLink = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`
      )
    }
    setHashState({ isShareHash: false, payload: null })
    setRoute('home')
  }

  const summary = useMemo(
    () => (activeReceipt ? calculateSplit(activeReceipt) : null),
    [activeReceipt]
  )

  // Mode 1: Friend opened a shared #s=<lz-string> breakdown URL
  if (hashState.isShareHash) {
    if (hashState.payload) {
      return (
        <>
          <BreakdownView
            payload={hashState.payload}
            onExit={handleExitShareLink}
            onNotify={notify}
          />
          <Toast message={toastMsg} />
        </>
      )
    }

    return (
      <main className="breakdown-shell" style={{ justifyContent: 'center' }}>
        <div
          className="card"
          style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: 28 }}
        >
          <AlertTriangle
            size={34}
            style={{ color: 'var(--privacy-ink)', marginBottom: 10 }}
          />
          <h1 style={{ margin: '0 0 8px', fontSize: '1.25rem' }}>
            Receipt link looks incomplete
          </h1>
          <p style={{ margin: '0 0 18px', fontSize: '0.9rem', color: 'var(--ink-secondary)' }}>
            This breakdown link may have been cut off when pasted. Ask your
            friend to share the full link or show their QR code again.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={handleExitShareLink}
          >
            <Sparkles size={16} />
            <span>Open PleasePayMe</span>
          </button>
        </div>
      </main>
    )
  }

  // Mode 2: Host previewing a friend's breakdown ticket
  if (previewPayload) {
    return (
      <>
        <BreakdownView
          payload={previewPayload}
          isHostPreview
          onExit={() => setPreviewPayload(null)}
          onNotify={notify}
        />
        <Toast message={toastMsg} />
      </>
    )
  }

  const isConfigured =
    Boolean(settings.geminiApiKey.trim()) && hasAnyPaymentHandle(settings.handles)

  const handleHeaderBack = () => {
    if (route === 'collect') {
      setRoute('assign')
    } else if (route === 'crop') {
      setPendingPhoto(null)
      setRoute('home')
    } else {
      setRoute('home')
    }
  }

  return (
    <div className="app-shell">
      <Header
        showBack={route !== 'home'}
        onBack={handleHeaderBack}
        onHome={() => {
          setPendingPhoto(null)
          setRoute('home')
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        isConfigured={isConfigured}
      />

      <main
        className={`main-container ${route === 'assign' ? 'has-sticky-footer' : ''}`}
      >
        {route === 'home' && (
          <HomeView
            settings={settings}
            recentSplits={recentSplits}
            onSelectPhoto={handleSelectPhoto}
            onTrySample={handleTrySample}
            onEnterManual={handleEnterManual}
            onOpenRecent={handleOpenRecent}
            onDeleteRecent={handleDeleteRecent}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {route === 'crop' && pendingPhoto && (
          <PrivacyCropView
            photoFile={pendingPhoto}
            settings={settings}
            onScanComplete={handleScanComplete}
            onCancel={() => {
              setPendingPhoto(null)
              setRoute('home')
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onManualFallback={handleEnterManual}
          />
        )}

        {route === 'assign' && activeReceipt && summary && (
          <AssignSplitView
            receipt={activeReceipt}
            summary={summary}
            settings={settings}
            onChange={persistActiveReceipt}
            onSaveFriendToSettings={handleSaveFriendToSettings}
            onGoCollect={() => setRoute('collect')}
            onNotify={notify}
          />
        )}

        {route === 'collect' && activeReceipt && summary && (
          <CollectView
            receipt={activeReceipt}
            summary={summary}
            settings={settings}
            onTogglePaid={handleTogglePaid}
            onBackToAssign={() => setRoute('assign')}
            onOpenSettings={() => setSettingsOpen(true)}
            onPreviewBreakdown={(payload) => setPreviewPayload(payload)}
            onNotify={notify}
          />
        )}
      </main>

      {settingsOpen && (
        <SettingsView
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setSettingsOpen(false)}
          onNotify={notify}
        />
      )}

      <Toast message={toastMsg} />
    </div>
  )
}
