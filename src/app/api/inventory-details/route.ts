import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-message";
import { requireMemberAdmin } from "@/lib/member-admin";
import { validateInventoryDetail } from "@/lib/inventory-order-validation";

export const runtime = "nodejs";

const columns = "id, inventory_master_id, inventory_id, quantity, unit_price, line_total";

export async function GET(request: Request) {
  const masterId = new URL(request.url).searchParams.get("inventoryMasterId");
  let parsedMasterId: number | null = null;
  if (masterId !== null) {
    if (!/^[1-9]\d*$/.test(masterId) || !Number.isSafeInteger(Number(masterId))) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }
    parsedMasterId = Number(masterId);
  }

  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;
    let query = supabase.from("inventory_detail").select(columns).order("id", { ascending: true });
    if (parsedMasterId !== null) query = query.eq("inventory_master_id", parsedMasterId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unable to list inventory order lines:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Unable to load order lines.") }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const { errors, row } = validateInventoryDetail(input);
  if (!row) {
    return NextResponse.json({ error: "Please correct the order line.", fields: errors }, { status: 422 });
  }
  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;
    const { data, error } = await supabase
      .from("inventory_detail")
      .insert(row)
      .select(columns)
      .single();
    if (error?.code === "23503") {
      return NextResponse.json({ error: "The selected order or inventory item no longer exists." }, { status: 422 });
    }
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Unable to create inventory order line:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Unable to create order line.") }, { status: 503 });
  }
}
