"use client";
import { useRef, useState, useTransition } from "react";
import { FileSpreadsheet, UploadCloud, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { importCommitAction, importPreviewAction, loadDemoAction, type PreviewData } from "@/app/actions";
import { FIELDS, type Mapping } from "@/lib/import/mapping";
import type { ImportResult } from "@/lib/import/run";
import { Badge, Button, Card, Checkbox, Notice, Select, cx } from "@/components/ui";

export function ImportWizard({ onDone, allowDemo = true }: { onDone?: (r: ImportResult | "demo") => void; allowDemo?: boolean }) {
  const fileRef = useRef<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>();
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();

  const pick = (f: File | undefined) => {
    if (!f) return;
    fileRef.current = f; setError(undefined);
    const fd = new FormData(); fd.set("file", f);
    start(async () => {
      const r = await importPreviewAction(fd);
      if (!r.ok || !r.data) return setError(r.error);
      setPreview(r.data); setMapping(r.data.mapping);
    });
  };

  const commit = (form: FormData) => {
    if (!fileRef.current) return;
    form.set("file", fileRef.current);
    form.set("mapping", JSON.stringify(mapping));
    start(async () => {
      const r = await importCommitAction(form);
      if (!r.ok || !r.data) return setError(r.error);
      setResult(r.data);
      onDone?.(r.data);
    });
  };

  if (result) {
    const warnings = result.errors.filter((e) => e.message.startsWith("Aviso"));
    const errors = result.errors.filter((e) => !e.message.startsWith("Aviso"));
    return (
      <Card className="p-6 animate-rise">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-brand-500" />
          <h3 className="text-lg font-semibold">Importação concluída</h3>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Linhas lidas", result.totalRows], ["Novos clientes", result.created], ["Atualizados", result.updated], ["Ignorados", result.skipped]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-paper p-3"><div className="text-xs text-ink-500">{l}</div><div className="num mt-1 text-xl font-semibold">{v as number}</div></div>
          ))}
        </div>
        {result.returnsDetected > 0 && <Notice tone="success">{result.returnsDetected} cliente(s) contatados por campanhas voltaram — retornos atribuídos.</Notice>}
        {(errors.length > 0 || warnings.length > 0) && (
          <details className="mt-4 rounded-lg border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium">{errors.length} erro(s) e {warnings.length} aviso(s) por linha</summary>
            <ul className="thin-scroll mt-2 max-h-60 space-y-1 overflow-auto text-[13px]">
              {[...errors, ...warnings].map((e, i) => <li key={i}><span className="num text-ink-400">Linha {e.row}:</span> {e.message}</li>)}
            </ul>
          </details>
        )}
        {!onDone && <Button className="mt-5" variant="secondary" onClick={() => { setResult(null); setPreview(null); }}>Importar outro arquivo</Button>}
      </Card>
    );
  }

  if (preview) {
    const mappedHeaders = new Set(Object.values(mapping));
    return (
      <form action={commit} className="space-y-4 animate-rise">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="size-5 text-brand-600" />
              <div><div className="text-sm font-semibold">{preview.filename}</div><div className="text-xs text-ink-500">{preview.totalRows.toLocaleString("pt-BR")} linhas · {preview.headers.length} colunas</div></div>
            </div>
            <button type="button" onClick={() => setPreview(null)} className="inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-950"><ArrowLeft className="size-3.5" />Trocar arquivo</button>
          </div>
          <div className="p-5">
            <h3 className="text-sm font-semibold">Confira as colunas</h3>
            <p className="mt-0.5 text-[13px] text-ink-500">Detectamos as colunas automaticamente. Ajuste se necessário — só o nome é obrigatório.</p>
            <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className={cx("shrink-0", mapping[f.key] ? "text-ink-900" : "text-ink-500")}>{f.label}{"required" in f && f.required && <span className="text-st-high"> *</span>}</span>
                  <Select value={mapping[f.key] ?? ""} className="h-8 max-w-[220px] text-[13px]"
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                    <option value="">— não importar —</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </label>
              ))}
            </div>
            {preview.headers.filter((h) => !mappedHeaders.has(h)).length > 0 && (
              <p className="mt-3 text-xs text-ink-500">Colunas ignoradas: {preview.headers.filter((h) => !mappedHeaders.has(h)).join(", ")}</p>
            )}
          </div>
          <div className="thin-scroll overflow-x-auto border-t border-line">
            <table className="w-full text-[12px]">
              <thead><tr>{preview.headers.map((h) => <th key={h} className="whitespace-nowrap border-b border-line bg-paper px-3 py-2 text-left font-medium text-ink-500">{h}{mappedHeaders.has(h) && <Badge tone="brand" className="ml-1.5">usada</Badge>}</th>)}</tr></thead>
              <tbody>{preview.sample.map((r, i) => <tr key={i}>{preview.headers.map((h) => <td key={h} className="whitespace-nowrap border-b border-line px-3 py-2 text-ink-700">{r[h]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Consentimento para contato (LGPD)</h3>
          <p className="mt-0.5 text-[13px] text-ink-500">
            {mapping.consentWhatsapp || mapping.consentEmail || mapping.consentSms
              ? "Sua planilha tem colunas de autorização — elas serão usadas cliente a cliente. A declaração abaixo vale só para quem estiver sem essa informação."
              : "Sua planilha não informa autorização de contato. Marque apenas o que você realmente coletou dos clientes."}
          </p>
          <div className="mt-3 space-y-2.5">
            <Checkbox name="consent_whatsapp" label="Declaro que estes clientes autorizaram receber mensagens por WhatsApp" />
            <Checkbox name="consent_email" label="Declaro que estes clientes autorizaram receber e-mails" />
            <Checkbox name="consent_sms" label="Declaro que estes clientes autorizaram receber SMS" />
            <Checkbox name="legitimate_interest" label="São clientes com relação comercial prévia (legítimo interesse)" hint="Usado somente para e-mail e apenas se você habilitar essa opção em Configurações. Sempre com link de descadastro." />
          </div>
          <p className="mt-3 text-xs text-ink-500">A declaração fica registrada com data e origem no histórico de consentimento de cada cliente. Clientes sem autorização são analisados normalmente, mas não recebem mensagens.</p>
        </Card>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end"><Button disabled={pending || !mapping.name}>{pending ? "Importando…" : `Importar ${preview.totalRows.toLocaleString("pt-BR")} linhas`}</Button></div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={cx("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface px-6 py-14 text-center transition-colors",
          drag ? "border-brand-500 bg-brand-50" : "border-line hover:border-ink-300")}>
        <input type="file" accept=".csv,.xlsx,.txt" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        <div className="grid size-12 place-items-center rounded-xl bg-paper ring-1 ring-line"><UploadCloud className="size-5 text-ink-600" /></div>
        <div className="mt-3 text-sm font-semibold">{pending ? "Lendo planilha…" : "Arraste sua planilha ou clique para escolher"}</div>
        <div className="mt-1 text-xs text-ink-500">Excel (.xlsx) ou CSV · até 10 MB · até 100 mil linhas</div>
        <div className="mt-4 max-w-md text-xs text-ink-400">Colunas úteis: nome, telefone, e-mail, data da última visita, quantidade de visitas, valor gasto, serviço preferido, profissional, autorização de contato.</div>
      </label>
      {error && <Notice tone="danger"><AlertTriangle className="mr-1 inline size-4" />{error}</Notice>}
      {allowDemo && (
        <p className="text-center text-[13px] text-ink-500">
          Só quer conhecer a plataforma?{" "}
          <button type="button" disabled={pending} className="font-medium text-ink-950 underline underline-offset-4"
            onClick={() => start(async () => { const r = await loadDemoAction(); if (!r.ok) return setError(r.error); onDone?.("demo"); })}>
            Carregar dados de demonstração
          </button>{" "}(clientes fictícios, identificados como demonstração).
        </p>
      )}
    </div>
  );
}
