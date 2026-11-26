import { getSettingMap, getWorkspaceSnapshot, localTodayIso, round2 } from './ledgerService.mjs';

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
  // Plain numeric amount (avoid matching years 2025/2026 or SYN codes or bullet numbers like "1)" or "3 shorts")
  const cleaned = text
    .replace(/\bsyn\d+\b/gi, ' ')
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
    .replace(/(?:^|\n)\s*\d+[.)]/g, ' ')
    .replace(/\b(\d+)\s+(?:shorts?|reels?|videos?|edits?|scripts?|blogs?|posts?)\b/gi, ' ');
  const numMatches = [...cleaned.matchAll(/\b(\d{2,6}(?:\.\d{1,2})?)\b/g)];
  if (numMatches.length > 0) {
    const val = Number(numMatches[0][1]);
    if (val >= 10 && val !== 2025 && val !== 2026) return round2(val);
  }
  return null;
}

function detectDateFromText(text, fallbackDate) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const lower = text.toLowerCase();
  const base = new Date(`${fallbackDate}T00:00:00Z`);
  const addDays = (n) => {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  if (/\byesterday\b/.test(lower)) return addDays(-1);
  if (/\btoday\b/.test(lower)) return fallbackDate;
  if (/\btomorrow\b/.test(lower)) return addDays(1);
  if (/\bnext week\b/.test(lower)) return addDays(7);

  const inDays = lower.match(/\bin\s+(\d{1,2})\s+days?\b/);
  if (inDays) return addDays(Number(inDays[1]));

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < weekdays.length; i++) {
    if (new RegExp(`\\b${weekdays[i]}\\b`, 'i').test(lower)) {
      const cur = base.getUTCDay();
      let delta = (i - cur + 7) % 7;
      if (delta === 0) delta = 7;
      return addDays(delta);
    }
  }
  return null;
}

function detectCategory(text, fallback = 'Shorts') {
  const lower = text.toLowerCase();
  if (/\b(short|shorts|reel|reels|yt short|ig reel)\b/.test(lower)) return 'Shorts';
  if (/\b(script|scripts|script writing)\b/.test(lower)) return 'Script Writing';
  if (/\b(blog|blogs|article|website blog)\b/.test(lower)) return 'Website Blogs';
  if (/\b(insta|instagram post|carousel|static post|post)\b/.test(lower)) return 'Instagram Posts';
  if (/\b(menu|menu design)\b/.test(lower)) return 'Menu Design';
  if (/\b(video|video edit|youtube|vlog|podcast|long form)\b/.test(lower)) return 'Video Edit';
  return fallback;
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
    .replace(/\b(as soon|tells me|told me|asked me|wants|want|needs|need|make|create|add|new|a|an|for|on this topic|topic|about|due|by|today|tomorrow|next week|friday|monday|tuesday|wednesday|thursday|saturday|sunday|monthly package|retainer|video|short|shorts|reel|reels|script|blog)\b/gi, ' ')
    .replace(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?\s*k?/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?k\b/gi, ' ')
    .replace(/\b\d{3,6}\b/g, ' ')
    .replace(/[,:;|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:on|of|in|to|with|regarding)\s+/i, '')
    .trim();

  if (!s || s.length < 3) return category;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatINR(n) {
  const num = Number(n || 0);
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
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

  if (/\b(service|category|shorts|video edit|margin|compare)\b/.test(lower)) {
    const lines = snapshot.categoryBreakdown.map(
      (c) => `• **${c.category}** (${c.orders} orders): Billed ${formatINR(c.billed)}, Profit ${formatINR(c.profit)} (${c.profit_pct}%)`
    );
    return {
      intent: 'answer',
      answer: `**Service Category Breakdown**\n${lines.join('\n')}`,
      drafts: [],
      warnings: [],
      mode: 'offline',
    };
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
    return {
      intent: 'answer',
      answer: `**Workspace Attention Summary**\n${lines.join('\n')}`,
      drafts: [],
      warnings: [],
      mode: 'offline',
    };
  }

  // General P&L summary
  const k = snapshot.kpis;
  const cm = k.current_month;
  return {
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
  };
}

export function parseOfflineCommand(db, text) {
  const snapshot = getWorkspaceSnapshot(db);
  const today = snapshot.kpis.today;
  const trimmed = String(text || '').trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    throw new Error('Please enter a command or question');
  }

  // 1. Question detection
  const isQuestion =
    trimmed.endsWith('?') ||
    /^(how|what|who|which|show|list|compare|tell me|give me|summary|status)\b/i.test(trimmed);
  if (isQuestion) {
    return answerQuestion(snapshot, trimmed);
  }

  const matchedClient = findMatchingClient(snapshot.clients, trimmed);
  const matchedEditor = findMatchingEditor(snapshot.editors, trimmed);
  const amount = parseAmountToken(trimmed);
  const parsedDate = detectDateFromText(trimmed, today) || today;
  const method = detectMethod(trimmed);

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
  const isPaymentIntent =
    (/\b(sent|paid|payment|received|got|came|transferred|upi|gpay|phonepe)\b/i.test(lower) &&
      amount !== null &&
      !/\b(make|new|order|assign)\b/i.test(lower)) ||
    (/\bpayment\b/i.test(lower) && matchedClient && amount !== null);

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

  // 7. Single Order Draft
  const category = detectCategory(trimmed, 'Shorts');
  const title = cleanTopicTitle(trimmed, matchedClient, matchedEditor, category);
  const billingType = /\b(monthly|package|retainer)\b/i.test(lower) ? 'monthly_package' : 'one_off';
  const deadline = detectDateFromText(trimmed, today);
  const suggestedRate =
    amount ??
    (category === 'Shorts'
      ? matchedClient?.default_rate_shorts ?? null
      : category === 'Video Edit'
      ? matchedClient?.default_rate_video ?? null
      : null);

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
  if (!matchedEditor) {
    warnings.push('No editor specified — order will start as Unassigned so you see it in Needs Attention.');
  }

  return {
    intent: 'order',
    answer: `Prepared new order draft${matchedClient ? ` for ${matchedClient.name}` : ''}. Confirm to create.`,
    drafts: [
      {
        type: 'order',
        client_id: matchedClient?.id ?? null,
        client_name: matchedClient?.name ?? '',
        order_date: today,
        title,
        category,
        brief: trimmed,
        billing_type: billingType,
        service_period: billingType === 'monthly_package' ? today.slice(0, 7) : '',
        amount,
        suggested_amount: amount == null ? suggestedRate : null,
        editor_id: matchedEditor?.id ?? null,
        editor_name: matchedEditor?.name ?? '',
        editor_cost:
          matchedEditor?.is_self
            ? 0
            : category === 'Shorts' && matchedEditor?.default_rate_shorts
            ? matchedEditor.default_rate_shorts
            : 0,
        production_deadline: deadline,
        payment_due_date: null,
      },
    ],
    warnings,
    mode: 'offline',
  };
}

