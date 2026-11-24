import { Logo } from "@/components/brand/logo";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink-950 p-10 text-white lg:flex lg:flex-col">
        <Link href="/"><Logo tone="light" /></Link>
        <OrbitArt />
        <div className="relative mt-auto max-w-md">
          <p className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">
            O cliente que sumiu ainda conhece o caminho de volta.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            O GravitaSolves encontra quem deixou de vir, mostra quanto isso custa e prepara a mensagem certa — com consentimento e aprovação humana.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 text-center">
            {[["8 formas", "de conectar"], ["10", "segmentos prontos"], ["LGPD", "no núcleo"]].map(([a, b]) => (
              <div key={a} className="bg-ink-950 px-3 py-4">
                <div className="num text-lg font-semibold text-citrus">{a}</div>
                <div className="text-[11px] text-ink-400">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </main>
    </div>
  );
}

function OrbitArt() {
  return (
    <svg className="pointer-events-none absolute -right-40 top-10 h-[620px] w-[620px] opacity-90" viewBox="0 0 400 400" fill="none" aria-hidden>
      {[60, 100, 140, 180].map((r, i) => (
        <circle key={r} cx="200" cy="200" r={r} stroke="#d4f06a" strokeOpacity={0.08 + i * 0.03} strokeDasharray={i % 2 ? "2 6" : undefined} />
      ))}
      <circle cx="200" cy="200" r="22" fill="#d4f06a" fillOpacity="0.9" />
      <circle cx="338" cy="131" r="6" fill="#d4f06a" />
      <circle cx="104" cy="118" r="4" fill="#12a37a" />
      <circle cx="268" cy="321" r="5" fill="#6e56cf" />
      <path d="M338 131 C 300 150, 260 170, 222 192" stroke="#d4f06a" strokeOpacity=".5" strokeDasharray="3 5" />
    </svg>
  );
}
