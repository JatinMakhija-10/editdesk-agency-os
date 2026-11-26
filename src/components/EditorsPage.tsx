import React, { useState } from 'react';
import { CheckCircle2, Edit3, Plus, UserCheck, Wallet, X } from 'lucide-react';
import { api, formatINR } from '../api';
import type { Editor, Order, WorkspaceSnapshot } from '../types';

interface EditorsPageProps {
  snapshot: WorkspaceSnapshot;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onRecordPayout: (editorId?: number) => void;
  onOpenOrder: (order: Order) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}

export const EditorsPage: React.FC<EditorsPageProps> = ({
  snapshot,
  onRefresh,
  onRecordPayout,
  onOpenOrder,
  onNotify,
}) => {
  const [editingEditor, setEditingEditor] = useState<Partial<Editor> | null>(null);
  const [selectedEditor, setSelectedEditor] = useState<Editor | null>(null);

  const activeEditor = selectedEditor
    ? snapshot.editors.find((e) => e.id === selectedEditor.id) || null
    : null;

  const handleSaveEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEditor) return;
    try {
      const res = await api.saveEditor(editingEditor);
      onRefresh(res.snapshot);
      setEditingEditor(null);
      onNotify('Editor saved');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Editors & Payouts</h1>
          <p className="text-xs text-zinc-400">
            Payout becomes payable only after you mark an editor&apos;s work submitted · Total due{' '}
            <span className="font-mono text-amber-300">{formatINR(snapshot.kpis.total_editor_due)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRecordPayout()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
          >
            <Wallet className="h-3.5 w-3.5 text-amber-400" />
            Pay Editor
          </button>
          <button
            onClick={() =>
              setEditingEditor({
                name: '',
                phone: '',
                specialty: 'Editing & Production',
                is_self: false,
                notes: '',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Editor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.editors.map((ed) => (
          <div
            key={ed.id}
            onClick={() => setSelectedEditor(ed)}
            className="cursor-pointer rounded-2xl border border-white/8 bg-[#10141e] p-4 transition hover:border-amber-500/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{ed.name}</h3>
                  {ed.is_self && (
                    <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      Owner (₹0)
                    </span>
                  )}
                  {ed.active_assignments > 0 && (
                    <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">
                      {ed.active_assignments} active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500">{ed.specialty || 'Editing'}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingEditor(ed);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-zinc-950/70 p-2.5 text-xs">
              <div>
                <div className="text-[10px] text-zinc-500">Submitted</div>
                <div className="font-mono font-medium tabular-nums text-zinc-200">
                  {formatINR(ed.submitted_payable)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Paid</div>
                <div className="font-mono font-medium tabular-nums text-emerald-400">
                  {formatINR(ed.total_paid)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Due Now</div>
                <div
                  className={`font-mono font-semibold tabular-nums ${
                    ed.payout_due > 0 ? 'text-amber-300' : 'text-zinc-400'
                  }`}
                >
                  {formatINR(ed.payout_due)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
              <span className="text-zinc-500">
                {ed.order_count} total jobs · {ed.submitted_count} submitted
              </span>
              {ed.payout_due > 0 ? (
                <button
                  onClick={() => onRecordPayout(ed.id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/30"
                >
                  <Wallet className="h-3 w-3" />
                  Settle {formatINR(ed.payout_due)}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Settled
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Editor Detail Modal */}
      {activeEditor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#10141e] p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-white/8 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{activeEditor.name} — Workload & Payouts</h2>
                <p className="text-xs text-zinc-400">
                  Submitted payable {formatINR(activeEditor.submitted_payable)} · Paid{' '}
                  {formatINR(activeEditor.total_paid)} · Due {formatINR(activeEditor.payout_due)}
                </p>
              </div>
              <button onClick={() => setSelectedEditor(null)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Assigned Orders ({activeEditor.order_count})
                </span>
                {activeEditor.payout_due > 0 && (
                  <button
                    onClick={() => {
                      setSelectedEditor(null);
                      onRecordPayout(activeEditor.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Record Payout
                  </button>
                )}
              </div>

              <div className="max-h-72 divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/8 bg-zinc-950/60">
                {snapshot.orders
                  .filter((o) => o.editor_id === activeEditor.id)
                  .map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSelectedEditor(null);
                        onOpenOrder(o);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs hover:bg-white/[0.03]"
                    >
                      <div>
                        <span className="font-mono font-semibold text-emerald-400">
                          {o.order_code}
                        </span>{' '}
                        <span className="text-white">{o.client_name}</span> —{' '}
                        <span className="text-zinc-400">{o.title}</span>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <span className="text-zinc-200">{formatINR(o.editor_cost)}</span>
                        <span className="ml-2 text-[11px] text-zinc-400">
                          · {o.editor_payout_status}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Editor Modal */}
      {editingEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveEditor}
            className="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-[#10141e] p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                {editingEditor.id ? 'Edit / Rename Editor' : 'Add Editor'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingEditor(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Editor Name *</label>
              <input
                required
                value={editingEditor.name || ''}
                onChange={(e) => setEditingEditor({ ...editingEditor, name: e.target.value })}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Phone</label>
                <input
                  value={editingEditor.phone || ''}
                  onChange={(e) => setEditingEditor({ ...editingEditor, phone: e.target.value })}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Specialty</label>
                <input
                  value={editingEditor.specialty || ''}
                  onChange={(e) => setEditingEditor({ ...editingEditor, specialty: e.target.value })}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Default Shorts Fee (₹)</label>
                <input
                  type="number"
                  value={editingEditor.default_rate_shorts ?? ''}
                  onChange={(e) =>
                    setEditingEditor({
                      ...editingEditor,
                      default_rate_shorts: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Default Video Fee (₹)</label>
                <input
                  type="number"
                  value={editingEditor.default_rate_video ?? ''}
                  onChange={(e) =>
                    setEditingEditor({
                      ...editingEditor,
                      default_rate_video: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={Boolean(editingEditor.is_self)}
                onChange={(e) => setEditingEditor({ ...editingEditor, is_self: e.target.checked })}
              />
              Owner / Self-completed work (defaults cost to ₹0)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingEditor(null)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Save Editor
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
