import { describe, expect, it } from "vitest";
import { fetchIcs, isBlockedHost, mapIcsEvents, normalizeIcsUrl } from "@/lib/sources/ics-url";
import { parseIcs } from "@/lib/sources/parsers";

describe("agenda por link (.ics / webcal)", () => {
  it("converte webcal:// em https:// e aceita links do iCloud e Outlook", () => {
    expect(normalizeIcsUrl("webcal://p42-caldav.icloud.com/published/2/abc").toString()).toBe("https://p42-caldav.icloud.com/published/2/abc");
    expect(normalizeIcsUrl("  https://outlook.office365.com/owa/calendar/x/y/calendar.ics ").hostname).toBe("outlook.office365.com");
  });

  it("rejeita esquemas e URLs inválidos", () => {
    expect(() => normalizeIcsUrl("file:///etc/passwd")).toThrow();
    expect(() => normalizeIcsUrl("ftp://x.com/a.ics")).toThrow();
    expect(() => normalizeIcsUrl("não é link")).toThrow();
    expect(() => normalizeIcsUrl("https://user:pass@x.com/a.ics")).toThrow();
  });

  it("bloqueia hosts locais e privados (SSRF)", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "app.internal", "printer.local"])
      expect(isBlockedHost(h), h).toBe(true);
    for (const h of ["p42-caldav.icloud.com", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isBlockedHost(h), h).toBe(false);
    expect(() => normalizeIcsUrl("http://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => normalizeIcsUrl("webcal://localhost:3000/a.ics")).toThrow();
  });

  it("não baixa de endereços internos", async () => {
    await expect(fetchIcs("http://127.0.0.1:3000/a.ics")).rejects.toThrow(/não é permitido/);
  });

  it("mapeia eventos igual ao upload de arquivo (mesmo externalId, ignora recorrentes e pessoais)", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:a1", "DTSTART:20260310T130000Z", "SUMMARY:Limpeza - Maria Souza (11) 98888-7777", "END:VEVENT",
      "BEGIN:VEVENT", "UID:a2", "DTSTART:20260310T150000Z", "SUMMARY:Almoço", "END:VEVENT",
      "BEGIN:VEVENT", "UID:a3", "DTSTART:20260311T150000Z", "SUMMARY:Reunião semanal", "RRULE:FREQ=WEEKLY", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const items = mapIcsEvents(parseIcs(ics));
    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe("a1@2026-03-10T13:00:00.000Z");
    expect(items[0].person.name).toBe("Maria Souza");
  });
});
