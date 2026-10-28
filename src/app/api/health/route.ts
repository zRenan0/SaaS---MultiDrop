import { NextResponse } from "next/server";

export function GET() {
  // Commit publicado (fornecido pela Vercel): permite confirmar qual versão está no ar.
  return NextResponse.json({ status: "ok", time: new Date().toISOString(), version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null });
}
