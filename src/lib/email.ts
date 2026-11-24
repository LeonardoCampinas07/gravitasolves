/**
 * E-mails transacionais da plataforma (recuperação de senha, verificação de e-mail).
 * - Com RESEND_API_KEY: envia via API do Resend.
 * - Sem chave em desenvolvimento: mostra o link no terminal do servidor (para testar localmente).
 * - Sem chave em produção: não envia e registra um aviso, sem o conteúdo nem o destinatário.
 */
export interface MailInput { to: string; subject: string; text: string; html?: string }

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendMail(m: MailInput): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.info(`\n[e-mail de desenvolvimento] Assunto: ${m.subject}\n${m.text}\n`);
    else console.warn("[email] RESEND_API_KEY ausente — e-mail transacional não enviado.");
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "GravitaSolves <no-reply@gravitasolves.com>", to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error("[email] falha no envio", res.status);
    return { sent: false };
  }
  return { sent: true };
}

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
