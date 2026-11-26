import React, { useState } from 'react';
import { Edit3, Plus, Wallet, X } from 'lucide-react';
import { api, formatINR } from '../api';
import type { Editor, Order, WorkspaceSnapshot } from '../types';

interface EditorsPageProps {
  snapshot: WorkspaceSnapshot;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onRecordPayout: (editorId?: number) => void;
  onOpenOrder: (order: Order) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}

const labelCls = 'mb-1.5 block text-xs text-[#a1a1a6]';

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
            Editors
          </h1>
          <p className="mt-1.5 text-[13px] text-[#85858b] tabular-nums">
            Payout unlocks after editor work is marked submitted · Total due{' '}
            <span className={snapshot.kpis.total_editor_due > 0 ? 'text-[#e5a93c]' : 'text-[#a1a1a6]'}>
              {formatINR(snapshot.kpis.total_editor_due)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onRecordPayout()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3.5 text-[13px] font-normal text-[#ededed] hover:bg-[#2a2a2d]"
          >
            <Wallet className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            Pay editor
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
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ededed] px-3.5 text-[13px] font-medium text-[#0f0f10] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Add editor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.editors.map((ed) => (
          <div
            key={ed.id}
            onClick={() => setSelectedEditor(ed)}
            className="cursor-pointer rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 hover:border-[#ededed]/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-[15px] font-medium text-[#ededed]">{ed.name}</h3>
                  {ed.is_self && <span className="font-mono text-xs text-[#85858b]">Owner</span>}
                  {ed.active_assignments > 0 && (
                    <span className="font-mono text-xs text-[#85858b]">
                      {ed.active_assignments} active
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#85858b]">{ed.specialty || 'Editing'}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingEditor(ed);
                }}
                aria-label={`Edit ${ed.name}`}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              >
                <Edit3 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-[#ededed]/[0.06] bg-[#141415] p-3 text-xs">
              <div>
                <div className="text-[#85858b]">Submitted</div>
                <div className="mt-1 font-mono font-medium tabular-nums text-[#ededed]">
                  {formatINR(ed.submitted_payable)}
                </div>
              </div>
              <div>
                <div className="text-[#85858b]">Paid</div>
                <div className="mt-1 font-mono font-medium tabular-nums text-[#4cc38a]">
                  {formatINR(ed.total_paid)}
                </div>
              </div>
              <div>
                <div className="text-[#85858b]">Due</div>
                <div
                  className={`mt-1 font-mono font-medium tabular-nums ${
                    ed.payout_due > 0 ? 'text-[#e5a93c]' : 'text-[#85858b]'
                  }`}
                >
                  {formatINR(ed.payout_due)}
                </div>
              </div>
            </div>

              <div className="mt-4 flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
              <span className="text-[#85858b] tabular-nums">
                {ed.order_count} jobs · {ed.submitted_count} submitted
                {ed.unallocated_advance > 0 && (
                  <span className="ml-2 font-mono text-[#e5a93c]">
                    Adv {formatINR(ed.unallocated_advance)}
                  </span>
                )}
              </span>
              {ed.payout_due > 0 ? (
                <button
                  onClick={() => onRecordPayout(ed.id)}
                  className="inline-flex h-8 items-center rounded-lg bg-[#ededed] px-3 text-xs font-medium text-[#0f0f10] hover:bg-white"
                >
                  Settle {formatINR(ed.payout_due)}
                </button>
              ) : (
                <span className="text-[#4cc38a]">Settled</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Editor Detail Modal */}
      {activeEditor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-[#ededed]/[0.08] pb-4">
              <div>
                <h2 className="text-base font-medium text-[#ededed]">{activeEditor.name}</h2>
                <p className="mt-0.5 text-xs text-[#85858b] tabular-nums">
                  Submitted {formatINR(activeEditor.submitted_payable)} · Paid{' '}
                  {formatINR(activeEditor.total_paid)} · Due {formatINR(activeEditor.payout_due)}
                </p>
              </div>
              <button
                onClick={() => setSelectedEditor(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="mt-4">
              {activeEditor.unallocated_advance > 0 && (
                <div className="mb-4 rounded-xl border border-[#ededed]/[0.08] bg-[#141415] p-3.5 text-xs">
                  <div className="font-medium text-[#e5a93c]">
                    Unallocated editor advance ({formatINR(activeEditor.unallocated_advance)})
                  </div>
                  <div className="mt-2 space-y-2">
                    {snapshot.editorPayouts
                      .filter((p) => p.editor_id === activeEditor.id && p.unallocated_amount > 0)
                      .map((p) => {
                        const openSubmitted = snapshot.orders.filter(
                          (o) =>
                            o.editor_id === activeEditor.id &&
                            o.editor_work_submitted &&
                            o.editor_balance_due > 0
                        );
                        return (
                          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[#a1a1a6]">
                              Payout {p.payout_date}: {formatINR(p.unallocated_amount)} unallocated
                            </span>
                            {openSubmitted.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {openSubmitted.map((o) => (
                                  <button
                                    key={o.id}
                                    onClick={() => handleApplyEditorAdvance(p.id, o.id)}
                                    className="h-7 rounded-md bg-[#ededed] px-2.5 text-[11px] font-medium text-[#0f0f10] hover:bg-white"
                                  >
                                    Apply to {o.order_code} ({formatINR(o.editor_balance_due)})
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[#85858b]">No submitted unpaid jobs</span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-[#a1a1a6]">
                  Assigned orders ({activeEditor.order_count})
                </span>
                {activeEditor.payout_due > 0 && (
                  <button
                    onClick={() => {
                      setSelectedEditor(null);
                      onRecordPayout(activeEditor.id);
                    }}
                    className="inline-flex h-8 items-center rounded-lg bg-[#ededed] px-3 text-xs font-medium text-[#0f0f10] hover:bg-white"
                  >
                    Record payout
                  </button>
                )}
              </div>

              <div className="max-h-72 divide-y divide-[#ededed]/[0.06] overflow-y-auto rounded-lg border border-[#ededed]/[0.08] bg-[#141415]">
                {snapshot.orders
                  .filter((o) => o.editor_id === activeEditor.id)
                  .map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSelectedEditor(null);
                        onOpenOrder(o);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs hover:bg-[#232325]/60"
                    >
                      <div>
                        <span className="font-mono text-[#ededed]">{o.order_code}</span>{' '}
                        <span className="ml-1 text-[#a1a1a6]">{o.client_name}</span> —{' '}
                        <span className="text-[#85858b]">{o.title}</span>
                      </div>
                      <div className="font-mono tabular-nums">
                        <span className="text-[#ededed]">{formatINR(o.editor_cost)}</span>
                        <span className="ml-2 text-[#85858b]">· {o.editor_payout_status}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveEditor}
            className="w-full max-w-md space-y-3 rounded-2xl border border-[#ededed]/[0.08] bg-[#19191b] p-5"
          >
            <div className="flex items-center justify-between border-b border-[#ededed]/[0.08] pb-3">
              <h2 className="text-base font-medium text-[#ededed]">
                {editingEditor.id ? 'Edit editor' : 'Add editor'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingEditor(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <div>
              <label className={labelCls}>Name</label>
              <input
                required
                value={editingEditor.name || ''}
                onChange={(e) => setEditingEditor({ ...editingEditor, name: e.target.value })}
                className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Phone</label>
                <input
                  value={editingEditor.phone || ''}
                  onChange={(e) => setEditingEditor({ ...editingEditor, phone: e.target.value })}
                  className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
                />
              </div>
              <div>
                <label className={labelCls}>Specialty</label>
                <input
                  value={editingEditor.specialty || ''}
                  onChange={(e) =>
                    setEditingEditor({ ...editingEditor, specialty: e.target.value })
                  }
                  className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Shorts fee (₹)</label>
                <input
                  type="number"
                  value={editingEditor.default_rate_shorts ?? ''}
                  onChange={(e) =>
                    setEditingEditor({
                      ...editingEditor,
                      default_rate_shorts: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
                />
              </div>
              <div>
                <label className={labelCls}>Video fee (₹)</label>
                <input
                  type="number"
                  value={editingEditor.default_rate_video ?? ''}
                  onChange={(e) =>
                    setEditingEditor({
                      ...editingEditor,
                      default_rate_video: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] px-3 text-[13px] text-[#ededed]"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#a1a1a6]">
              <input
                type="checkbox"
                checked={Boolean(editingEditor.is_self)}
                onChange={(e) => setEditingEditor({ ...editingEditor, is_self: e.target.checked })}
                className="accent-[#e5a93c]"
              />
              Owner or self-completed work (defaults cost to ₹0)
            </label>
            <div className="flex justify-end gap-2 border-t border-[#ededed]/[0.08] pt-3">
              <button
                type="button"
                onClick={() => setEditingEditor(null)}
                className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3.5 text-xs text-[#ededed]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#0f0f10] hover:bg-white"
              >
                Save editor
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
