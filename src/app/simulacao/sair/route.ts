import { NextResponse } from "next/server";
import { SIM_COOKIE } from "@/lib/sandbox";

/** Sai da simulação e volta para a página inicial. */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete(SIM_COOKIE);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
