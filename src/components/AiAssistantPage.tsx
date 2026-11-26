import React, { useState } from 'react';
import { AlertCircle, Check, Sparkles, Terminal, Trash2 } from 'lucide-react';
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
            notes: d.notes || 'Added via AI command',
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
            notes: d.notes || 'Added via AI command',
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
          ? `Saved ${orderDrafts.length} order(s) — latest code: ${latestCode}`
          : `Saved ${savedCount} action(s) to ledger`;

      onRefresh(latestSnap);
      setDrafts([]);
      setPrompt('');
      setResult(null);
      setSavedBanner(summaryMsg);
      onNotify('Confirmed and saved to ledger!');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">AI Command Assistant</h1>
          <p className="text-xs text-zinc-400">
            Paste WhatsApp briefs, log lump-sum payments, or ask finance questions · Always requires your confirmation before saving
          </p>
        </div>
        <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
          Engine:{' '}
          {snapshot.settings.ai_provider === 'offline' || !snapshot.settings.has_ai_key
            ? 'Offline Smart Parser'
            : `${snapshot.settings.ai_provider.toUpperCase()} (${snapshot.settings.ai_model})`}
        </span>
      </div>

      {/* Input Box */}
      <div className="rounded-2xl border border-white/10 bg-[#10141e] p-4">
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
          placeholder='Type naturally or paste a client WhatsApp message... e.g. "Bloom Care wants a new reel on winter skincare, assign Rohan" or "Bloom Care sent 5k"'
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_COMMANDS.map((ex, i) => (
              <button
                key={i}
                onClick={() => handleAnalyze(ex)}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-zinc-600 hover:text-white"
              >
                {ex.split('\n')[0]}
              </button>
            ))}
          </div>
          <button
            disabled={loading || !prompt.trim()}
            onClick={() => handleAnalyze()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? 'Analyzing...' : 'Preview Action (Ctrl+Enter)'}
          </button>
        </div>
      </div>

      {/* Confirmation Banner */}
      {savedBanner && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          <div className="flex items-center gap-2 font-medium">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>{savedBanner}</span>
          </div>
          <button
            onClick={() => setSavedBanner(null)}
            className="text-emerald-300/80 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Response & Editable Confirmation Drafts */}
      {result && (
        <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-[#10141e] p-4">
          <div className="flex items-start gap-2.5">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="space-y-1 text-sm text-zinc-100 whitespace-pre-line">
              {result.answer}
            </div>
          </div>

          {result.warnings?.length > 0 && (
            <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {drafts.length > 0 && (
            <div className="space-y-3 pt-1">
              {drafts.map((d, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-white/10 bg-zinc-950 p-3.5 text-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-300">
                      Draft: {d.type.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => removeDraft(idx)}
                      className="text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {d.type === 'order' && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] text-zinc-400">Client *</label>
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
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                        />
                        <datalist id="ai-clients-list">
                          {snapshot.clients.map((c) => (
                            <option key={c.id} value={c.name} />
                          ))}
                        </datalist>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[11px] text-zinc-400">Topic / Title *</label>
                        <input
                          value={d.title || ''}
                          onChange={(e) => updateDraft(idx, { title: e.target.value })}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] text-zinc-400">Category</label>
                        <select
                          value={d.category || 'Shorts'}
                          onChange={(e) => updateDraft(idx, { category: e.target.value })}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                        >
                          {ORDER_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] text-zinc-400">
                          Client Price (₹) {d.suggested_amount ? `(Usual: ₹${d.suggested_amount})` : ''}
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            placeholder="Blank = Rate Pending"
                            value={d.amount ?? ''}
                            onChange={(e) =>
                              updateDraft(idx, {
                                amount: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                          />
                          {d.suggested_amount && d.amount == null && (
                            <button
                              type="button"
                              onClick={() => updateDraft(idx, { amount: d.suggested_amount })}
                              className="shrink-0 rounded-lg bg-sky-500/20 px-2 text-[10px] text-sky-300"
                            >
                              Use ₹{d.suggested_amount}
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] text-zinc-400">Editor &amp; Fee (₹)</label>
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
                            className="w-2/3 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-white"
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
                            className="w-1/3 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {d.type === 'client_payment' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-[11px] text-zinc-400">Client *</label>
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
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                          >
                            <option value="">Select client...</option>
                            {snapshot.clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} (Due {formatINR(c.outstanding_due)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-zinc-400">Amount (₹) *</label>
                          <input
                            type="number"
                            value={d.amount || 0}
                            onChange={(e) => updateDraft(idx, { amount: Number(e.target.value) })}
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-zinc-400">Date</label>
                          <input
                            type="date"
                            value={d.payment_date || todayIso()}
                            onChange={(e) => updateDraft(idx, { payment_date: e.target.value })}
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-zinc-400">Method</label>
                          <select
                            value={d.method || 'UPI'}
                            onChange={(e) => updateDraft(idx, { method: e.target.value })}
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                          >
                            <option value="UPI">UPI</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cash">Cash</option>
                            <option value="Card">Card</option>
                          </select>
                        </div>
                      </div>
                      {d.open_orders?.length > 0 && (
                        <div className="rounded-lg bg-zinc-900/70 p-2 text-[11px] text-zinc-300">
                          Will auto-allocate oldest-first across:{' '}
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
                        <label className="mb-1 block text-[11px] text-zinc-400">Editor *</label>
                        <select
                          value={d.editor_id ?? ''}
                          onChange={(e) => {
                            const ed = snapshot.editors.find((x) => x.id === Number(e.target.value));
                            updateDraft(idx, {
                              editor_id: ed?.id ?? null,
                              editor_name: ed?.name ?? '',
                            });
                          }}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                        >
                          <option value="">Select editor...</option>
                          {snapshot.editors.map((ed) => (
                            <option key={ed.id} value={ed.id}>
                              {ed.name} (Due {formatINR(ed.payout_due)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-zinc-400">Amount (₹)</label>
                        <input
                          type="number"
                          value={d.amount || 0}
                          onChange={(e) => updateDraft(idx, { amount: Number(e.target.value) })}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-zinc-400">Date</label>
                        <input
                          type="date"
                          value={d.payout_date || todayIso()}
                          onChange={(e) => updateDraft(idx, { payout_date: e.target.value })}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-zinc-400">Method</label>
                        <select
                          value={d.method || 'UPI'}
                          onChange={(e) => updateDraft(idx, { method: e.target.value })}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                        >
                          <option value="UPI">UPI</option>
                          <option value="Bank Transfer">Bank Transfer</option>
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
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white sm:col-span-2"
                      />
                      <input
                        type="number"
                        value={d.amount || 0}
                        onChange={(e) => updateDraft(idx, { amount: Number(e.target.value) })}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white"
                      />
                    </div>
                  )}

                  {d.type === 'order_update' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-zinc-200">
                      <div>
                        Order: <span className="font-mono text-emerald-400">{d.order_code}</span> (
                        {d.client_name})
                      </div>
                      <select
                        value={d.patch?.production_status || ''}
                        onChange={(e) =>
                          updateDraft(idx, {
                            patch: { ...d.patch, production_status: e.target.value || undefined },
                          })
                        }
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white"
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
                        placeholder="Client Amount (₹)"
                        value={d.patch?.amount ?? ''}
                        onChange={(e) =>
                          updateDraft(idx, {
                            patch: {
                              ...d.patch,
                              amount: e.target.value ? Number(e.target.value) : undefined,
                            },
                          })
                        }
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white"
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setDrafts([]);
                    setResult(null);
                  }}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300"
                >
                  Discard
                </button>
                <button
                  disabled={saving}
                  onClick={handleConfirmAll}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  <Check className="h-4 w-4" />
                  {saving ? 'Saving...' : `Confirm & Save (${drafts.length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
