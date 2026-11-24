import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/"><Logo /></Link>
      <div className="mt-6 rounded-lg border border-st-risk/30 bg-st-risk/5 px-4 py-3 text-[13px] text-[#6e4e00]">
        Modelo inicial redigido para o produto. Deve ser revisado por assessoria jurídica antes da comercialização, com os dados da empresa operadora (razão social, CNPJ, endereço e encarregado).
      </div>
      <article className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-700 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-ink-950 [&_h2]:mt-6 [&_h2]:font-semibold [&_h2]:text-ink-950 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </div>
  );
}
