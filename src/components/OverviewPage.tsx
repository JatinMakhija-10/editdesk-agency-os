import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  IndianRupee,
  Plus,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { formatINR } from '../api';
import type { Order, WorkspaceSnapshot } from '../types';

interface OverviewProps {
  snapshot: WorkspaceSnapshot;
  onNewOrder: () => void;
  onRecordPayment: (clientId?: number) => void;
  onRecordPayout: (editorId?: number) => void;
  onOpenOrder: (order: Order) => void;
  onOpenAi: () => void;
  onNavigate: (tab: 'overview' | 'orders' | 'clients' | 'editors' | 'finances' | 'ai') => void;
}

export const OverviewPage: React.FC<OverviewProps> = ({
  snapshot,
  onNewOrder,
  onRecordPayment,
  onRecordPayout,
  onOpenOrder,
  onOpenAi,
  onNavigate,
}) => {
  const { kpis, attention, editors, categoryBreakdown, recentActivity } = snapshot;

  const editorsWithDues = editors.filter((e) => e.payout_due > 0);
  const totalAlerts =
    attention.unassigned.length +
    attention.needsReview.length +
    attention.overdueProduction.length +
    attention.overdueInvoices.length;

  return (
    <div className="space-y-6">
      {/* Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Studio Overview
          </h1>
          <p className="text-xs text-zinc-400 sm:text-sm">
            {kpis.today} • {kpis.total_orders} orders tracked • {totalAlerts} attention items
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onNewOrder}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-400 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            New Order
          </button>
          <button
            onClick={() => onRecordPayment()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            <IndianRupee className="h-4 w-4 text-emerald-400" />
            Client Payment
          </button>
          <button
            onClick={() => onRecordPayout()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            <Wallet className="h-4 w-4 text-amber-400" />
            Pay Editor
          </button>
          <button
            onClick={onOpenAi}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20"
          >
            <Sparkles className="h-4 w-4" />
            AI Command
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-[#10141e] p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Collected / Billed</span>
            <IndianRupee className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-white sm:text-2xl">
            {formatINR(kpis.total_collected)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400 tabular-nums">
            <span>Billed {formatINR(kpis.total_billed)}</span>
            {kpis.total_receivable > 0 && (
              <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-rose-300">
                Due {formatINR(kpis.total_receivable)}
              </span>
            )}
            {kpis.unallocated_client_advances > 0 && (
              <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-sky-300">
                Adv {formatINR(kpis.unallocated_client_advances)}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#10141e] p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Gross Profit</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums text-emerald-400 sm:text-2xl">
              {formatINR(kpis.gross_project_profit)}
            </span>
            <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium tabular-nums text-emerald-300">
              {kpis.gross_margin_pct}%
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-400 tabular-nums">
            {kpis.total_expenses > 0
              ? `Net after expenses: ${formatINR(kpis.net_profit_after_expenses)}`
              : `This month (${kpis.current_month.month}): ${formatINR(kpis.current_month.project_profit)}`}
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#10141e] p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Editor Payouts Due</span>
            <Wallet className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-amber-300 sm:text-2xl">
            {formatINR(kpis.total_editor_due)}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-400 tabular-nums">
            {editorsWithDues.length > 0
              ? editorsWithDues.map((e) => `${e.name} ${formatINR(e.payout_due)}`).join(' · ')
              : 'All submitted work settled'}
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#10141e] p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Production</span>
            <Users className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-white sm:text-2xl">
            {kpis.active_orders}{' '}
            <span className="text-sm font-normal text-zinc-400">open</span>
          </div>
          <div className="mt-1 text-xs text-zinc-400 tabular-nums">
            {kpis.delivered_orders} delivered · {attention.unassigned.length} unassigned
          </div>
        </div>
      </div>

      {/* Needs Attention Radar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-white/8 bg-[#10141e] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
                Needs Attention
              </h2>
            </div>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              View all orders →
            </button>
          </div>

          <div className="space-y-3">
            {/* Unassigned Jobs */}
            {attention.unassigned.length > 0 && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-rose-300">
                  <span>Unassigned Orders ({attention.unassigned.length})</span>
                  <span>Assign editor so nothing slips</span>
                </div>
                <div className="space-y-1.5">
                  {attention.unassigned.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => onOpenOrder(o)}
                      className="flex w-full items-center justify-between rounded-lg bg-zinc-900/80 px-3 py-2 text-left text-xs transition hover:bg-zinc-800"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-mono font-semibold text-rose-300">{o.order_code}</span>{' '}
                        <span className="font-medium text-white">{o.client_name}</span>{' '}
                        <span className="text-zinc-400">— {o.title}</span>
                      </div>
                      <span className="shrink-0 rounded-md bg-rose-500/20 px-2 py-0.5 text-[11px] font-medium text-rose-200">
                        Assign Editor
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Overdue Production vs Overdue Invoices (Kept Strictly Separate) */}
            {(attention.overdueProduction.length > 0 || attention.upcomingProduction.length > 0) && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-300">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Production Deadlines ({attention.overdueProduction.length} overdue ·{' '}
                    {attention.upcomingProduction.length} due in 3d)
                  </span>
                </div>
                <div className="space-y-1.5">
                  {[...attention.overdueProduction, ...attention.upcomingProduction].slice(0, 5).map((o) => {
                    const isOver = o.production_deadline && o.production_deadline < kpis.today;
                    return (
                      <button
                        key={o.id}
                        onClick={() => onOpenOrder(o)}
                        className="flex w-full items-center justify-between rounded-lg bg-zinc-900/80 px-3 py-2 text-left text-xs hover:bg-zinc-800"
                      >
                        <div className="truncate pr-2">
                          <span className="font-mono text-amber-300">{o.order_code}</span>{' '}
                          <span className="text-white">{o.client_name}</span> — {o.title}
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] tabular-nums ${
                            isOver ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          Due {o.production_deadline}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(attention.overdueInvoices.length > 0 || attention.upcomingInvoices.length > 0) && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-300">
                  <CalendarClock className="h-3.5 w-3.5" />
                  <span>
                    Client Invoice Due Dates ({attention.overdueInvoices.length} overdue ·{' '}
                    {attention.upcomingInvoices.length} due in 7d)
                  </span>
                </div>
                <div className="space-y-1.5">
                  {[...attention.overdueInvoices, ...attention.upcomingInvoices].slice(0, 5).map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between rounded-lg bg-zinc-900/80 px-3 py-2 text-xs"
                    >
                      <button onClick={() => onOpenOrder(o)} className="truncate pr-2 text-left hover:underline">
                        <span className="font-mono text-rose-300">{o.order_code}</span>{' '}
                        <span className="text-white">{o.client_name}</span> — {formatINR(o.balance_due)} due (
                        {o.payment_due_date})
                      </button>
                      <button
                        onClick={() => onRecordPayment(o.client_id)}
                        className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                      >
                        Record Pay
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submitted Editor Work Awaiting Payout */}
            {editorsWithDues.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-zinc-900/60 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-amber-200">
                  <span className="inline-flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-amber-400" />
                    Submitted Editor Work Awaiting Payout
                  </span>
                  <span className="tabular-nums">{formatINR(kpis.total_editor_due)} total</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editorsWithDues.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onRecordPayout(e.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20"
                    >
                      <span>{e.name}</span>
                      <span className="font-mono tabular-nums text-amber-300">{formatINR(e.payout_due)}</span>
                      <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px]">Pay</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Needs Review / Rate Pending Items */}
            {attention.needsReview.length > 0 && (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-sky-300">
                  <span>Rate Pending or Flagged for Review ({attention.needsReview.length})</span>
                  <span className="text-zinc-400">Tap to price or mark reviewed</span>
                </div>
                <div className="space-y-1.5">
                  {attention.needsReview.slice(0, 6).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => onOpenOrder(o)}
                      className="flex w-full items-center justify-between rounded-lg bg-zinc-900/80 px-3 py-2 text-left text-xs hover:bg-zinc-800"
                    >
                      <div className="min-w-0 truncate pr-2">
                        <span className="font-mono text-sky-300">{o.order_code}</span>{' '}
                        <span className="font-medium text-white">{o.client_name}</span> —{' '}
                        <span className="text-zinc-400">{o.notes || o.title}</span>
                      </div>
                      <span className="shrink-0 rounded-md bg-sky-500/20 px-2 py-0.5 text-[11px] tabular-nums text-sky-200">
                        {o.amount === null ? 'Set Rate' : formatINR(o.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {totalAlerts === 0 && editorsWithDues.length === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
                Everything is clean — no unassigned jobs, overdue items, or pending editor payouts.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Service Margins + Recent Activity */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/8 bg-[#10141e] p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-200">
              Profit by Service
            </h2>
            <div className="space-y-2.5">
              {categoryBreakdown.map((c) => (
                <div key={c.category} className="rounded-xl bg-zinc-900/70 px-3 py-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-white">
                      {c.category}{' '}
                      <span className="text-zinc-500">({c.orders})</span>
                    </span>
                    <span className="font-mono tabular-nums text-emerald-400">
                      {formatINR(c.profit)}{' '}
                      <span className="text-zinc-400">({c.profit_pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-500/80"
                      style={{ width: `${Math.max(4, Math.min(100, c.profit_pct))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#10141e] p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-200">
              Recent Activity
            </h2>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {recentActivity.slice(0, 12).map((act) => (
                <div
                  key={act.id}
                  className="border-l-2 border-zinc-700 pl-3 py-0.5 text-xs text-zinc-300"
                >
                  <div>{act.summary}</div>
                  <div className="text-[10px] text-zinc-500">
                    {new Date(act.created_at).toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
