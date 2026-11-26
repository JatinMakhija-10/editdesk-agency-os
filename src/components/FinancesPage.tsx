import React, { useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { api, EXPENSE_CATEGORIES, formatINR, formatPct, todayIso } from '../api';
import type { WorkspaceSnapshot } from '../types';

interface FinancesPageProps {
  snapshot: WorkspaceSnapshot;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onRecordPayment: (clientId?: number) => void;
  onRecordPayout: (editorId?: number) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}

export const FinancesPage: React.FC<FinancesPageProps> = ({
  snapshot,
  onRefresh,
  onRecordPayment,
  onRecordPayout,
  onNotify,
}) => {
  const [subtab, setSubtab] = useState<'pnl' | 'receipts' | 'payouts' | 'expenses'>('pnl');
  const [expDate, setExpDate] = useState(todayIso());
  const [expCat, setExpCat] = useState<string>('Software');
  const [expDesc, setExpDesc] = useState('');
  const [expAmt, setExpAmt] = useState('');

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.recordExpense({
        expense_date: expDate,
        category: expCat,
        description: expDesc,
        amount: Number(expAmt),
      });
      onRefresh(res.snapshot);
      setExpDesc('');
      setExpAmt('');
      onNotify('Expense recorded');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    try {
      const res = await api.deleteExpense(id);
      onRefresh(res.snapshot);
      onNotify('Expense removed');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleApplyClientAdvance = async (paymentId: number, orderId: number) => {
    try {
      const res = await api.allocateAdvance(paymentId, { order_id: orderId });
      onRefresh(res.snapshot);
      onNotify('Advance applied');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleApplyEditorAdvance = async (payoutId: number, orderId: number) => {
    try {
      const res = await api.allocateEditorAdvance(payoutId, { order_id: orderId });
      onRefresh(res.snapshot);
      onNotify('Editor advance applied');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#ededed]">
            Finances &amp; P&amp;L
          </h1>
          <p className="mt-1.5 text-[13px] text-[#85858b]">
            Accrual profit, cash receipts, editor payouts, and operating expenses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/export/orders.csv"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
          >
            <Download className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            Export CSV
          </a>
          <a
            href="/api/export/backup.json"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
          >
            <Download className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            JSON backup
          </a>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-1">
        {[
          { id: 'pnl', label: 'Monthly & yearly P&L' },
          { id: 'receipts', label: `Client receipts (${snapshot.payments.length})` },
          { id: 'payouts', label: `Editor payouts (${snapshot.editorPayouts.length})` },
          { id: 'expenses', label: `Expenses (${snapshot.expenses.length})` },
        ].map((t) => {
          const active = subtab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubtab(t.id as any)}
              className={`h-8 rounded-lg px-3 text-xs font-medium ${
                active ? 'bg-[#232325] text-[#ededed]' : 'text-[#85858b] hover:text-[#ededed]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subtab === 'pnl' && (
        <div className="space-y-4">
          {/* Yearly Summary */}
          <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
            <h2 className="mb-4 text-sm font-medium text-[#ededed]">Yearly summary</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-[#ededed]/[0.08] text-xs text-[#85858b]">
                  <tr>
                    <th className="py-2.5 pr-4 font-normal">Year</th>
                    <th className="py-2.5 pr-4 text-right font-normal">Billed</th>
                    <th className="py-2.5 pr-4 text-right font-normal">Editor cost</th>
                    <th className="py-2.5 pr-4 text-right font-normal">Gross profit</th>
                    <th className="py-2.5 pr-4 text-right font-normal">Margin</th>
                    <th className="py-2.5 pr-4 text-right font-normal">Expenses</th>
                    <th className="py-2.5 text-right font-normal">Cash net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ededed]/[0.06] tabular-nums">
                  {snapshot.yearlySummary.map((y) => (
                    <tr key={y.year}>
                      <td className="py-3 pr-4 font-mono text-[#ededed]">
                        {y.year}
                        {y.is_baseline && (
                          <span className="ml-2 text-xs text-[#85858b]">Baseline</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-[#ededed]">
                        {formatINR(y.project_billed)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-[#a1a1a6]">
                        {formatINR(y.editor_cost_committed)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono font-medium text-[#4cc38a]">
                        {formatINR(y.project_profit)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-[#a1a1a6]">
                        {formatPct(y.profit_pct)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-[#85858b]">
                        {formatINR(y.operating_expenses)}
                      </td>
                      <td className="py-3 text-right font-mono text-[#ededed]">
                        {formatINR(y.net_cash_profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Breakdown */}
          <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
            <h2 className="mb-4 text-sm font-medium text-[#ededed]">
              Monthly P&amp;L (project accrual vs cash flow)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-[#ededed]/[0.08] text-xs text-[#85858b]">
                  <tr>
                    <th className="py-2.5 pr-3 font-normal">Month</th>
                    <th className="py-2.5 pr-3 text-right font-normal">Orders</th>
                    <th className="py-2.5 pr-3 text-right font-normal">Billed</th>
                    <th className="py-2.5 pr-3 text-right font-normal">Editor cost</th>
                    <th className="py-2.5 pr-3 text-right font-normal">Profit</th>
                    <th className="py-2.5 pr-3 text-right font-normal">Margin</th>
                    <th className="py-2.5 pr-3 text-right font-normal">Cash in</th>
                    <th className="py-2.5 pr-3 text-right font-normal">Paid editors</th>
                    <th className="py-2.5 text-right font-normal">Expenses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ededed]/[0.06] tabular-nums">
                  {snapshot.monthlySummary.map((m) => (
                    <tr key={m.month} className="hover:bg-[#232325]/50">
                      <td className="py-2.5 pr-3 font-mono text-[#ededed]">{m.month}</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-[#85858b]">
                        {m.order_count}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-[#ededed]">
                        {formatINR(m.project_billed)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-[#a1a1a6]">
                        {formatINR(m.editor_cost_committed)}
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right font-mono font-medium ${
                          m.project_profit < 0 ? 'text-[#e5484d]' : 'text-[#4cc38a]'
                        }`}
                      >
                        {formatINR(m.project_profit)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-[#a1a1a6]">
                        {formatPct(m.profit_pct)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-[#ededed]">
                        {formatINR(m.cash_received)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-[#85858b]">
                        {formatINR(m.cash_paid_editors)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[#85858b]">
                        {formatINR(m.operating_expenses)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subtab === 'receipts' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-[#85858b] tabular-nums">
              Unallocated advances:{' '}
              <span className="font-mono text-[#e5a93c]">
                {formatINR(snapshot.kpis.unallocated_client_advances)}
              </span>
            </div>
            <button
              onClick={() => onRecordPayment()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ededed] px-3.5 text-xs font-medium text-[#0f0f10] hover:bg-white"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Record receipt
            </button>
          </div>

          <div className="space-y-2">
            {snapshot.payments.map((p) => {
              const openClientOrders =
                p.unallocated_amount > 0
                  ? snapshot.orders.filter((o) => o.client_id === p.client_id && o.balance_due > 0)
                  : [];
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[13px] font-medium text-[#ededed]">{p.client_name}</span>
                      <span className="ml-2 text-[#85858b]">
                        {p.payment_date} · {p.method}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-sm font-medium text-[#4cc38a]">
                        {formatINR(p.amount)}
                      </span>
                      {p.unallocated_amount > 0 && (
                        <span className="text-[#e5a93c]">
                          {formatINR(p.unallocated_amount)} unallocated
                        </span>
                      )}
                    </div>
                  </div>
                  {p.allocations.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {p.allocations.map((a) => (
                        <span
                          key={a.id}
                          className="rounded border border-[#ededed]/[0.06] bg-[#141415] px-2 py-1 font-mono text-[11px] text-[#a1a1a6]"
                        >
                          {a.order_code} {formatINR(a.amount)}
                        </span>
                      ))}
                    </div>
                  )}
                  {openClientOrders.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#ededed]/[0.06] pt-2.5">
                      <span className="text-[#a1a1a6]">Apply advance:</span>
                      {openClientOrders.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => handleApplyClientAdvance(p.id, o.id)}
                          className="h-7 rounded bg-[#ededed] px-2.5 text-[11px] font-medium text-[#0f0f10] hover:bg-white"
                        >
                          {o.order_code} ({formatINR(o.balance_due)})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subtab === 'payouts' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-[#85858b] tabular-nums">
              Total paid to editors:{' '}
              <span className="font-mono text-[#ededed]">
                {formatINR(snapshot.kpis.total_editor_paid)}
              </span>
            </div>
            <button
              onClick={() => onRecordPayout()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ededed] px-3.5 text-xs font-medium text-[#0f0f10] hover:bg-white"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Record payout
            </button>
          </div>
          <div className="space-y-2">
            {snapshot.editorPayouts.map((ep) => {
              const openEditorOrders =
                ep.unallocated_amount > 0
                  ? snapshot.orders.filter(
                      (o) =>
                        o.editor_id === ep.editor_id &&
                        o.editor_work_submitted &&
                        o.editor_balance_due > 0
                    )
                  : [];
              return (
                <div
                  key={ep.id}
                  className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-4 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-medium text-[#ededed]">{ep.editor_name}</span>
                      <span className="ml-2 text-[#85858b]">
                        {ep.payout_date} · {ep.method}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-sm font-medium text-[#ededed]">
                        {formatINR(ep.amount)}
                      </span>
                      {ep.unallocated_amount > 0 && (
                        <span className="text-[#e5a93c]">
                          {formatINR(ep.unallocated_amount)} unallocated
                        </span>
                      )}
                    </div>
                  </div>
                  {ep.allocations.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {ep.allocations.map((a) => (
                        <span
                          key={a.id}
                          className="rounded border border-[#ededed]/[0.06] bg-[#141415] px-2 py-1 font-mono text-[11px] text-[#a1a1a6]"
                        >
                          {a.order_code} {formatINR(a.amount)}
                        </span>
                      ))}
                    </div>
                  )}
                  {openEditorOrders.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#ededed]/[0.06] pt-2.5">
                      <span className="text-[#a1a1a6]">Apply advance:</span>
                      {openEditorOrders.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => handleApplyEditorAdvance(ep.id, o.id)}
                          className="h-7 rounded bg-[#ededed] px-2.5 text-[11px] font-medium text-[#0f0f10] hover:bg-white"
                        >
                          {o.order_code} ({formatINR(o.editor_balance_due)})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subtab === 'expenses' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <form
            onSubmit={handleAddExpense}
            className="space-y-3 rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5"
          >
            <h3 className="text-sm font-medium text-[#ededed]">Add operating expense</h3>
            <div>
              <label className="mb-1.5 block text-xs text-[#a1a1a6]">Date</label>
              <input
                type="date"
                required
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-[#a1a1a6]">Category</label>
              <select
                value={expCat}
                onChange={(e) => setExpCat(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-[#a1a1a6]">Description</label>
              <input
                required
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Adobe Creative Cloud"
                className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-[#a1a1a6]">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                required
                value={expAmt}
                onChange={(e) => setExpAmt(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
              />
            </div>
            <button
              type="submit"
              className="h-9 w-full rounded-lg bg-[#ededed] text-[13px] font-medium text-[#0f0f10] hover:bg-white"
            >
              Record expense
            </button>
          </form>

          <div className="space-y-2 lg:col-span-2">
            {snapshot.expenses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#ededed]/[0.08] p-8 text-center text-[13px] text-[#85858b]">
                No operating expenses recorded yet
              </div>
            ) : (
              snapshot.expenses.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-4 text-xs"
                >
                  <div>
                    <div className="text-[13px] font-medium text-[#ededed]">{ex.description}</div>
                    <div className="mt-0.5 text-[#85858b]">
                      {ex.expense_date} · {ex.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium tabular-nums text-[#ededed]">
                      {formatINR(ex.amount)}
                    </span>
                    <button
                      onClick={() => handleDeleteExpense(ex.id)}
                      aria-label="Delete expense"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#85858b] hover:bg-[#232325] hover:text-[#e5484d]"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
