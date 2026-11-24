import Link from "next/link";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CustomerStatus } from "@/db/schema";
import { PageGuide } from "@/components/guide";
import { STATUS_HELP } from "@/lib/guides";
import { STATUS_LABEL } from "@/lib/classification";

/** clsx + tailwind-merge: classes passadas por props sobrescrevem as padrão sem conflito. */
export const cx = (...v: ClassValue[]) => twMerge(clsx(v));

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
const BTN: Record<BtnVariant, string> = {
  primary: "btn-primary",
  accent: "bg-citrus text-[#0a0f0d] hover:bg-citrus-dim",
  secondary: "btn-secondary",
  ghost: "text-ink-600 hover:text-ink-950 hover:bg-ink-950/5",
  danger: "bg-surface text-st-high border border-st-high/30 hover:bg-st-high/10",
};
const btnBase = "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 h-9 text-sm font-medium transition-[background-color,border-color,color,transform] active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return <button {...p} className={cx(btnBase, BTN[variant], className)} />;
}
export function ButtonLink({ variant = "primary", className, ...p }: React.ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link {...p} className={cx(btnBase, BTN[variant], className)} />;
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx("glass rounded-[18px]", className)} />;
}
export function CardHeader({ title, description, action }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow, guide }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string; guide?: string }) {
  return (
    <>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-rise">
      <div>
        {eyebrow && <div className="mb-1 text-[12.5px] text-ink-500">{eyebrow}</div>}
        <h1 className="text-[30px] font-semibold tracking-[-0.03em]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    {guide && <PageGuide id={guide} />}
    </>
  );
}

export const STATUS_COLOR: Record<CustomerStatus, string> = {
  active: "var(--color-st-active)", at_risk: "var(--color-st-risk)", inactive: "var(--color-st-inactive)",
  highly_inactive: "var(--color-st-high)", recovered: "var(--color-st-recovered)", unknown: "var(--color-st-unknown)",
};

export function StatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span title={STATUS_HELP[status]} className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-800">
      <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "brand" | "warn" | "danger" | "violet" | "dark"; className?: string }) {
  const tones = {
    neutral: "bg-ink-950/5 text-ink-700",
    brand: "bg-brand-50 text-brand-700",
    warn: "bg-st-risk/15 text-st-risk-text",
    danger: "bg-st-high/10 text-st-high",
    violet: "bg-st-recovered/10 text-st-recovered",
    dark: "bg-ink-950 text-citrus",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function Kpi({ label, value, hint, accent, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: string; icon?: React.ReactNode }) {
  return (
    <Card className="relative overflow-hidden p-4 transition-colors hover:border-white/15 animate-rise">
      {accent && <span className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-25 blur-2xl" style={{ background: accent }} />}
      <div className="flex items-center justify-between text-[13px] text-ink-500">
        <span>{label}</span>
        <span className="text-ink-400">{icon}</span>
      </div>
      <div className="num mt-2 text-[26px] font-semibold leading-none text-ink-950" style={{ textShadow: "0 0 24px rgba(78,227,159,.12)" }}>{value}</div>
      {hint && <div className="mt-2 text-xs text-ink-500">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-xl bg-paper text-ink-600 ring-1 ring-line">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

const inputCls = "field w-full rounded-xl border border-line px-3 h-9 text-sm text-ink-950 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15";
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, p.className)} />;
}
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, "h-auto py-2 leading-relaxed", p.className)} />;
}
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, "pr-8", p.className)} />;
}
export function Checkbox({ label, hint, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" {...p} className="mt-0.5 size-4 rounded border-line accent-brand-600" />
      <span>
        <span className="text-ink-900">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warn" | "success" | "danger"; children: React.ReactNode; title?: string }) {
  const tones = {
    info: "border-line bg-surface text-ink-800",
    warn: "border-st-risk/30 bg-st-risk/10 text-st-risk-text",
    success: "border-brand-200 bg-brand-50 text-brand-800",
    danger: "border-st-high/30 bg-st-high/10 text-st-high-text",
  };
  return (
    <div className={cx("rounded-xl border px-3.5 py-3 text-sm", tones[tone])}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="thin-scroll overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cx("border-b border-line bg-paper/60 px-4 py-2.5 text-left text-xs font-medium text-ink-500", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cx("border-b border-line px-4 py-3 align-middle last:border-r-0", className)}>{children}</td>;
}

export function ProgressBar({ value, color = "var(--color-brand-500)" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-950/6">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

export function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? "bg-brand-500 text-white" : score >= 45 ? "bg-brand-100 text-brand-800" : "bg-ink-950/5 text-ink-600";
  return <span className={cx("num inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold", color)}>{score}</span>;
}
