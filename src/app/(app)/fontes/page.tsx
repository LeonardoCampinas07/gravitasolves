import { requireCtx } from "@/lib/auth/session";
import { loadSourceState } from "@/lib/sources/state";
import { Notice, PageHeader } from "@/components/ui";
import { SourcePicker } from "@/components/source-picker";

export const metadata = { title: "Conexões" };

const GOOGLE_MSG: Record<string, { tone: "success" | "warn" | "danger"; text: string }> = {
  conectado: { tone: "success", text: "Google Agenda conectado e sincronizado." },
  cancelado: { tone: "warn", text: "Conexão com o Google cancelada." },
  invalido: { tone: "danger", text: "Não foi possível validar a conexão. Tente novamente." },
  "nao-configurado": { tone: "warn", text: "A conexão com Google ainda não foi habilitada neste servidor. Use o arquivo .ics por enquanto." },
};

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ google?: string; msg?: string }> }) {
  const ctx = await requireCtx("customers:read");
  const sp = await searchParams;
  const state = await loadSourceState(ctx);
  const g = sp.google ? (GOOGLE_MSG[sp.google] ?? { tone: "danger" as const, text: `Erro ao conectar o Google: ${sp.msg ?? ""}` }) : null;
  return (
    <>
      <PageHeader guide="fontes" eyebrow="Sem planilha" title="Conexões" description="Conecte o jeito que você já atende. O GravitaSolves monta e atualiza sua base de clientes sozinho e descobre quem está sumindo." />
      {g && <div className="mb-4"><Notice tone={g.tone}>{g.text}</Notice></div>}
      <SourcePicker state={state} />
    </>
  );
}
