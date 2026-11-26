import React, { useCallback, useEffect, useState } from 'react';
import {
  Clapperboard,
  Command,
  IndianRupee,
  LayoutGrid,
  Lock,
  Plus,
  Settings,
  Smartphone,
  Terminal,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from './api';
import { AiAssistantPage } from './components/AiAssistantPage';
import { ClientsPage } from './components/ClientsPage';
import { EditorsPage } from './components/EditorsPage';
import { FinancesPage } from './components/FinancesPage';
import {
  CsvImportModal,
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

const SERVICE_DOT_COLORS: Record<string, string> = {
  Shorts: '#f5b841',
  'Video Edit': '#4cc38a',
  'Script Writing': '#5b9cf6',
  'Website Blogs': '#e06c9f',
  'Static Ads': '#f5b841',
  'Instagram Posts': '#9b8afb',
  'Menu Design': '#9b8afb',
  Thumbnails: '#5b9cf6',
  Other: '#85858b',
};

const StudioMark: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <rect x="1.5" y="2.5" width="15" height="13" rx="3" stroke="#ededed" strokeWidth="1.4" />
    <path d="M7.25 6.4L12.1 9L7.25 11.6V6.4Z" fill="#e5a93c" />
  </svg>
);

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
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [quickAiInput, setQuickAiInput] = useState('');
  const [submittedAiPrompt, setSubmittedAiPrompt] = useState('');

  const notify = useCallback((msg: string, isErr = false) => {
    setToast({ msg: msg.replace(/!+$/, ''), isErr });
    setTimeout(() => setToast(null), 3200);
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

  useEffect(() => {
    if (!authorized) return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const refreshSilent = () => {
      if (disposed) return;
      api.getWorkspace().then((s) => {
        if (!disposed) setSnapshot(s);
      }).catch(() => {});
    };

    const connectSse = () => {
      timer = setTimeout(() => {
        if (disposed) return;
        es = new EventSource('/api/events');
        es.onopen = () => setLiveSync(true);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.reason && data.reason !== 'connected') {
              refreshSilent();
            }
          } catch {
            // ignore ping
          }
        };
        es.onerror = () => {
          setLiveSync(false);
          // Serverless/cloud fallback: close SSE retry loop and rely on clean polling
          es?.close();
          es = null;
        };
      }, 150);

      // Periodic sync & app-foreground refresh (handles both published cloud & Desktop cloud sync)
      pollTimer = setInterval(refreshSilent, 10000);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshSilent();
    };

    if (document.readyState === 'complete') {
      connectSse();
    } else {
      window.addEventListener('load', connectSse, { once: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshSilent);

    return () => {
      disposed = true;
      window.removeEventListener('load', connectSse);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshSilent);
      if (timer) clearTimeout(timer);
      if (pollTimer) clearInterval(pollTimer);
      es?.close();
      setLiveSync(false);
    };
  }, [authorized]);

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
        setShowCsvModal(false);
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
      <div className="flex min-h-screen items-center justify-center bg-[#141415] text-[13px] text-[#85858b]">
        Loading EditDesk
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#141415] p-6">
        <form
          onSubmit={handlePinSubmit}
          className="w-full max-w-xs space-y-4 rounded-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-6 text-center"
        >
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#232325] text-[#a1a1a6]">
            <Lock className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-base font-medium text-[#ededed]">Owner unlock</h1>
            <p className="mt-1 text-[13px] text-[#85858b]">
              Enter the mobile PIN shown on desktop
            </p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="••••"
            className="w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] py-2.5 text-center font-mono text-lg tracking-[0.4em] text-[#ededed] focus:border-[#e5a93c]/60 focus:outline-none"
          />
          {pinError && <div className="text-xs text-[#e5484d]">{pinError}</div>}
          <button
            type="submit"
            className="h-10 w-full rounded-lg bg-[#ededed] text-[13px] font-medium text-[#0f0f10] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white active:scale-[0.98]"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#141415] text-[13px] text-[#85858b]">
        Opening ledger
      </div>
    );
  }

  const navItems: { id: Tab; label: string; icon: React.ComponentType<any>; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    {
      id: 'orders',
      label: 'Orders',
      icon: Clapperboard,
      count: snapshot.kpis.active_orders,
    },
    { id: 'clients', label: 'Clients', icon: Users },
    {
      id: 'editors',
      label: 'Editors',
      icon: Wallet,
      count: snapshot.editors.filter((e) => e.payout_due > 0).length || undefined,
    },
    { id: 'finances', label: 'Finances', icon: IndianRupee },
    { id: 'ai', label: 'Command', icon: Terminal },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#141415] text-[#ededed] md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden w-[240px] lg:w-[256px] shrink-0 flex-col justify-between border-r border-[#ededed]/[0.07] bg-[#0f0f10] p-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <div>
          {/* Brand Header */}
          <div className="flex h-9 items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <StudioMark />
              <span className="text-[15px] font-medium tracking-[-0.01em] text-[#ededed]">
                {snapshot.settings.agency_name}
              </span>
            </div>
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-[#85858b]"
              title={liveSync ? 'Live synced across desktop and iPhone' : 'Reconnecting'}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  liveSync ? 'bg-[#4cc38a]' : 'bg-[#e5a93c]'
                }`}
              />
              {liveSync ? 'Live' : 'Sync'}
            </span>
          </div>

          {/* Sidebar Command Search Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const cmd = quickAiInput.trim();
              if (!cmd) return;
              setSubmittedAiPrompt(cmd);
              setTab('ai');
            }}
            className="mt-4 flex h-9 items-center justify-between gap-2 rounded-lg border border-[#ededed]/[0.08] bg-[#161618] px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus-within:border-[#ededed]/20"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Command className="h-3.5 w-3.5 shrink-0 text-[#85858b]" strokeWidth={1.5} />
              <input
                value={quickAiInput}
                onChange={(e) => setQuickAiInput(e.target.value)}
                placeholder="Search or command"
                className="w-full bg-transparent text-[13px] text-[#ededed] placeholder-[#85858b] focus:outline-none"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <kbd className="rounded bg-[#232325] px-1.5 py-0.5 font-mono text-[10px] text-[#85858b]">
                Ctrl
              </kbd>
              <kbd className="rounded bg-[#232325] px-1.5 py-0.5 font-mono text-[10px] text-[#85858b]">
                K
              </kbd>
            </div>
          </form>

          {/* Navigation Group */}
          <div className="mt-6">
            <div className="mb-2 px-2.5 text-xs text-[#85858b]">Navigation</div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-[14px] ${
                      active
                        ? 'studio-nav-active font-medium text-[#ededed]'
                        : 'border border-transparent font-normal text-[#a1a1a6] hover:bg-[#19191b] hover:text-[#ededed]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex w-4 items-center justify-center">
                        <Icon
                          className={`h-4 w-4 ${active ? 'text-[#ededed]' : 'text-[#85858b]'}`}
                          strokeWidth={1.5}
                        />
                      </span>
                      <span>{item.label}</span>
                    </span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="font-mono text-xs tabular-nums text-[#85858b]">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Service Mix Summary Dots (inspired by clean vertical studio rails) */}
          {snapshot.categoryBreakdown.length > 0 && (
            <div className="mt-6 border-t border-[#ededed]/[0.06] pt-5">
              <div className="mb-2 px-2.5 text-xs text-[#85858b]">Services</div>
              <div className="space-y-0.5">
                {snapshot.categoryBreakdown.slice(0, 6).map((cat) => (
                  <button
                    key={cat.category}
                    onClick={() => setTab('orders')}
                    className="flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-[13px] text-[#a1a1a6] hover:bg-[#19191b] hover:text-[#ededed]"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: SERVICE_DOT_COLORS[cat.category] || '#85858b',
                        }}
                      />
                      <span className="truncate">{cat.category}</span>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#85858b]">
                      {cat.orders}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Utility Links */}
        <div className="mt-6 border-t border-[#ededed]/[0.06] pt-3">
          <div className="mb-2 px-2.5 text-xs text-[#85858b]">Device</div>
          <div className="space-y-1">
            <button
              onClick={() => setShowMobileModal(true)}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-[#a1a1a6] hover:bg-[#19191b] hover:text-[#ededed]"
            >
              <span className="flex w-4 items-center justify-center">
                <Smartphone className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
              </span>
              <span>Connect iPhone</span>
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-[#a1a1a6] hover:bg-[#19191b] hover:text-[#ededed]"
            >
              <span className="flex w-4 items-center justify-center">
                <Settings className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
              </span>
              <span>Settings</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="pt-safe sticky top-0 z-30 border-b border-[#ededed]/[0.07] bg-[#141415]/95 px-4 backdrop-blur-md md:px-8">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4">
            {/* Mobile Brand */}
            <div className="flex items-center gap-2 md:hidden">
              <StudioMark />
              <span className="text-[15px] font-medium text-[#ededed]">
                {snapshot.settings.agency_name}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  liveSync ? 'bg-[#4cc38a]' : 'bg-[#e5a93c]'
                }`}
              />
            </div>

            {/* Desktop Quiet Breadcrumb */}
            <div className="hidden items-center gap-2 text-[13px] text-[#a1a1a6] md:flex">
              {(() => {
                const activeItem = navItems.find((n) => n.id === tab);
                const ActiveIcon = activeItem?.icon || LayoutGrid;
                return (
                  <>
                    <ActiveIcon className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
                    <span>{activeItem?.label || 'Overview'}</span>
                  </>
                );
              })()}
            </div>

            {/* Primary Header Action */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMobileModal(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] text-[#a1a1a6] hover:text-[#ededed] md:hidden"
                aria-label="Connect iPhone"
              >
                <Smartphone className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] text-[#a1a1a6] hover:text-[#ededed] md:hidden"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => {
                  setEditingOrder(null);
                  setShowOrderModal(true);
                }}
                aria-label="New order"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ededed] px-3.5 text-[13px] font-medium text-[#0f0f10] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">New order</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page View */}
        <main className="animate-studio-enter mx-auto w-full max-w-[1440px] flex-1 p-4 pb-24 md:p-8 md:pb-12">
          {tab === 'overview' && (
            <OverviewPage
              snapshot={snapshot}
              onRecordPayment={(clientId) => setPaymentModalClient(clientId)}
              onRecordPayout={(editorId) => setPayoutModalEditor(editorId)}
              onOpenOrder={(o) => {
                setEditingOrder(o);
                setShowOrderModal(true);
              }}
              onNavigate={setTab}
              onNotify={notify}
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
              onImportCsv={() => setShowCsvModal(true)}
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
              initialPrompt={submittedAiPrompt}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-[#ededed]/[0.08] bg-[#0f0f10]/95 backdrop-blur-md md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`relative flex flex-col items-center justify-center py-2.5 text-[11px] font-normal ${
                active ? 'text-[#ededed]' : 'text-[#85858b]'
              }`}
            >
              {active && (
                <span className="absolute top-0 h-[2px] w-6 rounded-full bg-[#e5a93c]" />
              )}
              <Icon className="mb-1 h-4 w-4" strokeWidth={1.5} />
              <span>{item.label}</span>
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
        <MobileConnectModal
          onClose={() => setShowMobileModal(false)}
          onRefresh={setSnapshot}
          onNotify={notify}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          snapshot={snapshot}
          onClose={() => setShowSettingsModal(false)}
          onRefresh={setSnapshot}
          onOpenCsvImport={() => setShowCsvModal(true)}
          onNotify={notify}
        />
      )}

      {showCsvModal && (
        <CsvImportModal
          onClose={() => setShowCsvModal(false)}
          onRefresh={setSnapshot}
          onNotify={notify}
        />
      )}

      {/* Quiet Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-lg border border-[#ededed]/[0.1] bg-[#232325] px-3.5 py-2.5 text-xs font-normal text-[#ededed] shadow-lg md:bottom-6">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              toast.isErr ? 'bg-[#e5484d]' : 'bg-[#4cc38a]'
            }`}
          />
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
