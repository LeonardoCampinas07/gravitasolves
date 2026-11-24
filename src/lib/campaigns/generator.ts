/**
 * Geração de mensagens de campanha. Com IA: Claude escreve variações para o grupo com base
 * no perfil agregado (sem dados pessoais). Sem IA: modelos por segmento.
 */
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Channel, CustomerStatus } from "@/db/schema";
import { getSegment } from "@/lib/segments";
import { AI_MODEL, FALLBACK_PARAMS, aiEnabled, describeAiError, getAnthropic } from "@/lib/ai/client";
import { templateVariants } from "./templates";

export interface AudienceProfile {
  count: number;
  statuses: CustomerStatus[];
  avgDaysSince: number | null;
  avgTicketCents: number;
  topServices: string[];
  topStaff: string[];
}

export interface GenerateInput {
  businessName: string;
  segmentId: string;
  channel: Channel;
  tone: string;
  offer: string | null;
  objective: string | null;
  profile: AudienceProfile;
  /** false força os modelos do segmento (ex.: cota de IA esgotada). */
  useAi?: boolean;
}

export interface GeneratedCopy {
  variants: string[];
  subject: string | null;
  rationale: string;
  generatedBy: "ai" | "template";
  notice?: string;
}

const CopySchema = z.object({
  variants: z.array(z.string()).describe("Três variações de mensagem, cada uma com abordagem diferente"),
  email_subject: z.string().describe("Assunto do e-mail (curto). Vazio se o canal não for e-mail."),
  rationale: z.string().describe("Explicação curta (2–3 frases) da estratégia escolhida para este grupo"),
});

const CHANNEL_RULES: Record<Channel, string> = {
  whatsapp: "WhatsApp: até 350 caracteres, conversacional, no máximo 1 emoji, sem links.",
  sms: "SMS: até 150 caracteres, sem emoji, direto.",
  email: "E-mail: 2 a 4 frases curtas no corpo; tom pessoal, sem formatação HTML.",
};

export async function generateCopy(input: GenerateInput): Promise<GeneratedCopy> {
  if (!aiEnabled() || input.useAi === false) {
    return {
      variants: templateVariants(input.segmentId, input.profile.statuses, input.offer),
      subject: input.channel === "email" ? `Sentimos sua falta no ${input.businessName}` : null,
      rationale: "Mensagens criadas a partir dos modelos prontos do seu segmento. Revise e ajuste antes de enviar.",
      generatedBy: "template",
    };
  }
  const seg = getSegment(input.segmentId);
  const p = input.profile;
  const system = [
    "Você é o redator de reativação de clientes do GravitaSolves, escrevendo em português do Brasil para pequenos negócios.",
    "Escreva mensagens que pareçam escritas por uma pessoa do próprio estabelecimento: naturais, calorosas, específicas, sem clichês de marketing.",
    "Regras obrigatórias:",
    "- Use as variáveis exatamente assim: {nome} (primeiro nome), {estabelecimento}, {oferta} (só se houver oferta).",
    "- {servico} e {profissional} são opcionais e devem ficar em uma frase própria e curta, pois a frase é removida quando o cliente não tem esse dado.",
    "- Nunca invente fatos (preços, datas, novidades específicas, nomes de pessoas) que não foram informados.",
    "- Nunca cite há quantos dias a pessoa não vem nem use culpa ou urgência artificial.",
    "- Não inclua instrução de descadastro: o sistema acrescenta automaticamente.",
    "- Cada variação deve ter abertura e argumento diferentes entre si.",
    `- ${CHANNEL_RULES[input.channel]}`,
    seg.restrictions ? `- Restrição do setor: ${seg.restrictions}` : "",
  ].filter(Boolean).join("\n");

  const user = [
    `Estabelecimento: ${input.businessName} (${seg.label}).`,
    `Contexto do segmento: ${seg.aiContext}`,
    `Grupo: ${p.count} clientes; status: ${p.statuses.join(", ")}; afastamento médio: ${p.avgDaysSince ?? "?"} dias; ticket médio: R$ ${(p.avgTicketCents / 100).toFixed(2)}.`,
    p.topServices.length ? `Serviços/produtos mais usados pelo grupo: ${p.topServices.join(", ")}.` : "",
    p.topStaff.length ? `Profissionais preferidos: ${p.topStaff.join(", ")}.` : "",
    `Canal: ${input.channel}. Tom desejado: ${input.tone}.`,
    input.offer ? `Oferta aprovada pelo estabelecimento: ${input.offer}.` : "Sem oferta: foque em relacionamento e convite.",
    input.objective ? `Objetivo da campanha: ${input.objective}.` : "",
  ].filter(Boolean).join("\n");

  try {
    const res = await getAnthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 4000,
      ...FALLBACK_PARAMS,
      output_config: { effort: "low", format: betaZodOutputFormat(CopySchema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("A IA não retornou mensagens válidas.");
    const out = res.parsed_output;
    const variants = out.variants.map((v) => v.trim()).filter((v) => v.length > 10).slice(0, 4);
    if (!variants.length) throw new Error("A IA não retornou mensagens válidas.");
    return {
      variants,
      subject: input.channel === "email" ? out.email_subject || `Sentimos sua falta no ${input.businessName}` : null,
      rationale: out.rationale,
      generatedBy: "ai",
    };
  } catch (e) {
    return {
      variants: templateVariants(input.segmentId, input.profile.statuses, input.offer),
      subject: input.channel === "email" ? `Sentimos sua falta no ${input.businessName}` : null,
      rationale: "Mensagens criadas a partir dos modelos do segmento.",
      generatedBy: "template",
      notice: `A IA não respondeu (${describeAiError(e)}). Usamos os modelos do segmento.`,
    };
  }
}
