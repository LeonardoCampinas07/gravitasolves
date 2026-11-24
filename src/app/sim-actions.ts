"use server";
/**
 * Agente da SIMULAÇÃO: responde com os dados fictícios da Barbearia Exemplo usando o modo básico
 * (respostas prontas, sem custo de IA) e não grava conversa, campanha nem nada no banco.
 */
import { getContext } from "@/lib/auth/session";
import { runBasicAgent } from "@/lib/ai/basic-agent";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

export async function simAgentAction(text: string): Promise<{ ok: boolean; error?: string; data?: { text: string; mode: "basic"; actions: [] } }> {
  try {
    const ctx = await getContext();
    if (!ctx?.sim) return { ok: false, error: "Disponível apenas na simulação." };
    const q = String(text ?? "").trim().slice(0, 500);
    if (!q) return { ok: false, error: "Mensagem vazia." };
    if (!rateLimit(`sim-agent:${await clientIp()}`, 20, 60_000).ok) return { ok: false, error: "Muitas perguntas seguidas. Aguarde um minuto." };
    const norm = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (/(cri|mont|ger|prepar|fa[cz]).*campanha/.test(norm)) {
      return { ok: true, data: { mode: "basic", actions: [], text: [
        "Na sua conta, eu criaria agora uma campanha **em rascunho** com o público certo, as mensagens prontas e cada cliente checado contra consentimento, descadastro e frequência de contato.",
        "",
        "Como isto é uma **simulação**, não vou criar nada. Mas dá para ver como fica: em **Campanhas** existe a campanha **“Agente: reconquistar quem gastava mais”**, que eu preparei ontem e está aguardando aprovação humana.",
        "",
        "Nada é enviado sem alguém aprovar.",
      ].join("\n") } };
    }
    const r = await runBasicAgent({ org: ctx.org, userId: ctx.user.id, role: ctx.role }, q);
    return { ok: true, data: { mode: "basic", actions: [], text: r.text } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
  }
}
