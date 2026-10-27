import { NextResponse, type NextRequest } from "next/server";
import { MissingConfigurationError } from "@/lib/env";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { can } from "@/features/organizations/roles";
import { OAUTH_COOKIE, OAUTH_TTL_SECONDS, startOAuth } from "@/features/marketplace/oauth-flow";
import { getOrgContext } from "@/server/session";

export async function GET(request: NextRequest) {
  const back = (error: string) => NextResponse.redirect(new URL(`/app/integrations?error=${error}`, request.nextUrl.origin));
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/login?next=/app/integrations", request.nextUrl.origin));
  if (!can(ctx.role, "marketplace.connect")) return back("forbidden");
  if (!(await checkRateLimit("ml_oauth_start", ctx.user.id, 10, 600))) return back("rate_limited");
  try {
    const { state, url } = await startOAuth({ organizationId: ctx.organization.id, userId: ctx.user.id });
    const response = NextResponse.redirect(url);
    response.cookies.set(OAUTH_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/mercado-livre",
      maxAge: OAUTH_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    if (error instanceof MissingConfigurationError) return back("not_configured");
    logger.error("ml_oauth_start_failed", { error });
    return back("unexpected");
  }
}
