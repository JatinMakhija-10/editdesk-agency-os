import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  Filter,
  Kanban,
  Search,
  Square,
  Table2,
} from 'lucide-react';
import { api, formatINR, formatPct, PRODUCTION_STAGES } from '../api';
import type { Order, ProductionStage, WorkspaceSnapshot } from '../types';

interface OrdersPageProps {
  snapshot: WorkspaceSnapshot;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNewOrder: () => void;
  onOpenOrder: (order: Order) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}

const PAY_DOT: Record<string, string> = {
  Paid: 'bg-[#4cc38a]',
  'Partially paid': 'bg-[#e5a93c]',
  Unpaid: 'bg-[#e5484d]',
  'Rate Pending': 'bg-[#85858b]',
  'Zero / Bundled': 'bg-[#6d6d74]',
};

const STAGE_DOT: Record<string, string> = {
  New: 'bg-[#a1a1a6]',
  Unassigned: 'bg-[#e5484d]',
  Assigned: 'bg-[#a1a1a6]',
  Editing: 'bg-[#e5a93c]',
  'Internal review': 'bg-[#e5a93c]',
  'Client review': 'bg-[#e5a93c]',
  Revisions: 'bg-[#e5484d]',
  Approved: 'bg-[#4cc38a]',
  Delivered: 'bg-[#4cc38a]',
};

