import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  FileSpreadsheet,
  Laptop,
  QrCode,
  RefreshCw,
  Shield,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, formatINR, formatPct, ORDER_CATEGORIES, PRODUCTION_STAGES, todayIso } from '../api';
import type {
  AiProviderMode,
  AiTestResult,
  AutoSuggestions,
  CsvImportPreview,
  MobileInfo,
  Order,
  WorkspaceSnapshot,
} from '../types';
import { spreadsheetFileToCsvText } from '../utils/spreadsheetToCsv';

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
  const [autoSugg, setAutoSugg] = useState<AutoSuggestions | null>(null);

  const matchedClient = useMemo(
    () => snapshot.clients.find((c) => c.name.toLowerCase() === clientName.trim().toLowerCase()),
    [snapshot.clients, clientName]
  );

  useEffect(() => {
    if (existingOrder) return;
    let active = true;
    const timer = setTimeout(() => {
      api
        .getAutoSuggestions({
          clientId: matchedClient?.id ?? null,
          clientName: clientName.trim(),
          category,
          amount: amount ? Number(amount) : null,
        })
        .then((res) => {
          if (active && res.ok) setAutoSugg(res.suggestions);
        })
        .catch(() => {});
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [existingOrder, matchedClient?.id, clientName, category, amount]);

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

          {!existingOrder && autoSugg && (
            <div className="sm:col-span-3 rounded-lg border border-[#e5a93c]/20 bg-[#141415] p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-[#e5a93c]">Smart auto-fill suggestions</span>
                <button
                  type="button"
                  onClick={() => {
                    if (autoSugg.clientRate && !amount) {
                      setAmount(String(autoSugg.clientRate.amount));
                    }
                    if (autoSugg.editor) {
                      setEditorId(String(autoSugg.editor.id));
                      if (autoSugg.editor.suggestedCost != null) {
                        setEditorCost(String(autoSugg.editor.suggestedCost));
                      }
                    }
                    if (autoSugg.deadline?.date && !prodDeadline) {
                      setProdDeadline(autoSugg.deadline.date);
                    }
                    if (autoSugg.paymentDue?.date && !payDueDate) {
                      setPayDueDate(autoSugg.paymentDue.date);
                    }
                  }}
                  className="rounded border border-[#e5a93c]/35 bg-[#e5a93c]/10 px-2 py-0.5 text-[11px] font-medium text-[#e5a93c] hover:bg-[#e5a93c]/20"
                >
                  Auto-fill all
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#a1a1a6]">
                {autoSugg.clientRate && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(autoSugg.clientRate!.amount))}
                    className="rounded border border-[#ededed]/[0.08] bg-[#19191b] px-2 py-1 hover:border-[#e5a93c]/40 hover:text-[#ededed]"
                  >
                    Rate: {formatINR(autoSugg.clientRate.amount)} ({autoSugg.clientRate.reason})
                  </button>
                )}
                {autoSugg.editor && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditorId(String(autoSugg.editor!.id));
                      if (autoSugg.editor!.suggestedCost != null) {
                        setEditorCost(String(autoSugg.editor!.suggestedCost));
                      }
                    }}
                    className="rounded border border-[#ededed]/[0.08] bg-[#19191b] px-2 py-1 hover:border-[#e5a93c]/40 hover:text-[#ededed]"
                  >
                    Editor: {autoSugg.editor.name}
                    {autoSugg.editor.suggestedCost != null
                      ? ` · ${formatINR(autoSugg.editor.suggestedCost)} (${autoSugg.editor.avgCostPct}%)`
                      : ''}
                  </button>
                )}
                {autoSugg.deadline && (
                  <button
                    type="button"
                    onClick={() => setProdDeadline(autoSugg.deadline.date)}
                    className="rounded border border-[#ededed]/[0.08] bg-[#19191b] px-2 py-1 hover:border-[#e5a93c]/40 hover:text-[#ededed]"
                  >
                    Deadline: {autoSugg.deadline.date} ({autoSugg.deadline.days}d)
                  </button>
                )}
              </div>
            </div>
          )}

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

