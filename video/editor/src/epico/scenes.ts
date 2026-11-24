/**
 * Roteiro visual do vídeo épico (versão atual do GravitaSolves, tema escuro, simulação pública).
 * Cada parágrafo de scripts/script-epico.txt vira uma cena; tempos em fração da cena (0..1).
 * target = chave de public/shots-epico/meta.json (gerado por scripts/capture-epico.mjs).
 */
import type { Beat } from "../scenes";
export type { Beat, Cam } from "../scenes";
export type EpicScene =
  | { kind: "hook"; highlight: string[] }
  | { kind: "pain"; highlight: string[] }
  | { kind: "reveal" }
  | { kind: "ui"; title?: string; eyebrow?: string; beats: Beat[] }
  | { kind: "outro" };

export const SCENES: EpicScene[] = [
  // 01 — Lembra daquele cliente…
  { kind: "hook", highlight: ["parou", "vir."] },
  // 02 — Ele não reclamou… sumiu… dinheiro
  { kind: "pain", highlight: ["sumiu", "dinheiro", "dezenas"] },
  // 03 — A sua solução chegou: GravitaSolves
  { kind: "reveal" },
  // 04 — painel
  {
    kind: "ui", eyebrow: "Visão geral", title: "Sua base inteira, em segundos",
    beats: [
      {
        shot: "painel", at: 0,
        cam: [{ t: 0, zoom: 1.0 }, { t: 0.55, target: "revenue", zoom: 1.45, dy: 60 }, { t: 1, target: "revenue", zoom: 1.55, dy: 60 }],
        callouts: [{ t: 0.5, target: "revenue", text: "Dinheiro parado esperando por você", side: "top" }],
      },
      {
        shot: "inativos", at: 0.62,
        cam: [{ t: 0, target: "groups", zoom: 1.15 }, { t: 1, target: "groups", zoom: 1.3 }],
        callouts: [{ t: 0.2, target: "risk", text: "Quem está em risco", side: "bottom" }],
      },
    ],
  },
  // 05 — prioridade
  {
    kind: "ui", eyebrow: "Prioridade", title: "Comece por quem volta",
    beats: [{
      shot: "prioridade", at: 0,
      cam: [{ t: 0, zoom: 1.0, target: "first", dy: 200 }, { t: 0.6, target: "first", zoom: 1.45, dy: 120 }, { t: 1, target: "first", zoom: 1.55, dy: 120 }],
      callouts: [{ t: 0.55, target: "first", text: "Maior chance de voltar", side: "bottom" }],
    }],
  },
  // 06 — agente
  {
    kind: "ui", eyebrow: "Agente de IA", title: "É só perguntar",
    beats: [
      {
        shot: "agente_vazio", at: 0,
        cam: [{ t: 0, zoom: 1.05 }, { t: 0.7, target: "suggestion", zoom: 1.45 }],
        cursor: [{ t: 0.6, target: "suggestion" }, { t: 0.9, target: "suggestion", click: true }],
      },
      {
        shot: "agente_resposta", at: 0.5,
        cam: [{ t: 0, target: "answer", zoom: 1.25, dy: 60 }, { t: 1, target: "answer", zoom: 1.5, dy: 70 }],
      },
    ],
  },
  // 07 — campanha pronta
  {
    kind: "ui", eyebrow: "Campanhas", title: "Pediu, ficou pronta",
    beats: [
      { shot: "campanha_topo", at: 0, cam: [{ t: 0, zoom: 1.0 }, { t: 1, target: "status", zoom: 1.3, dy: 80 }] },
      {
        shot: "campanha", at: 0.4,
        cam: [{ t: 0, target: "strategy", zoom: 1.3 }, { t: 0.6, target: "variants", zoom: 1.6 }, { t: 1, target: "variants", zoom: 1.7 }],
        callouts: [{ t: 0.45, target: "variants", text: "Nome, serviço e profissional de cada cliente", side: "right" }],
      },
    ],
  },
  // 08 — LGPD + aprovação
  {
    kind: "ui", eyebrow: "LGPD", title: "Só com autorização",
    beats: [
      {
        shot: "lgpd", at: 0,
        cam: [{ t: 0, zoom: 1.05 }, { t: 0.8, target: "rules", zoom: 1.5, dy: 60 }],
        callouts: [{ t: 0.55, target: "rules", text: "Só recebe quem autorizou", side: "bottom" }],
      },
      {
        shot: "campanha_topo", at: 0.55,
        cam: [{ t: 0, target: "approve", zoom: 1.3, dy: 120 }, { t: 1, target: "approve", zoom: 1.7, dy: 80 }],
        cursor: [{ t: 0.55, target: "approve" }],
        callouts: [{ t: 0.3, target: "approve", text: "Nada sai sem a sua aprovação", side: "bottom" }],
      },
    ],
  },
  // 09 — agenda
  {
    kind: "ui",
    beats: [
      { shot: "agenda_topo", at: 0, cam: [{ t: 0, zoom: 1.0 }, { t: 1, target: "requests", zoom: 1.25, dy: 80 }] },
      {
        shot: "agenda", at: 0.42,
        cam: [{ t: 0, target: "requests", zoom: 1.3, dy: 80 }, { t: 1, target: "requests", zoom: 1.55, dy: 70 }],
        callouts: [{ t: 0.3, target: "requests", text: "Marcou pelo seu link, caiu na agenda", side: "top" }],
      },
    ],
  },
  // 10 — resultados
  {
    kind: "ui", eyebrow: "Resultados", title: "Quem voltou. Quanto voltou.",
    beats: [{
      shot: "resultados", at: 0,
      cam: [{ t: 0, zoom: 1.0 }, { t: 0.45, target: "kpis", zoom: 1.3 }, { t: 1, target: "chart", zoom: 1.35, dy: 150 }],
      callouts: [{ t: 0.4, target: "kpis", text: "Retorno medido de verdade", side: "bottom" }],
    }],
  },
  // 11 — simulação
  {
    kind: "ui", eyebrow: "Teste agora", title: "Veja funcionando",
    beats: [
      {
        shot: "landing", at: 0,
        cam: [{ t: 0, zoom: 1.0 }, { t: 1, target: "cta", zoom: 1.3, dy: -70 }],
        cursor: [{ t: 0.7, target: "cta" }, { t: 0.95, target: "cta", click: true }],
      },
      {
        shot: "simulacao", at: 0.4,
        cam: [{ t: 0, zoom: 1.0 }, { t: 1, target: "tour", zoom: 1.3 }],
        callouts: [{ t: 0.2, target: "bar", text: "Barbearia de exemplo · tudo liberado · sem cadastro", side: "bottom" }],
      },
    ],
  },
  // 12 — fechamento
  { kind: "outro" },
];
