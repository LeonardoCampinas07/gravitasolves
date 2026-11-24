import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface MigrationExecutor {
  exec(sql: string): Promise<void>;
  query(sql: string): Promise<{ name: string }[]>;
}

/** Aplica, em ordem, os arquivos db/migrations/*.sql ainda não aplicados. */
export async function runMigrations(db: MigrationExecutor, dir = path.join(process.cwd(), "db", "migrations")) {
  await db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set((await db.query(`SELECT name FROM _migrations`)).map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const text = readFileSync(path.join(dir, file), "utf8");
    await db.exec(`BEGIN;\n${text}\nINSERT INTO _migrations(name) VALUES ('${file.replace(/'/g, "''")}');\nCOMMIT;`);
    ran.push(file);
  }
  return ran;
}
