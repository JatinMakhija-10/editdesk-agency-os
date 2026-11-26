import React, { useState } from 'react';
import {
  Download,
  IndianRupee,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { api, EXPENSE_CATEGORIES, formatINR, todayIso } from '../api';
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
      onNotify('Operating expense recorded');
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
      onNotify('Unallocated client advance applied');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Finances & P&amp;L</h1>
          <p className="text-xs text-zinc-400">
            Replaces your Income, Editor Payouts, Profit, Monthly &amp; Yearly sheets automatically
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/export/orders.csv"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
          <a
            href="/api/export/backup.json"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" />
            JSON Backup
          </a>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/8 bg-[#10141e] p-1.5">
        {[
          { id: 'pnl', label: 'Monthly & Yearly P&L', icon: TrendingUp },
          { id: 'receipts', label: `Client Receipts (${snapshot.payments.length})`, icon: IndianRupee },
          { id: 'payouts', label: `Editor Payouts (${snapshot.editorPayouts.length})`, icon: Wallet },
          { id: 'expenses', label: `Expenses (${snapshot.expenses.length})`, icon: Receipt },
        ].map((t) => {
          const Icon = t.icon;
          const active = subtab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubtab(t.id as any)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                active ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {subtab === 'pnl' && (
        <div className="space-y-4">
          {/* Yearly Summary */}
          <div className="rounded-2xl border border-white/8 bg-[#10141e] p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Yearly Summary (Includes 2025 Baseline)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-[11px] uppercase text-zinc-400">
                  <tr>
                    <th className="py-2 pr-4">Year</th>
                    <th className="py-2 pr-4 text-right">Billed / Received</th>
                    <th className="py-2 pr-4 text-right">Editor Costs</th>
                    <th className="py-2 pr-4 text-right">Gross Profit</th>
                    <th className="py-2 pr-4 text-right">Margin</th>
                    <th className="py-2 pr-4 text-right">Expenses</th>
                    <th className="py-2 text-right">Cash Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 tabular-nums">
                  {snapshot.yearlySummary.map((y) => (
                    <tr key={y.year}>
                      <td className="py-2.5 pr-4 font-semibold text-white">
                        {y.year}
                        {y.is_baseline && (
                          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-normal text-zinc-400">
                            Baseline
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-zinc-200">
                        {formatINR(y.project_billed)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-amber-300">
                        {formatINR(y.editor_cost_committed)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono font-semibold text-emerald-400">
                        {formatINR(y.project_profit)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-zinc-300">
                        {y.profit_pct}%
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-zinc-400">
                        {formatINR(y.operating_expenses)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-sky-300">
                        {formatINR(y.net_cash_profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Breakdown */}
          <div className="rounded-2xl border border-white/8 bg-[#10141e] p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">
              Monthly P&amp;L (Project Accrual vs Actual Cash Flow)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-[11px] uppercase text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3">Month</th>
                    <th className="py-2 pr-3 text-right">Orders</th>
                    <th className="py-2 pr-3 text-right">Project Billed</th>
                    <th className="py-2 pr-3 text-right">Editor Cost</th>
                    <th className="py-2 pr-3 text-right">Project Profit</th>
                    <th className="py-2 pr-3 text-right">Margin</th>
                    <th className="py-2 pr-3 text-right">Cash In</th>
                    <th className="py-2 pr-3 text-right">Cash Out (Ed)</th>
                    <th className="py-2 text-right">Expenses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 tabular-nums">
                  {snapshot.monthlySummary.map((m) => (
                    <tr key={m.month} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-3 font-mono font-medium text-white">{m.month}</td>
                      <td className="py-2.5 pr-3 text-right text-zinc-400">{m.order_count}</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-zinc-200">
                        {formatINR(m.project_billed)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-amber-300">
                        {formatINR(m.editor_cost_committed)}
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right font-mono font-semibold ${
                          m.project_profit < 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatINR(m.project_profit)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-zinc-300">
                        {m.profit_pct}%
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-emerald-300">
                        {formatINR(m.cash_received)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-zinc-400">
                        {formatINR(m.cash_paid_editors)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-rose-300">
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
            <div className="text-xs text-zinc-400">
              Unallocated Advances:{' '}
              <span className="font-mono text-sky-300">
                {formatINR(snapshot.kpis.unallocated_client_advances)}
              </span>
            </div>
            <button
              onClick={() => onRecordPayment()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Record Receipt
            </button>
          </div>

          <div className="space-y-2">
            {snapshot.payments.map((p) => {
              const openClientOrders =
                p.unallocated_amount > 0
                  ? snapshot.orders.filter((o) => o.client_id === p.client_id && o.balance_due > 0)
                  : [];
              return (
                <div key={p.id} className="rounded-2xl border border-white/8 bg-[#10141e] p-3.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-white">{p.client_name}</span>{' '}
                      <span className="text-zinc-500">
                        · {p.payment_date} · {p.method}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-sm font-semibold text-emerald-400">
                        {formatINR(p.amount)}
                      </span>
                      {p.unallocated_amount > 0 && (
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[11px] text-sky-300">
                          {formatINR(p.unallocated_amount)} unallocated
                        </span>
                      )}
                    </div>
                  </div>
                  {p.allocations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.allocations.map((a) => (
                        <span
                          key={a.id}
                          className="rounded-md border border-white/5 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-300"
                        >
                          <span className="font-mono text-emerald-400">{a.order_code}</span>:{' '}
                          {formatINR(a.amount)}
                        </span>
                      ))}
                    </div>
                  )}
                  {openClientOrders.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
                      <span className="text-[11px] text-sky-300">Apply advance:</span>
                      {openClientOrders.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => handleApplyClientAdvance(p.id, o.id)}
                          className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-500/30"
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
            <div className="text-xs text-zinc-400">
              Total Paid to Editors:{' '}
              <span className="font-mono text-amber-300">{formatINR(snapshot.kpis.total_editor_paid)}</span>
            </div>
            <button
              onClick={() => onRecordPayout()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Record Payout
            </button>
          </div>
          <div className="space-y-2">
            {snapshot.editorPayouts.map((ep) => (
              <div key={ep.id} className="rounded-2xl border border-white/8 bg-[#10141e] p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white">{ep.editor_name}</span>{' '}
                    <span className="text-zinc-500">
                      · {ep.payout_date} · {ep.method}
                    </span>
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-amber-300">
                    {formatINR(ep.amount)}
                  </div>
                </div>
                {ep.allocations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ep.allocations.map((a) => (
                      <span
                        key={a.id}
                        className="rounded-md border border-white/5 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-300"
                      >
                        <span className="font-mono text-amber-300">{a.order_code}</span>:{' '}
                        {formatINR(a.amount)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {subtab === 'expenses' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <form
            onSubmit={handleAddExpense}
            className="space-y-3 rounded-2xl border border-white/8 bg-[#10141e] p-4"
          >
            <h3 className="text-sm font-semibold text-white">Add Operating Expense</h3>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Date</label>
              <input
                type="date"
                required
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Category</label>
              <select
                value={expCat}
                onChange={(e) => setExpCat(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Description *</label>
              <input
                required
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="e.g. Adobe Premiere Pro, Epidemic Sound"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={expAmt}
                onChange={(e) => setExpAmt(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-500 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Record Expense
            </button>
          </form>

          <div className="lg:col-span-2 space-y-2">
            {snapshot.expenses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-500">
                No operating expenses recorded yet (software, gear, marketing, etc.).
              </div>
            ) : (
              snapshot.expenses.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#10141e] p-3.5 text-xs"
                >
                  <div>
                    <div className="font-medium text-white">{ex.description}</div>
                    <div className="text-[11px] text-zinc-500">
                      {ex.expense_date} · {ex.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold tabular-nums text-rose-300">
                      {formatINR(ex.amount)}
                    </span>
                    <button
                      onClick={() => handleDeleteExpense(ex.id)}
                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