export const OrdersPage: React.FC<OrdersPageProps> = ({
  snapshot,
  onRefresh,
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
      onNotify('Assign an editor before marking work submitted', true);
      return;
    }
    try {
      const res = await api.updateOrder(order.id, {
        editor_work_submitted: !order.editor_work_submitted,
      });
      onRefresh(res.snapshot);
      onNotify(
        !order.editor_work_submitted
          ? `${order.order_code} marked submitted`
          : `${order.order_code} unmarked submitted`
      );
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#ededed]">
            Orders
          </h1>
          <p className="mt-1.5 text-[13px] text-[#85858b] tabular-nums">
            Showing {filtered.length} of {snapshot.orders.length} orders · Production and payment states stay independent
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-9 items-center rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${
                viewMode === 'table'
                  ? 'bg-[#232325] text-[#ededed]'
                  : 'text-[#85858b] hover:text-[#ededed]'
              }`}
            >
              <Table2 className="h-4 w-4" strokeWidth={1.5} />
              Table
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${
                viewMode === 'board'
                  ? 'bg-[#232325] text-[#ededed]'
                  : 'text-[#85858b] hover:text-[#ededed]'
              }`}
            >
              <Kanban className="h-4 w-4" strokeWidth={1.5} />
              Board
            </button>
          </div>

          <a
            href="/api/export/orders.csv"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs font-normal text-[#ededed] hover:bg-[#2a2a2d]"
          >
            <Download className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            Export CSV
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#85858b]"
            strokeWidth={1.5}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] pl-9 pr-3 text-[13px] text-[#ededed] placeholder-[#85858b] focus:border-[#ededed]/25 focus:outline-none"
          />
        </div>

        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-xs text-[#ededed] focus:outline-none"
        >
          <option value="all">All clients</option>
          {snapshot.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={editorFilter}
          onChange={(e) => setEditorFilter(e.target.value)}
          className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-xs text-[#ededed] focus:outline-none"
        >
          <option value="all">All editors</option>
          <option value="unassigned">Unassigned</option>
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
            className="h-9 w-1/2 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-2.5 text-xs text-[#ededed] focus:outline-none"
          >
            <option value="all">Any payment</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially paid">Partially paid</option>
            <option value="Rate Pending">Rate pending</option>
            <option value="Paid">Paid</option>
          </select>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-9 w-1/2 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-2.5 text-xs text-[#ededed] focus:outline-none"
          >
            <option value="all">Any stage</option>
            <option value="active">Active</option>
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
          {/* Mobile & Compact Window Stacked Cards (< lg) */}
          <div className="space-y-2 lg:hidden">
            {filtered.map((o) => (
              <div
                key={o.id}
                onClick={() => onOpenOrder(o)}
                className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-4 active:bg-[#232325]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[#85858b]">
                      <span className="font-mono text-[#ededed]">{o.order_code}</span>
                      <span>{o.order_date}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-[#ededed]">
                      {o.client_name} · <span className="font-normal text-[#a1a1a6]">{o.title}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-medium tabular-nums text-[#ededed]">
                      {o.amount === null ? 'TBD' : formatINR(o.amount)}
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[#a1a1a6]">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          PAY_DOT[o.payment_status] || 'bg-[#85858b]'
                        }`}
                      />
                      <span>{o.payment_status}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[#ededed]/[0.06] pt-2.5 text-xs text-[#a1a1a6]">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        STAGE_DOT[o.production_status] || 'bg-[#85858b]'
                      }`}
                    />
                    {o.production_status}
                  </span>
                  <span className="tabular-nums">
                    {o.editor_name || 'Unassigned'}
                    {o.editor_id ? ` · ${formatINR(o.editor_cost)}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (>= lg) */}
          <div className="hidden overflow-x-auto rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] lg:block">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#ededed]/[0.08] bg-[#141415]/60 text-xs font-normal text-[#85858b]">
                <tr>
                  <th className="px-3 py-3 font-normal">Order</th>
                  <th className="px-3 py-3 font-normal">Client &amp; deliverable</th>
                  <th className="px-3 py-3 font-normal">Stage</th>
                  <th className="px-3 py-3 font-normal">Editor</th>
                  <th className="px-2 py-3 text-center font-normal" title="Editor work submitted">
                    Sub
                  </th>
                  <th className="px-3 py-3 text-right font-normal">Amount</th>
                  <th className="px-3 py-3 font-normal">Payment</th>
                  <th className="px-3 py-3 text-right font-normal">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ededed]/[0.06]">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-[#232325]/55">
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <button
                        onClick={() => onOpenOrder(o)}
                        className="font-mono text-xs font-medium text-[#ededed] hover:text-[#e5a93c]"
                      >
                        {o.order_code}
                      </button>
                      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[#85858b]">
                        {o.order_date}
                      </div>
                    </td>

                    <td className="px-3 py-3 align-top">
                      <button onClick={() => onOpenOrder(o)} className="text-left">
                        <div className="font-medium text-[#ededed] hover:underline">
                          {o.client_name}
                          {o.billing_type === 'monthly_package' && (
                            <span className="ml-2 rounded bg-[#232325] px-1.5 py-0.5 font-mono text-[11px] font-normal text-[#a1a1a6]">
                              {o.service_period || 'Package'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#a1a1a6]">
                          {o.title}
                          {o.title.trim().toLowerCase() !== o.category.trim().toLowerCase() && (
                            <span className="text-[#85858b]"> · {o.category}</span>
                          )}
                        </div>
                        {o.production_deadline && (
                          <div className="mt-0.5 font-mono text-[11px] text-[#e5a93c]">
                            Due {o.production_deadline}
                          </div>
                        )}
                      </button>
                    </td>

                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-2 py-1">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            STAGE_DOT[o.production_status] || 'bg-[#85858b]'
                          }`}
                        />
                        <select
                          value={o.production_status}
                          onChange={(e) => handleStageChange(o, e.target.value as ProductionStage)}
                          className="bg-transparent text-xs text-[#ededed] focus:outline-none"
                        >
                          {PRODUCTION_STAGES.map((st) => (
                            <option key={st} value={st} className="bg-[#19191b] text-[#ededed]">
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      {o.editor_name ? (
                        <div>
                          <div className="text-[#ededed]">{o.editor_name}</div>
                          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[#85858b]">
                            {formatINR(o.editor_cost)} ·{' '}
                            <span
                              className={
                                o.editor_payout_status === 'Paid'
                                  ? 'text-[#4cc38a]'
                                  : o.editor_payout_status === 'Unpaid'
                                  ? 'text-[#e5a93c]'
                                  : 'text-[#85858b]'
                              }
                            >
                              {o.editor_payout_status}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => onOpenOrder(o)}
                          className="rounded-md bg-[#232325] px-2 py-1 text-xs text-[#e5484d] hover:bg-[#2a2a2d]"
                        >
                          Assign
                        </button>
                      )}
                    </td>

                    <td className="px-2 py-3 text-center align-top">
                      <button
                        onClick={() => handleToggleSubmitted(o)}
                        title="Toggle editor work submitted"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
                      >
                        {o.editor_work_submitted ? (
                          <CheckSquare className="h-4 w-4 text-[#4cc38a]" strokeWidth={1.5} />
                        ) : (
                          <Square className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
                        )}
                      </button>
                    </td>

                    <td className="px-3 py-3 text-right align-top font-mono tabular-nums whitespace-nowrap">
                      <div className="font-medium text-[#ededed]">
                        {o.amount === null ? 'TBD' : formatINR(o.amount)}
                      </div>
                      {o.allocated_paid > 0 && o.balance_due > 0 && (
                        <div className="mt-0.5 text-[11px] text-[#e5a93c]">
                          Paid {formatINR(o.allocated_paid)}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 text-xs text-[#a1a1a6]">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            PAY_DOT[o.payment_status] || 'bg-[#85858b]'
                          }`}
                        />
                        <span>{o.payment_status}</span>
                      </div>
                      {o.balance_due > 0 && (
                        <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[#e5484d]">
                          Bal {formatINR(o.balance_due)}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right align-top font-mono tabular-nums whitespace-nowrap">
                      <div className={o.profit < 0 ? 'text-[#e5484d]' : 'text-[#4cc38a]'}>
                        {formatINR(o.profit)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#85858b]">
                        {formatPct(o.profit_pct)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-[13px] text-[#85858b]">
                <Filter className="mx-auto mb-2 h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
                No orders match these filters
              </div>
            )}
          </div>
        </>
      ) : (
        /* Production Board */
        <div className="flex gap-3 overflow-x-auto pb-3">
          {PRODUCTION_STAGES.map((stage) => {
            const colOrders = filtered.filter((o) => o.production_status === stage);
            return (
              <div
                key={stage}
                className="w-72 shrink-0 rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-[#ededed]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[stage] || 'bg-[#85858b]'}`}
                    />
                    {stage}
                  </span>
                  <span className="font-mono text-xs text-[#85858b]">{colOrders.length}</span>
                </div>
                <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                  {colOrders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => onOpenOrder(o)}
                      className="cursor-pointer rounded-lg border border-[#ededed]/[0.06] bg-[#141415] p-3 hover:border-[#ededed]/20"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px] text-[#85858b]">
                        <span className="text-[#ededed]">{o.order_code}</span>
                        <span>{o.order_date}</span>
                      </div>
                      <div className="mt-1.5 text-[13px] font-medium text-[#ededed]">
                        {o.client_name}
                      </div>
                      <div className="mt-0.5 text-xs text-[#a1a1a6]">{o.title}</div>
                      <div className="mt-2.5 flex items-center justify-between border-t border-[#ededed]/[0.06] pt-2 text-[11px] text-[#85858b]">
                        <span>{o.editor_name || 'Unassigned'}</span>
                        <span className="font-mono tabular-nums text-[#ededed]">
                          {o.amount === null ? 'TBD' : formatINR(o.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {colOrders.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[#ededed]/[0.08] p-4 text-center text-xs text-[#85858b]">
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
