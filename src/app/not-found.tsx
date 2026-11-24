import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="text-center animate-rise">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink-950"><LogoMark size={30} tone="light" /></div>
        <div className="num mt-6 text-5xl font-semibold tracking-[-0.04em]">404</div>
        <h1 className="mt-2 text-lg font-semibold">Esta página saiu de órbita.</h1>
        <p className="mt-1 text-sm text-ink-500">O endereço não existe ou foi desativado.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-ink-950 px-4 text-sm font-medium text-white hover:bg-ink-800">Voltar ao início</Link>
      </div>
    </div>
  );
}
