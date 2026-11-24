/** npm run db:migrate — aplica as migrações no banco configurado em DATABASE_URL. */
import { runMigrations } from "../src/db/migrator";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { prepare: false, max: 1 });
    const ran = await runMigrations({
      exec: async (text) => { await sql.unsafe(text); },
      query: async (text) => (await sql.unsafe(text)) as unknown as { name: string }[],
    });
    console.log(ran.length ? `Aplicadas: ${ran.join(", ")}` : "Banco já está atualizado.");
    await sql.end();
  } else {
    const { getDb } = await import("../src/db/client");
    await getDb();
    console.log("PGlite local migrado em ./.data/pglite");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