/* 4. Connect iPhone (Published Cloud + LAN + Tailscale PWA) Modal */
export const MobileConnectModal: React.FC<{
  onClose: () => void;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}> = ({ onClose, onRefresh, onNotify }) => {
  const [info, setInfo] = useState<MobileInfo | null>(null);
  const [modeTab, setModeTab] = useState<'cloud' | 'lan'>('cloud');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api
      .getMobileInfo()
      .then((data) => {
        setInfo(data);
        if (!data.cloudUrl && !data.isCloudRuntime) {
          setModeTab('lan');
        }
      })
      .catch((err) => onNotify(err.message, true));
  }, [onNotify]);

  const handlePushCloud = async () => {
    setSyncing(true);
    try {
      const res = await api.syncPushCloud();
      onRefresh(res.snapshot);
      onNotify('Pushed local ledger to cloud');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSyncing(false);
    }
  };

  const handlePullCloud = async () => {
    setSyncing(true);
    try {
      const res = await api.syncPullCloud();
      onRefresh(res.snapshot);
      onNotify('Pulled latest cloud updates');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSyncing(false);
    }
  };

  const activeUrl =
    modeTab === 'cloud' && info?.cloudUrl ? info.cloudUrl : info?.primaryUrl || '';
  const activeQr =
    modeTab === 'cloud' && info?.cloudQr ? info.cloudQr : info?.primaryQr || null;

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
          <div className="py-10 text-center text-xs text-[#85858b]">Detecting connection options</div>
        ) : (
          <div className="mt-4 space-y-4 text-xs">
            <div className="inline-flex gap-1 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-1">
              <button
                onClick={() => setModeTab('cloud')}
                className={`h-8 rounded-md px-3 text-xs font-medium ${
                  modeTab === 'cloud'
                    ? 'bg-[#232325] text-[#ededed]'
                    : 'text-[#85858b] hover:text-[#ededed]'
                }`}
              >
                Anywhere (Cloud Sync)
              </button>
              <button
                onClick={() => setModeTab('lan')}
                className={`h-8 rounded-md px-3 text-xs font-medium ${
                  modeTab === 'lan'
                    ? 'bg-[#232325] text-[#ededed]'
                    : 'text-[#85858b] hover:text-[#ededed]'
                }`}
              >
                Same Wi-Fi (Local)
              </button>
            </div>

            {modeTab === 'cloud' && !info.cloudUrl ? (
              <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-4 text-[#a1a1a6] space-y-2">
                <div className="flex items-center gap-2 font-medium text-[#ededed]">
                  <Cloud className="h-4 w-4 text-[#e5a93c]" strokeWidth={1.5} />
                  Anywhere cloud sync not linked yet
                </div>
                <p>
                  Enter your published EditDesk Cloud URL and PIN in Settings to access and update your ledger from iPhone on 4G/5G even when your PC is off.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col items-center rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-4 text-center">
                  <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-[#ededed]">
                    <QrCode className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
                    {modeTab === 'cloud' ? 'Anywhere iPhone QR code' : 'Local Wi-Fi QR code'}
                  </div>
                  {activeQr && (
                    <img
                      src={activeQr}
                      alt="Scan on iPhone"
                      className="h-40 w-40 rounded-lg bg-white p-1.5"
                    />
                  )}
                  <div className="mt-3 break-all font-mono text-[11px] text-[#a1a1a6]">
                    {activeUrl}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(activeUrl);
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
                      Owner PIN
                    </span>
                    <span className="rounded bg-[#232325] px-2 py-0.5 font-mono text-xs text-[#e5a93c]">
                      {info.pinEnabled || modeTab === 'cloud' ? info.mobilePin : 'Disabled'}
                    </span>
                  </div>

                  <ol className="list-decimal space-y-1.5 pl-4 text-[#a1a1a6] leading-relaxed">
                    <li>
                      {modeTab === 'cloud'
                        ? 'Open the QR link on iPhone over any Wi-Fi or 4G/5G network'
                        : 'Connect iPhone to the same Wi-Fi network as this PC'}
                    </li>
                    <li>Enter your owner PIN once to unlock</li>
                    <li>In Chrome or Safari on iPhone, tap Share → Add to Home Screen</li>
                    <li>Updates sync between iPhone and Desktop</li>
                  </ol>

                  {modeTab === 'cloud' && !info.isCloudRuntime && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        disabled={syncing}
                        onClick={handlePushCloud}
                        className="h-8 rounded-lg bg-[#ededed] px-3 text-xs font-medium text-[#0f0f10] hover:bg-white disabled:opacity-50"
                      >
                        {syncing ? 'Syncing' : 'Push local to cloud'}
                      </button>
                      <button
                        disabled={syncing}
                        onClick={handlePullCloud}
                        className="h-8 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
                      >
                        Pull cloud updates
                      </button>
                    </div>
                  )}

                  {modeTab === 'lan' && (
                    <div className="rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] p-3 text-xs text-[#a1a1a6]">
                      <div className="flex items-center gap-1.5 font-medium text-[#ededed]">
                        <Laptop className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
                        Tailscale private tunnel
                      </div>
                      <div className="mt-1">
                        {info.tailscaleUrl
                          ? `Detected at ${info.tailscaleUrl}`
                          : 'Or use Cloud Sync tab for access even when your PC is powered off'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
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
  onOpenCsvImport: () => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}> = ({ snapshot, onClose, onRefresh, onOpenCsvImport, onNotify }) => {
  const s = snapshot.settings;
  const [agencyName, setAgencyName] = useState(s.agency_name);
  const [pinEnabled, setPinEnabled] = useState(s.pin_enabled);
  const [mobilePin, setMobilePin] = useState(s.mobile_pin);
  const [aiProvider, setAiProvider] = useState<AiProviderMode>(s.ai_provider);
  const [aiModel, setAiModel] = useState(s.ai_model);
  const [groqKey, setGroqKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [aiAutoFulfill, setAiAutoFulfill] = useState(Boolean(s.ai_auto_fulfill));
  const [testingAi, setTestingAi] = useState(false);
  const [testResults, setTestResults] = useState<AiTestResult[] | null>(null);
  const [minimizeToTray, setMinimizeToTray] = useState(s.minimize_to_tray);
  const [cloudUrl, setCloudUrl] = useState(s.cloud_url || '');
  const [cloudPin, setCloudPin] = useState('');
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(Boolean(s.cloud_sync_enabled));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
        groq_api_key: groqKey,
        gemini_api_key: geminiKey,
        openrouter_api_key: openrouterKey,
        openai_api_key: openaiKey,
        ai_auto_fulfill: aiAutoFulfill,
        minimize_to_tray: minimizeToTray,
        cloud_url: cloudUrl.trim().replace(/\/+$/, ''),
        cloud_pin: cloudPin,
        cloud_sync_enabled: cloudSyncEnabled,
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

  const handleTestAi = async () => {
    setTestingAi(true);
    try {
      const overrides: Record<string, string> = {};
      if (groqKey.trim()) overrides.groq_api_key = groqKey.trim();
      if (geminiKey.trim()) overrides.gemini_api_key = geminiKey.trim();
      if (openrouterKey.trim()) overrides.openrouter_api_key = openrouterKey.trim();
      if (openaiKey.trim()) overrides.openai_api_key = openaiKey.trim();
      const res = await api.testAiProviders(overrides);
      setTestResults(res.results);
      const passed = res.results.filter((r) => r.ok).length;
      onNotify(passed > 0 ? `${passed} AI key(s) working` : 'No working cloud key detected yet', passed === 0);
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setTestingAi(false);
    }
  };

  const handlePushSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncPushCloud({
        cloud_url: cloudUrl.trim().replace(/\/+$/, ''),
        cloud_pin: cloudPin || undefined,
      });
      onRefresh(res.snapshot);
      onNotify('Pushed local database to cloud');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSyncing(false);
    }
  };

  const handlePullSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncPullCloud({
        cloud_url: cloudUrl.trim().replace(/\/+$/, ''),
        cloud_pin: cloudPin || undefined,
      });
      onRefresh(res.snapshot);
      onNotify('Pulled latest cloud database');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSyncing(false);
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
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#ededed]">Cloud sync (anywhere iPhone)</span>
              <label className="flex items-center gap-2 text-[#a1a1a6]">
                <input
                  type="checkbox"
                  checked={cloudSyncEnabled}
                  onChange={(e) => setCloudSyncEnabled(e.target.checked)}
                  className="accent-[#e5a93c]"
                />
                Auto-sync
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Published cloud URL</label>
                <input
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  placeholder="https://your-site.netlify.app"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Cloud PIN {s.has_cloud_pin ? '(saved)' : ''}
                </label>
                <input
                  type="password"
                  value={cloudPin}
                  onChange={(e) => setCloudPin(e.target.value)}
                  placeholder={s.has_cloud_pin ? 'Keep existing' : '2026'}
                  className={inputCls}
                />
              </div>
            </div>
            {cloudUrl.trim() && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-[#85858b]">
                  {s.last_cloud_sync
                    ? `Last synced ${new Date(s.last_cloud_sync).toLocaleTimeString('en-IN')}`
                    : 'Not synced yet'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={handlePushSync}
                    className="h-8 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-2.5 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
                  >
                    Push local → cloud
                  </button>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={handlePullSync}
                    className="h-8 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-2.5 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
                  >
                    Pull cloud → local
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2.5 rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-3.5">
            <label className="flex items-center justify-between text-[#ededed]">
              <span>Require PIN on mobile and remote devices</span>
              <input
                type="checkbox"
                checked={pinEnabled}
                onChange={(e) => setPinEnabled(e.target.checked)}
                className="accent-[#e5a93c]"
              />
            </label>
            {pinEnabled && (
              <div>
                <label className={labelCls}>Owner PIN</label>
                <input
                  value={mobilePin}
                  onChange={(e) => setMobilePin(e.target.value)}
                  className="h-9 w-36 rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-3 font-mono text-sm text-[#ededed]"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-[#ededed]">AI automation &amp; free API keys</span>
              <button
                type="button"
                disabled={testingAi}
                onClick={handleTestAi}
                className="h-7 rounded-md border border-[#ededed]/[0.08] bg-[#232325] px-2.5 text-[11px] text-[#ededed] hover:bg-[#2a2a2d] disabled:opacity-50"
              >
                {testingAi ? 'Testing' : 'Test keys'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Routing mode</label>
                <select
                  value={aiProvider}
                  onChange={(e) => {
                    const p = e.target.value as AiProviderMode;
                    setAiProvider(p);
                    if (p === 'groq') setAiModel('llama-3.3-70b-versatile');
                    else if (p === 'gemini') setAiModel('gemini-2.5-flash');
                    else if (p === 'openrouter') setAiModel('meta-llama/llama-3.3-70b-instruct:free');
                    else if (p === 'openai') setAiModel('gpt-4o-mini');
                    else setAiModel('');
                  }}
                  className={inputCls}
                >
                  <option value="auto">Auto (Groq → Gemini → OpenRouter)</option>
                  <option value="groq">Groq (Llama 3.3 — Free)</option>
                  <option value="gemini">Google Gemini (Free)</option>
                  <option value="openrouter">OpenRouter (Free models)</option>
                  <option value="openai">OpenAI API</option>
                  <option value="offline">Offline engine</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Model override (optional)</label>
                <input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="Default per provider"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className={labelCls}>
                  Groq API key {s.has_groq_key ? <span className="text-[#4cc38a]">(active)</span> : '· console.groq.com'}
                </label>
                <input
                  type="password"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder={s.has_groq_key ? 'Keep existing' : 'gsk_... (free)'}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Gemini API key {s.has_gemini_key ? <span className="text-[#4cc38a]">(active)</span> : '· aistudio.google.com'}
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={s.has_gemini_key ? 'Keep existing' : 'AIza... (free)'}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  OpenRouter key {s.has_openrouter_key ? <span className="text-[#4cc38a]">(active)</span> : '· openrouter.ai'}
                </label>
                <input
                  type="password"
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  placeholder={s.has_openrouter_key ? 'Keep existing' : 'sk-or-... (free models)'}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  OpenAI key {s.has_openai_key ? <span className="text-[#4cc38a]">(active)</span> : '(optional)'}
                </label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder={s.has_openai_key ? 'Keep existing' : 'sk-...'}
                  className={inputCls}
                />
              </div>
            </div>

            <label className="flex items-center justify-between pt-1 text-[#ededed]">
              <span>Auto-save clear commands immediately without extra click</span>
              <input
                type="checkbox"
                checked={aiAutoFulfill}
                onChange={(e) => setAiAutoFulfill(e.target.checked)}
                className="accent-[#e5a93c]"
              />
            </label>

            {testResults && (
              <div className="space-y-1 rounded-lg border border-[#ededed]/[0.06] bg-[#19191b] p-2.5 text-[11px]">
                {testResults.map((r) => (
                  <div key={r.provider} className="flex items-center justify-between">
                    <span className="text-[#ededed]">{r.label}</span>
                    {!r.configured ? (
                      <span className="text-[#85858b]">Not set</span>
                    ) : r.ok ? (
                      <span className="font-mono text-[#4cc38a]">OK · {r.ms}ms</span>
                    ) : (
                      <span className="font-mono text-[#e5484d]">{r.error || 'Failed'}</span>
                    )}
                  </div>
                ))}
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCsvImport();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#ededed]"
            >
              <Upload className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
              Import CSV
            </button>
            <button
              type="button"
              onClick={handleResetSeed}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#a1a1a6] hover:text-[#e5484d]"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              Reset sample
            </button>
          </div>
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

/* 6. CSV Spreadsheet Importer Modal */
export const CsvImportModal: React.FC<{
  onClose: () => void;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}> = ({ onClose, onRefresh, onNotify }) => {
  const [csvText, setCsvText] = useState('');
  const [mode, setMode] = useState<'upsert' | 'replace'>('upsert');
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      const text = await spreadsheetFileToCsvText(file);
      setCsvText(text);
      const res = await api.previewCsv(text);
      setPreview(res);
    } catch (err: any) {
      onNotify(err.message || 'Failed to parse spreadsheet', true);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    try {
      const res = await api.previewCsv(csvText);
      setPreview(res);
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    try {
      const res = await api.importCsv(csvText, mode);
      onRefresh(res.snapshot);
      onNotify(
        `Imported ${res.result.inserted} new, ${res.result.updated} updated orders`
      );
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#a1a1a6]" strokeWidth={1.5} />
            <h2 className="text-base font-medium text-[#ededed]">Import spreadsheet (.xlsx / .csv)</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <p className="text-[#a1a1a6]">
            Supports Excel workbooks (.xlsx / .xls) and CSV files — including multi-section spreadsheets (Client Income, Editor Payouts, Yearly). Matching Project IDs update in place without duplicates.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs text-[#ededed] hover:bg-[#2a2a2d]">
              <Upload className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
              Choose .xlsx or .csv
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>

            <div className="inline-flex gap-1 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-0.5">
              <button
                type="button"
                onClick={() => setMode('upsert')}
                className={`h-8 rounded-md px-2.5 text-xs ${
                  mode === 'upsert' ? 'bg-[#232325] text-[#ededed]' : 'text-[#85858b]'
                }`}
              >
                Upsert by Project ID
              </button>
              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`h-8 rounded-md px-2.5 text-xs ${
                  mode === 'replace' ? 'bg-[#232325] text-[#ededed]' : 'text-[#85858b]'
                }`}
              >
                Replace existing orders
              </button>
            </div>
          </div>

          <textarea
            rows={6}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreview(null);
            }}
            placeholder="Paste spreadsheet CSV contents or upload a .csv file"
            className="w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-3 font-mono text-[11px] text-[#ededed] placeholder-[#85858b] focus:border-[#ededed]/25 focus:outline-none"
          />

          {preview && (
            <div className="space-y-2 rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-[#ededed]">
                  Parsed {preview.orderCount} orders ({preview.insertCount} new · {preview.updateCount} update)
                </span>
                <span className="font-mono text-[11px] text-[#85858b]">
                  Sections: {preview.sectionsDetected.join(', ') || 'table'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4 font-mono tabular-nums">
                <div>
                  <div className="text-[11px] text-[#85858b]">Received</div>
                  <div className="text-[#ededed]">{formatINR(preview.totalReceived)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#85858b]">Editor cost</div>
                  <div className="text-[#a1a1a6]">{formatINR(preview.totalEditorCost)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#85858b]">Profit</div>
                  <div className="text-[#4cc38a]">{formatINR(preview.totalProfit)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#85858b]">Margin</div>
                  <div className="text-[#ededed]">{formatPct(preview.marginPct)}</div>
                </div>
              </div>
              {preview.yearlyBaselines.length > 0 && (
                <div className="text-[11px] text-[#e5a93c]">
                  Yearly baselines included:{' '}
                  {preview.yearlyBaselines
                    .map((b) => `${b.year} (${formatINR(b.total_received)} / ${formatINR(b.total_profit)})`)
                    .join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-[#ededed]/[0.08] pt-4">
          <button type="button" onClick={onClose} className={secondaryBtnCls}>
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !csvText.trim()}
            onClick={handlePreview}
            className={secondaryBtnCls}
          >
            Preview
          </button>
          <button
            type="button"
            disabled={loading || !csvText.trim()}
            onClick={handleImport}
            className={primaryBtnCls}
          >
            {loading ? 'Importing' : 'Confirm & import'}
          </button>
        </div>
      </div>
    </div>
  );
};
