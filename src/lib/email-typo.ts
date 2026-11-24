/** Sugere a correção de domínios de e-mail digitados errado (ex.: gmial.com → gmail.com). */
const DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.br", "yahoo.com", "icloud.com", "live.com", "bol.com.br", "uol.com.br", "terra.com.br"];

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function emailTypoFix(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  const [, user, domain] = m;
  if (DOMAINS.includes(domain)) return null;
  let best: string | null = null, bestD = 3;
  for (const d of DOMAINS) {
    const dist = distance(domain, d);
    if (dist < bestD) { best = d; bestD = dist; }
  }
  return best && bestD <= 2 ? `${user}@${best}` : null;
}
