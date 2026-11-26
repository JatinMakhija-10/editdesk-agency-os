export type ProductionStage =
  | 'New'
  | 'Unassigned'
  | 'Assigned'
  | 'Editing'
  | 'Internal review'
  | 'Client review'
  | 'Revisions'
  | 'Approved'
  | 'Delivered';

export type PaymentStatus = 'Unpaid' | 'Partially paid' | 'Paid' | 'Rate Pending' | 'Zero / Bundled';

export type EditorPayoutStatus =
  | 'No Editor'
  | 'Zero Cost'
  | 'Awaiting Submission'
  | 'Unpaid'
  | 'Partially paid'
  | 'Paid';

export interface Order {
  id: number;
  order_code: string;
  order_date: string;
  client_id: number;
  client_name: string;
  title: string;
  category: string;
  brief: string;
  billing_type: 'one_off' | 'monthly_package';
  service_period: string;
  amount: number | null;
  production_status: ProductionStage;
  production_deadline: string | null;
  payment_due_date: string | null;
  editor_id: number | null;
  editor_name: string | null;
  editor_is_self: number;
  editor_cost: number;
  editor_work_submitted: boolean;
  editor_submitted_at: string | null;
  needs_review: boolean;
  notes: string;
  allocated_paid: number;
  balance_due: number;
  payment_status: PaymentStatus;
  editor_payable: number;
  editor_allocated: number;
  editor_balance_due: number;
  editor_payout_status: EditorPayoutStatus;
  profit: number;
  profit_pct: number;
}

export interface Client {
  id: number;
  name: string;
  aliases: string;
  phone: string;
  email: string;
  default_rate_shorts: number | null;
  default_rate_video: number | null;
  default_billing_type: 'one_off' | 'monthly_package';
  notes: string;
  order_count: number;
  active_orders: number;
  rate_pending_count: number;
  total_billed: number;
  total_received: number;
  total_allocated: number;
  outstanding_due: number;
  unallocated_advance: number;
  profit: number;
}

export interface Editor {
  id: number;
  name: string;
  phone: string;
  specialty: string;
  is_self: boolean;
  default_rate_shorts: number | null;
  default_rate_video: number | null;
  notes: string;
  order_count: number;
  active_assignments: number;
  submitted_count: number;
  total_assigned_cost: number;
  submitted_payable: number;
  total_paid: number;
  total_allocated: number;
  payout_due: number;
  unallocated_advance: number;
}

export interface PaymentAllocation {
  id: number;
  payment_id: number;
  order_id: number;
  order_code: string;
  order_title: string;
  amount: number;
}

export interface ClientPayment {
  id: number;
  client_id: number;
  client_name: string;
  payment_date: string;
  amount: number;
  method: string;
  reference: string;
  notes: string;
  allocated_amount: number;
  unallocated_amount: number;
  allocations: PaymentAllocation[];
}

export interface EditorPayoutAllocation {
  id: number;
  payout_id: number;
  order_id: number;
  order_code: string;
  order_title: string;
  amount: number;
}

export interface EditorPayout {
  id: number;
  editor_id: number;
  editor_name: string;
  payout_date: string;
  amount: number;
  method: string;
  reference: string;
  notes: string;
  allocated_amount: number;
  unallocated_amount: number;
  allocations: EditorPayoutAllocation[];
}

export interface Expense {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  notes: string;
}

export interface MonthlySummary {
  month: string;
  order_count: number;
  project_billed: number;
  editor_cost_committed: number;
  project_profit: number;
  profit_pct: number;
  cash_received: number;
  cash_paid_editors: number;
  operating_expenses: number;
  net_cash_profit: number;
}

export interface YearlySummary {
  year: string;
  is_baseline: boolean;
  order_count: number;
  project_billed: number;
  editor_cost_committed: number;
  project_profit: number;
  profit_pct: number;
  cash_received: number;
  cash_paid_editors: number;
  operating_expenses: number;
  net_cash_profit: number;
  notes?: string;
}

export interface CategorySummary {
  category: string;
  orders: number;
  billed: number;
  editor_cost: number;
  profit: number;
  profit_pct: number;
}

