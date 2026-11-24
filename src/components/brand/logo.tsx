/**
 * Marca GravitaSolves: órbita aberta (arco de 300°) com o "cliente" retornando ao núcleo.
 */
export function LogoMark({ size = 28, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  const ring = tone === "dark" ? "#0b5d47" : "#d4f06a";
  const core = tone === "dark" ? "#0a0f0d" : "#ffffff";
  const dot = tone === "dark" ? "#12a37a" : "#d4f06a";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* arco de 300° — abre no quadrante superior direito */}
      <path d="M26.39 10A12 12 0 1 1 22 5.61" stroke={ring} strokeWidth="3" strokeLinecap="round" />
      <circle cx="26.4" cy="10" r="3.2" fill={dot} />
      <circle cx="16" cy="16" r="5" fill={core} />
    </svg>
  );
}

export function Logo({ tone = "dark", size = 28 }: { tone?: "dark" | "light"; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} tone={tone} />
      <span className={`text-[19px] font-semibold tracking-[-0.03em] ${tone === "dark" ? "text-ink-950" : "text-white"}`}>gravita<span className={tone === "dark" ? "text-brand-600" : "text-citrus"}>solves</span></span>
    </span>
  );
}
