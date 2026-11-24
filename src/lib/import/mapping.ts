/** Detecção automática de colunas da planilha → campos do GravitaSolves. */

export const FIELDS = [
  { key: "name", label: "Nome", required: true, synonyms: ["nome", "cliente", "nome do cliente", "nome completo", "name", "customer", "paciente", "aluno"] },
  { key: "phone", label: "Telefone / WhatsApp", synonyms: ["telefone", "celular", "whatsapp", "whats", "fone", "tel", "phone", "contato", "numero", "telefone celular"] },
  { key: "email", label: "E-mail", synonyms: ["email", "e mail", "mail", "correio eletronico"] },
  { key: "lastVisit", label: "Data da última visita", synonyms: ["ultima visita", "data ultima visita", "data da ultima visita", "ultimo atendimento", "ultima compra", "data ultima compra", "ultima consulta", "ultimo pedido", "last visit", "ultimo servico", "data do ultimo atendimento"] },
  { key: "firstVisit", label: "Data da primeira visita", synonyms: ["primeira visita", "cliente desde", "data cadastro", "data de cadastro", "first visit", "primeira compra"] },
  { key: "visitCount", label: "Quantidade de visitas", synonyms: ["quantidade de visitas", "qtd visitas", "visitas", "n visitas", "numero de visitas", "total de visitas", "frequencia", "atendimentos", "qtd compras", "compras", "pedidos", "consultas"] },
  { key: "totalSpent", label: "Total gasto", synonyms: ["total gasto", "valor total", "faturamento", "total", "gasto total", "total comprado", "valor gasto"] },
  { key: "avgTicket", label: "Valor médio gasto", synonyms: ["ticket medio", "valor medio", "gasto medio", "media", "ticket", "valor medio gasto"] },
  { key: "lastVisitAmount", label: "Valor da última visita", synonyms: ["valor ultima visita", "valor da ultima visita", "valor ultima compra", "valor do ultimo atendimento"] },
  { key: "favoriteService", label: "Serviço/produto mais utilizado", synonyms: ["servico", "servico mais utilizado", "servico favorito", "produto", "produto favorito", "procedimento", "tratamento", "prato favorito", "modalidade", "categoria"] },
  { key: "preferredStaff", label: "Profissional preferido", synonyms: ["barbeiro", "profissional", "atendente", "vendedor", "vendedora", "dentista", "professor", "profissional preferido", "tosador"] },
  { key: "notes", label: "Observações / preferências", synonyms: ["observacoes", "observacao", "obs", "notas", "preferencias", "comentarios", "anotacoes"] },
  { key: "consentWhatsapp", label: "Autoriza WhatsApp", synonyms: ["aceita whatsapp", "autoriza whatsapp", "consentimento whatsapp", "opt in whatsapp", "optin whatsapp"] },
  { key: "consentEmail", label: "Autoriza e-mail", synonyms: ["aceita email", "autoriza email", "consentimento email", "opt in email", "newsletter"] },
  { key: "consentSms", label: "Autoriza SMS", synonyms: ["aceita sms", "autoriza sms", "consentimento sms", "opt in sms"] },
  { key: "externalId", label: "ID no sistema de origem", synonyms: ["id", "codigo", "cod", "id cliente", "codigo cliente", "external id", "matricula"] },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
export type Mapping = Partial<Record<FieldKey, string>>;

export function normHeader(h: string) {
  return h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Atribui cada campo à coluna de maior pontuação; uma coluna atende a no máximo um campo. */
export function detectMapping(headers: string[]): Mapping {
  const scored: { field: FieldKey; header: string; score: number }[] = [];
  for (const header of headers) {
    const h = normHeader(header);
    if (!h) continue;
    for (const f of FIELDS) {
      let best = 0;
      for (const syn of f.synonyms) {
        if (h === syn) best = Math.max(best, 100);
        else if (h.startsWith(syn + " ") || h.endsWith(" " + syn)) best = Math.max(best, 70 + syn.length);
        else if (syn.length >= 5 && h.includes(syn)) best = Math.max(best, 50 + syn.length);
      }
      if (best) scored.push({ field: f.key, header, score: best });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const s of scored) {
    if (mapping[s.field] || used.has(s.header)) continue;
    mapping[s.field] = s.header;
    used.add(s.header);
  }
  return mapping;
}
