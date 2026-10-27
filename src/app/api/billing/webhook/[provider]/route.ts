import { NextResponse, type NextRequest } from "next/server";
import { getBillingProviderByKey } from "@/server/integrations/billing/providers";

/**
 * Webhooks de cobrança. Só respondem quando há provedor real configurado e com `handleWebhook`
 * (que deve validar a assinatura do provedor e deduplicar por external_event_id em subscription_events).
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/billing/webhook/[provider]">) {
  const { provider: key } = await params;
  const provider = getBillingProviderByKey(key);
  if (!provider?.handleWebhook || !provider.isFinancial) return NextResponse.json({ error: "provider_not_configured" }, { status: 404 });
  const result = await provider.handleWebhook(request);
  return NextResponse.json(result.body, { status: result.status });
}
