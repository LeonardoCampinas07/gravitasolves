import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GravitaSolves — recupere clientes que sumiram", template: "%s · GravitaSolves" },
  description: "Plataforma com agente de IA que identifica clientes inativos, prioriza quem tem mais chance de voltar e prepara campanhas de reativação com respeito à LGPD.",
};

export const viewport: Viewport = { themeColor: "#0a0f0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
