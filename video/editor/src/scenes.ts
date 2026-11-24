/**
 * Roteiro visual. Cada parágrafo da narração vira uma cena. Os tempos são frações da duração da cena
 * (0 = início, 1 = fim), então o vídeo se adapta sozinho a qualquer narração (provisória ou ElevenLabs).
 *
 * target = chave de elemento registrada em public/shots/meta.json pelo capturador.
 */
export type Cam = { t: number; target?: string; zoom: number; dy?: number };
export type CursorKey = { t: number; target: string; click?: boolean };
export type Callout = { t: number; target: string; text: string; side?: "top" | "bottom" | "left" | "right" };
export type Beat = { shot: string; at: number; cam: Cam[]; cursor?: CursorKey[]; callouts?: Callout[] };
export type SceneDef =
  | { kind: "hook" }
  | { kind: "logo"; beats: Beat[] }
  | { kind: "ui"; title?: string; eyebrow?: string; beats: Beat[] }
  | { kind: "outro" };

export const SCENES: SceneDef[] = [
  // 01 — gancho
  { kind: "hook" },
  // 02 — apresentação
  {
    kind: "logo",
    beats: [{ shot: "landing", at: 0.5, cam: [{ t: 0, zoom: 1.0 }, { t: 1, target: "title", zoom: 1.18 }] }],
  },
  // 03 — conectar
  {
    kind: "ui", eyebrow: "Sem planilha", title: "Conecte do seu jeito",
    beats: [
      {
        shot: "fontes", at: 0,
        cam: [{ t: 0, zoom: 1.0 }, { t: 0.35, target: "question", zoom: 1.55 }, { t: 0.9, target: "chip", zoom: 1.7 }],
        cursor: [{ t: 0.45, target: "chip" }, { t: 0.85, target: "chip", click: true }],
      },
      {
        shot: "fontes_rec", at: 0.52,
        cam: [{ t: 0, target: "chip", zoom: 1.5 }, { t: 0.5, target: "booking", zoom: 1.35 }, { t: 1, target: "whatsapp", zoom: 1.3 }],
        callouts: [{ t: 0.35, target: "booking", text: "Recomendado para quem marca pelo WhatsApp", side: "bottom" }],
      },
    ],
  },
  // 04 — WhatsApp
  {
    kind: "ui",
    beats: [
      {
        shot: "whatsapp", at: 0,
        cam: [{ t: 0, target: "card", zoom: 1.2 }, { t: 0.7, target: "result", zoom: 1.7 }],
        callouts: [{ t: 0.55, target: "result", text: "Conversas viram clientes", side: "top" }],
      },
      {
        shot: "clientes", at: 0.55,
        cam: [{ t: 0, zoom: 1.05 }, { t: 0.6, target: "activity", zoom: 1.75 }],
        callouts: [{ t: 0.45, target: "activity", text: "Última conversa há meses", side: "right" }],
      },
    ],
  },
  // 05 — painel
  {
    kind: "ui", eyebrow: "Visão geral", title: "Sua base, em segundos",
    beats: [{
      shot: "painel", at: 0,
      cam: [{ t: 0, zoom: 1.0 }, { t: 0.3, target: "kpis", zoom: 1.4 }, { t: 0.55, target: "inactive", zoom: 1.6 }, { t: 0.9, target: "opportunity", zoom: 1.55 }],
      callouts: [
        { t: 0.32, target: "risk", text: "Quem está sumindo", side: "bottom" },
        { t: 0.72, target: "opportunity", text: "Receita parada na sua base", side: "top" },
      ],
    }],
  },
  // 06 — prioridade
  {
    kind: "ui",
    beats: [
      { shot: "inativos", at: 0, cam: [{ t: 0, zoom: 1.05 }, { t: 1, target: "groups", zoom: 1.25 }] },
      {
        shot: "prioridade", at: 0.42,
        cam: [{ t: 0, zoom: 1.1 }, { t: 0.55, target: "score", zoom: 1.9 }],
        cursor: [{ t: 0.2, target: "first" }, { t: 0.6, target: "score" }],
        callouts: [{ t: 0.5, target: "score", text: "Maior chance de voltar primeiro", side: "right" }],
      },
    ],
  },
  // 07 — agente
  {
    kind: "ui", eyebrow: "Agente de IA", title: "É só perguntar",
    beats: [
      {
        shot: "agente_vazio", at: 0,
        cam: [{ t: 0, zoom: 1.1 }, { t: 0.6, target: "suggestion", zoom: 1.55 }],
        cursor: [{ t: 0.35, target: "suggestion" }, { t: 0.8, target: "suggestion", click: true }],
      },
      {
        shot: "agente_resposta", at: 0.5,
        cam: [{ t: 0, zoom: 1.15 }, { t: 0.7, target: "answer", zoom: 1.6 }],
      },
    ],
  },
  // 08 — campanha
  {
    kind: "ui",
    beats: [{
      shot: "campanha", at: 0,
      cam: [{ t: 0, target: "strategy", zoom: 1.3 }, { t: 0.45, target: "v1", zoom: 1.75 }, { t: 1, target: "v1", zoom: 1.6, dy: 140 }],
      callouts: [{ t: 0.4, target: "v1", text: "Nome, serviço e barbeiro de cada cliente", side: "right" }],
    }],
  },
  // 09 — LGPD
  {
    kind: "ui", eyebrow: "Segurança", title: "LGPD por padrão",
    beats: [
      {
        shot: "lgpd", at: 0,
        cam: [{ t: 0, zoom: 1.15 }, { t: 0.55, target: "skipped", zoom: 1.85 }],
        callouts: [{ t: 0.5, target: "skipped", text: "Sem autorização: fica de fora", side: "left" }],
      },
      {
        shot: "campanha_topo", at: 0.6,
        cam: [{ t: 0, zoom: 1.1 }, { t: 0.6, target: "status", zoom: 1.7 }],
        callouts: [{ t: 0.4, target: "status", text: "Só sai com a sua aprovação", side: "bottom" }],
      },
    ],
  },
  // 10 — agenda
  {
    kind: "ui", eyebrow: "Link de agendamento", title: "O cliente marca. Você atende.",
    beats: [
      {
        shot: "booking", at: 0,
        cam: [{ t: 0, target: "services", zoom: 1.35 }, { t: 0.7, target: "submit", zoom: 1.6 }],
        cursor: [{ t: 0.3, target: "time" }, { t: 0.55, target: "submit" }, { t: 0.85, target: "submit", click: true }],
      },
      { shot: "booking_ok", at: 0.38, cam: [{ t: 0, target: "ok", zoom: 1.7 }, { t: 1, target: "ok", zoom: 1.8 }] },
      {
        shot: "agenda", at: 0.58,
        cam: [{ t: 0, zoom: 1.1 }, { t: 0.55, target: "row", zoom: 1.7 }],
        cursor: [{ t: 0.4, target: "done" }, { t: 0.8, target: "done", click: true }],
        callouts: [{ t: 0.3, target: "requests", text: "Pedido novo na agenda", side: "bottom" }],
      },
    ],
  },
  // 11 — resultados
  {
    kind: "ui", eyebrow: "Resultados", title: "Retorno que dá para medir",
    beats: [
      {
        shot: "resultados", at: 0,
        cam: [{ t: 0, zoom: 1.05 }, { t: 0.4, target: "kpis", zoom: 1.45 }, { t: 1, target: "chart", zoom: 1.5 }],
        callouts: [{ t: 0.35, target: "kpis", text: "Quem voltou e quanto faturou", side: "bottom" }],
      },
      {
        shot: "recuperado", at: 0.62,
        cam: [{ t: 0, zoom: 1.2 }, { t: 0.5, target: "badge", zoom: 1.9 }],
        callouts: [{ t: 0.45, target: "badge", text: "Cliente recuperado", side: "right" }],
      },
    ],
  },
  // 12 — fechamento
  { kind: "outro" },
];
