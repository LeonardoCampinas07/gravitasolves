export const CAMPAIGN_STATUS: Record<string, { label: string; tone: "neutral" | "warn" | "brand" | "violet" | "danger" | "dark" }> = {
  draft: { label: "Rascunho", tone: "neutral" }, pending_approval: { label: "Aguardando aprovação", tone: "warn" },
  approved: { label: "Aprovada", tone: "brand" }, sending: { label: "Em envio", tone: "brand" },
  completed: { label: "Concluída", tone: "violet" }, cancelled: { label: "Cancelada", tone: "danger" },
};
