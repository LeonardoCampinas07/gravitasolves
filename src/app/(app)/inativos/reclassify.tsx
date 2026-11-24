"use client";
import { useTransition, useState } from "react";
import { RefreshCw } from "lucide-react";
import { reclassifyAction } from "@/app/actions";
import { Button } from "@/components/ui";

export function ReclassifyButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <Button variant="ghost" disabled={pending} title={msg} onClick={() => start(async () => {
      const r = await reclassifyAction();
      setMsg(r.ok ? `${r.data} cliente(s) atualizados` : r.error);
    })}>
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />{msg ?? "Atualizar agora"}
    </Button>
  );
}
