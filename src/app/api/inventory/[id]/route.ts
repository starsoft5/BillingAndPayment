import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-message";
import { getInventoryConflictMessage } from "@/lib/inventory-conflict";
import { validateInventory } from "@/lib/inventory-validation";
import { requireMemberAdmin } from "@/lib/member-admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const inventoryColumns =
  "id, item_code, sku, name, category, description, quantity, unit_price, created_at";

function parseInventoryId(id: string) {
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const inventoryId = parseInventoryId(id);
  if (inventoryId === null) {
    return NextResponse.json({ error: "Invalid inventory item ID." }, { status: 400 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { errors, row } = validateInventory(input);
  if (!row) {
    return NextResponse.json(
      { error: "Please correct the inventory details.", fields: errors },
      { status: 422 }
    );
  }

  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;

    const { data, error } = await supabase
      .from("inventory")
      .update(row)
      .eq("id", inventoryId)
      .select(inventoryColumns)
      .maybeSingle();

    if (error) {
      const conflictMessage = await getInventoryConflictMessage(error, row, async (field, value) => {
        const { data, error: lookupError } = await supabase
          .from("inventory")
          .select("id")
          .eq(field, value)
          .neq("id", inventoryId)
          .limit(1)
          .maybeSingle();
        if (lookupError) throw lookupError;
        return Boolean(data);
      });
      if (conflictMessage) {
        return NextResponse.json(
          { error: conflictMessage },
          { status: 409 }
        );
      }
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unable to update inventory item:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to update inventory item.") },
      { status: 503 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const inventoryId = parseInventoryId(id);
  if (inventoryId === null) {
    return NextResponse.json({ error: "Invalid inventory item ID." }, { status: 400 });
  }

  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;

    const { data, error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", inventoryId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Unable to delete inventory item:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to delete inventory item.") },
      { status: 503 }
    );
  }
}
