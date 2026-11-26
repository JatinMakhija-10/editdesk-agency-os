import React, { useCallback, useEffect, useState } from 'react';
import {
  Clapperboard,
  IndianRupee,
  LayoutDashboard,
  Lock,
  Plus,
  Settings,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from './api';
import { AiAssistantPage } from './components/AiAssistantPage';
import { ClientsPage } from './components/ClientsPage';
import { EditorsPage } from './components/EditorsPage';
import { FinancesPage } from './components/FinancesPage';
import {
  MobileConnectModal,
  OrderModal,
  RecordPaymentModal,
  RecordPayoutModal,
  SettingsModal,
} from './components/Modals';
import { OrdersPage } from './components/OrdersPage';
import { OverviewPage } from './components/OverviewPage';
import type { Order, WorkspaceSnapshot } from './types';

type Tab = 'overview' | 'orders' | 'clients' | 'editors' | 'finances' | 'ai';

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [liveSync, setLiveSync] = useState(false);
  const [toast, setToast] = useState<{ msg: string; isErr?: boolean } | null>(null);

  // Modals
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [paymentModalClient, setPaymentModalClient] = useState<number | undefined | null>(null);
  const [payoutModalEditor, setPayoutModalEditor] = useState<number | undefined | null>(null);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [quickAiInput, setQuickAiInput] = useState('');

  const notify = useCallback((msg: string, isErr = false) => {
    setToast({ msg, isErr });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadWorkspace = useCallback(async () => {
    try {
      const auth = await api.authStatus();
      setAuthorized(auth.authorized);
      setAuthChecked(true);
      if (!auth.authorized) return;
      const snap = await api.getWorkspace();
      setSnapshot(snap);
    } catch (err: any) {
      if (err.pinRequired) {
        setAuthorized(false);
        setAuthChecked(true);
      } else {
        notify(err.message || 'Failed to load workspace', true);
      }
    }
  }, [notify]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Real-time Server-Sent Events sync across Desktop and iPhone (connect after load event)
  useEffect(() => {
    if (!authorized) return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connectSse = () => {
      timer = setTimeout(() => {
        es = new EventSource('/api/events');
        es.onopen = () => setLiveSync(true);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.reason && data.reason !== 'connected') {
              api.getWorkspace().then(setSnapshot).catch(() => {});
            }
          } catch {
            // ignore ping
          }
        };
        es.onerror = () => setLiveSync(false);
      }, 150);
    };

    if (document.readyState === 'complete') {
      connectSse();
    } else {
      window.addEventListener('load', connectSse, { once: true });
    }

    return () => {
      window.removeEventListener('load', connectSse);
      if (timer) clearTimeout(timer);
      es?.close();
      setLiveSync(false);
    };
  }, [authorized]);

  // Global Ctrl+K shortcut for AI Command tab and Escape to close modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setTab('ai');
      } else if (e.key === 'Escape') {
        setShowOrderModal(false);
        setEditingOrder(null);
        setPaymentModalClient(null);
        setPayoutModalEditor(null);
        setShowMobileModal(false);
        setShowSettingsModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    try {
      await api.verifyPin(pinInput);
      setAuthorized(true);
      setPinInput('');
      const snap = await api.getWorkspace();
      setSnapshot(snap);
    } catch (err: any) {
      setPinError(err.message || 'Incorrect PIN');
    }
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090b10] text-sm text-zinc-400">
        Loading EditDesk...
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090b10] p-6">
        <form
          onSubmit={handlePinSubmit}
          className="w-full max-w-xs space-y-4 rounded-3xl border border-white/10 bg-[#10141e] p-6 text-center shadow-2xl"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">EditDesk Owner Unlock</h1>
            <p className="mt-1 text-xs text-zinc-400">
              Enter the mobile PIN shown on your Desktop App
            </p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="••••"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 text-center font-mono text-xl tracking-[0.4em] text-white focus:border-emerald-500 focus:outline-none"
          />
          {pinError && <div className="text-xs text-rose-400">{pinError}</div>}
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Unlock Studio
          </button>
        </form>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090b10] text-sm text-zinc-400">
        Opening agency ledger...
      </div>
    );
  }

  const navItems: { id: Tab; label: string; icon: React.ComponentType<any>; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'orders',
      label: 'Orders',
      icon: Clapperboard,
      badge: snapshot.kpis.active_orders,
    },
    { id: 'clients', label: 'Clients', icon: Users },
    {
      id: 'editors',
      label: 'Editors',
      icon: Wallet,
      badge: snapshot.editors.filter((e) => e.payout_due > 0).length || undefined,
    },
    { id: 'finances', label: 'Finances', icon: IndianRupee },
    { id: 'ai', label: 'AI Bar', icon: Sparkles },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#090b10] text-zinc-100 md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-white/8 bg-[#0c0f17] p-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <div>
          <div className="mb-6 flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5">
              <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-xl" />
              <div>
                <div className="text-sm font-semibold leading-tight text-white">
                  {snapshot.settings.agency_name}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      liveSync ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  {liveSync ? 'Live Synced' : 'Connecting...'}
                </div>
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1.5 border-t border-white/8 pt-3">
          <button
            onClick={() => setShowMobileModal(true)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
          >
            <Smartphone className="h-4 w-4" />
            Connect iPhone
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar (Desktop Quick Command + Mobile Header) */}
        <header className="pt-safe sticky top-0 z-30 border-b border-white/8 bg-[#090b10]/90 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            {/* Mobile Brand */}
            <div className="flex items-center gap-2 md:hidden">
              <img src="/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
              <span className="text-sm font-semibold text-white">
                {snapshot.settings.agency_name}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${
                  liveSync ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
            </div>

            {/* Desktop Instant AI Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickAiInput.trim()) return;
                setTab('ai');
              }}
              className="hidden flex-1 max-w-xl items-center gap-2 rounded-xl border border-white/10 bg-[#10141e] px-3 py-1.5 md:flex"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-sky-400" />
              <input
                value={quickAiInput}
                onChange={(e) => setQuickAiInput(e.target.value)}
                placeholder='Quick AI command (Ctrl+K): "Bloom Care wants a short..." or "Bloom Care sent 5k"'
                className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
            </form>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowMobileModal(true)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-emerald-400 md:hidden"
                title="Connect iPhone"
              >
                <Smartphone className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 md:hidden"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setEditingOrder(null);
                  setShowOrderModal(true);
                }}
                aria-label="New Order"
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Order</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page View */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-24 md:p-6 md:pb-8">
          {tab === 'overview' && (
            <OverviewPage
              snapshot={snapshot}
              onNewOrder={() => {
                setEditingOrder(null);
                setShowOrderModal(true);
              }}
              onRecordPayment={(clientId) => setPaymentModalClient(clientId)}
              onRecordPayout={(editorId) => setPayoutModalEditor(editorId)}
              onOpenOrder={(o) => {
                setEditingOrder(o);
                setShowOrderModal(true);
              }}
              onOpenAi={() => setTab('ai')}
              onNavigate={setTab}
            />
          )}

          {tab === 'orders' && (
            <OrdersPage
              snapshot={snapshot}
              onRefresh={setSnapshot}
              onNewOrder={() => {
                setEditingOrder(null);
                setShowOrderModal(true);
              }}
              onOpenOrder={(o) => {
                setEditingOrder(o);
                setShowOrderModal(true);
              }}
              onNotify={notify}
            />
          )}

          {tab === 'clients' && (
            <ClientsPage
              snapshot={snapshot}
              onRefresh={setSnapshot}
              onRecordPayment={(clientId) => setPaymentModalClient(clientId)}
              onOpenOrder={(o) => {
                setEditingOrder(o);
                setShowOrderModal(true);
              }}
              onNotify={notify}
            />
          )}

          {tab === 'editors' && (
            <EditorsPage
              snapshot={snapshot}
              onRefresh={setSnapshot}
              onRecordPayout={(editorId) => setPayoutModalEditor(editorId)}
              onOpenOrder={(o) => {
                setEditingOrder(o);
                setShowOrderModal(true);
              }}
              onNotify={notify}
            />
          )}

          {tab === 'finances' && (
            <FinancesPage
              snapshot={snapshot}
              onRefresh={setSnapshot}
              onRecordPayment={(clientId) => setPaymentModalClient(clientId)}
              onRecordPayout={(editorId) => setPayoutModalEditor(editorId)}
              onNotify={notify}
            />
          )}

          {tab === 'ai' && (
            <AiAssistantPage
              snapshot={snapshot}
              onRefresh={setSnapshot}
              onNotify={notify}
              initialPrompt={quickAiInput}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (< md) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-white/10 bg-[#0c0f17]/95 backdrop-blur-md md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex flex-col items-center justify-center py-2 text-[10px] font-medium ${
                active ? 'text-emerald-400' : 'text-zinc-400'
              }`}
            >
              <Icon className="mb-0.5 h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      {showOrderModal && (
        <OrderModal
          snapshot={snapshot}
          existingOrder={editingOrder}
          onClose={() => {
            setShowOrderModal(false);
            setEditingOrder(null);
          }}
          onRefresh={setSnapshot}
          onNotify={notify}
        />
      )}

      {paymentModalClient !== null && (
        <RecordPaymentModal
          snapshot={snapshot}
          initialClientId={paymentModalClient}
          onClose={() => setPaymentModalClient(null)}
          onRefresh={setSnapshot}
          onNotify={notify}
        />
      )}

      {payoutModalEditor !== null && (
        <RecordPayoutModal
          snapshot={snapshot}
          initialEditorId={payoutModalEditor}
          onClose={() => setPayoutModalEditor(null)}
          onRefresh={setSnapshot}
          onNotify={notify}
        />
      )}

      {showMobileModal && (
        <MobileConnectModal onClose={() => setShowMobileModal(false)} onNotify={notify} />
      )}

      {showSettingsModal && (
        <SettingsModal
          snapshot={snapshot}
          onClose={() => setShowSettingsModal(false)}
          onRefresh={setSnapshot}
          onNotify={notify}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-20 right-4 z-50 rounded-xl border px-4 py-2.5 text-xs font-medium shadow-xl md:bottom-6 ${
            toast.isErr
              ? 'border-rose-500/40 bg-rose-950/95 text-rose-200'
              : 'border-emerald-500/40 bg-zinc-900/95 text-emerald-300'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
