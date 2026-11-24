/**
 * npm run prod:check — confere a configuração de produção ANTES do deploy, sem imprimir segredos.
 * Valida variáveis obrigatórias, conecta no DATABASE_URL e garante que o papel do app NÃO ignora RLS
 * (superusuário, BYPASSRLS ou dono das tabelas anulariam o isolamento entre empresas).
 */
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad: string[] = [];
const fail = (m: string) => { bad.push(m); console.log(`  ✗ ${m}`); };
const warn = (m: string) => console.log(`  ! ${m}`);
const env = (k: string) => process.env[k]?.trim() ?? "";

async function main() {
  console.log("Variáveis:");
  const app = env("APP_URL");
  if (/^https:\/\//.test(app)) ok("APP_URL é HTTPS"); else fail("APP_URL precisa ser https://… (domínio público)");
  const key = env("APP_ENCRYPTION_KEY");
  if (key && Buffer.from(key, "base64").length === 32) ok("APP_ENCRYPTION_KEY tem 32 bytes"); else fail("APP_ENCRYPTION_KEY ausente ou não tem 32 bytes em base64");
  for (const k of ["APP_SECRET", "CRON_SECRET"]) env(k).length >= 24 ? ok(`${k} definido`) : fail(`${k} ausente ou curto (mín. 24 caracteres)`);
  if (env("APP_SECRET") && env("APP_SECRET") === env("CRON_SECRET")) fail("APP_SECRET e CRON_SECRET devem ser diferentes");
  env("ANTHROPIC_API_KEY") ? ok("ANTHROPIC_API_KEY definida (agente com IA)") : warn("ANTHROPIC_API_KEY vazia — agente funciona em modo básico");
  env("RESEND_API_KEY") && env("EMAIL_FROM") ? ok("E-mail transacional configurado") : warn("RESEND_API_KEY/EMAIL_FROM vazios — sem e-mail de confirmação e recuperação de senha");
  const asaasEnv = env("ASAAS_ENV") || "sandbox";
  if (!env("ASAAS_API_KEY")) warn("ASAAS_API_KEY vazia — cobrança desativada");
  else {
    ok(`Asaas configurado (ambiente: ${asaasEnv})`);
    if (!env("ASAAS_WEBHOOK_TOKEN")) fail("ASAAS_WEBHOOK_TOKEN obrigatório quando o Asaas está ativo");
    if (asaasEnv === "production") warn("Asaas em PRODUÇÃO — cobranças reais");
  }

  console.log("Banco:");
  const url = env("DATABASE_URL");
  if (!/^postgres(ql)?:\/\//.test(url)) { fail("DATABASE_URL precisa ser postgres://… (Supabase: pooler porta 6543 ou direta 5432)"); return; }
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const [r] = await sql`select current_user as u, r.rolsuper as su, r.rolbypassrls as by, version() as v
      from pg_roles r where r.rolname = current_user`;
    ok(`Conectado como ${r.u} (${String(r.v).split(" ").slice(0, 2).join(" ")})`);
    if (r.su || r.by) fail(`O papel ${r.u} ignora RLS (superusuário/BYPASSRLS). Use o papel gravita_app — docs/03-PRODUCAO.md`);
    else ok("Papel sem bypass de RLS");
    const owned = await sql`select count(*)::int n from pg_tables where schemaname='public' and tableowner = current_user`;
    if (owned[0].n > 0) fail(`O papel é dono de ${owned[0].n} tabela(s) — donos ignoram RLS. Rode as migrações com o usuário postgres e o app com gravita_app`);
    const mig = await sql`select name from _migrations order by name`.catch(() => null);
    if (!mig) fail("Migrações não aplicadas (tabela _migrations ausente). Rode npm run db:migrate com o usuário administrador");
    else {
      const { readdirSync } = await import("node:fs");
      const files = readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort();
      const missing = files.filter((f) => !mig.some((m) => m.name === f));
      missing.length ? fail(`Migrações pendentes: ${missing.join(", ")}`) : ok(`Migrações em dia (${files.length})`);
    }
    const rls = await sql`select count(*)::int n from pg_tables where schemaname='public' and rowsecurity`;
    rls[0].n >= 14 ? ok(`RLS ativo em ${rls[0].n} tabelas`) : fail(`RLS ativo em só ${rls[0].n} tabelas (esperado ≥ 14)`);
  } catch (e) {
    fail(`Não conectou no banco: ${(e as Error).message.replace(url, "<DATABASE_URL>")}`);
  } finally { await sql.end(); }
}

main().then(() => {
  console.log(bad.length ? `\n${bad.length} problema(s) — corrija antes do deploy.` : "\nTudo certo para o deploy.");
  process.exit(bad.length ? 1 : 0);
});
