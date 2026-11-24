/** npm run jobs:run — executa o job diário manualmente (reclassificação, automações, retenção). */
import { runDailyJobs } from "../src/lib/jobs";

runDailyJobs()
  .then((r) => { console.table(r.map(({ errors, ...x }) => ({ ...x, errors: errors.length }))); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
