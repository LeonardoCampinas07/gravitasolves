/** Renderizador mínimo e seguro (sem HTML bruto) para respostas do agente: parágrafos, listas, **negrito**, _itálico_. */
import { Fragment } from "react";

function inline(text: string, key: string) {
  // _itálico_ só nas bordas de palavra: nomes como ANTHROPIC_API_KEY ficam intactos.
  const parts = text.split(/(\*\*[^*]+\*\*|(?<![\p{L}\p{N}])_[^_\n]+_(?![\p{L}\p{N}]))/gu);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={`${key}-${i}`}>{p.slice(1, -1)}</em>;
    return <Fragment key={`${key}-${i}`}>{p}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { depth: number; text: string }[] = [];
  const flush = (k: number) => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${k}`}>
        {list.map((li, i) => <li key={i} style={{ marginLeft: li.depth * 14 }}>{inline(li.text, `li-${k}-${i}`)}</li>)}
      </ul>,
    );
    list = [];
  };
  text.split("\n").forEach((line, i) => {
    const m = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (m) { list.push({ depth: Math.floor(m[1].length / 2), text: m[2] }); return; }
    flush(i);
    if (line.trim()) blocks.push(<p key={`p-${i}`}>{inline(line.replace(/^#+\s*/, ""), `p-${i}`)}</p>);
  });
  flush(-1);
  return <div className="prose-agent">{blocks}</div>;
}
