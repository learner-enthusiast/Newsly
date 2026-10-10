import { NextResponse } from "next/server";
import { getPublicBillingCatalog } from "@/services/billing/pricing";

export async function GET() {
  return NextResponse.json(getPublicBillingCatalog());
}
