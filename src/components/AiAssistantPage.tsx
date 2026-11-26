import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { api, formatINR, ORDER_CATEGORIES, PRODUCTION_STAGES, todayIso } from '../api';
import type {
  AgentAction,
  AgentLogItem,
  AiCommandResponse,
  WorkspaceSnapshot,
} from '../types';

export interface VoiceControllerView {
  speechSupported: boolean;
  ttsSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  interimTranscript: string;
  voiceError: string | null;
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
  toggleListening: (cb: (transcript: string) => void) => void;
  speak: (text: string, force?: boolean) => void;
  stopSpeaking: () => void;
}

interface AiAssistantPageProps {
  snapshot: WorkspaceSnapshot;
  onRefresh: (snap: WorkspaceSnapshot) => void;
  onNotify: (msg: string, isErr?: boolean) => void;
  voice: VoiceControllerView;
  sessionLog: AgentLogItem[];
  pendingDrafts: any[];
  lastResponse: AiCommandResponse | null;
  busy: boolean;
  onRunCommand: (
    text: string,
    opts?: { autoExecute?: boolean; viaVoice?: boolean }
  ) => Promise<void>;
  onUpdateDrafts: React.Dispatch<React.SetStateAction<any[]>>;
  onClearDrafts: () => void;
  onClearLog: () => void;
  initialPrompt?: string;
}

const PROMPT_GROUPS: { group: string; items: string[] }[] = [
  {
    group: 'Orders & Team',
    items: [
      'Got 30 static ads order for 10k',
      'Bloom Care wants a new short on skincare routine, assign to Rohan',
      'Add client Apex Media shorts rate 1200',
      'Add editor Kunal',
    ],
  },
  {
    group: 'Payments & Reminders',
    items: [
      'Bloom Care sent 5k UPI today',
      'Paid Rohan 1750',
      'Send WhatsApp reminder to Bloom Care',
      'Who owes me money?',
    ],
  },
  {
    group: 'App Control & Analytics',
    items: [
      'Show unpaid orders',
      'Open production board',
      'Open finances',
      'What is our collection rate and top client?',
    ],
  },
];

function formatActionChipLabel(act: AgentAction): string {
  if (act.label) return act.label;
  switch (act.type) {
    case 'navigate':
      return `Opened ${act.tab}`;
    case 'open_modal':
      return `Modal · ${act.modal.replace('_', ' ')}`;
    case 'whatsapp_reminder':
      return `WhatsApp · ${act.client_name}`;
    case 'export_data':
      return `Exported ${act.format.toUpperCase()}`;
    case 'sync_cloud':
      return 'Synced to cloud';
    default:
      return 'Action run';
  }
}