export interface ActivityItem {
  id: number;
  event_type: string;
  summary: string;
  entity_type: string | null;
  entity_id: number | null;
  created_at: string;
}

export type AiProviderMode = 'auto' | 'groq' | 'gemini' | 'openrouter' | 'openai' | 'offline';

export interface AppSettings {
  agency_name: string;
  owner_name: string;
  currency: string;
  order_prefix: string;
  pin_enabled: boolean;
  mobile_pin: string;
  ai_provider: AiProviderMode;
  ai_model: string;
  has_ai_key: boolean;
  has_groq_key?: boolean;
  has_gemini_key?: boolean;
  has_openrouter_key?: boolean;
  has_openai_key?: boolean;
  ready_providers?: string[];
  ai_auto_fulfill?: boolean;
  minimize_to_tray: boolean;
  port: number;
  cloud_url?: string;
  has_cloud_pin?: boolean;
  cloud_sync_enabled?: boolean;
  last_cloud_sync?: string;
}

export interface AutoSuggestions {
  editor: {
    id: number;
    name: string;
    is_self: boolean;
    confidence: string;
    reason: string;
    suggestedCost: number | null;
    avgCostPct: number;
  } | null;
  deadline: { date: string; days: number; reason: string };
  paymentDue: { date: string; days: number };
  clientRate: { amount: number; reason: string } | null;
}

export interface AiTestResult {
  provider: string;
  label: string;
  configured: boolean;
  ok: boolean;
  model?: string;
  ms?: number;
  error?: string;
}

export interface CsvImportPreview {
  sectionsDetected: string[];
  orderCount: number;
  clientCount: number;
  editorCount: number;
  totalReceived: number;
  totalEditorCost: number;
  totalProfit: number;
  marginPct: number;
  insertCount: number;
  updateCount: number;
  baselineYears: number[];
  yearlyBaselines: { year: number; total_received: number; total_paid: number; total_profit: number }[];
  sampleOrders: { order_code: string; order_date: string; client_name: string; title: string; amount: number | null; editor_name: string; editor_cost: number | null }[];
}

export interface WorkspaceSnapshot {
  kpis: {
    today: string;
    total_orders: number;
    active_orders: number;
    delivered_orders: number;
    total_billed: number;
    total_collected: number;
    total_receivable: number;
    unallocated_client_advances: number;
    total_editor_committed: number;
    total_editor_paid: number;
    total_editor_due: number;
    total_expenses: number;
    gross_project_profit: number;
    gross_margin_pct: number;
    net_profit_after_expenses: number;
    current_month: MonthlySummary;
  };
  orders: Order[];
  clients: Client[];
  editors: Editor[];
  payments: ClientPayment[];
  editorPayouts: EditorPayout[];
  expenses: Expense[];
  monthlySummary: MonthlySummary[];
  yearlySummary: YearlySummary[];
  categoryBreakdown: CategorySummary[];
  attention: {
    unassigned: Order[];
    needsReview: Order[];
    overdueProduction: Order[];
    upcomingProduction: Order[];
    overdueInvoices: Order[];
    upcomingInvoices: Order[];
    submittedUnpaidEditors: Order[];
    unallocatedClientAdvances: Client[];
    unallocatedEditorAdvances: Editor[];
  };
  recentActivity: ActivityItem[];
  settings: AppSettings;
}

export interface AiCommandResponse {
  intent: string;
  answer: string;
  warnings: string[];
  mode: string;
  drafts: any[];
  autoExecuted?: boolean;
  createdIds?: number[];
  snapshot?: WorkspaceSnapshot;
}

export interface MobileInfo {
  port: number;
  pinEnabled: boolean;
  mobilePin: string;
  addresses: { name: string; ip: string; url: string; kind: 'lan' | 'tailscale' | 'virtual' }[];
  primaryUrl: string;
  primaryQr: string | null;
  tailscaleUrl: string | null;
  tailscaleQr: string | null;
  cloudUrl?: string | null;
  cloudQr?: string | null;
  cloudSyncEnabled?: boolean;
  isCloudRuntime?: boolean;
}
