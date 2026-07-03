import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { withAxiom } from "next-axiom";

export const proxy = withAxiom(async function proxy(request: NextRequest) {
  return await updateSession(request);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
