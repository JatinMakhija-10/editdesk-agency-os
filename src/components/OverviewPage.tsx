import React, { useMemo, useState } from 'react';
import { Copy, IndianRupee, Wallet } from 'lucide-react';
import { api, formatINR, formatPct } from '../api';
import type { MonthlySummary, Order, WorkspaceSnapshot } from '../types';

interface OverviewProps {
  snapshot: WorkspaceSnapshot;
  onRecordPayment: (clientId?: number) => void;
  onRecordPayout: (editorId?: number) => void;
  onOpenOrder: (order: Order) => void;
  onNavigate: (tab: 'overview' | 'orders' | 'clients' | 'editors' | 'finances' | 'ai') => void;
  onNotify?: (msg: string, isErr?: boolean) => void;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function shortMonthLabel(ym: string): string {
  const parts = ym.split('-');
  const mIdx = Number(parts[1]) - 1;
  return MONTH_SHORT[mIdx] || ym;
}

function splitMonthYear(isoDate: string): { monthName: string; year: string } {
  const [y, m] = isoDate.split('-');
  const idx = Number(m) - 1;
  return { monthName: MONTH_FULL[idx] || isoDate, year: y || '' };
}

function formatWholeINR(value: number): string {
  const rounded = Math.round(Number(value || 0));
  return `₹${rounded.toLocaleString('en-IN')}`;
}

/** Tactile machined dark-titanium card object rendered purely in CSS/SVG for the hero receipt card. */
const SettlementCardVisual: React.FC<{ latestCode: string; prefix: string }> = ({
  latestCode,
  prefix,
}) => {
  const tailDigits = latestCode.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return (
    <div className="pointer-events-none relative hidden h-28 w-44 shrink-0 select-none sm:block">
      {/* Back secondary dark card */}
      <div
        className="absolute right-0 top-1 h-24 w-36 rounded-xl border border-[#ededed]/[0.08]"
        style={{
          background: 'linear-gradient(145deg, #27272b 0%, #161618 65%, #111113 100%)',
          transform: 'rotate(-8deg) translate(8px, -4px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 24px rgba(0,0,0,0.45)',
        }}
      />
      {/* Foreground titanium studio ledger card */}
      <div
        className="absolute bottom-0 left-0 flex h-24 w-38 flex-col justify-between rounded-xl border border-[#ededed]/[0.14] p-3"
        style={{
          background: 'linear-gradient(135deg, #323238 0%, #1c1c20 55%, #121214 100%)',
          transform: 'rotate(-14deg) translateY(8px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 18px 30px rgba(0,0,0,0.65)',
        }}
      >
        <div className="flex items-center justify-between">
          {/* Brushed EMV chip */}
          <svg width="20" height="15" viewBox="0 0 20 15" fill="none" aria-hidden="true">
            <rect
              x="0.5"
              y="0.5"
              width="19"
              height="14"
              rx="2.5"
              fill="#3e3e44"
              stroke="rgba(237,237,237,0.25)"
            />
            <line x1="6.5" y1="0.5" x2="6.5" y2="14.5" stroke="rgba(237,237,237,0.18)" />
            <line x1="13.5" y1="0.5" x2="13.5" y2="14.5" stroke="rgba(237,237,237,0.18)" />
            <line x1="0.5" y1="7.5" x2="19.5" y2="7.5" stroke="rgba(237,237,237,0.18)" />
          </svg>
          {/* Mini studio mark */}
          <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="1.5" y="2.5" width="15" height="13" rx="3" stroke="#d4d4d8" strokeWidth="1.4" />
            <path d="M7.25 6.4L12.1 9L7.25 11.6V6.4Z" fill="#e5a93c" />
          </svg>
        </div>
        <div className="font-mono text-[10px] tracking-[0.14em] text-[#d4d4d8]/80 tabular-nums">
          •••• •••• {tailDigits}
          <div className="mt-0.5 text-[8px] tracking-widest text-[#85858b]">{prefix} LEDGER</div>
        </div>
      </div>
    </div>
  );
};

interface MirroredChartProps {
  months: MonthlySummary[];
  orders: Order[];
  totalBilled: number;
  totalEditorCommitted: number;
  grossMarginPct: number;
}

const MirroredAgencyChart: React.FC<MirroredChartProps> = ({
  months,
  orders,
  totalBilled,
  totalEditorCommitted,
  grossMarginPct,
}) => {
  const ordered = useMemo(
    () => [...months].sort((a, b) => a.month.localeCompare(b.month)).slice(-10),
    [months]
  );
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { series1Label, series2Label, series1Vals, series2Vals } = useMemo(() => {
    const catTotals = new Map<string, number>();
    for (const o of orders) {
      const cat = o.category || 'Other';
      catTotals.set(cat, (catTotals.get(cat) || 0) + (o.amount || 0));
    }
    const sortedCats = [...catTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map((x) => x[0]);
    const c1 = sortedCats[0] || 'Shorts';
    const c2 = sortedCats[1] || 'Video Edit';

    const byMonth = new Map<string, { c1: number; c2: number }>();
    for (const m of ordered) byMonth.set(m.month, { c1: 0, c2: 0 });
    for (const o of orders) {
      const ym = String(o.order_date || '').slice(0, 7);
      const bucket = byMonth.get(ym);
      if (!bucket) continue;
      if (o.category === c1) bucket.c1 += o.amount || 0;
      else if (o.category === c2) bucket.c2 += o.amount || 0;
    }
    return {
      series1Label: c1,
      series2Label: c2,
      series1Vals: ordered.map((m) => byMonth.get(m.month)?.c1 || 0),
      series2Vals: ordered.map((m) => byMonth.get(m.month)?.c2 || 0),
    };
  }, [ordered, orders]);

  if (ordered.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-[13px] text-[#85858b]">
        No monthly records yet
      </div>
    );
  }

  const W = 900;
  const H = 285;
  const padL = 48;
  const padR = 24;
  const padT = 18;
  const padB = 18;
  const plotW = W - padL - padR;
  const zeroY = Math.round(padT + (H - padT - padB) * 0.58);
  const upSpan = zeroY - padT;
  const downSpan = H - padB - zeroY;

  const maxUp = Math.max(2000, ...ordered.map((m) => m.project_billed));
  const maxDown = Math.max(2000, ...ordered.map((m) => m.editor_cost_committed), maxUp * 0.72);
  const scaleMax = Math.max(maxUp, maxDown);

  const xFor = (i: number) =>
    ordered.length === 1 ? padL + plotW / 2 : padL + (i / (ordered.length - 1)) * plotW;
  const yUp = (val: number) => zeroY - (Math.max(0, val) / scaleMax) * upSpan;
  const yDown = (val: number) => zeroY + (Math.max(0, val) / scaleMax) * downSpan;

  const smoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const billedPts = ordered.map((m, i) => ({ x: xFor(i), y: yUp(m.project_billed) }));
  const profitPts = ordered.map((m, i) => ({ x: xFor(i), y: yUp(m.project_profit) }));
  const cat1Pts = ordered.map((_, i) => ({ x: xFor(i), y: yUp(series1Vals[i]) }));
  const cat2Pts = ordered.map((_, i) => ({ x: xFor(i), y: yUp(series2Vals[i]) }));

  const costPts = ordered.map((m, i) => ({ x: xFor(i), y: yDown(m.editor_cost_committed) }));
  const costMidPts = ordered.map((m, i) => ({ x: xFor(i), y: yDown(m.editor_cost_committed * 0.65) }));
  const costLowPts = ordered.map((m, i) => ({ x: xFor(i), y: yDown(m.editor_cost_committed * 0.35) }));

  const upTicks = [0, Math.round(scaleMax * 0.5), Math.round(scaleMax)];
  const downTicks = [Math.round(scaleMax * 0.5), Math.round(scaleMax)];

  const activePoint = hoveredIdx !== null ? ordered[hoveredIdx] : null;
  const headlineFigure = activePoint ? activePoint.project_billed : totalBilled;
  const activeCost = activePoint ? activePoint.editor_cost_committed : totalEditorCommitted;
  const activePct = activePoint ? activePoint.profit_pct : grossMarginPct;

  return (
    <div>
      {/* Header Readout */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[13px] text-[#a1a1a6]">
            Revenue {activePoint ? `· ${activePoint.month}` : '· 2026 cumulative'}
          </div>
          <div className="mt-2 text-[32px] font-medium leading-none tracking-[-0.025em] tabular-nums text-[#ededed]">
            {formatWholeINR(headlineFigure)}
          </div>
          <div className="mt-2.5 text-xs tabular-nums text-[#4cc38a]">
            {formatPct(activePct)} margin{' '}
            <span className="text-[#85858b]">· Editor spend {formatWholeINR(activeCost)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-[#85858b]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#f5b841]" />
            Billed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#4cc38a]" />
            Profit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#5b9cf6]" />
            {series1Label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#e06c9f]" />
            {series2Label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#6d6d74]" />
            Outflow (mirrored)
          </span>
        </div>
      </div>

      {/* Mirrored Multi-Series SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[200px] w-full overflow-visible select-none sm:h-[250px] md:h-[290px]"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <defs>
          <filter id="seriesGlow" x="-10%" y="-25%" width="120%" height="150%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Upward horizontal grid + ticks */}
        {upTicks.map((t, idx) => {
          const y = yUp(t);
          return (
            <g key={`up-${idx}`}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke={t === 0 ? 'rgba(237,237,237,0.10)' : 'rgba(237,237,237,0.04)'}
                strokeWidth="1"
              />
              <text
                x={padL - 10}
                y={y + 3.5}
                textAnchor="end"
                fill="#73737a"
                fontSize="10.5"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {t >= 1000 ? `${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          );
        })}

        {/* Mirrored downward ticks */}
        {downTicks.map((t, idx) => {
          const y = yDown(t);
          return (
            <g key={`dn-${idx}`}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="rgba(237,237,237,0.04)"
                strokeWidth="1"
              />
              <text
                x={padL - 10}
                y={y + 3.5}
                textAnchor="end"
                fill="#73737a"
                fontSize="10.5"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {t >= 1000 ? `${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          );
        })}

        {/* Lower mirrored outflow curves */}
        <path d={smoothPath(costLowPts)} fill="none" stroke="rgba(237,237,237,0.10)" strokeWidth="1.2" />
        <path d={smoothPath(costMidPts)} fill="none" stroke="rgba(237,237,237,0.18)" strokeWidth="1.4" />
        <path d={smoothPath(costPts)} fill="none" stroke="rgba(237,237,237,0.34)" strokeWidth="1.75" />

        {/* Upper multi-series revenue & margin curves */}
        <g filter="url(#seriesGlow)">
          <path d={smoothPath(cat2Pts)} fill="none" stroke="#e06c9f" strokeWidth="1.75" strokeLinecap="round" />
          <path d={smoothPath(cat1Pts)} fill="none" stroke="#5b9cf6" strokeWidth="1.85" strokeLinecap="round" />
          <path d={smoothPath(profitPts)} fill="none" stroke="#4cc38a" strokeWidth="2" strokeLinecap="round" />
          <path d={smoothPath(billedPts)} fill="none" stroke="#f5b841" strokeWidth="2.35" strokeLinecap="round" />
        </g>

        {/* Active vertical cursor */}
        {hoveredIdx !== null && (
          <line
            x1={xFor(hoveredIdx)}
            y1={padT}
            x2={xFor(hoveredIdx)}
            y2={H - padB}
            stroke="rgba(237,237,237,0.16)"
            strokeWidth="1"
          />
        )}

        {/* Month axis labels along the horizon */}
        {ordered.map((m, i) => {
          const x = xFor(i);
          const isActive = hoveredIdx !== null ? i === hoveredIdx : i === ordered.length - 1;
          return (
            <g key={m.month}>
              <text
                x={x}
                y={zeroY + 14}
                textAnchor="middle"
                fill={isActive ? '#ededed' : '#73737a'}
                fontSize="11"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {shortMonthLabel(m.month)}
              </text>
              {hoveredIdx === i && (
                <circle
                  cx={x}
                  cy={yUp(m.project_billed)}
                  r={4}
                  fill="#f5b841"
                  stroke="#171719"
                  strokeWidth="1.75"
                />
              )}
              <rect
                x={x - plotW / Math.max(ordered.length * 2, 4)}
                y={padT}
                width={plotW / Math.max(ordered.length, 2)}
                height={H - padT - padB}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const OverviewPage: React.FC<OverviewProps> = ({
  snapshot,
  onRecordPayment,
  onRecordPayout,
  onOpenOrder,
  onNavigate,
  onNotify,
}) => {
  const { kpis, attention, editors, orders, monthlySummary, recentActivity, settings } = snapshot;

  const editorsWithDues = editors.filter((e) => e.payout_due > 0);
  const cm = kpis.current_month;
  const { monthName, year } = splitMonthYear(kpis.today);
  const latestOrderCode = orders[0]?.order_code || `${settings.order_prefix}0001`;

  const copyReminder = async (orderId: number, clientName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.generateReminder({ orderId });
      await navigator.clipboard?.writeText(res.reminderText);
      onNotify?.(`Reminder copied for ${clientName}`);
    } catch (err: any) {
      onNotify?.(err.message || 'Could not copy reminder', true);
    }
  };

  const attentionRows: {
    key: string;
    dot: 'red' | 'amber' | 'neutral';
    code: string;
    label: string;
    meta: string;
    actionLabel: string;
    onClick: () => void;
    reminderOrder?: { id: number; clientName: string };
  }[] = [];

  for (const o of attention.unassigned) {
    attentionRows.push({
      key: `un-${o.id}`,
      dot: 'red',
      code: o.order_code,
      label: `${o.client_name} · ${o.title}`,
      meta: 'No editor assigned',
      actionLabel: 'Assign',
      onClick: () => onOpenOrder(o),
    });
  }

  for (const o of attention.overdueProduction) {
    attentionRows.push({
      key: `op-${o.id}`,
      dot: 'red',
      code: o.order_code,
      label: `${o.client_name} · ${o.title}`,
      meta: `Production overdue (${o.production_deadline})`,
      actionLabel: 'Open',
      onClick: () => onOpenOrder(o),
    });
  }

  for (const o of attention.upcomingProduction) {
    attentionRows.push({
      key: `up-${o.id}`,
      dot: 'amber',
      code: o.order_code,
      label: `${o.client_name} · ${o.title}`,
      meta: `Production due ${o.production_deadline}`,
      actionLabel: 'Open',
      onClick: () => onOpenOrder(o),
    });
  }

  for (const o of attention.overdueInvoices) {
    attentionRows.push({
      key: `oi-${o.id}`,
      dot: 'red',
      code: o.order_code,
      label: `${o.client_name} · ${formatINR(o.balance_due)} due`,
      meta: `Invoice overdue (${o.payment_due_date})`,
      actionLabel: 'Record payment',
      onClick: () => onRecordPayment(o.client_id),
      reminderOrder: { id: o.id, clientName: o.client_name },
    });
  }

  for (const o of attention.upcomingInvoices) {
    attentionRows.push({
      key: `ui-${o.id}`,
      dot: 'amber',
      code: o.order_code,
      label: `${o.client_name} · ${formatINR(o.balance_due)} due`,
      meta: `Invoice due ${o.payment_due_date}`,
      actionLabel: 'Record payment',
      onClick: () => onRecordPayment(o.client_id),
      reminderOrder: { id: o.id, clientName: o.client_name },
    });
  }

  for (const ed of editorsWithDues) {
    attentionRows.push({
      key: `ed-${ed.id}`,
      dot: 'amber',
      code: 'Payout',
      label: ed.name,
      meta: 'Submitted work ready to settle',
      actionLabel: `Pay ${formatINR(ed.payout_due)}`,
      onClick: () => onRecordPayout(ed.id),
    });
  }

  for (const o of attention.needsReview) {
    if (attentionRows.some((r) => r.code === o.order_code && r.key.startsWith('un-'))) continue;
    attentionRows.push({
      key: `rv-${o.id}`,
      dot: o.amount === null ? 'amber' : 'neutral',
      code: o.order_code,
      label: `${o.client_name} · ${o.notes || o.title}`,
      meta: o.amount === null ? 'Rate pending' : formatINR(o.amount),
      actionLabel: o.amount === null ? 'Set rate' : 'Review',
      onClick: () => onOpenOrder(o),
    });
  }

  return (
    <div className="space-y-6">
      {/* Period Display Title & Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-normal leading-[1.12] tracking-[-0.025em] text-[#ededed]">
            {monthName} <span className="text-[#73737a]">{year}</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onRecordPayment()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#ededed]/[0.08] bg-[#1e1e21] px-3.5 text-[13px] font-normal text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[#26262a] active:scale-[0.98]"
          >
            <IndianRupee className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            Client payment
          </button>
          <button
            onClick={() => onRecordPayout()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#ededed]/[0.08] bg-[#1e1e21] px-3.5 text-[13px] font-normal text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[#26262a] active:scale-[0.98]"
          >
            <Wallet className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            Pay editor
          </button>
        </div>
      </div>

      {/* Stat Cards Row — Asymmetric Proportions with Machined Studio Ledger Card */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="studio-card flex items-end justify-between gap-4 overflow-hidden rounded-2xl p-6 lg:col-span-5">
          <div className="min-w-0">
            <div className="text-[13px] text-[#a1a1a6]">Collected this year</div>
            <div className="mt-3 text-[32px] font-medium leading-none tracking-[-0.025em] tabular-nums text-[#ededed]">
              {formatWholeINR(kpis.total_collected)}
            </div>
            <div className="mt-3.5 text-xs tabular-nums text-[#4cc38a]">
              +{formatWholeINR(cm.project_billed)} this month{' '}
              <span className="text-[#85858b]">· {kpis.total_orders} orders</span>
            </div>
          </div>
          <SettlementCardVisual latestCode={latestOrderCode} prefix={settings.order_prefix} />
        </div>

        <div className="studio-card flex flex-col justify-between rounded-2xl p-6 lg:col-span-4">
          <div className="text-[13px] text-[#a1a1a6]">Gross profit</div>
          <div className="mt-3 text-[32px] font-medium leading-none tracking-[-0.025em] tabular-nums text-[#ededed]">
            {formatWholeINR(kpis.gross_project_profit)}
          </div>
          <div className="mt-3.5 text-xs tabular-nums text-[#4cc38a]">
            {formatPct(kpis.gross_margin_pct)} margin{' '}
            <span className="text-[#85858b]">· {formatWholeINR(cm.project_profit)} in {cm.month}</span>
          </div>
        </div>

        <div className="studio-card flex flex-col justify-between rounded-2xl p-6 lg:col-span-3">
          <div className="text-[13px] text-[#a1a1a6]">Payouts due</div>
          <div className="mt-3 text-[32px] font-medium leading-none tracking-[-0.025em] tabular-nums text-[#ededed]">
            {formatWholeINR(kpis.total_editor_due)}
          </div>
          <div className="mt-3.5 truncate text-xs tabular-nums text-[#85858b]">
            {editorsWithDues.length > 0 ? (
              <span className="text-[#e5a93c]">
                {editorsWithDues.map((e) => `${e.name} ${formatWholeINR(e.payout_due)}`).join(' · ')}
              </span>
            ) : (
              `${kpis.active_orders} open orders · All settled`
            )}
          </div>
        </div>
      </div>

      {/* Hero Full-Width Mirrored Cashflow Curve Chart */}
      <div className="studio-card rounded-2xl p-6">
        <MirroredAgencyChart
          months={monthlySummary}
          orders={orders}
          totalBilled={kpis.total_billed}
          totalEditorCommitted={kpis.total_editor_committed}
          grossMarginPct={kpis.gross_margin_pct}
        />
      </div>

      {/* Bottom Split: Needs Attention (7 cols) + Recent Activity (5 cols) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="studio-card rounded-2xl p-6 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#ededed]">
              Needs attention{' '}
              <span className="ml-1.5 font-mono text-xs font-normal text-[#85858b]">
                {attentionRows.length}
              </span>
            </h2>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs text-[#85858b] hover:text-[#ededed]"
            >
              All orders
            </button>
          </div>

          {attentionRows.length === 0 ? (
            <div className="rounded-xl border border-[#ededed]/[0.06] bg-[#141415] px-4 py-6 text-center text-[13px] text-[#85858b]">
              No unassigned jobs, overdue items, or pending payouts
            </div>
          ) : (
            <div className="divide-y divide-[#ededed]/[0.06] rounded-xl border border-[#ededed]/[0.07] bg-[#141415]">
              {attentionRows.slice(0, 7).map((row) => (
                <div
                  key={row.key}
                  onClick={row.onClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      row.onClick();
                    }
                  }}
                  className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-[#1c1c1f] sm:px-4"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center sm:gap-3">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full sm:mt-0 ${
                        row.dot === 'red'
                          ? 'bg-[#e5484d]'
                          : row.dot === 'amber'
                          ? 'bg-[#e5a93c]'
                          : 'bg-[#85858b]'
                      }`}
                    />
                    <span className="hidden w-16 shrink-0 font-mono text-xs text-[#a1a1a6] sm:inline">
                      {row.code}
                    </span>
                    <div className="min-w-0 flex-1 text-[13px] leading-snug text-[#ededed] sm:truncate">
                      <span className="mr-1.5 font-mono text-[11px] text-[#a1a1a6] sm:hidden">
                        {row.code}
                      </span>
                      <span>{row.label}</span>
                      <span className="block text-xs text-[#85858b] sm:ml-2 sm:inline">
                        {row.meta}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.reminderOrder && (
                      <button
                        type="button"
                        onClick={(e) =>
                          copyReminder(row.reminderOrder!.id, row.reminderOrder!.clientName, e)
                        }
                        title="Copy WhatsApp reminder"
                        className="inline-flex h-6 items-center gap-1 rounded border border-[#ededed]/[0.08] bg-[#19191b] px-2 text-[11px] text-[#85858b] hover:border-[#e5a93c]/40 hover:text-[#e5a93c]"
                      >
                        <Copy className="h-3 w-3" strokeWidth={1.5} />
                        Remind
                      </button>
                    )}
                    <span className="font-mono text-xs tabular-nums text-[#a1a1a6]">
                      {row.actionLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="studio-card rounded-2xl p-6 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#ededed]">Recent activity</h2>
            <button
              onClick={() => onNavigate('finances')}
              className="text-xs text-[#85858b] hover:text-[#ededed]"
            >
              Open P&amp;L
            </button>
          </div>
          <div className="max-h-72 divide-y divide-[#ededed]/[0.06] overflow-y-auto pr-1">
            {recentActivity.slice(0, 8).map((act) => (
              <div key={act.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="text-[13px] leading-snug text-[#a1a1a6]">{act.summary}</div>
                <div className="mt-1 font-mono text-[11px] text-[#73737a]">
                  {new Date(act.created_at).toLocaleString('en-IN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
