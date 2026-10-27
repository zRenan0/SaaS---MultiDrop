import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeEqual } from "@/lib/security/crypto";
import { logger } from "@/lib/logging/logger";
import { hasRole } from "@/features/organizations/roles";
import { completeOAuth, OAUTH_COOKIE } from "@/features/marketplace/oauth-flow";
import { getMemberships, getUser } from "@/server/session";

const querySchema = z.object({
  code: z.string().min(5).max(500),
  state: z.string().min(20).max(200),
});

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const finish = (query: string) => {
    const response = NextResponse.redirect(new URL(`/app/integrations?${query}`, origin));
    response.cookies.delete({ name: OAUTH_COOKIE, path: "/api/integrations/mercado-livre" });
    return response;
  };

  if (request.nextUrl.searchParams.get("error")) return finish("error=denied");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return finish("error=invalid_state");

  // O state deve coincidir com o cookie do navegador que iniciou o fluxo (proteção contra CSRF/login injection).
  const cookieState = request.cookies.get(OAUTH_COOKIE)?.value;
  if (!cookieState || !safeEqual(cookieState, parsed.data.state)) return finish("error=invalid_state");

  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/app/integrations", origin));

  try {
    const outcome = await completeOAuth({
      state: parsed.data.state,
      code: parsed.data.code,
      userId: user.id,
      hasAdminRole: async (organizationId) => {
        const memberships = await getMemberships(user.id);
        return memberships.some((m) => m.organizationId === organizationId && hasRole(m.role, "admin"));
      },
    });
    return outcome.ok ? finish("connected=1") : finish(`error=${outcome.reason}`);
  } catch (error) {
    logger.error("ml_oauth_callback_failed", { error });
    return finish("error=unexpected");
  }
}
