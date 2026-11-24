/** Driver de produção (postgres-js): datas em SQL escrito à mão precisam ser enviadas como texto ISO. */
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { PG_DATE_OIDS, drizzlePostgres } from "@/db/client";

describe("drizzlePostgres", () => {
  it("serializa Date como ISO e mantém texto (sem conectar)", async () => {
    const client = postgres("postgres://u:p@127.0.0.1:1/x", { prepare: false, max: 1 });
    drizzlePostgres(client);
    const s = (client as unknown as { options: { serializers: Record<string, (v: unknown) => unknown> } }).options.serializers;
    for (const oid of PG_DATE_OIDS) {
      expect(s[oid](new Date("2026-11-24T03:00:00.000Z"))).toBe("2026-11-24T03:00:00.000Z");
      expect(s[oid]("2026-11-24")).toBe("2026-11-24");
    }
    await client.end();
  });
});
