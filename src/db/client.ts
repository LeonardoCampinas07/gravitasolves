/**
 * Conexão com o banco.
 * - DATABASE_URL vazio            → PGlite persistido em ./.data/pglite (desenvolvimento)
 * - DATABASE_URL=memory://        → PGlite em memória (testes)
 * - DATABASE_URL=postgres://...   → PostgreSQL (Supabase em produção)
 * - Cloudflare Workers             → PostgreSQL com uma conexão por requisição (o Workers não permite
 *                                    reaproveitar sockets entre requisições); usa o Hyperdrive se configurado.
 */
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { runMigrations, type MigrationExecutor } from "./migrator";

export type DB = PgliteDatabase<typeof schema>;
/** Transação ou banco — ambos expõem a mesma API de consultas. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const PG_EMPTY_DIRS = [
  "pg_commit_ts", "pg_dynshmem", "pg_notify", "pg_replslot", "pg_serial", "pg_snapshots", "pg_stat", "pg_stat_tmp",
  "pg_tblspc", "pg_twophase", "pg_logical/snapshots", "pg_logical/mappings", "pg_wal/archive_status", "pg_wal/summaries",
];

interface DbState { db: DB; ready: Promise<void>; kind: "pglite" | "postgres" }
const g = globalThis as unknown as { __gravitaDb?: DbState };

async function createState(): Promise<DbState> {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_SIZE ?? 5) });
    return { db: drizzlePostgres(client), ready: Promise.resolve(), kind: "postgres" };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = url === "memory://" ? undefined : path.resolve(process.env.PGLITE_DIR ?? "./.data/pglite");
  // O PGlite não cria pastas intermediárias; garante que o diretório exista.
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    // Copiar/mover a pasta do projeto pode descartar subpastas vazias do Postgres, e sem elas o banco não abre.
    if (existsSync(path.join(dataDir, "PG_VERSION")))
      for (const d of PG_EMPTY_DIRS) mkdirSync(path.join(dataDir, d), { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  const exec: MigrationExecutor = {
    exec: async (text) => { await client.exec(text); },
    query: async (text) => (await client.query<{ name: string }>(text)).rows,
  };
  // PGlite local: migra automaticamente para facilitar o primeiro uso.
  let ready: Promise<void> = runMigrations(exec).then(() => undefined);
  // Verificação de produção (só testes): roda tudo como um papel sem bypass de RLS, igual ao gravita_app do Supabase.
  if (process.env.PGLITE_APP_ROLE === "1") ready = ready.then(async () => {
    await client.exec(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gravita_app') THEN CREATE ROLE gravita_app NOINHERIT; END IF; END $$;
      GRANT USAGE ON SCHEMA public TO gravita_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gravita_app;
      SET ROLE gravita_app;`);
  });
  return { db, ready, kind: "pglite" };
}

const isWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
const perRequest = new WeakMap<object, DB>();

async function workersDb(): Promise<DB> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env, ctx } = getCloudflareContext();
  let db = perRequest.get(ctx);
  if (!db) {
    const hyper = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    const url = hyper?.connectionString ?? process.env.DATABASE_URL?.trim() ?? "";
    if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL (ou o Hyperdrive) não configurado no Worker");
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_SIZE ?? 5), fetch_types: false, idle_timeout: 2 });
    // Conexões não sobrevivem à requisição no Workers: fecha logo que ficam ociosas para não esgotar o pooler.
    ctx.waitUntil(new Promise((r) => setTimeout(r, 25_000)).then(() => client.end({ timeout: 5 })));
    db = drizzlePostgres(client);
    perRequest.set(ctx, db);
  }
  return db;
}

/**
 * O drizzle (postgres-js) troca os serializadores de data por "repassa como está", contando que ele mesmo
 * converta. Em SQL escrito à mão (sql`... >= ${data}`) ele não converte, e o Date quebrava a consulta num
 * Postgres de verdade (o PGlite dos testes aceita Date, por isso passava). Aqui datas viram ISO e texto segue igual.
 */
export const PG_DATE_OIDS = ["1184", "1082", "1083", "1114", "1182", "1185", "1115", "1231"];
export function drizzlePostgres(client: import("postgres").Sql): DB {
  const db = drizzlePg(client, { schema }) as unknown as DB;
  const opts = (client as unknown as { options: { serializers: Record<string, (v: unknown) => unknown> } }).options;
  const toText = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
  for (const oid of PG_DATE_OIDS) opts.serializers[oid] = toText;
  return db;
}

let pending: Promise<DbState> | undefined;
export async function getDb(): Promise<DB> {
  if (isWorkers) return workersDb();
  if (!g.__gravitaDb) {
    pending ??= createState();
    g.__gravitaDb = await pending;
  }
  try {
    await g.__gravitaDb.ready;
  } catch (e) {
    // Não mantém em cache uma inicialização que falhou.
    g.__gravitaDb = undefined;
    pending = undefined;
    throw e;
  }
  return g.__gravitaDb.db;
}

/**
 * Executa `fn` numa transação com o contexto da empresa definido
 * (`app.current_org`), que as políticas RLS do Postgres usam.
 */
export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error("orgId inválido");
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}

export { schema };
