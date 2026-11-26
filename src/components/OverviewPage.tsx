import React, { useMemo, useState } from 'react';
import { IndianRupee, Wallet } from 'lucide-react';
import { formatINR, formatPct } from '../api';
import type { MonthlySummary, Order, WorkspaceSnapshot } from '../types';

interface OverviewProps {
  snapshot: WorkspaceSnapshot;
  onRecordPayment: (clientId?: number) => void;
  onRecordPayout: (editorId?: number) => void;
  onOpenOrder: (order: Order) => void;
  onNavigate: (tab: 'overview' | 'orders' | 'clients' | 'editors' | 'finances' | 'ai') => void;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortMonthLabel(ym: string): string {
  const parts = ym.split('-');
  const mIdx = Number(parts[1]) - 1;
  return MONTH_NAMES[mIdx] || ym;
}

const MonthlyTimelineChart: React.FC<{ months: MonthlySummary[] }> = ({ months }) => {
  const ordered = useMemo(() => [...months].sort((a, b) => a.month.localeCompare(b.month)).slice(-10), [months]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (ordered.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-[13px] text-[#85858b]">
        No monthly records yet
      </div>
    );
  }

  const W = 680;
  const H = 240;
  const padL = 52;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxVal = Math.max(
    1000,
    ...ordered.map((m) => Math.max(m.project_billed, m.editor_cost_committed, m.project_profit))
  );
  const yTicks = [0, Math.round(maxVal * 0.5), Math.round(maxVal)];

  const xFor = (i: number) =>
    ordered.length === 1 ? padL + plotW / 2 : padL + (i / (ordered.length - 1)) * plotW;
  const yFor = (val: number) => padT + plotH - (Math.max(0, val) / maxVal) * plotH;

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

  const billedPts = ordered.map((m, i) => ({ x: xFor(i), y: yFor(m.project_billed) }));
  const costPts = ordered.map((m, i) => ({ x: xFor(i), y: yFor(m.editor_cost_committed) }));
  const billedPath = smoothPath(billedPts);
  const costPath = smoothPath(costPts);
  const areaPath =
    billedPts.length > 1
      ? `${billedPath} L ${billedPts[billedPts.length - 1].x} ${padT + plotH} L ${billedPts[0].x} ${padT + plotH} Z`
      : '';

  const activePoint = hoveredIdx !== null ? ordered[hoveredIdx] : ordered[ordered.length - 1];
  const activeIdx = hoveredIdx !== null ? hoveredIdx : ordered.length - 1;

  return (
    <div>
      {/* Focused readout header */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-4 tabular-nums">
          <div>
            <span className="text-xs text-[#85858b]">{activePoint.month}</span>
            <div className="mt-0.5 text-xl font-medium text-[#ededed]">
              {formatINR(activePoint.project_billed)}
            </div>
          </div>
          <div className="text-xs text-[#a1a1a6]">
            Cost <span className="font-mono text-[#ededed]">{formatINR(activePoint.editor_cost_committed)}</span>
          </div>
          <div className="text-xs text-[#a1a1a6]">
            Profit{' '}
            <span className="font-mono text-[#4cc38a]">
              {formatINR(activePoint.project_profit)} ({formatPct(activePoint.profit_pct)})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#85858b]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#e5a93c]" />
            Billed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#6d6d74]" />
            Editor cost
          </span>
        </div>
      </div>

      {/* Crisp SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[220px] w-full overflow-visible select-none"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <defs>
          <linearGradient id="billedAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e5a93c" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#e5a93c" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => {
          const y = yFor(t);
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="rgba(237,237,237,0.06)"
                strokeWidth="1"
              />
              <text
                x={padL - 10}
                y={y + 4}
                textAnchor="end"
                fill="#85858b"
                fontSize="11"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {t >= 1000 ? `${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#billedAreaGrad)" />}
        {costPath && (
          <path d={costPath} fill="none" stroke="#6d6d74" strokeWidth="1.5" strokeDasharray="3 3" />
        )}
        {billedPath && (
          <path d={billedPath} fill="none" stroke="#e5a93c" strokeWidth="2" strokeLinecap="round" />
        )}

        {/* Active vertical guide */}
        <line
          x1={xFor(activeIdx)}
          y1={padT}
          x2={xFor(activeIdx)}
          y2={padT + plotH}
          stroke="rgba(237,237,237,0.12)"
          strokeWidth="1"
        />

        {ordered.map((m, i) => {
          const x = xFor(i);
          const yBilled = yFor(m.project_billed);
          const isCurrent = i === activeIdx;
          return (
            <g key={m.month}>
              <text
                x={x}
                y={H - 6}
                textAnchor="middle"
                fill={isCurrent ? '#ededed' : '#85858b'}
                fontSize="11"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {shortMonthLabel(m.month)}
              </text>
              <circle
                cx={x}
                cy={yBilled}
                r={isCurrent ? 4 : 2.5}
                fill={isCurrent ? '#e5a93c' : '#19191b'}
                stroke="#e5a93c"
                strokeWidth="1.75"
              />
              <rect
                x={x - plotW / Math.max(ordered.length * 2, 4)}
                y={padT}
                width={plotW / Math.max(ordered.length, 2)}
                height={plotH + 16}
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
}) => {
  const { kpis, attention, editors, categoryBreakdown, monthlySummary, recentActivity } = snapshot;

  const editorsWithDues = editors.filter((e) => e.payout_due > 0);
  const cm = kpis.current_month;
  const maxCategoryBilled = Math.max(1, ...categoryBreakdown.map((c) => c.billed));

  // Build unified quiet attention rows
  const attentionRows: {
    key: string;
    dot: 'red' | 'amber' | 'neutral';
    code: string;
    label: string;
    meta: string;
    actionLabel: string;
    onClick: () => void;
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
    <div className="space-y-8">
      {/* Page Title & Secondary Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#ededed]">
            Studio overview
          </h1>
          <p className="mt-1.5 text-[13px] text-[#85858b] tabular-nums">
            {kpis.today} · {kpis.total_orders} orders tracked
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onRecordPayment()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3.5 text-[13px] font-normal text-[#ededed] hover:bg-[#2a2a2d] active:scale-[0.98]"
          >
            <IndianRupee className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            Client payment
          </button>
          <button
            onClick={() => onRecordPayout()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#ededed]/[0.08] bg-[#232325] px-3.5 text-[13px] font-normal text-[#ededed] hover:bg-[#2a2a2d] active:scale-[0.98]"
          >
            <Wallet className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            Pay editor
          </button>
        </div>
      </div>

      {/* Stat Cards Row — Numbers Only */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
          <div className="text-[13px] text-[#a1a1a6]">Collected</div>
          <div className="mt-3 text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums text-[#ededed]">
            {formatINR(kpis.total_collected)}
          </div>
          <div className="mt-3 text-xs tabular-nums text-[#85858b]">
            Billed {formatINR(kpis.total_billed)} · Due{' '}
            <span className={kpis.total_receivable > 0 ? 'text-[#e5484d]' : 'text-[#85858b]'}>
              {formatINR(kpis.total_receivable)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
          <div className="text-[13px] text-[#a1a1a6]">Gross profit</div>
          <div className="mt-3 text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums text-[#4cc38a]">
            {formatINR(kpis.gross_project_profit)}
          </div>
          <div className="mt-3 text-xs tabular-nums text-[#85858b]">
            {formatPct(kpis.gross_margin_pct)} margin · {cm.month} {formatINR(cm.project_profit)}
          </div>
        </div>

        <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
          <div className="text-[13px] text-[#a1a1a6]">Editor payouts due</div>
          <div
            className={`mt-3 text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums ${
              kpis.total_editor_due > 0 ? 'text-[#e5a93c]' : 'text-[#ededed]'
            }`}
          >
            {formatINR(kpis.total_editor_due)}
          </div>
          <div className="mt-3 truncate text-xs tabular-nums text-[#85858b]">
            {editorsWithDues.length > 0
              ? editorsWithDues.map((e) => `${e.name} ${formatINR(e.payout_due)}`).join(' · ')
              : 'All submitted work settled'}
          </div>
        </div>

        <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
          <div className="text-[13px] text-[#a1a1a6]">Open production</div>
          <div className="mt-3 text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums text-[#ededed]">
            {kpis.active_orders}
          </div>
          <div className="mt-3 text-xs tabular-nums text-[#85858b]">
            {kpis.delivered_orders} delivered · {attention.unassigned.length} unassigned
          </div>
        </div>
      </div>

      {/* Asymmetric Primary Row: Monthly Revenue Timeline (2/3) + Service Mix (1/3) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#ededed]">Monthly revenue &amp; editor cost</h2>
            <button
              onClick={() => onNavigate('finances')}
              className="text-xs text-[#85858b] hover:text-[#ededed]"
            >
              Open P&amp;L
            </button>
          </div>
          <MonthlyTimelineChart months={monthlySummary} />
        </div>

        <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
          <h2 className="mb-4 text-sm font-medium text-[#ededed]">Service mix</h2>
          <div className="space-y-3.5">
            {categoryBreakdown.map((c) => {
              const sharePct = (c.billed / maxCategoryBilled) * 100;
              return (
                <div key={c.category}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-[#ededed]">
                      {c.category}{' '}
                      <span className="font-mono text-xs text-[#85858b]">({c.orders})</span>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#a1a1a6]">
                      {formatINR(c.profit)} · {formatPct(c.profit_pct)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-[#232325]">
                    <div
                      className="h-full rounded-full bg-[#ededed]/45"
                      style={{ width: `${Math.max(4, sharePct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row: Needs Attention Queue (2/3) + Recent Activity (1/3) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#ededed]">
              Needs attention{' '}
              <span className="ml-1 font-mono text-xs font-normal text-[#85858b]">
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
            <div className="rounded-lg border border-[#ededed]/[0.06] bg-[#141415] px-4 py-6 text-center text-[13px] text-[#85858b]">
              No unassigned jobs, overdue items, or pending payouts
            </div>
          ) : (
            <div className="divide-y divide-[#ededed]/[0.06] rounded-lg border border-[#ededed]/[0.08] bg-[#141415]">
              {attentionRows.slice(0, 8).map((row) => (
                <button
                  key={row.key}
                  onClick={row.onClick}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-[#1e1e21]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        row.dot === 'red'
                          ? 'bg-[#e5484d]'
                          : row.dot === 'amber'
                          ? 'bg-[#e5a93c]'
                          : 'bg-[#85858b]'
                      }`}
                    />
                    <span className="w-16 shrink-0 font-mono text-xs text-[#a1a1a6]">
                      {row.code}
                    </span>
                    <div className="min-w-0 truncate text-[13px] text-[#ededed]">
                      {row.label}
                      <span className="ml-2 text-xs text-[#85858b]">{row.meta}</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[#a1a1a6]">
                    {row.actionLabel}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#ededed]/[0.08] bg-[#19191b] p-5">
          <h2 className="mb-4 text-sm font-medium text-[#ededed]">Recent activity</h2>
          <div className="max-h-72 divide-y divide-[#ededed]/[0.06] overflow-y-auto pr-1">
            {recentActivity.slice(0, 10).map((act) => (
              <div key={act.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="text-[13px] leading-snug text-[#a1a1a6]">{act.summary}</div>
                <div className="mt-1 font-mono text-[11px] text-[#85858b]">
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
