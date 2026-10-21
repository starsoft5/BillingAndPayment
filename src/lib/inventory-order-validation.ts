export const inventoryOrderStatuses = ["draft", "confirmed", "fulfilled", "cancelled"] as const;

export type InventoryMasterInput = {
  customerId: number | string;
  inventoryDate: string;
  status: string;
  notes: string;
};

export type InventoryMasterRow = {
  customer_id: number;
  inventory_date: string;
  status: (typeof inventoryOrderStatuses)[number];
  notes: string | null;
};

export type InventoryMasterErrors = Partial<Record<keyof InventoryMasterInput, string>>;

export type InventoryDetailInput = {
  inventoryMasterId: number | string;
  inventoryId: number | string;
  quantity: number | string;
  unitPrice: number | string;
};

export type InventoryDetailRow = {
  inventory_master_id: number;
  inventory_id: number;
  quantity: number;
  unit_price: number;
};

export type InventoryDetailErrors = Partial<Record<keyof InventoryDetailInput, string>>;

function positiveId(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function validateInventoryMaster(input: unknown): {
  errors: InventoryMasterErrors;
  row: InventoryMasterRow | null;
} {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const errors: InventoryMasterErrors = {};
  const customerId = positiveId(value.customerId);
  const inventoryDate = typeof value.inventoryDate === "string" ? value.inventoryDate : "";
  const status = typeof value.status === "string" ? value.status : "";
  const notes = typeof value.notes === "string" ? value.notes.trim() : "";
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(inventoryDate)
    ? new Date(`${inventoryDate}T00:00:00.000Z`)
    : null;

  if (customerId === null) errors.customerId = "Select a valid customer.";
  if (!parsedDate || inventoryDate.startsWith("0000-") || Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== inventoryDate) {
    errors.inventoryDate = "Enter a valid inventory date.";
  }
  if (!inventoryOrderStatuses.includes(status as (typeof inventoryOrderStatuses)[number])) {
    errors.status = "Select a valid order status.";
  }
  if (typeof value.notes !== "string") errors.notes = "Notes must be text.";
  else if (notes.length > 2000) errors.notes = "Notes must be 2,000 characters or fewer.";

  if (Object.keys(errors).length || customerId === null) return { errors, row: null };
  return {
    errors,
    row: {
      customer_id: customerId,
      inventory_date: inventoryDate,
      status: status as InventoryMasterRow["status"],
      notes: notes || null,
    },
  };
}

export function validateInventoryDetail(input: unknown): {
  errors: InventoryDetailErrors;
  row: InventoryDetailRow | null;
} {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const errors: InventoryDetailErrors = {};
  const inventoryMasterId = positiveId(value.inventoryMasterId);
  const inventoryId = positiveId(value.inventoryId);
  const quantity = typeof value.quantity === "number" || typeof value.quantity === "string"
    ? Number(value.quantity)
    : Number.NaN;
  const unitPrice = typeof value.unitPrice === "number" || typeof value.unitPrice === "string"
    ? Number(value.unitPrice)
    : Number.NaN;

  if (inventoryMasterId === null) errors.inventoryMasterId = "Select a valid order.";
  if (inventoryId === null) errors.inventoryId = "Select an inventory item.";
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) {
    errors.quantity = "Quantity must be a positive whole number.";
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 9999999999.99 ||
    Math.abs(unitPrice * 100 - Math.round(unitPrice * 100)) > 1e-8) {
    errors.unitPrice = "Enter a non-negative price with up to 2 decimal places.";
  }

  if (Object.keys(errors).length || inventoryMasterId === null || inventoryId === null) {
    return { errors, row: null };
  }
  return {
    errors,
    row: {
      inventory_master_id: inventoryMasterId,
      inventory_id: inventoryId,
      quantity,
      unit_price: unitPrice,
    },
  };
}
