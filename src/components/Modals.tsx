import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Laptop,
  QrCode,
  RefreshCw,
  Shield,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { api, formatINR, ORDER_CATEGORIES, PRODUCTION_STAGES, todayIso } from '../api';
import type { MobileInfo, Order, WorkspaceSnapshot } from '../types';

/* 1. Create / Edit Order Modal */
export const OrderModal: React.FC<{
  snapshot: WorkspaceSnapshot;
  existingOrder?: Order | null;
  onClose: () => void;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}> = ({ snapshot, existingOrder, onClose, onRefresh, onNotify }) => {
  const [clientName, setClientName] = useState(existingOrder?.client_name || '');
  const [orderDate, setOrderDate] = useState(existingOrder?.order_date || todayIso());
  const [title, setTitle] = useState(existingOrder?.title || '');
  const [category, setCategory] = useState(existingOrder?.category || 'Shorts');
  const [brief, setBrief] = useState(existingOrder?.brief || '');
  const [billingType, setBillingType] = useState<'one_off' | 'monthly_package'>(
    existingOrder?.billing_type || 'one_off'
  );
  const [servicePeriod, setServicePeriod] = useState(existingOrder?.service_period || '');
  const [amount, setAmount] = useState(
    existingOrder?.amount !== null && existingOrder?.amount !== undefined
      ? String(existingOrder.amount)
      : ''
  );
  const [prodStatus, setProdStatus] = useState<string>(
    existingOrder?.production_status || 'New'
  );
  const [prodDeadline, setProdDeadline] = useState(existingOrder?.production_deadline || '');
  const [payDueDate, setPayDueDate] = useState(existingOrder?.payment_due_date || '');
  const [editorId, setEditorId] = useState<string>(
    existingOrder?.editor_id ? String(existingOrder.editor_id) : ''
  );
  const [editorCost, setEditorCost] = useState(
    existingOrder ? String(existingOrder.editor_cost) : '0'
  );
  const [editorSubmitted, setEditorSubmitted] = useState(
    Boolean(existingOrder?.editor_work_submitted)
  );
  const [notes, setNotes] = useState(existingOrder?.notes || '');
  const [needsReview, setNeedsReview] = useState(Boolean(existingOrder?.needs_review));
  const [saving, setSaving] = useState(false);

  const matchedClient = useMemo(
    () => snapshot.clients.find((c) => c.name.toLowerCase() === clientName.trim().toLowerCase()),
    [snapshot.clients, clientName]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        client_id: matchedClient?.id,
        client_name: clientName.trim(),
        order_date: orderDate,
        title: title.trim() || category,
        category,
        brief,
        billing_type: billingType,
        service_period: servicePeriod,
        amount: amount === '' ? null : Number(amount),
        production_status: existingOrder
          ? prodStatus
          : editorId
          ? prodStatus === 'New' || prodStatus === 'Unassigned'
            ? 'Assigned'
            : prodStatus
          : 'Unassigned',
        production_deadline: prodDeadline || null,
        payment_due_date: payDueDate || null,
        editor_id: editorId ? Number(editorId) : null,
        editor_cost: Number(editorCost || 0),
        editor_work_submitted: editorSubmitted,
        needs_review: existingOrder ? needsReview : false,
        notes,
      };
      const res = existingOrder
        ? await api.updateOrder(existingOrder.id, payload)
        : await api.createOrder(payload);
      onRefresh(res.snapshot);
      onNotify(existingOrder ? `Updated ${existingOrder.order_code}` : 'New order added!');
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingOrder) return;
    try {
      const res = await api.deleteOrder(existingOrder.id);
      onRefresh(res.snapshot);
      onNotify(`Deleted ${existingOrder.order_code}`);
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#10141e] p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              {existingOrder ? `Edit Order ${existingOrder.order_code}` : 'Quick Add New Order'}
            </h2>
            {existingOrder && (
              <p className="text-xs text-zinc-400">
                Payment: {existingOrder.payment_status} (Paid {formatINR(existingOrder.allocated_paid)}, Bal{' '}
                {formatINR(existingOrder.balance_due)})
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
          <div>
            <label className="mb-1 block text-zinc-400">Client Name *</label>
            <input
              required
              list="order-clients-list"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Bloom Care"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500/60 focus:outline-none"
            />
            <datalist id="order-clients-list">
              {snapshot.clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-zinc-400">Video Topic / Deliverable Title *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Skincare Morning Routine Reel"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            >
              {ORDER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">Order Date</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">
              Client Price (₹){' '}
              {matchedClient?.default_rate_shorts && category === 'Shorts' && !amount && (
                <button
                  type="button"
                  onClick={() => setAmount(String(matchedClient.default_rate_shorts))}
                  className="ml-1 text-sky-400 underline"
                >
                  Use ₹{matchedClient.default_rate_shorts}
                </button>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Leave blank if Rate TBD"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">Assign Editor</label>
            <select
              value={editorId}
              onChange={(e) => {
                const val = e.target.value;
                setEditorId(val);
                const ed = snapshot.editors.find((x) => String(x.id) === val);
                if (ed?.is_self) setEditorCost('0');
                else if (ed?.default_rate_shorts && category === 'Shorts' && editorCost === '0') {
                  setEditorCost(String(ed.default_rate_shorts));
                }
              }}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            >
              <option value="">Unassigned</option>
              {snapshot.editors.map((ed) => (
                <option key={ed.id} value={ed.id}>
                  {ed.name} {ed.is_self ? '(Self)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">Editor Cost (₹)</label>
            <input
              type="number"
              step="0.01"
              value={editorCost}
              onChange={(e) => setEditorCost(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">Production Stage</label>
            <select
              value={prodStatus}
              onChange={(e) => setProdStatus(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            >
              {PRODUCTION_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">Billing Type</label>
            <select
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as 'one_off' | 'monthly_package')}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            >
              <option value="one_off">Individual Order</option>
              <option value="monthly_package">Monthly Package</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">Production Deadline</label>
            <input
              type="date"
              value={prodDeadline}
              onChange={(e) => setProdDeadline(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">Invoice Payment Due Date</label>
            <input
              type="date"
              value={payDueDate}
              onChange={(e) => setPayDueDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            />
          </div>

          {billingType === 'monthly_package' && (
            <div className="sm:col-span-3">
              <label className="mb-1 block text-zinc-400">Service Period (e.g. Nov 2026)</label>
              <input
                value={servicePeriod}
                onChange={(e) => setServicePeriod(e.target.value)}
                placeholder="Nov 2026"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
          )}

          <div className="sm:col-span-3">
            <label className="mb-1 block text-zinc-400">Brief / Notes</label>
            <textarea
              rows={2}
              value={brief || notes}
              onChange={(e) => {
                setBrief(e.target.value);
                setNotes(e.target.value);
              }}
              placeholder="Topic instructions, raw footage link, or payment notes..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-white"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editorSubmitted}
              disabled={!editorId}
              onChange={(e) => setEditorSubmitted(e.target.checked)}
            />
            Editor work submitted (unlocks editor payout)
          </label>
          {existingOrder?.needs_review && (
            <label className="flex items-center gap-2 text-sky-300">
              <input
                type="checkbox"
                checked={!needsReview}
                onChange={(e) => setNeedsReview(!e.target.checked)}
              />
              Mark review item resolved
            </label>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/8 pt-4">
          {existingOrder ? (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              {saving ? 'Saving...' : existingOrder ? 'Save Changes' : 'Create Order'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

/* 2. Record Client Lump-Sum Payment Modal */
export const RecordPaymentModal: React.FC<{
  snapshot: WorkspaceSnapshot;
  initialClientId?: number;
  onClose: () => void;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}> = ({ snapshot, initialClientId, onClose, onRefresh, onNotify }) => {
  const defaultClient =
    snapshot.clients.find((c) => c.id === initialClientId) ||
    snapshot.clients.find((c) => c.outstanding_due > 0) ||
    snapshot.clients[0];

  const [clientId, setClientId] = useState<number>(defaultClient?.id || 0);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [method, setMethod] = useState('UPI');
  const [mode, setMode] = useState<'fifo' | 'selected' | 'unallocated'>('fifo');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const openOrders = useMemo(
    () =>
      snapshot.orders
        .filter((o) => o.client_id === clientId && o.balance_due > 0)
        .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.id - b.id),
    [snapshot.orders, clientId]
  );

  // Live allocation preview
  const preview = useMemo(() => {
    const amt = Number(amount || 0);
    if (amt <= 0 || mode === 'unallocated') {
      return { allocated: 0, unallocated: Math.max(0, amt), lines: [] as { code: string; amt: number }[] };
    }
    let rem = amt;
    const lines: { code: string; amt: number }[] = [];
    for (const o of openOrders) {
      if (mode === 'selected' && !selectedIds.includes(o.id)) continue;
      if (rem <= 0) break;
      const take = Math.min(rem, o.balance_due);
      lines.push({ code: o.order_code, amt: Math.round(take * 100) / 100 });
      rem = Math.round((rem - take) * 100) / 100;
    }
    return { allocated: Math.round((amt - rem) * 100) / 100, unallocated: Math.max(0, rem), lines };
  }, [amount, mode, openOrders, selectedIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.recordPayment({
        client_id: clientId,
        payment_date: paymentDate,
        amount: Number(amount),
        method,
        mode,
        selected_order_ids: selectedIds,
        notes,
      });
      onRefresh(res.snapshot);
      onNotify(
        `Recorded ${formatINR(Number(amount))} payment (${
          preview.unallocated > 0 ? `${formatINR(preview.unallocated)} stored as advance` : 'fully allocated'
        })`
      );
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#10141e] p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <h2 className="text-base font-semibold text-white">Record Client Payment</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <div>
            <label className="mb-1 block text-zinc-400">Client *</label>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(Number(e.target.value));
                setSelectedIds([]);
              }}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
            >
              {snapshot.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — Due {formatINR(c.outstanding_due)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-zinc-400">Amount Received (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-zinc-400">Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-zinc-400">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
              >
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-zinc-400">How should this payment be allocated?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'fifo', label: 'Oldest First (FIFO)' },
                { id: 'selected', label: 'Pick Orders' },
                { id: 'unallocated', label: 'Keep as Advance' },
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setMode(m.id as any)}
                  className={`rounded-xl border px-2 py-2 text-[11px] font-medium transition ${
                    mode === m.id
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'selected' && (
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-white/8 bg-zinc-950 p-2.5">
              {openOrders.length === 0 ? (
                <div className="text-zinc-500">No priced unpaid orders for this client.</div>
              ) : (
                openOrders.map((o) => (
                  <label key={o.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(o.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, o.id] : prev.filter((x) => x !== o.id)
                          )
                        }
                      />
                      <span className="font-mono text-emerald-400">{o.order_code}</span>
                      <span className="text-zinc-200">{o.title}</span>
                    </span>
                    <span className="font-mono tabular-nums text-zinc-400">
                      {formatINR(o.balance_due)}
                    </span>
                  </label>
                ))
              )}
            </div>
          )}

          {/* Live Allocation Preview */}
          {Number(amount) > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="font-semibold text-emerald-300">Allocation Preview</div>
              {preview.lines.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {preview.lines.map((l) => (
                    <span key={l.code} className="rounded bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200">
                      {l.code}: {formatINR(l.amt)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-zinc-400">No orders matched; full amount stored as advance.</div>
              )}
              {preview.unallocated > 0 && (
                <div className="mt-1.5 text-[11px] text-sky-300">
                  +{formatINR(preview.unallocated)} will remain as Client Advance Credit
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-zinc-400">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="UTR / GPay note"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-white/8 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            {saving ? 'Saving...' : 'Confirm Payment'}
          </button>
        </div>
      </form>
    </div>
  );
};

/* 3. Record Editor Payout Modal */
export const RecordPayoutModal: React.FC<{
  snapshot: WorkspaceSnapshot;
  initialEditorId?: number;
  onClose: () => void;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}> = ({ snapshot, initialEditorId, onClose, onRefresh, onNotify }) => {
  const defaultEd =
    snapshot.editors.find((e) => e.id === initialEditorId) ||
    snapshot.editors.find((e) => e.payout_due > 0) ||
    snapshot.editors[0];

  const [editorId, setEditorId] = useState<number>(defaultEd?.id || 0);
  const [amount, setAmount] = useState(defaultEd?.payout_due ? String(defaultEd.payout_due) : '');
  const [payoutDate, setPayoutDate] = useState(todayIso());
  const [method, setMethod] = useState('UPI');
  const [mode, setMode] = useState<'fifo' | 'selected'>('fifo');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const submittedOpen = useMemo(
    () =>
      snapshot.orders
        .filter((o) => o.editor_id === editorId && o.editor_work_submitted && o.editor_balance_due > 0)
        .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.id - b.id),
    [snapshot.orders, editorId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.recordEditorPayout({
        editor_id: editorId,
        payout_date: payoutDate,
        amount: Number(amount),
        method,
        mode,
        selected_order_ids: selectedIds,
      });
      onRefresh(res.snapshot);
      onNotify(`Recorded ${formatINR(Number(amount))} editor payout`);
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#10141e] p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <h2 className="text-base font-semibold text-white">Pay Editor (Submitted Work)</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <div>
            <label className="mb-1 block text-zinc-400">Editor *</label>
            <select
              value={editorId}
              onChange={(e) => {
                const nextId = Number(e.target.value);
                setEditorId(nextId);
                const ed = snapshot.editors.find((x) => x.id === nextId);
                setAmount(ed?.payout_due ? String(ed.payout_due) : '');
                setSelectedIds([]);
              }}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
            >
              {snapshot.editors.map((ed) => (
                <option key={ed.id} value={ed.id}>
                  {ed.name} — Due {formatINR(ed.payout_due)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-zinc-400">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-zinc-400">Date</label>
              <input
                type="date"
                value={payoutDate}
                onChange={(e) => setPayoutDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-zinc-400">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
              >
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setMode('fifo')}
              className={`rounded-xl border px-3 py-2 text-[11px] font-medium ${
                mode === 'fifo'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400'
              }`}
            >
              Oldest Submitted First (FIFO)
            </button>
            <button
              type="button"
              onClick={() => setMode('selected')}
              className={`rounded-xl border px-3 py-2 text-[11px] font-medium ${
                mode === 'selected'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400'
              }`}
            >
              Pick Submitted Jobs
            </button>
          </div>

          <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-white/8 bg-zinc-950 p-2.5">
            {submittedOpen.length === 0 ? (
              <div className="text-zinc-500">
                No submitted unpaid jobs for this editor (excess will stay as advance).
              </div>
            ) : (
              submittedOpen.map((o) => (
                <label key={o.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex items-center gap-2">
                    {mode === 'selected' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(o.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, o.id] : prev.filter((x) => x !== o.id)
                          )
                        }
                      />
                    )}
                    <span className="font-mono text-amber-300">{o.order_code}</span>
                    <span className="text-zinc-200">{o.client_name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-zinc-300">
                    {formatINR(o.editor_balance_due)}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-white/8 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
          >
            {saving ? 'Saving...' : 'Confirm Payout'}
          </button>
        </div>
      </form>
    </div>
  );
};

/* 4. Connect iPhone (LAN + Tailscale PWA) Modal */
export const MobileConnectModal: React.FC<{
  onClose: () => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}> = ({ onClose, onNotify }) => {
  const [info, setInfo] = useState<MobileInfo | null>(null);

  useEffect(() => {
    api
      .getMobileInfo()
      .then(setInfo)
      .catch((err) => onNotify(err.message, true));
  }, [onNotify]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#10141e] p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Use on iPhone (Zero Public Website)</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!info ? (
          <div className="py-10 text-center text-xs text-zinc-400">Detecting network address...</div>
        ) : (
          <div className="mt-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col items-center rounded-2xl border border-white/8 bg-zinc-950 p-4 text-center">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                  <QrCode className="h-4 w-4" />
                  Same Wi-Fi QR Code
                </div>
                {info.primaryQr && (
                  <img
                    src={info.primaryQr}
                    alt="Scan on iPhone"
                    className="h-40 w-40 rounded-xl bg-white p-1.5"
                  />
                )}
                <div className="mt-2 break-all font-mono text-[11px] text-zinc-300">
                  {info.primaryUrl}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(info.primaryUrl);
                    onNotify('Copied iPhone URL');
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                >
                  <Copy className="h-3 w-3" />
                  Copy URL
                </button>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/8 bg-zinc-950 p-4">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Shield className="h-4 w-4 text-sky-400" />
                  Owner Mobile PIN:{' '}
                  <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-sky-300">
                    {info.pinEnabled ? info.mobilePin : 'Disabled'}
                  </span>
                </div>

                <ol className="list-decimal space-y-1.5 pl-4 text-zinc-300 leading-relaxed">
                  <li>
                    Connect your iPhone to the <strong>same Wi-Fi</strong> as this Windows PC.
                  </li>
                  <li>
                    Scan the QR code with your iPhone camera and open in <strong>Safari</strong>.
                  </li>
                  <li>
                    Enter your PIN once, then tap <strong>Share → Add to Home Screen</strong>.
                  </li>
                  <li>
                    It installs as a full-screen <strong>EditDesk</strong> iPhone app and syncs live with your Desktop!
                  </li>
                </ol>

                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-2.5 text-[11px] text-sky-200">
                  <div className="font-semibold flex items-center gap-1">
                    <Laptop className="h-3.5 w-3.5" />
                    Access outside home Wi-Fi (still private!)
                  </div>
                  {info.tailscaleUrl ? (
                    <div className="mt-1">
                      Tailscale detected! Use <span className="font-mono">{info.tailscaleUrl}</span> on 4G/5G anywhere.
                    </div>
                  ) : (
                    <div className="mt-1 text-zinc-300">
                      Install free <strong>Tailscale</strong> on Windows + iPhone for a private encrypted tunnel anywhere on 4G/5G — no public website needed.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* 5. Settings Modal */
export const SettingsModal: React.FC<{
  snapshot: WorkspaceSnapshot;
  onClose: () => void;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}> = ({ snapshot, onClose, onRefresh, onNotify }) => {
  const s = snapshot.settings;
  const [agencyName, setAgencyName] = useState(s.agency_name);
  const [pinEnabled, setPinEnabled] = useState(s.pin_enabled);
  const [mobilePin, setMobilePin] = useState(s.mobile_pin);
  const [aiProvider, setAiProvider] = useState<'offline' | 'openai' | 'gemini'>(s.ai_provider);
  const [aiModel, setAiModel] = useState(s.ai_model);
  const [aiKey, setAiKey] = useState('');
  const [minimizeToTray, setMinimizeToTray] = useState(s.minimize_to_tray);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateSettings({
        agency_name: agencyName,
        pin_enabled: pinEnabled,
        mobile_pin: mobilePin,
        ai_provider: aiProvider,
        ai_model: aiModel,
        ai_api_key: aiKey,
        minimize_to_tray: minimizeToTray,
      });
      onRefresh(res.snapshot);
      onNotify('Settings updated');
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleResetSeed = async () => {
    try {
      const res = await api.resetSeed();
      onRefresh(res.snapshot);
      onNotify('Reset to original 2025 & SYN0001–SYN0050 baseline');
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        onSubmit={handleSave}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#10141e] p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <h2 className="text-base font-semibold text-white">Studio, Mobile &amp; AI Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <div>
            <label className="mb-1 block text-zinc-400">Agency Name</label>
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="rounded-xl border border-white/8 bg-zinc-950 p-3 space-y-2">
            <label className="flex items-center justify-between">
              <span className="font-medium text-zinc-200">Require PIN when accessing from iPhone</span>
              <input
                type="checkbox"
                checked={pinEnabled}
                onChange={(e) => setPinEnabled(e.target.checked)}
              />
            </label>
            {pinEnabled && (
              <div>
                <label className="mb-1 block text-zinc-400">Mobile PIN</label>
                <input
                  value={mobilePin}
                  onChange={(e) => setMobilePin(e.target.value)}
                  className="w-36 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-sm text-white"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/8 bg-zinc-950 p-3 space-y-2.5">
            <div className="font-medium text-zinc-200">AI Assistant Engine</div>
            <select
              value={aiProvider}
              onChange={(e) => {
                const p = e.target.value as 'offline' | 'openai' | 'gemini';
                setAiProvider(p);
                if (p === 'openai' && (!aiModel || aiModel.includes('gemini'))) {
                  setAiModel('gpt-4o-mini');
                }
                if (p === 'gemini' && (!aiModel || aiModel.includes('gpt'))) {
                  setAiModel('gemini-2.5-flash');
                }
              }}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
            >
              <option value="offline">Built-in Offline Smart Parser (₹0, zero API key)</option>
              <option value="gemini">Google Gemini API (Best for messy WhatsApp briefs)</option>
              <option value="openai">OpenAI API (gpt-4o-mini)</option>
            </select>

            {aiProvider !== 'offline' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-zinc-400">Model</label>
                  <input
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-zinc-400">
                    API Key {s.has_ai_key ? '(Saved ✓)' : ''}
                  </label>
                  <input
                    type="password"
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                    placeholder={s.has_ai_key ? 'Leave blank to keep existing' : 'Paste key...'}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                  />
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center justify-between rounded-xl border border-white/8 bg-zinc-950 p-3">
            <span className="text-zinc-200">
              Keep Desktop server running in Windows System Tray when closed (keeps iPhone synced!)
            </span>
            <input
              type="checkbox"
              checked={minimizeToTray}
              onChange={(e) => setMinimizeToTray(e.target.checked)}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4">
          <button
            type="button"
            onClick={handleResetSeed}
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:border-rose-500/40 hover:text-rose-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-import Initial CSV
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Save Settings
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
