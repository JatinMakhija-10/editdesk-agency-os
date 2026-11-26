import type { AiCommandResponse, MobileInfo, WorkspaceSnapshot } from './types';

export const PRODUCTION_STAGES = [
  'New',
  'Unassigned',
  'Assigned',
  'Editing',
  'Internal review',
  'Client review',
  'Revisions',
  'Approved',
  'Delivered',
] as const;

export const ORDER_CATEGORIES = [
  'Shorts',
  'Video Edit',
  'Script Writing',
  'Website Blogs',
  'Instagram Posts',
  'Menu Design',
  'Other',
] as const;

export const EXPENSE_CATEGORIES = ['Software', 'Tools', 'Marketing', 'Equipment', 'Other'] as const;

export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Rate Pending';
  const num = Number(value);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err: any = new Error(data.error || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.pinRequired = Boolean(data.pinRequired);
    throw err;
  }
  return data as T;
}

export const api = {
  authStatus: () =>
    apiFetch<{ authorized: boolean; isLocal: boolean; pinEnabled: boolean }>('/api/auth/status'),
  verifyPin: (pin: string) =>
    apiFetch<{ ok: boolean; token: string }>('/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
  getWorkspace: () => apiFetch<WorkspaceSnapshot>('/api/workspace'),
  getMobileInfo: () => apiFetch<MobileInfo>('/api/mobile-info'),
  createOrder: (payload: any) =>
    apiFetch<{ id: number; snapshot: WorkspaceSnapshot }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createBatchOrders: (orders: any[]) =>
    apiFetch<{ ids: number[]; snapshot: WorkspaceSnapshot }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ orders }),
    }),
  updateOrder: (id: number, patch: any) =>
    apiFetch<{ id: number; snapshot: WorkspaceSnapshot }>(`/api/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteOrder: (id: number) =>
    apiFetch<{ ok: boolean; snapshot: WorkspaceSnapshot }>(`/api/orders/${id}`, {
      method: 'DELETE',
    }),
  recordPayment: (payload: any) =>
    apiFetch<{ result: any; snapshot: WorkspaceSnapshot }>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  allocateAdvance: (paymentId: number, payload: { order_id: number; amount?: number }) =>
    apiFetch<{ result: any; snapshot: WorkspaceSnapshot }>(`/api/payments/${paymentId}/allocate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  recordEditorPayout: (payload: any) =>
    apiFetch<{ result: any; snapshot: WorkspaceSnapshot }>('/api/editor-payouts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  allocateEditorAdvance: (payoutId: number, payload: { order_id: number; amount?: number }) =>
    apiFetch<{ result: any; snapshot: WorkspaceSnapshot }>(`/api/editor-payouts/${payoutId}/allocate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  recordExpense: (payload: any) =>
    apiFetch<{ id: number; snapshot: WorkspaceSnapshot }>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteExpense: (id: number) =>
    apiFetch<{ ok: boolean; snapshot: WorkspaceSnapshot }>(`/api/expenses/${id}`, {
      method: 'DELETE',
    }),
  saveClient: (payload: any) =>
    apiFetch<{ id: number; snapshot: WorkspaceSnapshot }>(
      payload.id ? `/api/clients/${payload.id}` : '/api/clients',
      {
        method: payload.id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      }
    ),
  getClientReminder: (clientId: number) =>
    apiFetch<{ client_id: number; client_name: string; outstanding_due: number; message: string }>(
      `/api/clients/${clientId}/reminder`
    ),
  saveEditor: (payload: any) =>
    apiFetch<{ id: number; snapshot: WorkspaceSnapshot }>(
      payload.id ? `/api/editors/${payload.id}` : '/api/editors',
      {
        method: payload.id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      }
    ),
  runAiCommand: (text: string) =>
    apiFetch<AiCommandResponse>('/api/ai/command', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  updateSettings: (payload: any) =>
    apiFetch<{ snapshot: WorkspaceSnapshot }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  resetSeed: () =>
    apiFetch<{ snapshot: WorkspaceSnapshot }>('/api/system/reset-seed', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};
