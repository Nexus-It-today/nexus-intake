import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";

export async function GET(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ profile: result.value });
}
