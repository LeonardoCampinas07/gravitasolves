import { billingEnforced, trialDays } from "@/lib/billing/service";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  // Só promete teste grátis quando a cobrança está ligada neste servidor.
  const trial = billingEnforced() ? trialDays() : 0;
  return <SignupForm trialDays={trial} />;
}
