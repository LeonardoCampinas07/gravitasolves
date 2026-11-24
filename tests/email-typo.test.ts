import { describe, expect, it } from "vitest";
import { emailTypoFix } from "@/lib/email-typo";

describe("emailTypoFix", () => {
  it("corrige domínios comuns digitados errado", () => {
    expect(emailTypoFix("ana@gmial.com")).toBe("ana@gmail.com");
    expect(emailTypoFix("ana@hotmal.com")).toBe("ana@hotmail.com");
    expect(emailTypoFix("ana@gmail.con")).toBe("ana@gmail.com");
  });
  it("não sugere nada para domínios corretos ou desconhecidos", () => {
    expect(emailTypoFix("ana@gmail.com")).toBeNull();
    expect(emailTypoFix("ana@minhaempresa.com.br")).toBeNull();
    expect(emailTypoFix("sem-arroba")).toBeNull();
  });
});
