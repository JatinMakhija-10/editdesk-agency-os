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
      onNotify('Client advance applied');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#ededed]">
            Clients
          </h1>
          <p className="mt-1.5 text-[13px] text-[#85858b] tabular-nums">
            {snapshot.clients.length} clients · Outstanding{' '}
            <span className={snapshot.kpis.total_receivable > 0 ? 'text-[#e5484d]' : 'text-[#a1a1a6]'}>
              {formatINR(snapshot.kpis.total_receivable)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onRecordPayment()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3.5 text-[13px] font-normal text-[#ededed] hover:bg-[#2a2a2d]"
          >
            <IndianRupee className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            Record payment
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
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ededed] px-3.5 text-[13px] font-medium text-[#0f0f10] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white"
          >
            <UserPlus className="h-4 w-4" strokeWidth={1.5} />
            Add client
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#85858b]"
          strokeWidth={1.5}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] pl-9 pr-3 text-[13px] text-[#ededed] placeholder-[#85858b] focus:border-[#ededed]/25 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clients.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelectedClient(c)}
            className="cursor-pointer rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 hover:border-[#ededed]/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-[15px] font-medium text-[#ededed]">{c.name}</h3>
                  {c.active_orders > 0 && (
                    <span className="font-mono text-xs text-[#85858b]">{c.active_orders} open</span>
                  )}
                </div>
                {c.aliases && <p className="mt-0.5 text-xs text-[#85858b]">Aliases: {c.aliases}</p>}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingClient(c);
                }}
                aria-label={`Edit ${c.name}`}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              >
                <Edit3 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-[#ededed]/[0.06] bg-[#141415] p-3 text-xs">
              <div>
                <div className="text-[#85858b]">Billed</div>
                <div className="mt-1 font-mono font-medium tabular-nums text-[#ededed]">
                  {formatINR(c.total_billed)}
                </div>
              </div>
              <div>
                <div className="text-[#85858b]">Received</div>
                <div className="mt-1 font-mono font-medium tabular-nums text-[#4cc38a]">
                  {formatINR(c.total_received)}
                </div>
              </div>
              <div>
                <div className="text-[#85858b]">Due</div>
                <div
                  className={`mt-1 font-mono font-medium tabular-nums ${
                    c.outstanding_due > 0 ? 'text-[#e5484d]' : 'text-[#85858b]'
                  }`}
                >
                  {formatINR(c.outstanding_due)}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap gap-2 font-mono text-[11px] tabular-nums">
                {c.unallocated_advance > 0 && (
                  <span className="text-[#e5a93c]">Advance {formatINR(c.unallocated_advance)}</span>
                )}
                {c.rate_pending_count > 0 && (
                  <span className="text-[#a1a1a6]">{c.rate_pending_count} rate TBD</span>
                )}
              </div>
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleGenerateReminder(c.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-2.5 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
                  Remind
                </button>
                <button
                  onClick={() => onRecordPayment(c.id)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-2.5 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
                >
                  <Plus className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
                  Payment
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Client Detail Modal */}
      {activeClient && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#ededed]/[0.08] pb-4">
              <div>
                <h2 className="text-base font-medium text-[#ededed]">{activeClient.name}</h2>
                <p className="mt-0.5 text-xs text-[#85858b] tabular-nums">
                  {activeClient.order_count} orders · Profit {formatINR(activeClient.profit)} · Shorts hint{' '}
                  {activeClient.default_rate_shorts ? formatINR(activeClient.default_rate_shorts) : 'None'}
                </p>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[#ededed]/[0.06] bg-[#141415] p-3">
                <div className="text-xs text-[#85858b]">Total billed</div>
                <div className="mt-1 font-mono text-base font-medium tabular-nums text-[#ededed]">
                  {formatINR(activeClient.total_billed)}
                </div>
              </div>
              <div className="rounded-lg border border-[#ededed]/[0.06] bg-[#141415] p-3">
                <div className="text-xs text-[#85858b]">Received</div>
                <div className="mt-1 font-mono text-base font-medium tabular-nums text-[#4cc38a]">
                  {formatINR(activeClient.total_received)}
                </div>
              </div>
              <div className="rounded-lg border border-[#ededed]/[0.06] bg-[#141415] p-3">
                <div className="text-xs text-[#85858b]">Outstanding due</div>
                <div className="mt-1 font-mono text-base font-medium tabular-nums text-[#e5484d]">
                  {formatINR(activeClient.outstanding_due)}
                </div>
              </div>
              <div className="rounded-lg border border-[#ededed]/[0.06] bg-[#141415] p-3">
                <div className="text-xs text-[#85858b]">Advance credit</div>
                <div className="mt-1 font-mono text-base font-medium tabular-nums text-[#e5a93c]">
                  {formatINR(activeClient.unallocated_advance)}
                </div>
              </div>
            </div>

            {activeClient.unallocated_advance > 0 && (
              <div className="mt-4 rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-3.5 text-xs">
                <div className="font-medium text-[#e5a93c]">
                  Unallocated advance available ({formatINR(activeClient.unallocated_advance)})
                </div>
                <div className="mt-2 space-y-2">
                  {snapshot.payments
                    .filter((p) => p.client_id === activeClient.id && p.unallocated_amount > 0)
                    .map((p) => {
                      const openOrders = snapshot.orders.filter(
                        (o) => o.client_id === activeClient.id && o.balance_due > 0
                      );
                      return (
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[#a1a1a6]">
                            Receipt {p.payment_date}: {formatINR(p.unallocated_amount)} unallocated
                          </span>
                          {openOrders.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {openOrders.map((o) => (
                                <button
                                  key={o.id}
                                  onClick={() => handleApplyAdvance(p.id, o.id)}
                                  className="h-7 rounded-md bg-[#ededed] px-2.5 text-[11px] font-medium text-[#0f0f10] hover:bg-white"
                                >
                                  Apply to {o.order_code} ({formatINR(o.balance_due)})
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#85858b]">No priced unpaid orders</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#a1a1a6]">Order history</h3>
                <button
                  onClick={() => {
                    setSelectedClient(null);
                    onRecordPayment(activeClient.id);
                  }}
                  className="inline-flex h-8 items-center rounded-lg bg-[#ededed] px-3 text-xs font-medium text-[#0f0f10] hover:bg-white"
                >
                  Record lump-sum payment
                </button>
              </div>
              <div className="max-h-64 divide-y divide-[#ededed]/[0.06] overflow-y-auto rounded-lg border border-[#ededed]/[0.08] bg-[#141415]">
                {snapshot.orders
                  .filter((o) => o.client_id === activeClient.id)
                  .map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSelectedClient(null);
                        onOpenOrder(o);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs hover:bg-[#232325]/60"
                    >
                      <div>
                        <span className="font-mono text-[#ededed]">{o.order_code}</span>{' '}
                        <span className="text-[#85858b]">{o.order_date}</span>{' '}
                        <span className="ml-1 text-[#a1a1a6]">{o.title}</span>
                      </div>
                      <div className="font-mono tabular-nums">
                        <span className="text-[#ededed]">
                          {o.amount === null ? 'TBD' : formatINR(o.amount)}
                        </span>
                        <span className="ml-2 text-[#85858b]">· {o.payment_status}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveClient}
            className="w-full max-w-md space-y-3 rounded-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5"
          >
            <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
              <h2 className="text-base font-medium text-[#ededed]">
                {editingClient.id ? 'Edit client' : 'Add client'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <label className={labelCls}>Canonical name</label>
              <input
                required
                value={editingClient.name || ''}
                onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
              />
            </div>

            <div>
              <label className={labelCls}>Aliases (comma-separated)</label>
              <input
                value={editingClient.aliases || ''}
                onChange={(e) => setEditingClient({ ...editingClient, aliases: e.target.value })}
                placeholder="Nova Fit, Nova Fitness"
                className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Phone</label>
                <input
                  value={editingClient.phone || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                  className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
                />
              </div>
              <div>
                <label className={labelCls}>Default billing</label>
                <select
                  value={editingClient.default_billing_type || 'one_off'}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      default_billing_type: e.target.value as 'one_off' | 'monthly_package',
                    })
                  }
                  className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
                >
                  <option value="one_off">One-off orders</option>
                  <option value="monthly_package">Monthly package</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Shorts rate (₹)</label>
                <input
                  type="number"
                  value={editingClient.default_rate_shorts ?? ''}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      default_rate_shorts: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
                />
              </div>
              <div>
                <label className={labelCls}>Video rate (₹)</label>
                <input
                  type="number"
                  value={editingClient.default_rate_video ?? ''}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      default_rate_video: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#ededed]/[0.08] pt-3">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3.5 text-xs text-[#ededed]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#0f0f10] hover:bg-white"
              >
                Save client
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WhatsApp Reminder Drafter */}
      {reminderBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-3 rounded-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
            <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
              <h2 className="text-base font-medium text-[#ededed]">
                Payment reminder · {reminderBox.name}
              </h2>
              <button
                onClick={() => setReminderBox(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <textarea
              rows={8}
              value={reminderBox.message}
              onChange={(e) => setReminderBox({ ...reminderBox, message: e.target.value })}
              className="w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-3 text-[13px] leading-relaxed text-[#ededed] focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(reminderBox.message);
                  onNotify('Copied reminder message');
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#0f0f10] hover:bg-white"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                Copy message
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const labelCls = 'mb-1.5 block text-xs text-[#a1a1a6]';
