export type InventoryInput = {
  itemCode: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
};

export type InventoryRowInput = {
  item_code: string;
  sku: string;
  name: string;
  category: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
};

export type InventoryErrors = Partial<Record<keyof InventoryInput, string>>;

export function validateInventory(input: unknown): {
  errors: InventoryErrors;
  row: InventoryRowInput | null;
} {
  const value =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const errors: InventoryErrors = {};
  const itemCode = typeof value.itemCode === "string" ? value.itemCode.trim() : "";
  const sku = typeof value.sku === "string" ? value.sku.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const category = typeof value.category === "string" ? value.category.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const quantityText =
    typeof value.quantity === "number" || typeof value.quantity === "string"
      ? String(value.quantity)
      : "";
  const priceText =
    typeof value.unitPrice === "number" || typeof value.unitPrice === "string"
      ? String(value.unitPrice)
      : "";
  const quantity = quantityText.trim() ? Number(quantityText) : Number.NaN;
  const unitPrice = priceText.trim() ? Number(priceText) : Number.NaN;

  if (typeof value.itemCode !== "string") {
    errors.itemCode = "Item code must be text.";
  }
  else if (!itemCode) errors.itemCode = "Enter an item code.";
  else if (itemCode.length > 64) errors.itemCode = "Item code must be 64 characters or fewer.";
  if (!sku) errors.sku = "Enter an SKU.";
  else if (sku.length > 64) errors.sku = "SKU must be 64 characters or fewer.";
  if (!name) errors.name = "Enter an item name.";
  else if (name.length > 120) errors.name = "Name must be 120 characters or fewer.";
  if (value.category != null && typeof value.category !== "string") {
    errors.category = "Category must be text.";
  }
  if (value.description != null && typeof value.description !== "string") {
    errors.description = "Description must be text.";
  }
  if (category.length > 100) errors.category = "Category must be 100 characters or fewer.";
  if (!Number.isInteger(quantity) || quantity < 0) {
    errors.quantity = "Quantity must be a non-negative whole number.";
  }
  if (
    !Number.isFinite(unitPrice) ||
    unitPrice < 0 ||
    unitPrice > 9999999999.99 ||
    Math.abs(unitPrice * 100 - Math.round(unitPrice * 100)) > 1e-8
  ) {
    errors.unitPrice = "Enter a price with up to 10 digits and 2 decimal places.";
  }

  if (Object.keys(errors).length) return { errors, row: null };
  return {
    errors,
    row: {
      item_code: itemCode,
      sku,
      name,
      category: category || null,
      description: description || null,
      quantity,
      unit_price: unitPrice,
    },
  };
}
