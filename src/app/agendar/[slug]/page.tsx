import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { resolveSettings } from "@/lib/settings";
import { getSegment } from "@/lib/segments";
import { SERVICES } from "@/lib/demo";
import { LogoMark } from "@/components/brand/logo";
import { BookingForm } from "./booking-form";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.slug, slug));
  return { title: org ? `Agendar em ${org.name}` : "Agenda", robots: { index: false } };
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org) notFound();
  const s = resolveSettings(org);
  if (!s.booking.enabled) notFound();
  const seg = getSegment(org.segment);
  const services = s.booking.services.length ? s.booking.services : (SERVICES[org.segment] ?? SERVICES.generic).services;
  const initials = org.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <div className="min-h-dvh bg-paper">
      <div className="h-40 bg-ink-950 sm:h-48">
        <svg className="h-full w-full opacity-60" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <circle cx="330" cy="40" r="70" fill="none" stroke="#d4f06a" strokeOpacity=".15" /><circle cx="330" cy="40" r="110" fill="none" stroke="#d4f06a" strokeOpacity=".08" strokeDasharray="2 6" />
          <circle cx="395" cy="18" r="4" fill="#d4f06a" />
        </svg>
      </div>
      <main className="mx-auto -mt-16 max-w-lg px-4 pb-12">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_60px_-36px_rgba(10,15,13,.5)] animate-rise">
          <div className="flex items-center gap-3">
            <div className="grid size-14 place-items-center rounded-2xl bg-ink-950 text-lg font-semibold text-citrus">{initials}</div>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.02em]">{org.name}</h1>
              <p className="text-sm text-ink-500">{seg.label}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-600">{s.booking.intro || "Escolha o serviço e o melhor horário. Confirmamos com você pelo WhatsApp."}</p>
          <BookingForm slug={slug} services={services} staff={s.booking.staff} staffLabel={seg.vocab.staff} businessName={org.name} />
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-400"><LogoMark size={14} /> Agendamento por GravitaSolves · seus dados são usados apenas por {org.name}</p>
      </main>
    </div>
  );
}