export async function runAiCommand(db, text) {
  const settings = getSettingMap(db);
  const provider = settings.ai_provider || 'offline';
  const apiKey = (settings.ai_api_key || '').trim();
  const model = (settings.ai_model || '').trim();

  if (provider === 'offline' || !apiKey) {
    return parseOfflineCommand(db, text);
  }

  const snapshot = getWorkspaceSnapshot(db);
  const today = snapshot.kpis.today;

  const systemPrompt = `You are EditDesk AI, an assistant for an Indian video-editing agency owner (INR ₹).
Today's date: ${today}.
Clients: ${snapshot.clients.map((c) => `${c.name} (id:${c.id}, due:₹${c.outstanding_due}, rate_shorts:${c.default_rate_shorts ?? 'none'})`).join('; ')}.
Editors: ${snapshot.editors.map((e) => `${e.name} (id:${e.id}, is_self:${e.is_self}, due:₹${e.payout_due})`).join('; ')}.
Recent Orders: ${snapshot.orders.slice(0, 15).map((o) => `${o.order_code}:${o.client_name}/${o.title}/₹${o.amount ?? 'TBD'}/${o.production_status}/due:₹${o.balance_due}`).join('; ')}.
KPIs: Billed ₹${snapshot.kpis.total_billed}, Collected ₹${snapshot.kpis.total_collected}, Receivable ₹${snapshot.kpis.total_receivable}, Editor Due ₹${snapshot.kpis.total_editor_due}, Gross Profit ₹${snapshot.kpis.gross_project_profit} (${snapshot.kpis.gross_margin_pct}%).

Rules:
- NEVER silently invent missing amounts or dates. If amount is unknown, set amount to null.
- Production deadline and client payment_due_date are separate.
- Return STRICT JSON matching:
{
  "intent": "order" | "batch_orders" | "client_payment" | "editor_payout" | "expense" | "order_update" | "answer",
  "answer": "short helpful message",
  "warnings": ["any missing/ambiguous items"],
  "drafts": [
    // For order/batch_orders:
    // { "type":"order", "client_id":number|null, "client_name":string, "order_date":"YYYY-MM-DD", "title":string, "category":"Shorts"|"Video Edit"|"Script Writing"|"Website Blogs"|"Instagram Posts"|"Menu Design"|"Other", "brief":string, "billing_type":"one_off"|"monthly_package", "service_period":string, "amount":number|null, "editor_id":number|null, "editor_name":string, "editor_cost":number, "production_deadline":"YYYY-MM-DD"|null, "payment_due_date":"YYYY-MM-DD"|null }
    // For client_payment:
    // { "type":"client_payment", "client_id":number|null, "client_name":string, "payment_date":"YYYY-MM-DD", "amount":number, "method":"UPI"|"Bank Transfer"|"Cash"|"Card"|"Other", "mode":"fifo", "notes":string }
    // For editor_payout:
    // { "type":"editor_payout", "editor_id":number|null, "editor_name":string, "payout_date":"YYYY-MM-DD", "amount":number, "method":"UPI"|"Bank Transfer"|"Cash", "mode":"fifo", "notes":string }
    // For expense:
    // { "type":"expense", "expense_date":"YYYY-MM-DD", "category":"Software"|"Tools"|"Marketing"|"Equipment"|"Other", "description":string, "amount":number, "notes":string }
  ]
}`;

  try {
    let parsed;
    if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0.1,
        }),
      });
      if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}`);
      const json = await resp.json();
      parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
    } else if (provider === 'gemini') {
      const targetModel = model || 'gemini-2.5-flash';
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
          }),
        }
      );
      if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
      const json = await resp.json();
      const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      parsed = JSON.parse(raw);
    } else {
      return parseOfflineCommand(db, text);
    }

    // Enrich payment/payout drafts with live open orders for UI confirmation
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
    for (const d of drafts) {
      if (d.type === 'client_payment' && d.client_id) {
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
      }
      if (d.type === 'editor_payout' && d.editor_id) {
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

    return {
      intent: parsed.intent || 'answer',
      answer: parsed.answer || 'Ready for confirmation.',
      drafts,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      mode: provider,
    };
  } catch (err) {
    const fallback = parseOfflineCommand(db, text);
    fallback.warnings = [
      ...(fallback.warnings || []),
      `Used offline smart engine (cloud AI fallback: ${err.message})`,
    ];
    return fallback;
  }
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

  return {
    client_id: client.id,
    client_name: client.name,
    outstanding_due: client.outstanding_due,
    message: lines.join('\n'),
  };
}
