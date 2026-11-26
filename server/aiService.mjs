import { getSettingMap, getWorkspaceSnapshot, localTodayIso, round2 } from './ledgerService.mjs';

const DELIVERABLE_UNIT_RX =
  /\b(\d+)\s+(static\s+ads?|ad\s+creatives?|banner\s+ads?|reels?|shorts?|videos?|edits?|scripts?|blogs?|articles?|posts?|thumbnails?|menu\s+designs?|ads)\b/gi;

function parseAmountToken(text) {
  // Matches ₹5,000, Rs 4000, 5k, 4.5k, 1500
  const rupeeMatch = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k)?/i);
  if (rupeeMatch) {
    const base = Number(rupeeMatch[1].replace(/,/g, ''));
    return rupeeMatch[2] ? round2(base * 1000) : round2(base);
  }
  const kMatch = text.match(/\b(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    return round2(Number(kMatch[1]) * 1000);
  }
  // Plain numeric amount (avoid matching years 2025/2026, SYN codes, bullets, or deliverable counts like "30 static ads")
  const cleaned = text
    .replace(/\bsyn\d+\b/gi, ' ')
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
    .replace(/(?:^|\n)\s*\d+[.)]/g, ' ')
    .replace(DELIVERABLE_UNIT_RX, ' ');
  const numMatches = [...cleaned.matchAll(/\b(\d{2,6}(?:\.\d{1,2})?)\b/g)];
  if (numMatches.length > 0) {
    const val = Number(numMatches[0][1]);
    if (val >= 10 && val !== 2025 && val !== 2026) return round2(val);
  }
  return null;
}

