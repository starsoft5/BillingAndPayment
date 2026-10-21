import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-message";
import { requireMemberAdmin } from "@/lib/member-admin";
import { validateInventoryDetail, validateInventoryMaster } from "@/lib/inventory-order-validation";

export const runtime = "nodejs";

const columns = "id, customer_id, inventory_date, status, notes, created_at";

export async function GET() {
  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;
    const { data, error } = await supabase
      .from("inventory_master")
      .select(columns)
      .order("inventory_date", { ascending: false })
      .order("id", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Unable to list inventory orders:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Unable to load orders.") }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const body = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const { errors: masterErrors, row: masterRow } = validateInventoryMaster(body.master);
  const detailInputs = Array.isArray(body.details) ? body.details : [];
  const detailValidations = detailInputs.map((detail) => validateInventoryDetail({
    ...(detail && typeof detail === "object" ? detail : {}),
    inventoryMasterId: 1,
  }));
  const detailErrors = detailValidations.flatMap((validation) => Object.keys(validation.errors));
  if (!Array.isArray(body.details) || detailInputs.length === 0 || !masterRow ||
    detailValidations.some((validation) => !validation.row)) {
    return NextResponse.json(
      {
        error: "Please correct the order and add at least one valid inventory line.",
        fields: { master: masterErrors, details: detailValidations.map((validation) => validation.errors), detailErrors },
      },
      { status: 422 }
    );
  }

  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;
    const { data: masterId, error } = await supabase.rpc("create_inventory_order", {
      p_customer_id: masterRow.customer_id,
      p_inventory_date: masterRow.inventory_date,
      p_status: masterRow.status,
      p_notes: masterRow.notes,
      p_details: detailValidations.map(({ row }) => ({
        inventory_id: row!.inventory_id,
        quantity: row!.quantity,
        unit_price: row!.unit_price,
      })),
    });
    if (error?.code === "23503") {
      return NextResponse.json({ error: "The selected customer or inventory item no longer exists." }, { status: 422 });
    }
    if (error) throw error;
    const { data, error: readError } = await supabase
      .from("inventory_master")
      .select(columns)
      .eq("id", masterId)
      .single();
    if (readError) throw readError;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Unable to create inventory order:", error);
    return NextResponse.json({ error: getErrorMessage(error, "Unable to create order.") }, { status: 503 });
  }
}
