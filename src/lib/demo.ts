/**
 * Dados de DEMONSTRAÇÃO. Pessoas fictícias, marcadas com is_demo = true, exibidas com selo
 * "Demonstração" e bloqueadas para envio real. Podem ser removidas a qualquer momento.
 */
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { customers, type Organization } from "@/db/schema";
import { getSegment } from "./segments";
import { addDays, today } from "./dates";
import { importRows } from "./import/run";
import { audit } from "./audit";

const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Karina", "Lucas", "Mariana", "Nicolas", "Olívia", "Pedro", "Rafaela", "Samuel", "Tatiane", "Vinícius", "Yasmin", "André", "Beatriz", "Caio", "Débora", "Enzo", "Fernanda", "Gustavo", "Helena", "Igor"];
const LAST = ["Silva", "Souza", "Oliveira", "Santos", "Lima", "Pereira", "Costa", "Almeida", "Ferreira", "Rodrigues", "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro"];

export const SERVICES: Record<string, { services: string[]; staff: string[]; ticket: [number, number] }> = {
  barbershop: { services: ["Corte", "Corte + barba", "Barba", "Pigmentação"], staff: ["Rafael", "Thiago", "Marcos"], ticket: [45, 110] },
  beauty_salon: { services: ["Escova", "Coloração", "Manicure", "Corte feminino"], staff: ["Juliana", "Patrícia", "Camila"], ticket: [60, 280] },
  dental: { services: ["Limpeza", "Revisão", "Clareamento", "Ortodontia"], staff: ["Dra. Paula", "Dr. Ricardo"], ticket: [180, 900] },
  aesthetics: { services: ["Limpeza de pele", "Drenagem", "Peeling", "Massagem"], staff: ["Aline", "Bianca"], ticket: [120, 450] },
  gym: { services: ["Musculação", "Funcional", "Pilates", "Spinning"], staff: ["Prof. Leo", "Prof. Carol"], ticket: [99, 180] },
  restaurant: { services: ["Executivo", "Pizza", "Hambúrguer", "Sushi"], staff: ["Salão", "Delivery"], ticket: [45, 160] },
  clothing: { services: ["Jeans", "Vestidos", "Camisaria", "Acessórios"], staff: ["Larissa", "Bruno"], ticket: [150, 600] },
  auto_repair: { services: ["Troca de óleo", "Revisão", "Freios", "Suspensão"], staff: ["Seu Carlos", "Jefferson"], ticket: [250, 1400] },
  pet_shop: { services: ["Banho", "Banho e tosa", "Ração", "Consulta"], staff: ["Bia", "Renato"], ticket: [60, 220] },
  generic: { services: ["Atendimento", "Produto A", "Produto B"], staff: ["Equipe"], ticket: [50, 300] },
};

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

export function buildDemoRows(segmentId: string, count = 160, ref = today()) {
  const seg = getSegment(segmentId);
  const cfg = SERVICES[seg.id] ?? SERVICES.generic;
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const span = seg.thresholds.highlyInactiveDays * 1.8;
  return Array.from({ length: count }, (_, i) => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const daysAgo = Math.floor(Math.pow(r(), 1.4) * span);
    const visits = 1 + Math.floor(Math.pow(r(), 2) * 30);
    const ticket = cfg.ticket[0] + r() * (cfg.ticket[1] - cfg.ticket[0]);
    const last = addDays(ref, -daysAgo);
    const first = addDays(last, -Math.floor(visits * seg.thresholds.atRiskDays * (0.6 + r() * 0.6)));
    return {
      Nome: name,
      Telefone: `+55 (11) 9${String(1000 + i).padStart(4, "0")}-${String(Math.floor(r() * 9000) + 1000)}`,
      "E-mail": `${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.demo${i}@exemplo.com`,
      "Última visita": last,
      "Primeira visita": first,
      "Quantidade de visitas": visits,
      "Ticket médio": ticket.toFixed(2).replace(".", ","),
      "Serviço mais utilizado": pick(cfg.services),
      Profissional: pick(cfg.staff),
      "Aceita WhatsApp": r() < 0.75 ? "sim" : "não",
      "Aceita e-mail": r() < 0.5 ? "sim" : "não",
    };
  });
}

export async function loadDemoData(tx: Tx, org: Organization, userId: string) {
  const rows = buildDemoRows(org.segment);
  return importRows(tx, org, rows, {
    filename: "dados-de-demonstracao", source: "demo", userId, isDemo: true,
    mapping: {
      name: "Nome", phone: "Telefone", email: "E-mail", lastVisit: "Última visita", firstVisit: "Primeira visita",
      visitCount: "Quantidade de visitas", avgTicket: "Ticket médio", favoriteService: "Serviço mais utilizado",
      preferredStaff: "Profissional", consentWhatsapp: "Aceita WhatsApp", consentEmail: "Aceita e-mail",
    },
  });
}

export async function removeDemoData(tx: Tx, orgId: string, userId: string) {
  const del = await tx.delete(customers).where(and(eq(customers.orgId, orgId), eq(customers.isDemo, true))).returning({ id: customers.id });
  await audit(tx, { orgId, actorType: "user", actorId: userId, action: "demo.remove", summary: `${del.length} clientes de demonstração removidos` });
  return del.length;
}
