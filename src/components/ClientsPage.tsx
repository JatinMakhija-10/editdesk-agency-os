import React, { useState } from 'react';
import {
  Copy,
  Edit3,
  IndianRupee,
  MessageSquare,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { api, formatINR } from '../api';
import type { Client, Order, WorkspaceSnapshot } from '../types';

interface ClientsPageProps {
  snapshot: WorkspaceSnapshot;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onRecordPayment: (clientId?: number) => void;
  onOpenOrder: (order: Order) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}

export const ClientsPage: React.FC<ClientsPageProps> = ({
  snapshot,
  onRefresh,
  onRecordPayment,
  onOpenOrder,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
  const [reminderBox, setReminderBox] = useState<{ name: string; message: string } | null>(null);

  const clients = snapshot.clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${c.name} ${c.aliases} ${c.phone}`.toLowerCase().includes(q);
  });

  const activeClient = selectedClient
    ? snapshot.clients.find((c) => c.id === selectedClient.id) || null
    : null;

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    try {
      const res = await api.saveClient(editingClient);
      onRefresh(res.snapshot);
      setEditingClient(null);
      onNotify('Client saved');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleGenerateReminder = async (clientId: number) => {
    try {
      const res = await api.getClientReminder(clientId);
      setReminderBox({ name: res.client_name, message: res.message });
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleApplyAdvance = async (paymentId: number, orderId: number) => {
    try {
      const res = await api.allocateAdvance(paymentId, { order_id: orderId });
      onRefresh(res.snapshot);
      onNotify('Client advance applied to order');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Clients</h1>
          <p className="text-xs text-zinc-400">
            {snapshot.clients.length} clients · Total outstanding receivables{' '}
            <span className="font-mono text-rose-300">{formatINR(snapshot.kpis.total_receivable)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRecordPayment()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
          >
            <IndianRupee className="h-3.5 w-3.5 text-emerald-400" />
            Record Payment
          </button>
          <button
            onClick={() =>
              setEditingClient({
                name: '',
                aliases: '',
                phone: '',
                email: '',
                default_billing_type: 'one_off',
                notes: '',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Client
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client name or alias..."
          className="w-full rounded-xl border border-zinc-800 bg-[#10141e] py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {clients.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelectedClient(c)}
            className="cursor-pointer rounded-2xl border border-white/8 bg-[#10141e] p-4 transition hover:border-emerald-500/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{c.name}</h3>
                  {c.active_orders > 0 && (
                    <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                      {c.active_orders} open
                    </span>
                  )}
                </div>
                {c.aliases && (
                  <p className="text-[11px] text-zinc-500">Aliases: {c.aliases}</p>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingClient(c);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-zinc-950/70 p-2.5 text-xs">
              <div>
                <div className="text-[10px] text-zinc-500">Billed</div>
                <div className="font-mono font-medium tabular-nums text-zinc-200">
                  {formatINR(c.total_billed)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Received</div>
                <div className="font-mono font-medium tabular-nums text-emerald-400">
                  {formatINR(c.total_received)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Due</div>
                <div
                  className={`font-mono font-semibold tabular-nums ${
                    c.outstanding_due > 0 ? 'text-rose-400' : 'text-zinc-400'
                  }`}
                >
                  {formatINR(c.outstanding_due)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {c.unallocated_advance > 0 && (
                  <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                    Advance {formatINR(c.unallocated_advance)}
                  </span>
                )}
                {c.rate_pending_count > 0 && (
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                    {c.rate_pending_count} rate TBD
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleGenerateReminder(c.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800"
                >
                  <MessageSquare className="h-3 w-3 text-emerald-400" />
                  Remind
                </button>
                <button
                  onClick={() => onRecordPayment(c.id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25"
                >
                  <Plus className="h-3 w-3" />
                  Payment
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Client Detail Modal */}
      {activeClient && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#10141e] p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{activeClient.name} — Ledger</h2>
                <p className="text-xs text-zinc-400">
                  {activeClient.order_count} orders · Profit {formatINR(activeClient.profit)} · Shorts hint:{' '}
                  {activeClient.default_rate_shorts ? formatINR(activeClient.default_rate_shorts) : 'None'}
                </p>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl bg-zinc-950 p-3">
                <div className="text-[11px] text-zinc-500">Total Billed</div>
                <div className="font-mono text-base font-semibold text-white">
                  {formatINR(activeClient.total_billed)}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-950 p-3">
                <div className="text-[11px] text-zinc-500">Received</div>
                <div className="font-mono text-base font-semibold text-emerald-400">
                  {formatINR(activeClient.total_received)}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-950 p-3">
                <div className="text-[11px] text-zinc-500">Outstanding Due</div>
                <div className="font-mono text-base font-semibold text-rose-400">
                  {formatINR(activeClient.outstanding_due)}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-950 p-3">
                <div className="text-[11px] text-zinc-500">Advance Credit</div>
                <div className="font-mono text-base font-semibold text-sky-400">
                  {formatINR(activeClient.unallocated_advance)}
                </div>
              </div>
            </div>

            {/* Unallocated Advance Quick Apply */}
            {activeClient.unallocated_advance > 0 && (
              <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                <div className="text-xs font-semibold text-sky-300">
                  Unallocated Advance Available ({formatINR(activeClient.unallocated_advance)})
                </div>
                <div className="mt-2 space-y-2">
                  {snapshot.payments
                    .filter((p) => p.client_id === activeClient.id && p.unallocated_amount > 0)
                    .map((p) => {
                      const openOrders = snapshot.orders.filter(
                        (o) => o.client_id === activeClient.id && o.balance_due > 0
                      );
                      return (
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-zinc-200">
                            Receipt {p.payment_date}: {formatINR(p.unallocated_amount)} unallocated
                          </span>
                          {openOrders.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {openOrders.map((o) => (
                                <button
                                  key={o.id}
                                  onClick={() => handleApplyAdvance(p.id, o.id)}
                                  className="rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-medium text-zinc-950 hover:bg-sky-400"
                                >
                                  Apply to {o.order_code} ({formatINR(o.balance_due)})
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-zinc-400">No priced unpaid orders yet</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Orders History
                </h3>
                <button
                  onClick={() => {
                    setSelectedClient(null);
                    onRecordPayment(activeClient.id);
                  }}
                  className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  + Record Lump-Sum Payment
                </button>
              </div>
              <div className="max-h-64 divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/8 bg-zinc-950/60">
                {snapshot.orders
                  .filter((o) => o.client_id === activeClient.id)
                  .map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSelectedClient(null);
                        onOpenOrder(o);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs hover:bg-white/[0.03]"
                    >
                      <div>
                        <span className="font-mono font-semibold text-emerald-400">
                          {o.order_code}
                        </span>{' '}
                        <span className="text-zinc-400">({o.order_date})</span>{' '}
                        <span className="text-white">{o.title}</span>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <span className="text-zinc-200">{formatINR(o.amount)}</span>
                        <span className="ml-2 text-[11px] text-zinc-400">· {o.payment_status}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveClient}
            className="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-[#10141e] p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                {editingClient.id ? 'Edit Client' : 'Add Client'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Canonical Name *</label>
              <input
                required
                value={editingClient.name || ''}
                onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                Aliases (comma-separated, helps AI match chats)
              </label>
              <input
                value={editingClient.aliases || ''}
                onChange={(e) => setEditingClient({ ...editingClient, aliases: e.target.value })}
                placeholder="e.g. Nova Fit, Nova Fitness"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Phone / WhatsApp</label>
                <input
                  value={editingClient.phone || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Default Billing</label>
                <select
                  value={editingClient.default_billing_type || 'one_off'}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      default_billing_type: e.target.value as 'one_off' | 'monthly_package',
                    })
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  <option value="one_off">One-off Orders</option>
                  <option value="monthly_package">Monthly Package</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Usual Shorts Rate (₹)</label>
                <input
                  type="number"
                  value={editingClient.default_rate_shorts ?? ''}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      default_rate_shorts: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Usual Video Rate (₹)</label>
                <input
                  type="number"
                  value={editingClient.default_rate_video ?? ''}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      default_rate_video: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Save Client
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WhatsApp Reminder Drafter Modal */}
      {reminderBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-3 rounded-2xl border border-white/10 bg-[#10141e] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                WhatsApp Reminder — {reminderBox.name}
              </h2>
              <button onClick={() => setReminderBox(null)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              rows={8}
              value={reminderBox.message}
              onChange={(e) => setReminderBox({ ...reminderBox, message: e.target.value })}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(reminderBox.message);
                  onNotify('Copied WhatsApp reminder to clipboard!');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Message
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
