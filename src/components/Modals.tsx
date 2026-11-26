import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
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

const inputCls =
  'h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed] placeholder-[#85858b] focus:border-[#ededed]/25 focus:outline-none';
const labelCls = 'mb-1.5 block text-xs text-[#a1a1a6]';
const primaryBtnCls =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#ededed] px-4 text-[13px] font-medium text-[#0f0f10] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white active:scale-[0.98] disabled:opacity-50';
const secondaryBtnCls =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3.5 text-[13px] font-normal text-[#ededed] hover:bg-[#2a2a2d] active:scale-[0.98]';

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
      onNotify(existingOrder ? `Updated ${existingOrder.order_code}` : 'Order added');
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
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
          <div>
            <h2 className="text-base font-medium text-[#ededed]">
              {existingOrder ? `Edit ${existingOrder.order_code}` : 'New order'}
            </h2>
            {existingOrder && (
              <p className="mt-0.5 text-xs text-[#85858b] tabular-nums">
                {existingOrder.payment_status} · Paid {formatINR(existingOrder.allocated_paid)} · Balance{' '}
                {formatINR(existingOrder.balance_due)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Client</label>
            <input
              required
              list="order-clients-list"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Bloom Care"
              className={inputCls}
            />
            <datalist id="order-clients-list">
              {snapshot.clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Topic or deliverable</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Morning routine reel"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              {ORDER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Order date</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              Client price (₹)
              {matchedClient?.default_rate_shorts && category === 'Shorts' && !amount && (
                <button
                  type="button"
                  onClick={() => setAmount(String(matchedClient.default_rate_shorts))}
                  className="ml-2 text-[#e5a93c] hover:underline"
                >
                  Use {formatINR(matchedClient.default_rate_shorts)}
                </button>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Leave blank if TBD"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Assigned editor</label>
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
              className={inputCls}
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
            <label className={labelCls}>Editor cost (₹)</label>
            <input
              type="number"
              step="0.01"
              value={editorCost}
              onChange={(e) => setEditorCost(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Production stage</label>
            <select
              value={prodStatus}
              onChange={(e) => setProdStatus(e.target.value)}
              className={inputCls}
            >
              {PRODUCTION_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Billing type</label>
            <select
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as 'one_off' | 'monthly_package')}
              className={inputCls}
            >
              <option value="one_off">Individual order</option>
              <option value="monthly_package">Monthly package</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Production deadline</label>
            <input
              type="date"
              value={prodDeadline}
              onChange={(e) => setProdDeadline(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Payment due date</label>
            <input
              type="date"
              value={payDueDate}
              onChange={(e) => setPayDueDate(e.target.value)}
              className={inputCls}
            />
          </div>

          {billingType === 'monthly_package' && (
            <div className="sm:col-span-3">
              <label className={labelCls}>Service period</label>
              <input
                value={servicePeriod}
                onChange={(e) => setServicePeriod(e.target.value)}
                placeholder="Nov 2026"
                className={inputCls}
              />
            </div>
          )}

          <div className="sm:col-span-3">
            <label className={labelCls}>Brief and notes</label>
            <textarea
              rows={2}
              value={brief || notes}
              onChange={(e) => {
                setBrief(e.target.value);
                setNotes(e.target.value);
              }}
              placeholder="Deliverable details or raw footage link"
              className="w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-3 text-[13px] text-[#ededed] placeholder-[#85858b] focus:border-[#ededed]/25 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#a1a1a6]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editorSubmitted}
              disabled={!editorId}
              onChange={(e) => setEditorSubmitted(e.target.checked)}
              className="accent-[#e5a93c]"
            />
            Editor work submitted (unlocks payout)
          </label>
          {existingOrder?.needs_review && (
            <label className="flex items-center gap-2 text-[#ededed]">
              <input
                type="checkbox"
                checked={!needsReview}
                onChange={(e) => setNeedsReview(!e.target.checked)}
                className="accent-[#e5a93c]"
              />
              Mark review resolved
            </label>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-[#ededed]/[0.08] pt-4">
          {existingOrder ? (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#e5484d] hover:bg-[#2a2a2d]"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              Delete
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryBtnCls}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryBtnCls}>
              {saving ? 'Saving' : existingOrder ? 'Save changes' : 'Create order'}
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
        `Recorded ${formatINR(Number(amount))} (${
          preview.unallocated > 0 ? `${formatINR(preview.unallocated)} unallocated advance` : 'allocated'
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
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
          <h2 className="text-base font-medium text-[#ededed]">Record client payment</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Client</label>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(Number(e.target.value));
                setSelectedIds([]);
              }}
              className={inputCls}
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
              <label className={labelCls}>Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={inputCls}
              >
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank transfer</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Allocation mode</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'fifo', label: 'Oldest first' },
                { id: 'selected', label: 'Pick orders' },
                { id: 'unallocated', label: 'Hold advance' },
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setMode(m.id as any)}
                  className={`h-9 rounded-lg border px-2 text-xs font-medium ${
                    mode === m.id
                      ? 'border-[#e5a93c]/50 bg-[#232325] text-[#ededed]'
                      : 'border-[#ededed]/[0.08] bg-[#141415] text-[#85858b] hover:text-[#ededed]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'selected' && (
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-3 text-xs">
              {openOrders.length === 0 ? (
                <div className="text-[#85858b]">No priced unpaid orders for this client</div>
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
                        className="accent-[#e5a93c]"
                      />
                      <span className="font-mono text-[#a1a1a6]">{o.order_code}</span>
                      <span className="text-[#ededed]">{o.title}</span>
                    </span>
                    <span className="font-mono tabular-nums text-[#a1a1a6]">
                      {formatINR(o.balance_due)}
                    </span>
                  </label>
                ))
              )}
            </div>
          )}

          {Number(amount) > 0 && (
            <div className="rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-3 text-xs">
              <div className="font-medium text-[#ededed]">Allocation preview</div>
              {preview.lines.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {preview.lines.map((l) => (
                    <span
                      key={l.code}
                      className="rounded bg-[#232325] px-2 py-1 font-mono text-[11px] tabular-nums text-[#ededed]"
                    >
                      {l.code} {formatINR(l.amt)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-[#85858b]">
                  No open orders matched — stored as client advance
                </div>
              )}
              {preview.unallocated > 0 && (
                <div className="mt-2 text-[11px] tabular-nums text-[#e5a93c]">
                  {formatINR(preview.unallocated)} remains as unallocated advance
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="UTR or payment reference"
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-[#ededed]/[0.08] pt-4">
          <button type="button" onClick={onClose} className={secondaryBtnCls}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryBtnCls}>
            {saving ? 'Saving' : 'Confirm payment'}
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
      onNotify(`Recorded ${formatINR(Number(amount))} payout`);
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
          <h2 className="text-base font-medium text-[#ededed]">Pay editor</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Editor</label>
            <select
              value={editorId}
              onChange={(e) => {
                const nextId = Number(e.target.value);
                setEditorId(nextId);
                const ed = snapshot.editors.find((x) => x.id === nextId);
                setAmount(ed?.payout_due ? String(ed.payout_due) : '');
                setSelectedIds([]);
              }}
              className={inputCls}
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
              <label className={labelCls}>Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                value={payoutDate}
                onChange={(e) => setPayoutDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={inputCls}
              >
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank transfer</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setMode('fifo')}
              className={`h-9 rounded-lg border px-3 text-xs font-medium ${
                mode === 'fifo'
                  ? 'border-[#e5a93c]/50 bg-[#232325] text-[#ededed]'
                  : 'border-[#ededed]/[0.08] bg-[#141415] text-[#85858b]'
              }`}
            >
              Oldest submitted first
            </button>
            <button
              type="button"
              onClick={() => setMode('selected')}
              className={`h-9 rounded-lg border px-3 text-xs font-medium ${
                mode === 'selected'
                  ? 'border-[#e5a93c]/50 bg-[#232325] text-[#ededed]'
                  : 'border-[#ededed]/[0.08] bg-[#141415] text-[#85858b]'
              }`}
            >
              Pick submitted jobs
            </button>
          </div>

          <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-3 text-xs">
            {submittedOpen.length === 0 ? (
              <div className="text-[#85858b]">
                No submitted unpaid jobs for this editor
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
                        className="accent-[#e5a93c]"
                      />
                    )}
                    <span className="font-mono text-[#a1a1a6]">{o.order_code}</span>
                    <span className="text-[#ededed]">{o.client_name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[#a1a1a6]">
                    {formatINR(o.editor_balance_due)}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-[#ededed]/[0.08] pt-4">
          <button type="button" onClick={onClose} className={secondaryBtnCls}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryBtnCls}>
            {saving ? 'Saving' : 'Confirm payout'}
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
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-[#a1a1a6]" strokeWidth={1.5} />
            <h2 className="text-base font-medium text-[#ededed]">Connect iPhone</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {!info ? (
          <div className="py-10 text-center text-xs text-[#85858b]">Detecting network address</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
            <div className="flex flex-col items-center rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-4 text-center">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-[#ededed]">
                <QrCode className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
                Local Wi-Fi QR code
              </div>
              {info.primaryQr && (
                <img
                  src={info.primaryQr}
                  alt="Scan on iPhone"
                  className="h-40 w-40 rounded-lg bg-white p-1.5"
                />
              )}
              <div className="mt-3 break-all font-mono text-[11px] text-[#a1a1a6]">
                {info.primaryUrl}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(info.primaryUrl);
                  onNotify('Copied iPhone URL');
                }}
                className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
              >
                <Copy className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
                Copy URL
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-4">
              <div className="flex items-center justify-between text-[#ededed]">
                <span className="flex items-center gap-1.5 font-medium">
                  <Shield className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
                  Mobile PIN
                </span>
                <span className="rounded bg-[#232325] px-2 py-0.5 font-mono text-xs text-[#e5a93c]">
                  {info.pinEnabled ? info.mobilePin : 'Disabled'}
                </span>
              </div>

              <ol className="list-decimal space-y-1.5 pl-4 text-[#a1a1a6] leading-relaxed">
                <li>Connect iPhone to the same Wi-Fi network as this PC</li>
                <li>Scan the QR code and open the link in Safari</li>
                <li>Enter the PIN once, then tap Share → Add to Home Screen</li>
                <li>Changes sync immediately between iPhone and desktop</li>
              </ol>

              <div className="rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] p-3 text-xs text-[#a1a1a6]">
                <div className="flex items-center gap-1.5 font-medium text-[#ededed]">
                  <Laptop className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
                  Remote access on 4G/5G
                </div>
                {info.tailscaleUrl ? (
                  <div className="mt-1">
                    Tailscale active at <span className="font-mono text-[#ededed]">{info.tailscaleUrl}</span>
                  </div>
                ) : (
                  <div className="mt-1">
                    Install Tailscale on Windows and iPhone for private access outside home Wi-Fi without a public website
                  </div>
                )}
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
      onNotify('Settings saved');
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
      onNotify('Sample workspace restored');
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        onSubmit={handleSave}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
          <h2 className="text-base font-medium text-[#ededed]">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <div>
            <label className={labelCls}>Agency name</label>
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="space-y-2.5 rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-3.5">
            <label className="flex items-center justify-between text-[#ededed]">
              <span>Require PIN on mobile and LAN devices</span>
              <input
                type="checkbox"
                checked={pinEnabled}
                onChange={(e) => setPinEnabled(e.target.checked)}
                className="accent-[#e5a93c]"
              />
            </label>
            {pinEnabled && (
              <div>
                <label className={labelCls}>Mobile PIN</label>
                <input
                  value={mobilePin}
                  onChange={(e) => setMobilePin(e.target.value)}
                  className="h-9 w-36 rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-3 font-mono text-sm text-[#ededed]"
                />
              </div>
            )}
          </div>

          <div className="space-y-2.5 rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-3.5">
            <div className="font-medium text-[#ededed]">Command parser engine</div>
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
              className={inputCls}
            >
              <option value="offline">Built-in offline parser (no API key)</option>
              <option value="gemini">Google Gemini API</option>
              <option value="openai">OpenAI API</option>
            </select>

            {aiProvider !== 'offline' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Model</label>
                  <input
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    API key {s.has_ai_key ? '(saved)' : ''}
                  </label>
                  <input
                    type="password"
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                    placeholder={s.has_ai_key ? 'Keep existing' : 'Paste key'}
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center justify-between rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-3.5 text-[#ededed]">
            <span>Minimize desktop window to system tray on close</span>
            <input
              type="checkbox"
              checked={minimizeToTray}
              onChange={(e) => setMinimizeToTray(e.target.checked)}
              className="accent-[#e5a93c]"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#ededed]/[0.08] pt-4">
          <button
            type="button"
            onClick={handleResetSeed}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#a1a1a6] hover:text-[#e5484d]"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Reset sample data
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryBtnCls}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryBtnCls}>
              <Check className="h-4 w-4" strokeWidth={1.75} />
              Save settings
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
