import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  Filter,
  Kanban,
  Plus,
  Search,
  Square,
  Table2,
} from 'lucide-react';
import { api, formatINR, PRODUCTION_STAGES } from '../api';
import type { Order, ProductionStage, WorkspaceSnapshot } from '../types';

interface OrdersPageProps {
  snapshot: WorkspaceSnapshot;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNewOrder: () => void;
  onOpenOrder: (order: Order) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}

const STAGE_STYLE: Record<string, string> = {
  New: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  Unassigned: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  Assigned: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  Editing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'Internal review': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'Client review': 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  Revisions: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  Approved: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  Delivered: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const PAY_STYLE: Record<string, string> = {
  Paid: 'bg-emerald-500/15 text-emerald-300',
  'Partially paid': 'bg-amber-500/15 text-amber-300',
  Unpaid: 'bg-rose-500/15 text-rose-300',
  'Rate Pending': 'bg-sky-500/15 text-sky-300',
  'Zero / Bundled': 'bg-zinc-700/60 text-zinc-300',
};

export const OrdersPage: React.FC<OrdersPageProps> = ({
  snapshot,
  onRefresh,
  onNewOrder,
  onOpenOrder,
  onNotify,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [editorFilter, setEditorFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.orders.filter((o) => {
      if (clientFilter !== 'all' && String(o.client_id) !== clientFilter) return false;
      if (editorFilter === 'unassigned' && o.editor_id !== null) return false;
      if (editorFilter !== 'all' && editorFilter !== 'unassigned' && String(o.editor_id) !== editorFilter)
        return false;
      if (paymentFilter !== 'all' && o.payment_status !== paymentFilter) return false;
      if (stageFilter === 'active' && o.production_status === 'Delivered') return false;
      if (stageFilter !== 'all' && stageFilter !== 'active' && o.production_status !== stageFilter)
        return false;
      if (q) {
        const hay = `${o.order_code} ${o.client_name} ${o.title} ${o.category} ${o.editor_name || ''} ${o.brief} ${o.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [snapshot.orders, search, clientFilter, editorFilter, paymentFilter, stageFilter]);

  const handleStageChange = async (order: Order, nextStage: ProductionStage) => {
    try {
      const res = await api.updateOrder(order.id, { production_status: nextStage });
      onRefresh(res.snapshot);
      onNotify(`${order.order_code} moved to ${nextStage}`);
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleToggleSubmitted = async (order: Order) => {
    if (!order.editor_id) {
      onNotify('Assign an editor first before marking work submitted.', true);
      return;
    }
    try {
      const res = await api.updateOrder(order.id, {
        editor_work_submitted: !order.editor_work_submitted,
      });
      onRefresh(res.snapshot);
      onNotify(
        !order.editor_work_submitted
          ? `${order.order_code}: Editor work marked submitted (payout now eligible)`
          : `${order.order_code}: Editor work unmarked as submitted`
      );
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Orders & Production</h1>
          <p className="text-xs text-zinc-400">
            Showing {filtered.length} of {snapshot.orders.length} orders · Production and Payment states stay independent
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-zinc-900 p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                viewMode === 'table' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                viewMode === 'board' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              Board
            </button>
          </div>

          <a
            href="/api/export/orders.csv"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </a>

          <button
            onClick={onNewOrder}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" />
            New Order
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-white/8 bg-[#10141e] p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SYN code, client, topic, editor..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
          />
        </div>

        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
        >
          <option value="all">All Clients</option>
          {snapshot.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={editorFilter}
          onChange={(e) => setEditorFilter(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
        >
          <option value="all">All Editors</option>
          <option value="unassigned">Unassigned Only</option>
          {snapshot.editors.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {ed.name}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="w-1/2 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
          >
            <option value="all">Any Payment</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially paid">Partially paid</option>
            <option value="Rate Pending">Rate Pending</option>
            <option value="Paid">Paid</option>
          </select>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="w-1/2 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
          >
            <option value="all">Any Stage</option>
            <option value="active">Active (Not Delivered)</option>
            {PRODUCTION_STAGES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {viewMode === 'table' ? (
        <>
          {/* Mobile Cards View (< md) */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map((o) => (
              <div
                key={o.id}
                onClick={() => onOpenOrder(o)}
                className="rounded-2xl border border-white/8 bg-[#10141e] p-3.5 active:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-emerald-400">
                        {o.order_code}
                      </span>
                      <span className="text-xs text-zinc-500">{o.order_date}</span>
                      {o.billing_type === 'monthly_package' && (
                        <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">
                          Pkg
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-white">
                      {o.client_name} · <span className="font-normal text-zinc-300">{o.title}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold tabular-nums text-white">
                      {o.amount === null ? 'Price TBD' : formatINR(o.amount)}
                    </div>
                    <span
                      className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                        PAY_STYLE[o.payment_status] || 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {o.payment_status}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2 text-xs">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] ${
                      STAGE_STYLE[o.production_status] || 'border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {o.production_status}
                  </span>
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span>{o.editor_name || 'Unassigned'}</span>
                    {o.editor_id && (
                      <span className="font-mono tabular-nums text-zinc-300">
                        ({formatINR(o.editor_cost)})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View (>= md) */}
          <div className="hidden overflow-x-auto rounded-2xl border border-white/8 bg-[#10141e] md:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/8 bg-zinc-950/60 text-[11px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-3.5 py-3">Order</th>
                  <th className="px-3.5 py-3">Client & Topic</th>
                  <th className="px-3.5 py-3">Production</th>
                  <th className="px-3.5 py-3">Editor & Cost</th>
                  <th className="px-3.5 py-3 text-center">Submitted</th>
                  <th className="px-3.5 py-3 text-right">Client Amount</th>
                  <th className="px-3.5 py-3">Payment</th>
                  <th className="px-3.5 py-3 text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="transition hover:bg-white/[0.03]"
                  >
                    <td className="px-3.5 py-2.5 align-top">
                      <button
                        onClick={() => onOpenOrder(o)}
                        className="font-mono font-semibold text-emerald-400 hover:underline"
                      >
                        {o.order_code}
                      </button>
                      <div className="text-[11px] tabular-nums text-zinc-500">{o.order_date}</div>
                      {o.needs_review && (
                        <span className="mt-0.5 inline-block rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-300">
                          Review
                        </span>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 align-top">
                      <button onClick={() => onOpenOrder(o)} className="text-left">
                        <div className="font-medium text-white hover:text-emerald-300">
                          {o.client_name}
                          {o.billing_type === 'monthly_package' && (
                            <span className="ml-1.5 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">
                              Package {o.service_period}
                            </span>
                          )}
                        </div>
                        <div className="text-zinc-300">
                          {o.title}{' '}
                          <span className="text-zinc-500">· {o.category}</span>
                        </div>
                        {o.production_deadline && (
                          <div className="mt-0.5 text-[10px] text-amber-300">
                            Prod due: {o.production_deadline}
                          </div>
                        )}
                      </button>
                    </td>

                    <td className="px-3.5 py-2.5 align-top">
                      <select
                        value={o.production_status}
                        onChange={(e) => handleStageChange(o, e.target.value as ProductionStage)}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-medium focus:outline-none ${
                          STAGE_STYLE[o.production_status] || 'border-zinc-700 bg-zinc-900 text-zinc-200'
                        }`}
                      >
                        {PRODUCTION_STAGES.map((st) => (
                          <option key={st} value={st} className="bg-zinc-900 text-zinc-100">
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-3.5 py-2.5 align-top">
                      {o.editor_name ? (
                        <div>
                          <div className="font-medium text-zinc-200">{o.editor_name}</div>
                          <div className="tabular-nums text-[11px] text-zinc-400">
                            {formatINR(o.editor_cost)} ·{' '}
                            <span
                              className={
                                o.editor_payout_status === 'Paid'
                                  ? 'text-emerald-400'
                                  : o.editor_payout_status === 'Unpaid'
                                  ? 'text-amber-300'
                                  : 'text-zinc-500'
                              }
                            >
                              {o.editor_payout_status}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => onOpenOrder(o)}
                          className="rounded-md bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/25"
                        >
                          + Assign Editor
                        </button>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 text-center align-top">
                      <button
                        onClick={() => handleToggleSubmitted(o)}
                        title="Toggle editor work submitted (makes payout eligible)"
                        className="inline-flex items-center justify-center rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        {o.editor_work_submitted ? (
                          <CheckSquare className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Square className="h-4 w-4 text-zinc-600" />
                        )}
                      </button>
                    </td>

                    <td className="px-3.5 py-2.5 text-right align-top font-mono tabular-nums">
                      <div className="font-semibold text-white">{formatINR(o.amount)}</div>
                      {o.allocated_paid > 0 && o.balance_due > 0 && (
                        <div className="text-[10px] text-amber-300">
                          Paid {formatINR(o.allocated_paid)}
                        </div>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 align-top">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          PAY_STYLE[o.payment_status] || 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {o.payment_status}
                      </span>
                      {o.balance_due > 0 && (
                        <div className="mt-0.5 text-[10px] tabular-nums text-rose-300">
                          Bal {formatINR(o.balance_due)}
                        </div>
                      )}
                      {o.payment_due_date && o.balance_due > 0 && (
                        <div className="text-[10px] text-zinc-400">Due {o.payment_due_date}</div>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 text-right align-top font-mono tabular-nums">
                      <span className={o.profit < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                        {formatINR(o.profit)}
                      </span>
                      <div className="text-[10px] text-zinc-500">{o.profit_pct}%</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-zinc-500">
                <Filter className="mx-auto mb-2 h-5 w-5" />
                No orders match these filters.
              </div>
            )}
          </div>
        </>
      ) : (
        /* Production Kanban Board */
        <div className="flex gap-3 overflow-x-auto pb-3">
          {PRODUCTION_STAGES.map((stage) => {
            const colOrders = filtered.filter((o) => o.production_status === stage);
            return (
              <div
                key={stage}
                className="w-72 shrink-0 rounded-2xl border border-white/8 bg-[#10141e] p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${
                      STAGE_STYLE[stage] || 'border-zinc-700 text-zinc-200'
                    }`}
                  >
                    {stage}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">{colOrders.length}</span>
                </div>
                <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                  {colOrders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => onOpenOrder(o)}
                      className="cursor-pointer rounded-xl border border-white/6 bg-zinc-950/80 p-3 transition hover:border-emerald-500/40"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-semibold text-emerald-400">
                          {o.order_code}
                        </span>
                        <span className="text-zinc-500">{o.order_date}</span>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-white">{o.client_name}</div>
                      <div className="mt-0.5 text-xs text-zinc-300">{o.title}</div>
                      <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 text-[11px]">
                        <span className="text-zinc-400">{o.editor_name || 'Unassigned'}</span>
                        <span className="font-mono tabular-nums text-zinc-200">
                          {formatINR(o.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {colOrders.length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-[11px] text-zinc-600">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
