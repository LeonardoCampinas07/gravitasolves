import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // CSP: sem scripts de terceiros. 'unsafe-inline' é necessário para os scripts de hidratação do Next sem nonce;
  // 'unsafe-eval' só em desenvolvimento (React Refresh).
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

// Build para a Cloudflare (npm run cf:build): o PGlite (banco local de desenvolvimento, ~26 MB) fica fora do Worker.
const cfBuild = process.env.GRAVITA_CF_BUILD === "1";

const nextConfig: NextConfig = {
  // Permite um build de verificação em outra pasta sem afetar o servidor de desenvolvimento.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: cfBuild ? ["exceljs", "postgres"] : ["@electric-sql/pglite", "exceljs"],
  ...(cfBuild && {
    webpack: (config: { resolve: { alias: Record<string, string | false> } }) => {
      config.resolve.alias["@electric-sql/pglite"] = false;
      config.resolve.alias["drizzle-orm/pglite"] = false;
      return config;
    },
  }),
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