function addDaysIsoStr(baseIso, days) {
  const base = new Date(`${baseIso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function detectDateFromText(text, fallbackDate) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const lower = text.toLowerCase();
  const base = new Date(`${fallbackDate}T00:00:00Z`);

  if (/\byesterday\b/.test(lower)) return addDaysIsoStr(fallbackDate, -1);
  if (/\btoday\b/.test(lower)) return fallbackDate;
  if (/\btomorrow\b/.test(lower)) return addDaysIsoStr(fallbackDate, 1);
  if (/\bnext week\b/.test(lower)) return addDaysIsoStr(fallbackDate, 7);

  const inDays = lower.match(/\bin\s+(\d{1,2})\s+days?\b/);
  if (inDays) return addDaysIsoStr(fallbackDate, Number(inDays[1]));

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < weekdays.length; i++) {
    if (new RegExp(`\\b${weekdays[i]}\\b`, 'i').test(lower)) {
      const cur = base.getUTCDay();
      let delta = (i - cur + 7) % 7;
      if (delta === 0) delta = 7;
      return addDaysIsoStr(fallbackDate, delta);
    }
  }
  return null;
}

function detectCategory(text, fallback = 'Shorts') {
  const lower = text.toLowerCase();
  if (/\b(static\s+ads?|ad\s+creatives?|banner\s+ads?|meta\s+ads?|fb\s+ads?|ads)\b/.test(lower)) {
    return 'Static Ads';
  }
  if (/\b(thumbnail|thumbnails)\b/.test(lower)) return 'Thumbnails';
  if (/\b(short|shorts|reel|reels|yt short|ig reel)\b/.test(lower)) return 'Shorts';
  if (/\b(script|scripts|script writing)\b/.test(lower)) return 'Script Writing';
  if (/\b(blog|blogs|article|website blog)\b/.test(lower)) return 'Website Blogs';
  if (/\b(insta|instagram post|carousel|static post|post|posts)\b/.test(lower)) return 'Instagram Posts';
  if (/\b(menu|menu design)\b/.test(lower)) return 'Menu Design';
  if (/\b(video|video edit|youtube|vlog|podcast|long form)\b/.test(lower)) return 'Video Edit';
  return fallback;
}

function detectDeliverablePackage(text, category) {
  const m = text.match(
    /\b(\d{1,3})\s+(static\s+ads?|ad\s+creatives?|banner\s+ads?|reels?|shorts?|videos?|edits?|scripts?|blogs?|articles?|posts?|thumbnails?|menu\s+designs?|ads)\b/i
  );
  if (!m) return { quantity: 1, packageLabel: null };
  const quantity = Math.max(1, Number(m[1]));
  const rawUnit = m[2].trim().replace(/\s+/g, ' ');
  const capitalizedUnit = rawUnit
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  const packageLabel = quantity > 1 ? `${quantity} ${capitalizedUnit}` : category;
  return { quantity, packageLabel };
}

function detectMethod(text) {
  const lower = text.toLowerCase();
  if (/\b(upi|gpay|phonepe|paytm)\b/.test(lower)) return 'UPI';
  if (/\b(bank|neft|imps|rtgs|transfer|wire)\b/.test(lower)) return 'Bank Transfer';
  if (/\b(cash)\b/.test(lower)) return 'Cash';
  if (/\b(card)\b/.test(lower)) return 'Card';
  return 'UPI';
}

function findMatchingClient(clients, text) {
  const lower = text.toLowerCase();
  // Sort longest match first so "Nova Fitness" beats "Nova Fit"
  const candidates = [];
  for (const c of clients) {
    candidates.push({ client: c, term: c.name.toLowerCase() });
    const aliases = (c.aliases || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    for (const a of aliases) {
      candidates.push({ client: c, term: a });
    }
  }
  candidates.sort((a, b) => b.term.length - a.term.length);
  for (const item of candidates) {
    const escaped = item.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      return item.client;
    }
  }
  return null;
}

function findMatchingEditor(editors, text) {
  const lower = text.toLowerCase();
  const sorted = [...editors].sort((a, b) => b.name.length - a.name.length);
  for (const e of sorted) {
    const escaped = e.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      return e;
    }
  }
  return null;
}

function cleanTopicTitle(rawText, client, editor, category) {
  const pkg = detectDeliverablePackage(rawText, category);
  let s = String(rawText || '').trim();
  if (client) {
    const terms = [client.name, ...(client.aliases || '').split(',').map((x) => x.trim()).filter(Boolean)];
    for (const t of terms) {
      s = s.replace(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
    }
  }
  if (editor) {
    s = s.replace(new RegExp(`\\b(?:assign(?:ed)?\\s*(?:to)?|give\\s*(?:to)?|editor)\\s*${editor.name}\\b`, 'gi'), ' ');
    s = s.replace(new RegExp(`\\b${editor.name}\\b`, 'gi'), ' ');
  }
  s = s
    .replace(DELIVERABLE_UNIT_RX, ' ')
    .replace(/\b(i|we|got|received|gave|as soon|tells me|told me|asked me|wants|want|needs|need|make|create|add|new|order|orders|a|an|for|on this topic|topic|about|due|by|today|tomorrow|next week|friday|monday|tuesday|wednesday|thursday|saturday|sunday|monthly package|package|retainer|video|short|shorts|reel|reels|script|blog|static|ads)\b/gi, ' ')
    .replace(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?\s*k?/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?k\b/gi, ' ')
    .replace(/\b\d{3,6}\b/g, ' ')
    .replace(/[,:;|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:on|of|in|to|with|regarding|from|by|at)(?:\s+|$)/gi, '')
    .trim();

  if (pkg.quantity > 1 && pkg.packageLabel) {
    return s && s.length >= 3 ? `${pkg.packageLabel} · ${s.charAt(0).toUpperCase() + s.slice(1)}` : pkg.packageLabel;
  }
  if (!s || s.length < 3) return category;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatINR(n) {
  const num = Number(n || 0);
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function toSpeechText(text = '') {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/•\s*/g, '')
    .replace(/₹([\d,]+(?:\.\d+)?)/g, '$1 rupees')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

function finalizeResponse(payload) {
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const drafts = Array.isArray(payload.drafts) ? payload.drafts : [];
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  const answer = String(payload.answer || 'Done.');
  const spoken_summary = payload.spoken_summary
    ? toSpeechText(payload.spoken_summary)
    : toSpeechText(answer.split('\n').slice(0, 3).join('. '));
  return {
    ...payload,
    answer,
    spoken_summary,
    drafts,
    actions,
    warnings,
  };
}

function answerQuestion(snapshot, text) {
  const lower = text.toLowerCase();
  const matchedClient = findMatchingClient(snapshot.clients, text);
  const matchedEditor = findMatchingEditor(snapshot.editors, text);

  if (matchedClient && /\b(owe|owes|due|pending|balance|paid|received|billed|profit|orders?|summary|how much)\b/.test(lower)) {
    const cOrders = snapshot.orders.filter((o) => o.client_id === matchedClient.id);
    const pendingOrders = cOrders.filter((o) => o.balance_due > 0);
    const ratePending = cOrders.filter((o) => o.amount === null);
    const lines = [
      `**${matchedClient.name}** — ${cOrders.length} total orders (${matchedClient.active_orders} active)`,
      `• Total Billed: ${formatINR(matchedClient.total_billed)} | Received: ${formatINR(matchedClient.total_received)}`,
      `• Outstanding Due: **${formatINR(matchedClient.outstanding_due)}**${
        matchedClient.unallocated_advance > 0
          ? ` | Unallocated Advance: ${formatINR(matchedClient.unallocated_advance)}`
          : ''
      }`,
      `• Agency Profit from ${matchedClient.name}: ${formatINR(matchedClient.profit)}`,
    ];
    if (pendingOrders.length > 0) {
      lines.push(
        `• Unpaid Orders: ${pendingOrders.map((o) => `${o.order_code} (${formatINR(o.balance_due)})`).join(', ')}`
      );
    }
    if (ratePending.length > 0) {
      lines.push(`• Rate Pending (TBD): ${ratePending.map((o) => o.order_code).join(', ')}`);
    }
    return {
      intent: 'answer',
      answer: lines.join('\n'),
      drafts: [],
      warnings: [],
      mode: 'offline',
    };
  }

  if (matchedEditor && /\b(owe|owes|due|pending|payout|pay|paid|earn|orders?|work|how much)\b/.test(lower)) {
    const eOrders = snapshot.orders.filter((o) => o.editor_id === matchedEditor.id);
    const dueOrders = eOrders.filter((o) => o.editor_balance_due > 0);
    const lines = [
      `**${matchedEditor.name}** — ${eOrders.length} orders assigned (${matchedEditor.active_assignments} active)`,
      `• Submitted Payable: ${formatINR(matchedEditor.submitted_payable)} | Paid: ${formatINR(matchedEditor.total_paid)}`,
      `• Payout Due Now: **${formatINR(matchedEditor.payout_due)}**`,
    ];
    if (dueOrders.length > 0) {
      lines.push(
        `• Unpaid Submitted Orders: ${dueOrders
          .map((o) => `${o.order_code} (${formatINR(o.editor_balance_due)})`)
          .join(', ')}`
      );
    }
    return {
      intent: 'answer',
      answer: lines.join('\n'),
      drafts: [],
      warnings: [],
      mode: 'offline',
    };
  }

  if (/\b(who owes|receivable|receivables|unpaid clients|pending payments|collect)\b/.test(lower)) {
    const debtors = snapshot.clients.filter((c) => c.outstanding_due > 0 || c.rate_pending_count > 0);
    if (debtors.length === 0) {
      return {
        intent: 'answer',
        answer: 'All priced client orders are fully paid! Check Rate Pending orders if any rates are still TBD.',
        drafts: [],
        warnings: [],
        mode: 'offline',
      };
    }
    const lines = debtors.map(
      (c) =>
        `• **${c.name}**: Due ${formatINR(c.outstanding_due)}${
          c.rate_pending_count > 0 ? ` (+ ${c.rate_pending_count} Rate Pending)` : ''
        }${c.unallocated_advance > 0 ? ` [Advance: ${formatINR(c.unallocated_advance)}]` : ''}`
    );
    return {
      intent: 'answer',
      answer: `**Client Receivables (Total: ${formatINR(snapshot.kpis.total_receivable)})**\n${lines.join('\n')}`,
      drafts: [],
      warnings: [],
      mode: 'offline',
    };
  }

  if (/\b(editor|editors|payout|payouts|pay editors|who to pay)\b/.test(lower)) {
    const payable = snapshot.editors.filter((e) => e.payout_due > 0);
    if (payable.length === 0) {
      return {
        intent: 'answer',
        answer: 'No pending editor payouts right now.',
        drafts: [],
        warnings: [],
        mode: 'offline',
      };
    }
    const lines = payable.map((e) => `• **${e.name}**: Owed ${formatINR(e.payout_due)}`);
    return {
      intent: 'answer',
      answer: `**Pending Editor Payouts (Total: ${formatINR(snapshot.kpis.total_editor_due)})**\n${lines.join('\n')}`,
      drafts: [],
      warnings: [],
      mode: 'offline',
    };
  }

  if (/\b(collection rate|collected rate|avg|average|profit per order|top client|concentration|aging|overdue bucket|pipeline|payment method|health|analytics|breakdown|insights)\b/.test(lower)) {
    const a = snapshot.analytics || {};
    const aging = a.receivables_aging || { current_0_7: 0, bucket_8_30: 0, bucket_over_30: 0, count_unpaid: 0 };
    const topClient = Array.isArray(a.top_clients) && a.top_clients[0] ? a.top_clients[0] : null;
    const lines = [
      `**Agency Health & Analytics**`,
      `• Collection Rate: **${a.collection_rate_pct ?? 0}%** | Delivery Rate: **${a.delivery_rate_pct ?? 0}%**`,
      `• Avg Order Value: ${formatINR(a.avg_order_value)} | Avg Profit / Order: ${formatINR(a.avg_profit_per_order)}`,
      topClient
        ? `• Top Client: **${topClient.name}** (${formatINR(topClient.billed)} billed · ${a.top_client_concentration_pct ?? 0}% concentration)`
        : `• Top Client: No billed orders yet`,
      `• Receivables Aging (${aging.count_unpaid} unpaid): 0–7d ${formatINR(aging.current_0_7)} | 8–30d ${formatINR(aging.bucket_8_30)} | 30+d ${formatINR(aging.bucket_over_30)}`,
    ];
    return finalizeResponse({
      intent: 'answer',
      answer: lines.join('\n'),
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }

  if (/\b(service|category|shorts|video edit|margin|compare)\b/.test(lower)) {
    const lines = snapshot.categoryBreakdown.map(
      (c) => `• **${c.category}** (${c.orders} orders): Billed ${formatINR(c.billed)}, Profit ${formatINR(c.profit)} (${c.profit_pct}%)`
    );
    return finalizeResponse({
      intent: 'answer',
      answer: `**Service Category Breakdown**\n${lines.join('\n') || 'No service orders recorded yet.'}`,
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }

  if (/\b(attention|overdue|unassigned|missing|pending|alert|risk)\b/.test(lower)) {
    const att = snapshot.attention;
    const lines = [
      `• Unassigned Editors: ${att.unassigned.length} (${att.unassigned.map((o) => o.order_code).join(', ') || 'None'})`,
      `• Needs Review / Rate Pending: ${att.needsReview.length} (${att.needsReview.map((o) => o.order_code).join(', ') || 'None'})`,
      `• Overdue Production Deadlines: ${att.overdueProduction.length}`,
      `• Overdue Client Invoice Due Dates: ${att.overdueInvoices.length}`,
      `• Submitted Work Awaiting Editor Payout: ${att.submittedUnpaidEditors.length} (${formatINR(snapshot.kpis.total_editor_due)})`,
    ];
    return finalizeResponse({
      intent: 'answer',
      answer: `**Workspace Attention Summary**\n${lines.join('\n')}`,
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }

  // General P&L summary
  const k = snapshot.kpis;
  const cm = k.current_month;
  return finalizeResponse({
    intent: 'answer',
    answer: [
      `**Agency Snapshot (${k.total_orders} tracked orders)**`,
      `• Total Billed: ${formatINR(k.total_billed)} | Collected: ${formatINR(k.total_collected)} | Receivable: ${formatINR(k.total_receivable)}`,
      `• Editor Committed: ${formatINR(k.total_editor_committed)} | Paid: ${formatINR(k.total_editor_paid)} | Due: ${formatINR(k.total_editor_due)}`,
      `• Gross Profit: **${formatINR(k.gross_project_profit)}** (${k.gross_margin_pct}%) | Operating Expenses: ${formatINR(k.total_expenses)}`,
      `• Current Month (${cm.month}): Billed ${formatINR(cm.project_billed)}, Profit ${formatINR(cm.project_profit)} (${cm.profit_pct}%)`,
    ].join('\n'),
    drafts: [],
    warnings: [],
    mode: 'offline',
  });
}

function detectAppControlCommand(db, snapshot, trimmed, lower, matchedClient, matchedEditor, amount) {
  const codeMatch = trimmed.match(/\b(SYN\d{4})\b/i);
  const matchedOrder = codeMatch
    ? snapshot.orders.find((o) => o.order_code.toUpperCase() === codeMatch[1].toUpperCase())
    : null;

  // 0A. WhatsApp payment reminder generation (voice/chat triggers reminder + link directly)
  if (/\b(remind|reminder|whatsapp|follow\s*up|followup|ping)\b/i.test(lower) && (matchedClient || matchedOrder)) {
    const res = generateAutoReminder(db, {
      orderId: matchedOrder?.id,
      clientId: matchedClient?.id,
    });
    return finalizeResponse({
      intent: 'whatsapp_reminder',
      answer: `Prepared WhatsApp reminder for **${res.client_name}**:\n\n${res.reminderText}`,
      spoken_summary: `Prepared WhatsApp reminder for ${res.client_name}. Ready to send.`,
      actions: [
        {
          type: 'whatsapp_reminder',
          client_id: matchedClient?.id ?? null,
          order_id: matchedOrder?.id ?? null,
          client_name: res.client_name,
          message: res.reminderText,
          waUrl: res.waUrl,
          label: `WhatsApp ${res.client_name}`,
        },
      ],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }

  // 0B. Export CSV / Backup JSON / Sync Cloud
  if (/\b(export|download|save)\b/i.test(lower) && /\b(csv|excel|sheet|spreadsheet)\b/i.test(lower)) {
    return finalizeResponse({
      intent: 'app_control',
      answer: 'Downloading CSV spreadsheet export of your ledger.',
      actions: [{ type: 'export_data', format: 'csv', label: 'Export CSV' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }
  if (/\b(export|download|take)\b/i.test(lower) && /\b(backup|json)\b/i.test(lower)) {
    return finalizeResponse({
      intent: 'app_control',
      answer: 'Downloading full JSON workspace backup.',
      actions: [{ type: 'export_data', format: 'backup', label: 'Download JSON backup' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }
  if (/\b(sync)\b/i.test(lower) && /\b(cloud|now|netlify|remote)\b/i.test(lower)) {
    return finalizeResponse({
      intent: 'app_control',
      answer: 'Syncing local ledger with cloud endpoint now.',
      actions: [{ type: 'sync_cloud', label: 'Sync cloud now' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }

  // 0C. Explicit Modal Open Commands
  if (/\b(open|show|launch|configure)\b/i.test(lower) && /\b(settings|api key|api keys|gemini key|groq key|cloud url|pin)\b/i.test(lower)) {
    return finalizeResponse({
      intent: 'app_control',
      answer: 'Opening workspace Settings.',
      actions: [{ type: 'open_modal', modal: 'settings', label: 'Opened Settings' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }
  if (/\b(connect|pair|show|open)\b/i.test(lower) && /\b(iphone|mobile|phone|qr|qr code)\b/i.test(lower)) {
    return finalizeResponse({
      intent: 'app_control',
      answer: 'Opening Connect iPhone & QR pairing dialog.',
      actions: [{ type: 'open_modal', modal: 'mobile', label: 'Opened Connect iPhone' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }
  if (/\b(import|upload)\b/i.test(lower) && /\b(csv|excel|xlsx|spreadsheet)\b/i.test(lower)) {
    return finalizeResponse({
      intent: 'app_control',
      answer: 'Opening Excel & CSV importer.',
      actions: [{ type: 'open_modal', modal: 'csv', label: 'Opened CSV Import' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }
  if (/^(?:open|show|launch)\s+(?:new\s+order(?:\s+modal|\s+form)?|order\s+form)$/i.test(trimmed)) {
    return finalizeResponse({
      intent: 'app_control',
      answer: 'Opening the New Order modal.',
      actions: [{ type: 'open_modal', modal: 'new_order', label: 'Opened New Order form' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }
  if (matchedOrder && /^(?:open|edit|view|inspect)\s+syn\d{4}$/i.test(trimmed)) {
    return finalizeResponse({
      intent: 'app_control',
      answer: `Opening ${matchedOrder.order_code} (${matchedOrder.client_name}).`,
      actions: [{ type: 'open_modal', modal: 'edit_order', order_id: matchedOrder.id, label: `Editing ${matchedOrder.order_code}` }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }
  if (/\b(open|launch)\b/i.test(lower) && /\b(payment|collect)\b/i.test(lower) && amount === null) {
    return finalizeResponse({
      intent: 'app_control',
      answer: `Opening record payment form${matchedClient ? ` for ${matchedClient.name}` : ''}.`,
      actions: [{ type: 'open_modal', modal: 'payment', client_id: matchedClient?.id ?? null, label: 'Opened Payment form' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }
  if (/\b(open|launch)\b/i.test(lower) && /\b(payout)\b/i.test(lower) && amount === null) {
    return finalizeResponse({
      intent: 'app_control',
      answer: `Opening editor payout form${matchedEditor ? ` for ${matchedEditor.name}` : ''}.`,
      actions: [{ type: 'open_modal', modal: 'payout', editor_id: matchedEditor?.id ?? null, label: 'Opened Payout form' }],
      drafts: [],
      warnings: [],
      mode: 'offline',
    });
  }

  // 0D. Navigation & Smart Filtering (only clear UI navigation phrases, never questions like "who owes me money?")
  const isNavVerb = /^(?:open|go\s+to|switch\s+to|navigate\s+to|take\s+me\s+to|show(?:\s+me)?(?:\s+the)?|view)\b/i.test(lower);
  const asksQuestionInstead = /\b(who|what|how|why|which|tell)\b/i.test(lower) || trimmed.endsWith('?');
  if (isNavVerb && !asksQuestionInstead) {
    if (/\b(overview|dashboard|home|analytics|stats)\b/i.test(lower)) {
      return finalizeResponse({
        intent: 'app_control',
        answer: 'Switched to Overview dashboard.',
        actions: [{ type: 'navigate', tab: 'overview', label: 'Overview' }],
        drafts: [],
        warnings: [],
        mode: 'offline',
      });
    }
    if (/\b(clients|client\s+list|customers)\b/i.test(lower)) {
      return finalizeResponse({
        intent: 'app_control',
        answer: 'Switched to Clients directory.',
        actions: [{ type: 'navigate', tab: 'clients', label: 'Clients' }],
        drafts: [],
        warnings: [],
        mode: 'offline',
      });
    }
    if (/\b(editors|team|freelancers)\b/i.test(lower)) {
      return finalizeResponse({
        intent: 'app_control',
        answer: 'Switched to Editors directory.',
        actions: [{ type: 'navigate', tab: 'editors', label: 'Editors' }],
        drafts: [],
        warnings: [],
        mode: 'offline',
      });
    }
    if (/\b(finances|p&l|pnl|accounting|expenses|ledger)\b/i.test(lower)) {
      return finalizeResponse({
        intent: 'app_control',
        answer: 'Switched to Finances & P&L.',
        actions: [{ type: 'navigate', tab: 'finances', label: 'Finances' }],
        drafts: [],
        warnings: [],
        mode: 'offline',
      });
    }
    if (/\b(orders|projects|jobs|kanban|board|unpaid|unassigned|rate\s+pending)\b/i.test(lower)) {
      const ordersFilter = { nonce: Date.now() };
      const tags = [];
      if (/\b(board|kanban)\b/i.test(lower)) {
        ordersFilter.viewMode = 'board';
        tags.push('Board view');
      } else {
        ordersFilter.viewMode = 'table';
      }
      if (/\bunpaid\b/i.test(lower)) {
        ordersFilter.paymentFilter = 'Unpaid';
        tags.push('Unpaid');
      } else if (/\b(rate\s*pending|tbd)\b/i.test(lower)) {
        ordersFilter.paymentFilter = 'Rate Pending';
        tags.push('Rate Pending');
      } else {
        ordersFilter.paymentFilter = 'all';
      }
      if (/\bunassigned\b/i.test(lower)) {
        ordersFilter.editorFilter = 'unassigned';
        tags.push('Unassigned');
      } else {
        ordersFilter.editorFilter = 'all';
      }
      if (/\bactive|open\b/i.test(lower)) {
        ordersFilter.stageFilter = 'active';
        tags.push('Active');
      } else {
        ordersFilter.stageFilter = 'all';
      }
      if (matchedClient) {
        ordersFilter.clientFilter = String(matchedClient.id);
        tags.push(matchedClient.name);
      } else {
        ordersFilter.clientFilter = 'all';
      }
      return finalizeResponse({
        intent: 'app_control',
        answer: `Opened Orders${tags.length ? ` (${tags.join(' · ')})` : ''}.`,
        actions: [{ type: 'navigate', tab: 'orders', label: `Orders${tags.length ? ` · ${tags.join(', ')}` : ''}`, ordersFilter }],
        drafts: [],
        warnings: [],
        mode: 'offline',
      });
    }
  }

  return null;
}

export function parseOfflineCommand(db, text) {
  return finalizeResponse(parseOfflineCommandCore(db, text));
}

function parseOfflineCommandCore(db, text) {
  const snapshot = getWorkspaceSnapshot(db);
  const today = snapshot.kpis.today;
  const trimmed = String(text || '').trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    throw new Error('Please enter a command or question');
  }

  const matchedClient = findMatchingClient(snapshot.clients, trimmed);
  const matchedEditor = findMatchingEditor(snapshot.editors, trimmed);
  const amount = parseAmountToken(trimmed);
  const parsedDate = detectDateFromText(trimmed, today) || today;
  const method = detectMethod(trimmed);

  // 0. App Control, Navigation, Modals, WhatsApp Reminders, Exports
  const controlResult = detectAppControlCommand(
    db,
    snapshot,
    trimmed,
    lower,
    matchedClient,
    matchedEditor,
    amount
  );
  if (controlResult) return controlResult;

  // 0E. Onboard New Client or Editor via voice/command (e.g. "Add client Apex Studio shorts 1200")
  const addClientMatch = trimmed.match(/^(?:add|new|create|onboard)\s+client\s+([A-Za-z0-9 &._'-]{2,40})/i);
  if (addClientMatch) {
    const rawName = addClientMatch[1]
      .replace(/\b(shorts?|video|edit|rate|with|at|rs|inr|rupees?)\b.*$/i, '')
      .trim();
    const rateShorts = /\bshorts?\b/i.test(lower) ? amount : null;
    const rateVideo = /\bvideo\b/i.test(lower) ? amount : null;
    if (rawName.length >= 2) {
      return finalizeResponse({
        intent: 'add_client',
        answer: `Prepared new client draft for **${rawName}**. Confirm to add to your directory.`,
        drafts: [
          {
            type: 'client',
            name: rawName,
            aliases: '',
            default_rate_shorts: rateShorts,
            default_rate_video: rateVideo,
            notes: '',
          },
        ],
        warnings: [],
        mode: 'offline',
      });
    }
  }

  const addEditorMatch = trimmed.match(/^(?:add|new|create|hire|onboard)\s+editor\s+([A-Za-z0-9 &._'-]{2,40})/i);
  if (addEditorMatch) {
    const rawName = addEditorMatch[1]
      .replace(/\b(shorts?|video|edit|rate|with|at|rs|inr|rupees?)\b.*$/i, '')
      .trim();
    const rateShorts = /\bshorts?\b/i.test(lower) ? amount : null;
    const rateVideo = /\bvideo\b/i.test(lower) ? amount : null;
    if (rawName.length >= 2) {
      return finalizeResponse({
        intent: 'add_editor',
        answer: `Prepared new editor draft for **${rawName}**. Confirm to add to your team.`,
        drafts: [
          {
            type: 'editor',
            name: rawName,
            specialty: /\bdesign|static\b/i.test(lower) ? 'Design / Static Ads' : 'Video & Shorts',
            default_rate_shorts: rateShorts,
            default_rate_video: rateVideo,
            is_self: false,
            notes: '',
          },
        ],
        warnings: [],
        mode: 'offline',
      });
    }
  }

  // 1. Question detection
  const isQuestion =
    trimmed.endsWith('?') ||
    /^(how|what|who|which|show|list|compare|tell me|give me|summary|status)\b/i.test(trimmed);
  if (isQuestion) {
    return answerQuestion(snapshot, trimmed);
  }

  // 2. Order update if explicit SYN code mentioned
  const codeMatch = trimmed.match(/\b(SYN\d{4})\b/i);
  if (codeMatch) {
    const code = codeMatch[1].toUpperCase();
    const order = snapshot.orders.find((o) => o.order_code.toUpperCase() === code);
    if (order) {
      const patch = {};
      if (matchedEditor) {
        patch.editor_id = matchedEditor.id;
        patch.editor_name = matchedEditor.name;
      }
      if (amount !== null) {
        if (/\b(editor|cost|fee|payout)\b/.test(lower) && matchedEditor) {
          patch.editor_cost = amount;
        } else if (/\b(paid|received|client)\b/.test(lower) && !matchedEditor) {
          patch.amount = amount;
        } else if (matchedEditor && !/\b(client|amount|price|bill)\b/.test(lower)) {
          patch.editor_cost = amount;
        } else {
          patch.amount = amount;
        }
      }
      if (/\bdelivered\b/.test(lower)) patch.production_status = 'Delivered';
      else if (/\bediting\b/.test(lower)) patch.production_status = 'Editing';
      else if (/\binternal review\b/.test(lower)) patch.production_status = 'Internal review';
      else if (/\bclient review\b/.test(lower)) patch.production_status = 'Client review';
      else if (/\bapproved\b/.test(lower)) patch.production_status = 'Approved';
      else if (/\brevision|revisions\b/.test(lower)) patch.production_status = 'Revisions';
      if (/\bsubmitted\b/.test(lower)) patch.editor_work_submitted = true;
      patch.needs_review = false;

      return {
        intent: 'order_update',
        answer: `Prepared update draft for ${order.order_code} (${order.client_name}). Review and confirm below.`,
        drafts: [
          {
            type: 'order_update',
            order_id: order.id,
            order_code: order.order_code,
            client_name: order.client_name,
            patch,
          },
        ],
        warnings: [],
        mode: 'offline',
      };
    }
  }

  // 3. Expense draft
  if (/\b(expense|spent|software|adobe|premiere|after effects|canva|capcut|subscription|equipment|marketing|tools)\b/i.test(lower) && amount !== null) {
    let category = 'Other';
    if (/\b(software|adobe|premiere|canva|capcut|subscription|saas)\b/i.test(lower)) category = 'Software';
    else if (/\b(tool|tools|plugin)\b/i.test(lower)) category = 'Tools';
    else if (/\b(marketing|ads|ad)\b/i.test(lower)) category = 'Marketing';
    else if (/\b(equipment|mic|camera|ssd|drive|laptop)\b/i.test(lower)) category = 'Equipment';

    return {
      intent: 'expense',
      answer: 'Prepared operating expense draft. Confirm to save.',
      drafts: [
        {
          type: 'expense',
          expense_date: parsedDate,
          category,
          amount,
          description: trimmed,
          notes: '',
        },
      ],
      warnings: [],
      mode: 'offline',
    };
  }

  // 4. Editor payout draft (e.g. "Paid Rohan 1750", "Pay Kabir 450", "Settle Rohan")
  const isPayoutIntent =
    matchedEditor &&
    !matchedClient &&
    /\b(paid|pay|settle|payout|settled|sent)\b/i.test(lower) &&
    !/\b(make|new|short|reel|video|script|blog|assign)\b/i.test(lower);

  if (isPayoutIntent) {
    const payoutAmount = amount ?? (matchedEditor.payout_due > 0 ? matchedEditor.payout_due : null);
    const openOrders = snapshot.orders
      .filter((o) => o.editor_id === matchedEditor.id && o.editor_work_submitted && o.editor_balance_due > 0)
      .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.id - b.id);

    const warnings = [];
    if (!payoutAmount) warnings.push(`Amount could not be read; enter exact payout amount before confirming.`);
    if (openOrders.length === 0) {
      warnings.push(`${matchedEditor.name} has ₹0 in submitted unpaid orders; payout will be saved as unallocated advance.`);
    }

    return {
      intent: 'editor_payout',
      answer: `Prepared payout draft for ${matchedEditor.name}. Review allocations and confirm.`,
      drafts: [
        {
          type: 'editor_payout',
          editor_id: matchedEditor.id,
          editor_name: matchedEditor.name,
          payout_date: parsedDate,
          amount: payoutAmount ?? 0,
          method,
          mode: 'fifo',
          open_orders: openOrders.map((o) => ({
            id: o.id,
            order_code: o.order_code,
            title: o.title,
            order_date: o.order_date,
            balance_due: o.editor_balance_due,
          })),
          notes: '',
        },
      ],
      warnings,
      mode: 'offline',
    };
  }

  // 5. Client payment draft (e.g. "Bloom Care sent 5k", "Bloom Care paid 4000 UPI")
  const hasDeliverablePhrase =
    /\b(make|new|order|orders|assign|shorts?|reels?|static\s+ads?|ads?|creatives?|banners?|videos?|scripts?|blogs?|posts?|thumbnails?|menus?|package|retainer)\b/i.test(
      lower
    );
  const isPaymentIntent =
    (/\b(sent|paid|payment|received|got|came|transferred|upi|gpay|phonepe)\b/i.test(lower) &&
      amount !== null &&
      !hasDeliverablePhrase) ||
    (/\bpayment\b/i.test(lower) && matchedClient && amount !== null && !hasDeliverablePhrase);

  if (isPaymentIntent) {
    const openOrders = matchedClient
      ? snapshot.orders
          .filter((o) => o.client_id === matchedClient.id && o.balance_due > 0)
          .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.id - b.id)
      : [];
    const ratePendingOrders = matchedClient
      ? snapshot.orders.filter((o) => o.client_id === matchedClient.id && o.amount === null)
      : [];

    const warnings = [];
    if (!matchedClient) warnings.push('Could not identify which client sent this payment. Please select the client.');
    if (matchedClient && openOrders.length === 0) {
      if (ratePendingOrders.length > 0) {
        warnings.push(
          `${matchedClient.name} has ${ratePendingOrders.map((o) => o.order_code).join(', ')} marked "Rate Pending". You can confirm now to store as unallocated advance, or set the order price first.`
        );
      } else {
        warnings.push(`${matchedClient.name} has ₹0 unpaid balance; confirming will store ₹${amount} as unallocated advance.`);
      }
    }

    return {
      intent: 'client_payment',
      answer: `Prepared client payment draft${matchedClient ? ` for ${matchedClient.name}` : ''}. Confirm to record and allocate.`,
      drafts: [
        {
          type: 'client_payment',
          client_id: matchedClient?.id ?? null,
          client_name: matchedClient?.name ?? '',
          payment_date: parsedDate,
          amount: amount ?? 0,
          method,
          mode: 'fifo',
          open_orders: openOrders.map((o) => ({
            id: o.id,
            order_code: o.order_code,
            title: o.title,
            order_date: o.order_date,
            balance_due: o.balance_due,
          })),
          notes: '',
        },
      ],
      warnings,
      mode: 'offline',
    };
  }

  // 6. Multi-order batch extraction (numbered/bulleted lines like "1) ... 2) ..." or multi-line requests)
  const bulletMatches = [...trimmed.matchAll(/(?:^|\n|\s)(?:\d+[.)]|[-*])\s+([^\n]+)/g)];
  let multiParts = [];
  if (bulletMatches.length >= 2) {
    multiParts = bulletMatches.map((m) => m[1].trim()).filter(Boolean);
  } else if (trimmed.includes('\n')) {
    const lines = trimmed
      .split('\n')
      .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
      .filter((l) => l.length > 3);
    if (lines.length >= 2) multiParts = lines;
  }

  if (multiParts.length >= 2) {
    const baseCategory = detectCategory(trimmed, 'Shorts');
    const sharedDeadline = detectDateFromText(trimmed, today);
    const warnings = [];
    if (!matchedClient) warnings.push('Client was not detected automatically — select the client before confirming.');

    const drafts = multiParts.map((part) => {
      const cat = detectCategory(part, baseCategory);
      const itemAmt = parseAmountToken(part);
      const itemEditor = findMatchingEditor(snapshot.editors, part) || matchedEditor;
      const title = cleanTopicTitle(part, matchedClient, itemEditor, cat);
      const suggestedRate =
        itemAmt ??
        (cat === 'Shorts'
          ? matchedClient?.default_rate_shorts ?? null
          : cat === 'Video Edit'
          ? matchedClient?.default_rate_video ?? null
          : null);

      return {
        type: 'order',
        client_id: matchedClient?.id ?? null,
        client_name: matchedClient?.name ?? '',
        order_date: today,
        title,
        category: cat,
        brief: part,
        billing_type: /\b(monthly|package|retainer)\b/i.test(trimmed) ? 'monthly_package' : 'one_off',
        service_period: '',
        amount: itemAmt,
        suggested_amount: itemAmt == null ? suggestedRate : null,
        editor_id: itemEditor?.id ?? null,
        editor_name: itemEditor?.name ?? '',
        editor_cost: itemEditor?.is_self ? 0 : itemEditor?.default_rate_shorts && cat === 'Shorts' ? itemEditor.default_rate_shorts : 0,
        production_deadline: detectDateFromText(part, today) || sharedDeadline,
        payment_due_date: null,
      };
    });

    return {
      intent: 'batch_orders',
      answer: `Extracted ${drafts.length} separate orders from your message. Review each before saving.`,
      drafts,
      warnings,
      mode: 'offline',
    };
  }

  // 7. Single Order Draft (with Self-Fulfilling automation for priced & package orders)
  const category = detectCategory(trimmed, 'Shorts');
  const pkg = detectDeliverablePackage(trimmed, category);
  const title = cleanTopicTitle(trimmed, matchedClient, matchedEditor, category);
  const billingType =
    /\b(monthly|package|retainer)\b/i.test(lower) || pkg.quantity >= 5 ? 'monthly_package' : 'one_off';
  const explicitDeadline = detectDateFromText(trimmed, today);
  const unitRate = amount != null && pkg.quantity > 1 ? round2(amount / pkg.quantity) : null;
  const briefText =
    pkg.quantity > 1 && amount != null
      ? `${trimmed} (${pkg.quantity} units @ ₹${unitRate}/unit)`
      : trimmed;

  const sugg = autoSuggestFromSnapshot(snapshot, {
    clientId: matchedClient?.id ?? null,
    clientName: matchedClient?.name ?? '',
    category,
    amount,
    quantity: pkg.quantity,
  });

  const suggestedRate =
    amount ??
    sugg.clientRate?.amount ??
    (category === 'Shorts'
      ? matchedClient?.default_rate_shorts ?? null
      : category === 'Video Edit'
      ? matchedClient?.default_rate_video ?? null
      : null);

  // Self-fulfill editor, editor cost, deadline & due date whenever price is known and editor wasn't explicitly named
  const canSelfFulfillEditor = amount !== null && !matchedEditor && Boolean(sugg.editor);
  const resolvedEditor = matchedEditor
    ? matchedEditor
    : canSelfFulfillEditor
    ? { id: sugg.editor.id, name: sugg.editor.name, is_self: sugg.editor.is_self }
    : null;

  const resolvedEditorCost = matchedEditor
    ? matchedEditor.is_self
      ? 0
      : category === 'Shorts' && matchedEditor.default_rate_shorts
      ? round2(matchedEditor.default_rate_shorts * pkg.quantity)
      : sugg.editor && sugg.editor.id === matchedEditor.id && sugg.editor.suggestedCost != null
      ? sugg.editor.suggestedCost
      : 0
    : canSelfFulfillEditor
    ? sugg.editor.suggestedCost ?? 0
    : 0;

  const resolvedDeadline = explicitDeadline || (amount !== null ? sugg.deadline.date : null);
  const autoFilledFields = [];
  if (pkg.quantity > 1) autoFilledFields.push(`${pkg.quantity} units`);
  if (canSelfFulfillEditor) autoFilledFields.push(`editor → ${resolvedEditor.name}`);
  if (canSelfFulfillEditor && resolvedEditorCost > 0) autoFilledFields.push(`cost → ₹${resolvedEditorCost}`);
  if (!explicitDeadline && resolvedDeadline) autoFilledFields.push(`due → ${resolvedDeadline}`);

  const warnings = [];
  if (!matchedClient) {
    warnings.push('No existing client matched — choose or enter a client name before saving.');
  }
  if (amount === null) {
    warnings.push(
      suggestedRate != null
        ? `No price specified in command (suggested usual rate: ₹${suggestedRate}, or leave blank as Rate Pending).`
        : 'No price specified — will save as Rate Pending (TBD) unless you fill an amount.'
    );
  }
  if (!matchedEditor && !canSelfFulfillEditor) {
    warnings.push('No editor specified — order will start as Unassigned so you see it in Needs Attention.');
  }

  return {
    intent: 'order',
    answer: canSelfFulfillEditor
      ? `Auto-fulfilled ${pkg.quantity > 1 ? `${pkg.quantity}× ${category}` : category} draft${
          matchedClient ? ` for ${matchedClient.name}` : ''
        } (${autoFilledFields.join(', ')}).`
      : `Prepared new order draft${matchedClient ? ` for ${matchedClient.name}` : ''}. Confirm to create.`,
    drafts: [
      {
        type: 'order',
        client_id: matchedClient?.id ?? null,
        client_name: matchedClient?.name ?? '',
        order_date: today,
        title,
        category,
        brief: briefText,
        billing_type: billingType,
        service_period: billingType === 'monthly_package' ? today.slice(0, 7) : '',
        amount,
        suggested_amount: amount == null ? suggestedRate : null,
        quantity: pkg.quantity,
        unit_rate: unitRate,
        editor_id: resolvedEditor?.id ?? null,
        editor_name: resolvedEditor?.name ?? '',
        editor_cost: resolvedEditorCost,
        production_deadline: resolvedDeadline,
        payment_due_date: amount !== null ? sugg.paymentDue.date : null,
        production_status: resolvedEditor ? 'Assigned' : 'Unassigned',
        auto_filled_fields: autoFilledFields,
        suggestions: sugg,
      },
    ],
    warnings,
    mode: 'offline',
  };
}

const DESIGN_CATEGORIES = new Set(['Static Ads', 'Instagram Posts', 'Menu Design', 'Thumbnails']);

function daysBetweenIso(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const a = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${endIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = Math.round((b - a) / 86400000);
  return diff >= 0 && diff <= 60 ? diff : null;
}

export function autoSuggestFromSnapshot(
  snapshot,
  opts = {}
) {
  const clientId = opts.clientId ?? opts.client_id ?? null;
  const clientName = opts.clientName ?? opts.client_name ?? '';
  const category = opts.category || 'Shorts';
  const amount = opts.amount ?? null;
  const quantity = opts.quantity ?? 1;
  const today = snapshot.kpis?.today || localTodayIso();
  const orders = snapshot.orders || [];
  const editors = snapshot.editors || [];
  const clients = snapshot.clients || [];

  const resolvedClient =
    (clientId ? clients.find((c) => c.id === Number(clientId)) : null) ||
    (clientName ? findMatchingClient(clients, clientName) : null);

  const ownerNameLower = String(snapshot.settings?.owner_name || '').trim().toLowerCase();
  // Rank non-self editors using 3 tiers: (client+category) -> (category or sibling design) -> (overall non-self)
  const nonSelfEditors = editors.filter((e) => {
    if (e.is_self) return false;
    const nl = e.name.trim().toLowerCase();
    if (nl === 'owner' || nl === 'self' || (ownerNameLower && nl === ownerNameLower)) return false;
    return true;
  });
  const rankPool = (list) => {
    const counts = new Map();
    for (const o of list) {
      if (!o.editor_id) continue;
      const ed = nonSelfEditors.find((e) => e.id === o.editor_id);
      if (!ed) continue;
      const entry = counts.get(o.editor_id) || { count: 0, ratios: [] };
      entry.count += 1;
      if (o.amount > 0 && o.editor_cost > 0) {
        const r = o.editor_cost / o.amount;
        if (r > 0 && r <= 0.95) entry.ratios.push(r);
      }
      counts.set(o.editor_id, entry);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  };

  let reason = '';
  let ranked = [];
  if (resolvedClient) {
    ranked = rankPool(
      orders.filter((o) => o.client_id === resolvedClient.id && o.category === category)
    );
    if (ranked.length > 0) {
      reason = `Usually handles ${category} for ${resolvedClient.name} (${ranked[0][1].count} orders)`;
    }
  }
  if (ranked.length === 0) {
    ranked = rankPool(orders.filter((o) => o.category === category));
    if (ranked.length > 0) {
      reason = `Top ${category} editor (${ranked[0][1].count} past orders)`;
    }
  }
  if (ranked.length === 0 && DESIGN_CATEGORIES.has(category)) {
    ranked = rankPool(orders.filter((o) => DESIGN_CATEGORIES.has(o.category)));
    if (ranked.length > 0) {
      reason = `Handled recent design deliverables (${ranked[0][1].count} orders)`;
    }
  }
  if (ranked.length === 0) {
    ranked = rankPool(orders);
    if (ranked.length > 0) {
      reason = `Most active team editor (${ranked[0][1].count} orders)`;
    }
  }

  // Fallback average agency payout ratio when chosen editor has no priced ratio yet
  const agencyRatios = orders
    .filter((o) => o.amount > 0 && o.editor_cost > 0 && !o.editor_is_self)
    .map((o) => o.editor_cost / o.amount)
    .filter((r) => r > 0 && r <= 0.95);
  const agencyAvgRatio =
    agencyRatios.length > 0
      ? agencyRatios.reduce((s, r) => s + r, 0) / agencyRatios.length
      : 0.55;

  let editorSuggestion = null;
  if (ranked.length > 0) {
    const [bestEditorId, stats] = ranked[0];
    const ed = editors.find((e) => e.id === bestEditorId);
    if (ed) {
      const avgRatio =
        stats.ratios.length > 0
          ? stats.ratios.reduce((s, r) => s + r, 0) / stats.ratios.length
          : agencyAvgRatio;
      const numericAmt = amount !== null && amount !== undefined && amount !== '' ? Number(amount) : null;
      let suggestedCost = null;
      if (numericAmt && numericAmt > 0) {
        suggestedCost = round2(numericAmt * avgRatio);
      } else if (category === 'Shorts' && ed.default_rate_shorts) {
        suggestedCost = round2(ed.default_rate_shorts * Math.max(1, quantity || 1));
      } else if (category === 'Video Edit' && ed.default_rate_video) {
        suggestedCost = round2(ed.default_rate_video * Math.max(1, quantity || 1));
      }

      editorSuggestion = {
        id: ed.id,
        name: ed.name,
        is_self: Boolean(ed.is_self),
        confidence: stats.count >= 3 ? 'high' : 'medium',
        reason,
        suggestedCost,
        avgCostPct: Math.round(avgRatio * 100),
      };
    }
  }

  // Turnaround days calculation
  const turnaroundSamples = orders
    .filter((o) => o.category === category && o.production_deadline && o.order_date)
    .map((o) => daysBetweenIso(o.order_date, o.production_deadline))
    .filter((d) => d !== null);

  let defaultDays = 5;
  if (category === 'Shorts' || category === 'Script Writing' || category === 'Instagram Posts') defaultDays = 3;
  if ((quantity || 1) >= 10) defaultDays = 10;

  const avgDays =
    turnaroundSamples.length > 0
      ? Math.max(1, Math.round(turnaroundSamples.reduce((s, d) => s + d, 0) / turnaroundSamples.length))
      : defaultDays;

  // Client usual rate for category
  let clientRate = null;
  if (resolvedClient) {
    const prevOrders = orders.filter(
      (o) => o.client_id === resolvedClient.id && o.category === category && o.amount !== null && o.amount > 0
    );
    if (prevOrders.length > 0) {
      clientRate = {
        amount: prevOrders[0].amount,
        reason: `Last ${category} rate for ${resolvedClient.name}`,
      };
    } else if (category === 'Shorts' && resolvedClient.default_rate_shorts) {
      clientRate = {
        amount: resolvedClient.default_rate_shorts,
        reason: `Default Shorts rate for ${resolvedClient.name}`,
      };
    } else if (category === 'Video Edit' && resolvedClient.default_rate_video) {
      clientRate = {
        amount: resolvedClient.default_rate_video,
        reason: `Default Video rate for ${resolvedClient.name}`,
      };
    }
  }

  return {
    editor: editorSuggestion,
    deadline: {
      date: addDaysIsoStr(today, avgDays),
      days: avgDays,
      reason:
        turnaroundSamples.length > 0
          ? `Avg ${avgDays}-day turnaround for ${category}`
          : `Default ${avgDays}-day schedule for ${category}`,
    },
    paymentDue: {
      date: addDaysIsoStr(today, (quantity || 1) >= 10 ? 15 : 7),
      days: (quantity || 1) >= 10 ? 15 : 7,
    },
    clientRate,
  };
}

export function autoSuggestForOrder(db, opts = {}) {
  const snapshot = getWorkspaceSnapshot(db);
  return autoSuggestFromSnapshot(snapshot, opts);
}

const PROVIDER_DEFAULTS = {
  groq: {
    label: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
    settingKey: 'groq_api_key',
  },
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-2.5-flash',
    envKey: 'GEMINI_API_KEY',
    settingKey: 'gemini_api_key',
  },
  openrouter: {
    label: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    envKey: 'OPENROUTER_API_KEY',
    settingKey: 'openrouter_api_key',
  },
  openai: {
    label: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    settingKey: 'openai_api_key',
  },
};

function extractJsonObject(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    const fenced = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // continue
      }
    }
    const start = txt.indexOf('{');
    const end = txt.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(txt.slice(start, end + 1));
    }
    throw new Error('Provider returned invalid JSON');
  }
}

async function callProviderJson(provider, apiKey, modelOverride, systemPrompt, userText) {
  const cfg = PROVIDER_DEFAULTS[provider];
  if (!cfg) throw new Error(`Unsupported AI provider: ${provider}`);
  const targetModel = (modelOverride || '').trim() || cfg.model;

  if (provider === 'gemini') {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
      }
    );
    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
    const json = await resp.json();
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return { parsed: extractJsonObject(raw), model: targetModel };
  }

  // OpenAI-compatible: Groq, OpenRouter, OpenAI
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://editdesk.local';
    headers['X-Title'] = 'EditDesk Agency OS';
  }
  const body = {
    model: targetModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    temperature: 0.1,
  };
  if (provider === 'openai' || provider === 'groq') {
    body.response_format = { type: 'json_object' };
  }

  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`${cfg.label} HTTP ${resp.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`);
  }
  const json = await resp.json();
  return {
    parsed: extractJsonObject(json.choices?.[0]?.message?.content || '{}'),
    model: targetModel,
  };
}

function getProviderKey(settings, provider, preferredLegacyProvider) {
  const cfg = PROVIDER_DEFAULTS[provider];
  if (!cfg) return '';
  const specific = (settings[cfg.settingKey] || '').trim();
  if (specific) return specific;
  const legacy = (settings.ai_api_key || '').trim();
  if (legacy && preferredLegacyProvider === provider) return legacy;
  return (process.env[cfg.envKey] || '').trim();
}

function resolveProviderChain(settings) {
  const configured = settings.ai_provider || 'offline';
  const legacyTarget = ['groq', 'gemini', 'openrouter', 'openai'].includes(configured) ? configured : '';
  const allOrder = ['groq', 'gemini', 'openrouter', 'openai'];

  if (configured === 'offline') {
    // Only use env keys if user hasn't explicitly configured legacy key, keeping offline override safe unless keys exist
    const envOnly = allOrder
      .map((p) => ({ provider: p, key: (process.env[PROVIDER_DEFAULTS[p].envKey] || '').trim(), customModel: '' }))
      .filter((x) => Boolean(x.key));
    return envOnly;
  }

  const ordered =
    configured === 'auto'
      ? allOrder
      : [configured, ...allOrder.filter((p) => p !== configured)];

  return ordered
    .map((p) => ({
      provider: p,
      key: getProviderKey(settings, p, legacyTarget),
      customModel: p === configured ? (settings.ai_model || '').trim() : '',
    }))
    .filter((x) => Boolean(x.key));
}

export async function testAiProviders(db, overrideKeys = {}) {
  const settings = { ...getSettingMap(db), ...overrideKeys };
  const results = [];
  for (const provider of ['groq', 'gemini', 'openrouter', 'openai']) {
    const key = (overrideKeys[PROVIDER_DEFAULTS[provider].settingKey] || '').trim() || getProviderKey(settings, provider, settings.ai_provider);
    if (!key) {
      results.push({ provider, label: PROVIDER_DEFAULTS[provider].label, configured: false, ok: false, error: 'No key set' });
      continue;
    }
    const t0 = Date.now();
    try {
      const { parsed, model } = await callProviderJson(
        provider,
        key,
        '',
        'Reply ONLY with JSON: {"ok":true}',
        'ping'
      );
      results.push({
        provider,
        label: PROVIDER_DEFAULTS[provider].label,
        configured: true,
        ok: Boolean(parsed),
        model,
        ms: Date.now() - t0,
      });
    } catch (err) {
      results.push({
        provider,
        label: PROVIDER_DEFAULTS[provider].label,
        configured: true,
        ok: false,
        ms: Date.now() - t0,
        error: err.message,
      });
    }
  }
  return results;
}

export async function runAiCommand(db, text) {
  const settings = getSettingMap(db);
  const snapshot = getWorkspaceSnapshot(db);
  const trimmed = String(text || '').trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    throw new Error('Please enter a command or question');
  }

  // Instant zero-latency deterministic app control (navigation, modals, reminders, exports, cloud sync)
  const quickClient = findMatchingClient(snapshot.clients, trimmed);
  const quickEditor = findMatchingEditor(snapshot.editors, trimmed);
  const quickAmount = parseAmountToken(trimmed);
  const instantControl = detectAppControlCommand(
    db,
    snapshot,
    trimmed,
    lower,
    quickClient,
    quickEditor,
    quickAmount
  );
  if (instantControl) return instantControl;

  const chain = resolveProviderChain(settings);
  if (chain.length === 0) {
    return parseOfflineCommand(db, text);
  }

  const today = snapshot.kpis.today;
  const a = snapshot.analytics || {};

  const systemPrompt = `You are EditDesk AI, an autonomous agency operations & voice control agent for an Indian creative/video-editing studio (INR ₹).
Today's date: ${today}.
Clients: ${snapshot.clients.map((c) => `${c.name} (id:${c.id}, due:₹${c.outstanding_due}, rate_shorts:${c.default_rate_shorts ?? 'none'})`).join('; ')}.
Editors: ${snapshot.editors.map((e) => `${e.name} (id:${e.id}, is_self:${e.is_self}, due:₹${e.payout_due})`).join('; ')}.
Recent Orders: ${snapshot.orders.slice(0, 15).map((o) => `${o.order_code}:${o.client_name}/${o.title}/${o.category}/₹${o.amount ?? 'TBD'}/ed:${o.editor_name || 'none'}(₹${o.editor_cost})/${o.production_status}`).join('; ')}.
KPIs: Billed ₹${snapshot.kpis.total_billed}, Collected ₹${snapshot.kpis.total_collected}, Receivable ₹${snapshot.kpis.total_receivable}, Editor Due ₹${snapshot.kpis.total_editor_due}, Gross Profit ₹${snapshot.kpis.gross_project_profit} (${snapshot.kpis.gross_margin_pct}%), Collection Rate ${a.collection_rate_pct ?? 0}%, Avg Order ₹${a.avg_order_value ?? 0}.

Rules:
- You control BOTH ledger records AND the UI (navigation, modals, filters, WhatsApp reminders, exports, cloud sync).
- NEVER invent unknown client prices. If client amount is unknown, set amount to null.
- Recognize package quantities like "30 static ads for 10k" -> category:"Static Ads", title:"30 Static Ads", quantity:30, amount:10000, billing_type:"monthly_package".
- If user didn't name an editor on a priced order, pick the best matching non-self editor from history or leave null so EditDesk auto-fulfills it.
- Keep "spoken_summary" concise (1-2 natural spoken sentences without markdown or asterisks) for text-to-speech playback.
- Return STRICT JSON matching:
{
  "intent": "order" | "batch_orders" | "client_payment" | "editor_payout" | "expense" | "order_update" | "add_client" | "add_editor" | "whatsapp_reminder" | "app_control" | "answer",
  "answer": "short helpful message",
  "spoken_summary": "concise plain sentence for voice read-aloud",
  "warnings": ["any missing/ambiguous items"],
  "actions": [
    // Optional UI control actions:
    // { "type":"navigate", "tab":"overview"|"orders"|"clients"|"editors"|"finances"|"ai", "ordersFilter":{ "viewMode":"table"|"board", "paymentFilter":"all"|"Unpaid"|"Rate Pending", "stageFilter":"all"|"active", "editorFilter":"all"|"unassigned" } }
    // { "type":"open_modal", "modal":"new_order"|"payment"|"payout"|"settings"|"mobile"|"csv"|"edit_order", "client_id":number|null, "editor_id":number|null, "order_id":number|null }
    // { "type":"whatsapp_reminder", "client_id":number|null, "order_id":number|null }
    // { "type":"export_data", "format":"csv"|"backup" }
    // { "type":"sync_cloud" }
  ],
  "drafts": [
    // For order/batch_orders:
    // { "type":"order", "client_id":number|null, "client_name":string, "order_date":"YYYY-MM-DD", "title":string, "category":"Shorts"|"Static Ads"|"Video Edit"|"Script Writing"|"Website Blogs"|"Instagram Posts"|"Menu Design"|"Thumbnails"|"Other", "quantity":number, "brief":string, "billing_type":"one_off"|"monthly_package", "service_period":string, "amount":number|null, "editor_id":number|null, "editor_name":string, "editor_cost":number, "production_deadline":"YYYY-MM-DD"|null, "payment_due_date":"YYYY-MM-DD"|null }
    // For client_payment:
    // { "type":"client_payment", "client_id":number|null, "client_name":string, "payment_date":"YYYY-MM-DD", "amount":number, "method":"UPI"|"Bank Transfer"|"Cash"|"Card"|"Other", "mode":"fifo", "notes":string }
    // For editor_payout:
    // { "type":"editor_payout", "editor_id":number|null, "editor_name":string, "payout_date":"YYYY-MM-DD", "amount":number, "method":"UPI"|"Bank Transfer"|"Cash", "mode":"fifo", "notes":string }
    // For expense:
    // { "type":"expense", "expense_date":"YYYY-MM-DD", "category":"Software"|"Tools"|"Marketing"|"Equipment"|"Other", "description":string, "amount":number, "notes":string }
    // For client onboarding:
    // { "type":"client", "name":string, "aliases":string, "default_rate_shorts":number|null, "default_rate_video":number|null, "notes":string }
    // For editor onboarding:
    // { "type":"editor", "name":string, "specialty":string, "default_rate_shorts":number|null, "default_rate_video":number|null, "is_self":false, "notes":string }
    // For order_update:
    // { "type":"order_update", "order_id":number, "order_code":string, "client_name":string, "patch":{ "production_status":string, "editor_id":number|null, "amount":number, "editor_cost":number, "editor_work_submitted":boolean } }
  ]
}`;

  const errors = [];
  for (const item of chain) {
    try {
      const { parsed, model: usedModel } = await callProviderJson(
        item.provider,
        item.key,
        item.customModel,
        systemPrompt,
        text
      );

      const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
      for (const d of drafts) {
        if (d.type === 'order') {
          const matchedClient =
            (d.client_id ? snapshot.clients.find((c) => c.id === Number(d.client_id)) : null) ||
            (d.client_name ? findMatchingClient(snapshot.clients, d.client_name) : null);
          if (matchedClient) {
            d.client_id = matchedClient.id;
            d.client_name = matchedClient.name;
          }
          const matchedEd =
            (d.editor_id ? snapshot.editors.find((e) => e.id === Number(d.editor_id)) : null) ||
            (d.editor_name ? findMatchingEditor(snapshot.editors, d.editor_name) : null);
          if (matchedEd) {
            d.editor_id = matchedEd.id;
            d.editor_name = matchedEd.name;
          }
          const qty = Math.max(1, Number(d.quantity || 1));
          const sugg = autoSuggestFromSnapshot(snapshot, {
            clientId: d.client_id ?? null,
            clientName: d.client_name || '',
            category: d.category || 'Shorts',
            amount: d.amount ?? null,
            quantity: qty,
          });
          const autoFilled = [];
          if (!d.editor_id && d.amount !== null && sugg.editor) {
            d.editor_id = sugg.editor.id;
            d.editor_name = sugg.editor.name;
            autoFilled.push(`editor → ${sugg.editor.name}`);
          }
          if ((d.editor_cost === undefined || d.editor_cost === null || Number(d.editor_cost) === 0) && d.editor_id && d.amount > 0) {
            const edObj = snapshot.editors.find((e) => e.id === Number(d.editor_id));
            if (edObj && !edObj.is_self && sugg.editor?.suggestedCost) {
              d.editor_cost = sugg.editor.suggestedCost;
              autoFilled.push(`cost → ₹${d.editor_cost}`);
            }
          }
          if (!d.production_deadline && sugg.deadline) {
            d.production_deadline = sugg.deadline.date;
            autoFilled.push(`due → ${sugg.deadline.date}`);
          }
          if (!d.payment_due_date && d.amount !== null && sugg.paymentDue) {
            d.payment_due_date = sugg.paymentDue.date;
          }
          if (d.amount == null && sugg.clientRate) {
            d.suggested_amount = sugg.clientRate.amount;
          }
          if (qty > 1 && d.amount > 0) {
            d.unit_rate = round2(d.amount / qty);
          }
          d.quantity = qty;
          d.auto_filled_fields = autoFilled;
          d.suggestions = sugg;
        } else if (d.type === 'client_payment' && d.client_id) {
          d.open_orders = snapshot.orders
            .filter((o) => o.client_id === Number(d.client_id) && o.balance_due > 0)
            .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.id - b.id)
            .map((o) => ({
              id: o.id,
              order_code: o.order_code,
              title: o.title,
              order_date: o.order_date,
              balance_due: o.balance_due,
            }));
        } else if (d.type === 'editor_payout' && d.editor_id) {
          d.open_orders = snapshot.orders
            .filter((o) => o.editor_id === Number(d.editor_id) && o.editor_work_submitted && o.editor_balance_due > 0)
            .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.id - b.id)
            .map((o) => ({
              id: o.id,
              order_code: o.order_code,
              title: o.title,
              order_date: o.order_date,
              balance_due: o.editor_balance_due,
            }));
        }
      }

      const resolvedActions = [];
      for (const act of Array.isArray(parsed.actions) ? parsed.actions : []) {
        if (act?.type === 'whatsapp_reminder' && (act.client_id || act.order_id)) {
          try {
            const rem = generateAutoReminder(db, {
              orderId: act.order_id ?? undefined,
              clientId: act.client_id ?? undefined,
            });
            resolvedActions.push({
              type: 'whatsapp_reminder',
              client_id: act.client_id ?? null,
              order_id: act.order_id ?? null,
              client_name: rem.client_name,
              message: rem.reminderText,
              waUrl: rem.waUrl,
              label: `WhatsApp ${rem.client_name}`,
            });
          } catch {
            // ignore bad id from LLM
          }
        } else if (act?.type) {
          resolvedActions.push(act);
        }
      }

      return finalizeResponse({
        intent: parsed.intent || 'answer',
        answer: parsed.answer || 'Ready for confirmation.',
        spoken_summary: parsed.spoken_summary,
        drafts,
        actions: resolvedActions,
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        mode: `${item.provider} (${usedModel})`,
      });
    } catch (err) {
      errors.push(`${item.provider}: ${err.message}`);
    }
  }

  const fallback = parseOfflineCommand(db, text);
  fallback.warnings = [
    ...(fallback.warnings || []),
    `Used offline smart engine (cloud fallback: ${errors.join(' | ')})`,
  ];
  return fallback;
}

export function generateClientReminder(db, clientId) {
  const snapshot = getWorkspaceSnapshot(db);
  const client = snapshot.clients.find((c) => c.id === Number(clientId));
  if (!client) throw new Error('Client not found');

  const unpaidOrders = snapshot.orders
    .filter((o) => o.client_id === client.id && o.balance_due > 0)
    .sort((a, b) => a.order_date.localeCompare(b.order_date));
  const ratePending = snapshot.orders.filter((o) => o.client_id === client.id && o.amount === null);

  const lines = [`Hi ${client.name}, sharing a quick summary of pending deliverables & balance:`];
  for (const o of unpaidOrders) {
    lines.push(`• ${o.order_code} (${o.order_date}) — ${o.title}: ₹${o.balance_due.toLocaleString('en-IN')}`);
  }
  if (ratePending.length > 0) {
    lines.push(
      `• Rate Pending: ${ratePending.map((o) => `${o.order_code} (${o.title})`).join(', ')}`
    );
  }
  if (client.unallocated_advance > 0) {
    lines.push(`• Advance Credit Available: -₹${client.unallocated_advance.toLocaleString('en-IN')}`);
  }
  lines.push(`\nTotal Balance Due: ₹${client.outstanding_due.toLocaleString('en-IN')}`);
  lines.push('Thank you!');

  const message = lines.join('\n');
  return {
    client_id: client.id,
    client_name: client.name,
    outstanding_due: client.outstanding_due,
    message,
    waUrl: `https://wa.me/?text=${encodeURIComponent(message)}`,
  };
}

export function generateAutoReminder(db, { orderId, clientId } = {}) {
  const snapshot = getWorkspaceSnapshot(db);
  if (orderId) {
    const order = snapshot.orders.find((o) => o.id === Number(orderId));
    if (!order) throw new Error('Order not found');
    const bal = order.balance_due ?? 0;
    const reminderText = [
      `Hi ${order.client_name},`,
      `Friendly reminder for ${order.title} (${order.order_code}, dated ${order.order_date}).`,
      bal > 0
        ? `Pending amount: ₹${bal.toLocaleString('en-IN')}${order.payment_due_date ? ` (due ${order.payment_due_date})` : ''}.`
        : 'Rate / invoice pending confirmation.',
      'Please let me know once sent. Thank you!',
    ].join('\n');
    return {
      ok: true,
      order_id: order.id,
      client_name: order.client_name,
      reminderText,
      waUrl: `https://wa.me/?text=${encodeURIComponent(reminderText)}`,
    };
  }
  if (clientId) {
    const res = generateClientReminder(db, clientId);
    return {
      ok: true,
      client_id: res.client_id,
      client_name: res.client_name,
      reminderText: res.message,
      waUrl: res.waUrl,
    };
  }
  throw new Error('orderId or clientId is required');
}
