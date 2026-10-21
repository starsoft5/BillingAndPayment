import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-message";
import { getInventoryConflictMessage } from "@/lib/inventory-conflict";
import { validateInventory } from "@/lib/inventory-validation";
import { requireMemberAdmin } from "@/lib/member-admin";

export const runtime = "nodejs";

const inventoryColumns =
  "id, item_code, sku, name, category, description, quantity, unit_price, created_at";

export async function GET() {
  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;

    const { data, error } = await supabase
      .from("inventory")
      .select(inventoryColumns)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unable to list inventory:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to load inventory.") },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
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
      .insert(row)
      .select(inventoryColumns)
      .single();

    if (error) {
      const conflictMessage = await getInventoryConflictMessage(error, row, async (field, value) => {
        const { data, error: lookupError } = await supabase
          .from("inventory")
          .select("id")
          .eq(field, value)
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
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Unable to create inventory item:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to create inventory item.") },
      { status: 503 }
    );
  }
}
