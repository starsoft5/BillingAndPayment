import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-message";
import { requireMemberAdmin } from "@/lib/member-admin";

export const runtime = "nodejs";

type OrderLine = {
  quantity: number;
  inventory_master: { inventory_date: string }[] | { inventory_date: string } | null;
};

export async function GET() {
  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;

    const { data, error } = await supabase
      .from("inventory_detail")
      .select("quantity, inventory_master!inner(inventory_date)");
    if (error) throw error;

    const monthlyItemCounts = new Map<string, number>();
    for (const line of (data ?? []) as OrderLine[]) {
      const master = Array.isArray(line.inventory_master)
        ? line.inventory_master[0]
        : line.inventory_master;
      const date = master?.inventory_date;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const month = date.slice(0, 7);
      monthlyItemCounts.set(month, (monthlyItemCounts.get(month) ?? 0) + line.quantity);
    }

    return NextResponse.json(
      [...monthlyItemCounts].map(([month, itemCount]) => ({ month, itemCount })),
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    console.error("Unable to load order item analytics:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to load order item analytics.") },
      { status: 503 }
    );
  }
}