function renderFormattedText(text: string): React.ReactNode {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-medium text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

export const AiAssistantPage: React.FC<AiAssistantPageProps> = ({
  snapshot,
  onRefresh,
  onNotify,
  voice,
  sessionLog,
  pendingDrafts,
  lastResponse,
  busy,
  onRunCommand,
  onUpdateDrafts,
  onClearDrafts,
  onClearLog,
  initialPrompt = '',
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [activePresetGroup, setActivePresetGroup] = useState(0);

  useEffect(() => {
    if (initialPrompt.trim()) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  const handleSend = async (textOverride?: string, autoExecute = false, viaVoice = false) => {
    const q = (textOverride ?? prompt).trim();
    if (!q) return;
    setSavedBanner(null);
    if (!textOverride) setPrompt('');
    await onRunCommand(q, { autoExecute, viaVoice });
  };

  const handleMicToggle = () => {
    voice.toggleListening((spoken) => {
      setPrompt(spoken);
      handleSend(spoken, voice.handsFree, true);
    });
  };

  const splitPackageDraft = (idx: number) => {
    const d = pendingDrafts[idx];
    if (!d || d.type !== 'order' || !d.quantity || d.quantity <= 1) return;
    const count = Math.min(50, Number(d.quantity));
    const perAmount = d.amount != null ? Math.round((Number(d.amount) / count) * 100) / 100 : null;
    const perCost = d.editor_cost ? Math.round((Number(d.editor_cost) / count) * 100) / 100 : 0;
    const baseLabel = d.category || 'Deliverable';
    const expanded = Array.from({ length: count }, (_, i) => ({
      ...d,
      title: `${baseLabel} #${i + 1}`,
      quantity: 1,
      unit_rate: null,
      amount: perAmount,
      editor_cost: perCost,
      billing_type: 'one_off',
      auto_filled_fields: [],
    }));
    onUpdateDrafts((prev) => [...prev.slice(0, idx), ...expanded, ...prev.slice(idx + 1)]);
    onNotify(`Split into ${count} individual ${baseLabel} orders`);
  };

  const updateDraft = (idx: number, patch: any) => {
    onUpdateDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const removeDraft = (idx: number) => {
    onUpdateDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmAll = async () => {
    if (pendingDrafts.length === 0) return;
    setSaving(true);
    try {
      let latestSnap = snapshot;
      const orderDrafts = pendingDrafts.filter((d) => d.type === 'order');
      const otherDrafts = pendingDrafts.filter((d) => d.type !== 'order');

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
            notes: d.notes || 'Added via agent console',
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
            notes: d.notes || 'Added via agent console',
          });
          latestSnap = res.snapshot;
        } else if (d.type === 'expense') {
          const res = await api.recordExpense(d);
          latestSnap = res.snapshot;
        } else if (d.type === 'order_update') {
          const res = await api.updateOrder(d.order_id, d.patch);
          latestSnap = res.snapshot;
        } else if (d.type === 'client') {
          const res = await api.saveClient(d);
          latestSnap = res.snapshot;
        } else if (d.type === 'editor') {
          const res = await api.saveEditor(d);
          latestSnap = res.snapshot;
        }
      }

      const savedCount = pendingDrafts.length;
      const latestCode = latestSnap.orders[0]?.order_code;
      const summaryMsg =
        orderDrafts.length > 0 && latestCode
          ? `Saved ${orderDrafts.length} order(s) — latest code ${latestCode}`
          : `Saved ${savedCount} action(s) to ledger`;

      onRefresh(latestSnap);
      onClearDrafts();
      setSavedBanner(summaryMsg);
      onNotify('Saved to ledger');
      voice.speak(summaryMsg);
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Agent Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#ededed]">
            Agency Agent
          </h1>
          <p className="mt-1.5 text-[13px] text-[#85858b]">
            Speak or type to create orders, log payments, navigate views, open modals, or send WhatsApp reminders
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => voice.setHandsFree(!voice.handsFree)}
            title="When enabled, voice commands and Ctrl+Enter automatically save complete actions"
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${
              voice.handsFree
                ? 'border-[#e5a93c]/30 bg-[#e5a93c]/10 text-[#ededed]'
                : 'border-[#ededed]/[0.08] bg-[#19191b] text-[#85858b]'
            }`}
          >
            <Zap
              className={`h-3.5 w-3.5 ${voice.handsFree ? 'text-[#e5a93c]' : 'text-[#85858b]'}`}
              strokeWidth={1.6}
            />
            <span>Auto-run {voice.handsFree ? 'on' : 'off'}</span>
          </button>

          {voice.ttsSupported && (
            <button
              type="button"
              onClick={() =>
                voice.isSpeaking ? voice.stopSpeaking() : voice.setTtsEnabled(!voice.ttsEnabled)
              }
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${
                voice.ttsEnabled
                  ? 'border-[#4cc38a]/30 bg-[#4cc38a]/10 text-[#ededed]'
                  : 'border-[#ededed]/[0.08] bg-[#19191b] text-[#85858b]'
              }`}
            >
              {voice.ttsEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-[#4cc38a]" strokeWidth={1.6} />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.6} />
              )}
              <span>{voice.isSpeaking ? 'Stop speech' : voice.ttsEnabled ? 'Voice replies' : 'Muted'}</span>
            </button>
          )}

          <span className="rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 py-1.5 font-mono text-[11px] text-[#a1a1a6]">
            {snapshot.settings.ready_providers &&
            snapshot.settings.ready_providers.length > 0 &&
            snapshot.settings.ai_provider !== 'offline'
              ? `${snapshot.settings.ai_provider} · ${snapshot.settings.ready_providers.join(' + ')}`
              : 'Offline smart agent'}
          </span>
        </div>
      </div>

      {/* Main Voice + Command Console */}
      <div className="studio-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {/* Interactive Mic Trigger */}
          <button
            type="button"
            onClick={handleMicToggle}
            disabled={!voice.speechSupported}
            aria-label={voice.isListening ? 'Stop voice listening' : 'Start voice command'}
            className={`group flex shrink-0 items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium transition-colors sm:w-44 ${
              voice.isListening
                ? 'border-[#e5a93c]/60 bg-[#e5a93c]/15 text-[#ededed]'
                : 'border-[#ededed]/[0.1] bg-[#141415] text-[#ededed] hover:border-[#ededed]/25 hover:bg-[#1e1e21]'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {voice.isListening ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e5a93c] opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#e5a93c]" />
                </span>
                <Square className="h-3.5 w-3.5 fill-current text-[#e5a93c]" />
                <span>Listening…</span>
              </>
            ) : voice.speechSupported ? (
              <>
                <Mic className="h-4 w-4 text-[#e5a93c]" strokeWidth={1.75} />
                <span>Speak command</span>
              </>
            ) : (
              <>
                <MicOff className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
                <span>Mic unavailable</span>
              </>
            )}
          </button>

          {/* Textarea Input */}
          <div className="relative flex-1">
            <textarea
              rows={2}
              value={voice.isListening && voice.interimTranscript ? voice.interimTranscript : prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSend(undefined, voice.handsFree);
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(undefined, voice.handsFree);
                }
              }}
              placeholder="Say or type: 'Open unpaid orders', 'Got 30 static ads order for 10k', 'Remind Bloom Care'..."
              className="h-full min-h-[64px] w-full rounded-xl border border-[#ededed]/[0.08] bg-[#141415] px-3.5 py-2.5 text-[13px] text-[#ededed] placeholder-[#85858b] focus:border-[#ededed]/25 focus:outline-none"
            />
          </div>
        </div>

        {voice.voiceError && (
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#e5a93c]/20 bg-[#141415] px-3 py-2 text-xs text-[#e5a93c]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span>{voice.voiceError}</span>
          </div>
        )}

        {/* Quick Command Categories & Action Buttons */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-[#ededed]/[0.06] pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {PROMPT_GROUPS.map((g, idx) => (
              <button
                key={g.group}
                type="button"
                onClick={() => setActivePresetGroup(idx)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  activePresetGroup === idx
                    ? 'bg-[#232325] text-[#ededed]'
                    : 'text-[#85858b] hover:text-[#ededed]'
                }`}
              >
                {g.group}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={busy || !prompt.trim()}
              onClick={() => handleSend(undefined, false)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3 text-xs font-normal text-[#ededed] hover:bg-[#2a2a2d] disabled:opacity-50"
            >
              <Terminal className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
              {busy ? 'Running' : 'Preview'}
            </button>
            <button
              disabled={busy || !prompt.trim()}
              onClick={() => handleSend(undefined, true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#ededed] px-3.5 text-xs font-medium text-[#0f0f10] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5 text-[#0f0f10]" strokeWidth={1.75} />
              Run &amp; save
            </button>
          </div>
        </div>

        {/* Preset Suggestion Pills */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PROMPT_GROUPS[activePresetGroup].items.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(ex, voice.handsFree)}
              className="rounded-md border border-[#ededed]/[0.06] bg-[#141415] px-2.5 py-1 text-xs text-[#a1a1a6] hover:border-[#ededed]/20 hover:text-[#ededed]"
            >
              {ex}
            </button>
          ))}
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

      {/* Pending Confirmation Drafts (Interactive Review / Missing Fields) */}
      {pendingDrafts.length > 0 && (
        <div className="studio-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[#ededed]">
                Review &amp; confirm ({pendingDrafts.length})
              </div>
              {lastResponse?.warnings && lastResponse.warnings.length > 0 && (
                <div className="mt-1 text-xs text-[#e5a93c]">{lastResponse.warnings[0]}</div>
              )}
            </div>
            <span className="font-mono text-[11px] text-[#85858b]">{lastResponse?.mode || 'agent'}</span>
          </div>

          <div className="space-y-3">
            {pendingDrafts.map((d, idx) => (
              <div
                key={idx}
                className="space-y-3 rounded-lg border border-[#ededed]/[0.08] bg-[#141415] p-4 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[#e5a93c]">
                      Draft · {d.type.replace('_', ' ')}
                    </span>
                    {d.type === 'order' && d.quantity > 1 && d.amount > 0 && (
                      <span className="rounded bg-[#232325] px-2 py-0.5 font-mono text-[11px] text-[#4cc38a]">
                        {d.quantity} units · {formatINR(d.unit_rate || d.amount / d.quantity)}/unit
                      </span>
                    )}
                    {d.type === 'order' &&
                      Array.isArray(d.auto_filled_fields) &&
                      d.auto_filled_fields.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#232325] px-2 py-0.5 text-[11px] text-[#a1a1a6]">
                          <Sparkles className="h-3 w-3 text-[#e5a93c]" strokeWidth={1.5} />
                          {d.auto_filled_fields.join(' · ')}
                        </span>
                      )}
                  </div>
                  <div className="flex items-center gap-2">
                    {d.type === 'order' && d.quantity > 1 && (
                      <button
                        type="button"
                        onClick={() => splitPackageDraft(idx)}
                        className="inline-flex h-7 items-center gap-1 rounded border border-[#ededed]/[0.08] bg-[#232325] px-2 text-[11px] text-[#ededed] hover:bg-[#2a2a2d]"
                      >
                        <Layers className="h-3 w-3 text-[#85858b]" strokeWidth={1.5} />
                        Split into {d.quantity}
                      </button>
                    )}
                    <button
                      onClick={() => removeDraft(idx)}
                      aria-label="Remove draft"
                      className="text-[#85858b] hover:text-[#e5484d]"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {d.type === 'order' && (
                  <div className="space-y-2.5">
                    {!d.client_id && snapshot.clients.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-[#85858b]">Quick-pick client:</span>
                        {snapshot.clients.slice(0, 8).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => updateDraft(idx, { client_id: c.id, client_name: c.name })}
                            className="rounded border border-[#ededed]/[0.08] bg-[#19191b] px-2 py-0.5 text-[#a1a1a6] hover:border-[#e5a93c]/40 hover:text-[#ededed]"
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
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

                      <div>
                        <label className="mb-1 block text-[#a1a1a6]">Production deadline</label>
                        <input
                          type="date"
                          value={d.production_deadline || ''}
                          onChange={(e) =>
                            updateDraft(idx, { production_deadline: e.target.value || null })
                          }
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[#a1a1a6]">Payment due date</label>
                        <input
                          type="date"
                          value={d.payment_due_date || ''}
                          onChange={(e) =>
                            updateDraft(idx, { payment_due_date: e.target.value || null })
                          }
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[#a1a1a6]">Billing type</label>
                        <select
                          value={d.billing_type || 'one_off'}
                          onChange={(e) => updateDraft(idx, { billing_type: e.target.value })}
                          className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                        >
                          <option value="one_off">Individual order</option>
                          <option value="monthly_package">Package / Retainer</option>
                        </select>
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

                {d.type === 'client' && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[#a1a1a6]">Client name</label>
                      <input
                        value={d.name || ''}
                        onChange={(e) => updateDraft(idx, { name: e.target.value })}
                        className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[#a1a1a6]">Shorts rate (₹)</label>
                      <input
                        type="number"
                        placeholder="Optional"
                        value={d.default_rate_shorts ?? ''}
                        onChange={(e) =>
                          updateDraft(idx, {
                            default_rate_shorts: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[#a1a1a6]">Video edit rate (₹)</label>
                      <input
                        type="number"
                        placeholder="Optional"
                        value={d.default_rate_video ?? ''}
                        onChange={(e) =>
                          updateDraft(idx, {
                            default_rate_video: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                      />
                    </div>
                  </div>
                )}

                {d.type === 'editor' && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[#a1a1a6]">Editor name</label>
                      <input
                        value={d.name || ''}
                        onChange={(e) => updateDraft(idx, { name: e.target.value })}
                        className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[#a1a1a6]">Specialty</label>
                      <input
                        value={d.specialty || ''}
                        onChange={(e) => updateDraft(idx, { specialty: e.target.value })}
                        className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[#a1a1a6]">Shorts payout (₹)</label>
                      <input
                        type="number"
                        placeholder="Optional"
                        value={d.default_rate_shorts ?? ''}
                        onChange={(e) =>
                          updateDraft(idx, {
                            default_rate_shorts: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="h-9 w-full rounded-lg border border-[#ededed]/[0.08] bg-[#19191b] px-2.5 text-[#ededed]"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClearDrafts}
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
              {saving ? 'Saving' : `Confirm & save (${pendingDrafts.length})`}
            </button>
          </div>
        </div>
      )}

      {/* Agent Session Log */}
      <div className="studio-card p-5">
        <div className="flex items-center justify-between pb-3">
          <div className="text-sm font-medium text-[#ededed]">Agent activity log</div>
          {sessionLog.length > 0 && (
            <button
              type="button"
              onClick={onClearLog}
              className="inline-flex items-center gap-1 text-xs text-[#85858b] hover:text-[#ededed]"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
              Clear log
            </button>
          )}
        </div>

        {sessionLog.length === 0 ? (
          <div className="rounded-xl border border-[#ededed]/[0.06] bg-[#141415] px-4 py-8 text-center text-xs text-[#85858b]">
            Tap <strong className="font-medium text-[#ededed]">Speak command</strong> above or click the{' '}
            <strong className="font-medium text-[#ededed]">Voice</strong> button in the header from any page to control EditDesk hands-free.
          </div>
        ) : (
          <div className="space-y-3">
            {sessionLog.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-3.5 text-xs ${
                  item.role === 'user'
                    ? 'border-[#ededed]/[0.06] bg-[#141415]'
                    : 'border-[#ededed]/[0.08] bg-[#1b1b1e]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#85858b]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#a1a1a6]">
                    {item.role === 'user' ? (
                      <>
                        {item.viaVoice ? (
                          <Mic className="h-3 w-3 text-[#e5a93c]" strokeWidth={1.6} />
                        ) : (
                          <Terminal className="h-3 w-3 text-[#85858b]" strokeWidth={1.5} />
                        )}
                        You
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 text-[#4cc38a]" strokeWidth={1.6} />
                        Agent {item.mode ? `· ${item.mode}` : ''}
                      </>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {item.role === 'assistant' && voice.ttsSupported && (
                      <button
                        type="button"
                        onClick={() => voice.speak(item.spokenText || item.text, true)}
                        className="inline-flex items-center gap-1 text-[#85858b] hover:text-[#ededed]"
                        aria-label="Speak response"
                      >
                        <Volume2 className="h-3 w-3" strokeWidth={1.5} />
                        Play
                      </button>
                    )}
                    <span className="font-mono tabular-nums">{item.timestamp}</span>
                  </div>
                </div>

                <div className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-[#ededed]">
                  {renderFormattedText(item.text)}
                </div>

                {/* Executed Action Badges & WhatsApp Quick Launch */}
                {item.actions && item.actions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {item.actions.map((act, idx) =>
                      act.type === 'whatsapp_reminder' ? (
                        <div key={idx} className="flex flex-wrap items-center gap-2">
                          <a
                            href={act.waUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#4cc38a]/15 px-2.5 text-[11px] font-medium text-[#4cc38a] hover:bg-[#4cc38a]/25"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Send WhatsApp to {act.client_name}
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(act.message);
                              onNotify('Copied reminder text');
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-[#ededed]/[0.08] bg-[#141415] px-2 text-[11px] text-[#a1a1a6] hover:text-[#ededed]"
                          >
                            <Copy className="h-3 w-3" />
                            Copy text
                          </button>
                        </div>
                      ) : (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-md border border-[#4cc38a]/25 bg-[#4cc38a]/10 px-2 py-0.5 text-[11px] text-[#4cc38a]"
                        >
                          <Check className="h-3 w-3" />
                          {formatActionChipLabel(act)}
                        </span>
                      )
                    )}
                  </div>
                )}

                {item.autoExecuted && (
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#4cc38a]">
                    <Check className="h-3 w-3" />
                    Auto-saved to ledger
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
