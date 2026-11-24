/**
 * Cliente mínimo da API v3 do Asaas (https://docs.asaas.com).
 * - ASAAS_ENV=sandbox (padrão) usa https://api-sandbox.asaas.com/v3 — nenhuma cobrança real.
 * - ASAAS_ENV=production usa https://api.asaas.com/v3.
 * A chave (ASAAS_API_KEY) fica só no servidor e nunca é registrada em logs.
 */

export class AsaasError extends Error {
  constructor(message: string, public status: number, public details?: unknown) { super(message); }
}

export function asaasEnv(): "sandbox" | "production" {
  return process.env.ASAAS_ENV?.trim() === "production" ? "production" : "sandbox";
}

export function asaasConfigured() {
  return Boolean(process.env.ASAAS_API_KEY?.trim());
}

function baseUrl() {
  return asaasEnv() === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const key = process.env.ASAAS_API_KEY?.trim();
  if (!key) throw new AsaasError("Cobrança não configurada (ASAAS_API_KEY ausente).", 0);
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: key, "User-Agent": "GravitaSolves/1.0" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = undefined;
  try { json = text ? JSON.parse(text) : undefined; } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    const errors = (json as { errors?: { description?: string }[] } | undefined)?.errors;
    const msg = errors?.map((e) => e.description).filter(Boolean).join("; ") || `HTTP ${res.status}`;
    throw new AsaasError(`Asaas: ${msg}`, res.status, errors);
  }
  return json as T;
}

export interface AsaasCustomer { id: string; name: string; email?: string; cpfCnpj?: string }
export interface AsaasSubscription { id: string; customer: string; value: number; nextDueDate: string; status: string; externalReference?: string | null }
export interface AsaasPayment {
  id: string; customer: string; subscription?: string | null; status: string; value: number;
  billingType?: string; dueDate?: string; paymentDate?: string | null; clientPaymentDate?: string | null;
  confirmedDate?: string | null; invoiceUrl?: string; externalReference?: string | null; deleted?: boolean;
}

export const asaas = {
  createCustomer: (input: { name: string; email: string; cpfCnpj: string; externalReference: string }) =>
    call<AsaasCustomer>("POST", "/customers", { ...input, notificationDisabled: false }),
  createSubscription: (input: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }) =>
    call<AsaasSubscription>("POST", "/subscriptions", { ...input, billingType: "UNDEFINED", cycle: "MONTHLY" }),
  updateSubscription: (id: string, input: { value: number; description?: string }) =>
    call<AsaasSubscription>("POST", `/subscriptions/${encodeURIComponent(id)}`, { ...input, updatePendingPayments: true }),
  deleteSubscription: (id: string) => call<{ deleted: boolean; id: string }>("DELETE", `/subscriptions/${encodeURIComponent(id)}`),
  listSubscriptionPayments: (id: string) =>
    call<{ data: AsaasPayment[] }>("GET", `/subscriptions/${encodeURIComponent(id)}/payments?limit=20`),
  getPayment: (id: string) => call<AsaasPayment>("GET", `/payments/${encodeURIComponent(id)}`),
};

/** Valida CPF (11) ou CNPJ (14) pelos dígitos verificadores. Retorna só os dígitos ou null. */
export function normalizeDocument(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (d.length === 11) return validCpf(d) ? d : null;
  if (d.length === 14) return validCnpj(d) ? d : null;
  return null;
}

function validCpf(c: string) {
  if (/^(\d)\1{10}$/.test(c)) return false;
  const dv = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(c[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function validCnpj(c: string) {
  if (/^(\d)\1{13}$/.test(c)) return false;
  const dv = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(c[i]) * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
