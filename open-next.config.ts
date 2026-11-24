import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sem cache incremental em R2/KV: as telas do app são dinâmicas (dados por empresa) e isso evita custo extra.
export default defineCloudflareConfig();
