import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-message";
import { requireMemberAdmin } from "@/lib/member-admin";
import { validateInventoryMaster } from "@/lib/inventory-order-validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const columns = "id, customer_id, inventory_date, status, notes, created_at";

function parseId(id: string) {
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const masterId = parseId((await params).id);
  if (masterId === null) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const { errors, row } = validateInventoryMaster(input);
  if (!row) {
    return NextResponse.json({ error: "Please correct the order details.", fields: errors }, { status: 422 });
  }
  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;
    const { data, error } = await supabase
      .from("inventory_master")
      .update(row)
      .eq("id", masterId)
      .select(columns)
      .maybeSingle();
    if (error?.code === "23503") {
      return NextResponse.json({ error: "The selected customer no longer exists." }, { status: 422 });
    }
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unable to update inventory order:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Unable to update order.") }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const masterId = parseId((await params).id);
  if (masterId === null) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;
    const { data, error } = await supabase
      .from("inventory_master")
      .delete()
      .eq("id", masterId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Unable to delete inventory order:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Unable to delete order.") }, { status: 503 });
  }
}
