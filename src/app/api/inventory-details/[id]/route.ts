import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-message";
import { requireMemberAdmin } from "@/lib/member-admin";
import { validateInventoryDetail } from "@/lib/inventory-order-validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const columns = "id, inventory_master_id, inventory_id, quantity, unit_price, line_total";

function parseId(id: string) {
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const detailId = parseId((await params).id);
  if (detailId === null) return NextResponse.json({ error: "Invalid order line ID." }, { status: 400 });
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
      .update(row)
      .eq("id", detailId)
      .select(columns)
      .maybeSingle();
    if (error?.code === "23503") {
      return NextResponse.json({ error: "The selected order or inventory item no longer exists." }, { status: 422 });
    }
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Order line not found." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unable to update inventory order line:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Unable to update order line.") }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const detailId = parseId((await params).id);
  if (detailId === null) return NextResponse.json({ error: "Invalid order line ID." }, { status: 400 });
  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;
    const { data, error } = await supabase
      .from("inventory_detail")
      .delete()
      .eq("id", detailId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Order line not found." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Unable to delete inventory order line:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Unable to delete order line.") }, { status: 503 });
  }
}
