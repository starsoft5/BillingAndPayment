type InventoryWriteError = {
  code: string;
  message: string;
  details: string | null;
};

type ConflictLookup = (field: "item_code", value: string) => Promise<boolean>;

export async function getInventoryConflictMessage(
  error: InventoryWriteError,
  row: { item_code: string; sku: string },
  lookup: ConflictLookup
) {
  if (error.code !== "23505") return null;

  const uniqueViolation = `${error.message} ${error.details ?? ""}`;

  if (/item[_ ]code/i.test(uniqueViolation)) {
    return "An item with this item code already exists.";
  }

  if (await lookup("item_code", row.item_code)) {
    return "An item with this item code already exists.";
  }

  return "An inventory item already exists with a value that must be unique.";
}
