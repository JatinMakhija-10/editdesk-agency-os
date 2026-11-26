import React, { useState } from 'react';
import { AlertCircle, Check, Terminal, Trash2 } from 'lucide-react';
import { api, formatINR, ORDER_CATEGORIES, PRODUCTION_STAGES, todayIso } from '../api';
import type { AiCommandResponse, WorkspaceSnapshot } from '../types';

interface AiAssistantPageProps {
  snapshot: WorkspaceSnapshot;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
  initialPrompt?: string;
}

const EXAMPLE_COMMANDS = [
  'Bloom Care wants a new short on skincare routine, assign to Rohan',
  'Need 3 shorts for Nova Fitness:\n1) Gym myth reel\n2) Protein recipe\n3) Client review',
  'Bloom Care sent 5k UPI today',
  'Paid Rohan 1750',
  'How much do I owe Rohan?',
  'Who owes me money?',
];

export const AiAssistantPage: React.FC<AiAssistantPageProps> = ({
  snapshot,
  onRefresh,
  onNotify,
  initialPrompt = '',
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiCommandResponse | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const handleAnalyze = async (textOverride?: string) => {
    const q = (textOverride ?? prompt).trim();
    if (!q) return;
    if (textOverride) setPrompt(textOverride);
    setLoading(true);
    setSavedBanner(null);
    try {
      const res = await api.runAiCommand(q);
      setResult(res);
      setDrafts(res.drafts || []);
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const updateDraft = (idx: number, patch: any) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmAll = async () => {
    if (drafts.length === 0) return;
    setSaving(true);
    try {
      let latestSnap = snapshot;
      const orderDrafts = drafts.filter((d) => d.type === 'order');
      const otherDrafts = drafts.filter((d) => d.type !== 'order');

      if (orderDrafts.length > 1) {
        const res = await api.createBatchOrders(orderDrafts);
        latestSnap = res.snapshot;
      } else if (orderDrafts.length === 1) {
        const res = await api.createOrder(orderDrafts[0]);
        latestSnap = res.snapshot;
      }

      for (const d of otherDrafts) {
        if (d.type === 'client_payment') {
          const res = await api.recordPayment({
            client_id: d.client_id,
            client_name: d.client_name,
            payment_date: d.payment_date || todayIso(),
            amount: Number(d.amount),
            method: d.method || 'UPI',
            mode: d.mode || 'fifo',
            notes: d.notes || 'Added via command bar',
          });
          latestSnap = res.snapshot;
        } else if (d.type === 'editor_payout') {
          const res = await api.recordEditorPayout({
            editor_id: d.editor_id,
            editor_name: d.editor_name,
            payout_date: d.payout_date || todayIso(),
            amount: Number(d.amount),
            method: d.method || 'UPI',
            mode: d.mode || 'fifo',
            notes: d.notes || 'Added via command bar',
          });
          latestSnap = res.snapshot;
        } else if (d.type === 'expense') {
          const res = await api.recordExpense(d);
          latestSnap = res.snapshot;
        } else if (d.type === 'order_update') {
          const res = await api.updateOrder(d.order_id, d.patch);
          latestSnap = res.snapshot;
        }
      }

      const savedCount = drafts.length;
      const latestCode = latestSnap.orders[0]?.order_code;
      const summaryMsg =
        orderDrafts.length > 0 && latestCode
          ? `Saved ${orderDrafts.length} order(s) — latest code ${latestCode}`
          : `Saved ${savedCount} action(s) to ledger`;

      onRefresh(latestSnap);
      setDrafts([]);
      setPrompt('');
      setResult(null);
      setSavedBanner(summaryMsg);
      onNotify('Saved to ledger');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#ededed]">
            Command bar
          </h1>
          <p className="mt-1.5 text-[13px] text-[#85858b]">
            Paste client briefs, draft payments, or ask ledger questions · Drafts require confirmation before saving
          </p>
        </div>
        <span className="rounded-md border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 py-1 font-mono text-xs text-[#a1a1a6]">
          {snapshot.settings.ai_provider === 'offline' || !snapshot.settings.has_ai_key
            ? 'Offline parser'
            : `${snapshot.settings.ai_provider} · ${snapshot.settings.ai_model}`}
        </span>
      </div>

      {/* Input Box */}
      <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-4">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleAnalyze();
            }
          }}
          placeholder="Type a command or paste a brief"
          className="w-full rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-3 text-[13px] text-[#ededed] placeholder-[#85858b] focus:border-[#ededed]/25 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_COMMANDS.map((ex, i) => (
              <button
                key={i}
                onClick={() => handleAnalyze(ex)}
                className="rounded-md border border-[#ededed]/[0.06] bg-[#141415] px-2.5 py-1 text-xs text-[#a1a1a6] hover:border-[#ededed]/20 hover:text-[#ededed]"
              >
                {ex.split('\n')[0]}
              </button>
            ))}
          </div>
          <button
            disabled={loading || !prompt.trim()}
            onClick={() => handleAnalyze()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#0f0f10] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white disabled:opacity-50"
          >
            <Terminal className="h-4 w-4" strokeWidth={1.5} />
            {loading ? 'Analyzing' : 'Preview action'}
          </button>
        </div>
      </div>

      {/* Confirmation Banner */}
      {savedBanner && (
        <div className="flex items-center justify-between rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] px-4 py-3 text-xs text-[#ededed]">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-[#4cc38a]" strokeWidth={1.5} />
            <span>{savedBanner}</span>
          </div>
          <button onClick={() => setSavedBanner(null)} className="text-[#85858b] hover:text-[#ededed]">
            Dismiss
          </button>
        </div>
      )}

      {/* Response & Editable Confirmation Drafts */}
      {result && (
        <div className="space-y-4 rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
          <div className="flex items-start gap-2.5">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-[#85858b]" strokeWidth={1.5} />
            <div className="whitespace-pre-line text-[13px] leading-relaxed text-[#ededed]">
              {result.answer}
            </div>
          </div>

          {result.warnings?.length > 0 && (
            <div className="space-y-1 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-3 text-xs text-[#e5a93c]">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {drafts.length > 0 && (
            <div className="space-y-3">
              {drafts.map((d, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-4 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#e5a93c]">
                      Draft · {d.type.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => removeDraft(idx)}
                      aria-label="Remove draft"
                      className="text-[#85858b] hover:text-[#e5484d]"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>

                  {d.type === 'order' && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[#a1a1a6]">Client</label>
                        <input
                          list="ai-clients-list"
                          value={d.client_name || ''}
                          onChange={(e) => {
                            const found = snapshot.clients.find(
                              (c) => c.name.toLowerCase() === e.target.value.toLowerCase()
                            );
                            updateDraft(idx, {
                              client_name: e.target.value,
                              client_id: found?.id ?? null,
                            });
                          }}
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        />
                        <datalist id="ai-clients-list">
                          {snapshot.clients.map((c) => (
                            <option key={c.id} value={c.name} />
                          ))}
                        </datalist>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[#a1a1a6]">Topic or deliverable</label>
                        <input
                          value={d.title || ''}
                          onChange={(e) => updateDraft(idx, { title: e.target.value })}
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block truncate leading-4 text-[#a1a1a6]">Category</label>
                        <select
                          value={d.category || 'Shorts'}
                          onChange={(e) => updateDraft(idx, { category: e.target.value })}
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        >
                          {ORDER_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block truncate leading-4 text-[#a1a1a6]">
                          Client price (₹)
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            placeholder="TBD"
                            value={d.amount ?? ''}
                            onChange={(e) =>
                              updateDraft(idx, {
                                amount: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                          />
                          {d.suggested_amount && d.amount == null && (
                            <button
                              type="button"
                              onClick={() => updateDraft(idx, { amount: d.suggested_amount })}
                              className="h-9 shrink-0 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-2.5 text-[11px] text-[#e5a93c]"
                            >
                              ₹{d.suggested_amount}
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block truncate leading-4 text-[#a1a1a6]">
                          Editor &amp; fee (₹)
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            value={d.editor_id ?? ''}
                            onChange={(e) => {
                              const ed = snapshot.editors.find(
                                (x) => x.id === Number(e.target.value)
                              );
                              updateDraft(idx, {
                                editor_id: ed?.id ?? null,
                                editor_name: ed?.name ?? '',
                                editor_cost: ed?.is_self ? 0 : d.editor_cost,
                              });
                            }}
                            className="h-9 w-2/3 rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2 text-[#ededed]"
                          >
                            <option value="">Unassigned</option>
                            {snapshot.editors.map((ed) => (
                              <option key={ed.id} value={ed.id}>
                                {ed.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={d.editor_cost ?? 0}
                            onChange={(e) =>
                              updateDraft(idx, { editor_cost: Number(e.target.value || 0) })
                            }
                            className="h-9 w-1/3 rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2 text-[#ededed]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {d.type === 'client_payment' && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-[#a1a1a6]">Client</label>
                          <select
                            value={d.client_id ?? ''}
                            onChange={(e) => {
                              const cl = snapshot.clients.find(
                                (c) => c.id === Number(e.target.value)
                              );
                              updateDraft(idx, {
                                client_id: cl?.id ?? null,
                                client_name: cl?.name ?? '',
                              });
                            }}
                            className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                          >
                            <option value="">Select client</option>
                            {snapshot.clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} (Due {formatINR(c.outstanding_due)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[#a1a1a6]">Amount (₹)</label>
                          <input
                            type="number"
                            value={d.amount || 0}
                            onChange={(e) => updateDraft(idx, { amount: Number(e.target.value) })}
                            className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[#a1a1a6]">Date</label>
                          <input
                            type="date"
                            value={d.payment_date || todayIso()}
                            onChange={(e) => updateDraft(idx, { payment_date: e.target.value })}
                            className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[#a1a1a6]">Method</label>
                          <select
                            value={d.method || 'UPI'}
                            onChange={(e) => updateDraft(idx, { method: e.target.value })}
                            className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                          >
                            <option value="UPI">UPI</option>
                            <option value="Bank Transfer">Bank transfer</option>
                            <option value="Cash">Cash</option>
                            <option value="Card">Card</option>
                          </select>
                        </div>
                      </div>
                      {d.open_orders?.length > 0 && (
                        <div className="rounded-md bg-[#19191b] px-3 py-2 text-[11px] text-[#a1a1a6]">
                          Oldest-first allocation:{' '}
                          {d.open_orders
                            .map((o: any) => `${o.order_code} (${formatINR(o.balance_due)})`)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  {d.type === 'editor_payout' && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-[#a1a1a6]">Editor</label>
                        <select
                          value={d.editor_id ?? ''}
                          onChange={(e) => {
                            const ed = snapshot.editors.find((x) => x.id === Number(e.target.value));
                            updateDraft(idx, {
                              editor_id: ed?.id ?? null,
                              editor_name: ed?.name ?? '',
                            });
                          }}
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        >
                          <option value="">Select editor</option>
                          {snapshot.editors.map((ed) => (
                            <option key={ed.id} value={ed.id}>
                              {ed.name} (Due {formatINR(ed.payout_due)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[#a1a1a6]">Amount (₹)</label>
                        <input
                          type="number"
                          value={d.amount || 0}
                          onChange={(e) => updateDraft(idx, { amount: Number(e.target.value) })}
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[#a1a1a6]">Date</label>
                        <input
                          type="date"
                          value={d.payout_date || todayIso()}
                          onChange={(e) => updateDraft(idx, { payout_date: e.target.value })}
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[#a1a1a6]">Method</label>
                        <select
                          value={d.method || 'UPI'}
                          onChange={(e) => updateDraft(idx, { method: e.target.value })}
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        >
                          <option value="UPI">UPI</option>
                          <option value="Bank Transfer">Bank transfer</option>
                          <option value="Cash">Cash</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {d.type === 'expense' && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <input
                        value={d.description || ''}
                        onChange={(e) => updateDraft(idx, { description: e.target.value })}
                        className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed] sm:col-span-2"
                      />
                      <input
                        type="number"
                        value={d.amount || 0}
                        onChange={(e) => updateDraft(idx, { amount: Number(e.target.value) })}
                        className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                      />
                    </div>
                  )}

                  {d.type === 'order_update' && (
                    <div className="grid grid-cols-1 gap-2 text-[#ededed] sm:grid-cols-3">
                      <div className="flex items-center font-mono">
                        {d.order_code} · {d.client_name}
                      </div>
                      <select
                        value={d.patch?.production_status || ''}
                        onChange={(e) =>
                          updateDraft(idx, {
                            patch: { ...d.patch, production_status: e.target.value || undefined },
                          })
                        }
                        className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2 text-[#ededed]"
                      >
                        <option value="">Keep current stage</option>
                        {PRODUCTION_STAGES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Client amount (₹)"
                        value={d.patch?.amount ?? ''}
                        onChange={(e) =>
                          updateDraft(idx, {
                            patch: {
                              ...d.patch,
                              amount: e.target.value ? Number(e.target.value) : undefined,
                            },
                          })
                        }
                        className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2 text-[#ededed]"
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setDrafts([]);
                    setResult(null);
                  }}
                  className="h-9 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3.5 text-xs text-[#ededed]"
                >
                  Discard
                </button>
                <button
                  disabled={saving}
                  onClick={handleConfirmAll}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#0f0f10] hover:bg-white"
                >
                  <Check className="h-4 w-4" strokeWidth={1.75} />
                  {saving ? 'Saving' : `Confirm & save (${drafts.length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
