"use client";
/** Campo de senha com botão de mostrar/ocultar, aviso de Caps Lock e, opcionalmente, a lista de requisitos. */
import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { Input, cx } from "@/components/ui";

export const PASSWORD_RULES: [string, (pw: string) => boolean][] = [
  ["10 caracteres ou mais", (pw) => pw.length >= 10],
  ["Pelo menos uma letra", (pw) => /[A-Za-z]/.test(pw)],
  ["Pelo menos um número", (pw) => /\d/.test(pw)],
];

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { rules?: boolean };

export function PasswordInput({ rules, className, onChange, onKeyUp, ...p }: Props) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [value, setValue] = useState("");
  return (
    <>
      <div className="relative">
        <Input
          {...p}
          type={show ? "text" : "password"}
          className={cx("pr-10", className)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => { setValue(e.target.value); onChange?.(e); }}
          onKeyUp={(e) => { setCaps(e.getModifierState("CapsLock")); onKeyUp?.(e); }}
          onBlur={() => setCaps(false)}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={show}
          title={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-xl text-ink-400 transition hover:text-ink-950 focus-visible:text-ink-950 focus-visible:outline-none"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {caps && <span className="mt-1 block text-xs font-medium text-st-risk-text" role="status">Caps Lock está ativado.</span>}
      {rules && (
        <ul className="mt-2 grid gap-1 text-xs" aria-live="polite">
          {PASSWORD_RULES.map(([label, ok]) => {
            const done = ok(value);
            return (
              <li key={label} className={cx("flex items-center gap-1.5 transition-colors", done ? "text-brand-600" : "text-ink-500")}>
                <span className={cx("grid size-3.5 place-items-center rounded-full ring-1 transition", done ? "bg-brand-600 text-white ring-brand-600" : "ring-line")}>
                  {done && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                {label}
                <span className="sr-only">{done ? " (ok)" : " (pendente)"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
