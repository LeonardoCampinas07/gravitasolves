import type { Role } from "@/db/schema";

export type Permission =
  | "customers:read" | "customers:write" | "customers:delete" | "import"
  | "campaigns:write" | "campaigns:approve" | "campaigns:send"
  | "agent:use" | "automations:write" | "settings:write" | "integrations:write"
  | "members:write" | "data:export" | "org:delete";

const MATRIX: Record<Role, Permission[] | "*"> = {
  owner: "*",
  admin: [
    "customers:read", "customers:write", "customers:delete", "import", "campaigns:write", "campaigns:approve",
    "campaigns:send", "agent:use", "automations:write", "settings:write", "integrations:write", "members:write", "data:export",
  ],
  manager: ["customers:read", "customers:write", "import", "campaigns:write", "campaigns:send", "agent:use"],
  viewer: ["customers:read"],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Proprietário", admin: "Administrador", manager: "Gestor", viewer: "Leitura",
};

export function can(role: Role, permission: Permission) {
  const p = MATRIX[role];
  return p === "*" || p.includes(permission);
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) { super(`Sem permissão para esta ação (${permission}).`); }
}

export function assertCan(role: Role, permission: Permission) {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
