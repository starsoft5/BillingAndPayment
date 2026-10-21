"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  validateInventory,
  type InventoryErrors,
  type InventoryInput,
} from "@/lib/inventory-validation";

type InventoryItem = {
  id: number;
  item_code: string | null;
  sku: string;
  name: string;
  category: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
};

const emptyForm: InventoryInput = {
  itemCode: "",
  sku: "",
  name: "",
  category: "",
  description: "",
  quantity: "0",
  unitPrice: "0.00",
};
const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-[#e2e9e3] bg-white px-3 text-sm text-[#31463b] outline-none transition placeholder:text-[#aab5ad] focus:border-[#83a990] focus:ring-4 focus:ring-[#eaf3ed] aria-[invalid=true]:border-[#d78372]";

export default function InventoryPanel() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState<InventoryInput>(emptyForm);
  const [errors, setErrors] = useState<InventoryErrors>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/inventory");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load inventory.");
      setItems(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      `${item.item_code ?? ""} ${item.sku} ${item.name} ${item.category ?? ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [items, search]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
  }

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      itemCode: item.item_code ?? "",
      sku: item.sku,
      name: item.name,
      category: item.category ?? "",
      description: item.description ?? "",
      quantity: String(item.quantity),
      unitPrice: String(item.unit_price),
    });
    setErrors({});
    setNotice("");
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateField(field: keyof InventoryInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function saveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateInventory(form);
    setErrors(validation.errors);
    setNotice("");
    setErrorMessage("");
    if (!validation.row) return;

    setSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/inventory/${editingId}` : "/api/inventory",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
          }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save inventory item.");
      const wasEditing = editingId !== null;
      resetForm();
      setNotice(wasEditing ? "Inventory item updated." : "Inventory item added.");
      await loadInventory();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save inventory item.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: InventoryItem) {
    if (!window.confirm(`Delete ${item.name} from inventory?`)) return;
    setDeletingId(item.id);
    setErrorMessage("");
    setNotice("");
    try {
      const response = await fetch(`/api/inventory/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Unable to delete inventory item.");
      }
      if (editingId === item.id) resetForm();
      setNotice("Inventory item deleted.");
      await loadInventory();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete inventory item.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-7 sm:pt-10 lg:px-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-[#82988b]">
            <span className="h-px w-4 bg-[#a8c1b2]" />
            STOCK MANAGEMENT
          </div>
          <h1 className="mb-1 mt-3 text-3xl font-bold tracking-tight text-[#263c32]">Inventory</h1>
          <p className="mb-0 text-xs text-[#87928b]">Manage items, stock levels, and prices.</p>
        </div>
        <div className="grid shrink-0 gap-1 text-right">
          <strong className="text-2xl font-bold text-[#416c57]">
            {items.length.toString().padStart(2, "0")}
          </strong>
          <span className="text-[8px] font-bold tracking-widest text-[#9ba69f]">TOTAL ITEMS</span>
        </div>
      </div>

      {(notice || errorMessage) && (
        <div
          role={errorMessage ? "alert" : "status"}
          className={`mb-4 rounded-md border px-3 py-2.5 text-xs ${
            errorMessage
              ? "border-[#f3d8d0] bg-[#fff3f0] text-[#a24838]"
              : "border-[#d9ebdc] bg-[#edf6ef] text-[#356a52]"
          }`}
        >
          {errorMessage || notice}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,0.76fr)_minmax(0,1.35fr)]">
        <section className="rounded-lg border border-[#e9eeea] bg-white px-5 pt-5">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <span className="mb-1.5 block text-[8px] font-bold tracking-widest text-[#98a69d]">
                {editingId ? "UPDATE DETAILS" : "NEW ITEM"}
              </span>
              <h2 className="m-0 text-base font-bold tracking-tight">
                {editingId ? "Edit item" : "Add an item"}
              </h2>
            </div>
            <span className="grid size-8 place-items-center rounded-md bg-[#edf5ef] text-lg text-[#5b856e]">
              ＋
            </span>
          </div>
          <form onSubmit={saveItem} noValidate>
            <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="itemCode">
              Item Code
            </label>
            <input
              className={inputClass}
              id="itemCode"
              maxLength={64}
              required
              placeholder="e.g. ITM-001"
              value={form.itemCode}
              aria-invalid={Boolean(errors.itemCode)}
              aria-describedby={errors.itemCode ? "itemCode-error" : undefined}
              onChange={(event) => updateField("itemCode", event.target.value)}
            />
            {errors.itemCode && (
              <span className="mt-1 block text-[10px] leading-4 text-[#b64d3e]" id="itemCode-error">
                {errors.itemCode}
              </span>
            )}

            <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="itemName">
              Item name
            </label>
            <input
              className={inputClass}
              id="itemName"
              maxLength={120}
              required
              placeholder="e.g. Canvas tote bag"
              value={form.name}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "itemName-error" : undefined}
              onChange={(event) => updateField("name", event.target.value)}
            />
            {errors.name && <span className="mt-1 block text-[10px] text-[#b64d3e]" id="itemName-error">{errors.name}</span>}

            <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="sku">
              SKU
            </label>
            <input
              className={inputClass}
              id="sku"
              maxLength={64}
              required
              placeholder="e.g. SKU-1001"
              value={form.sku}
              aria-invalid={Boolean(errors.sku)}
              aria-describedby={errors.sku ? "sku-error" : undefined}
              onChange={(event) => updateField("sku", event.target.value)}
            />
            {errors.sku && <span className="mt-1 block text-[10px] text-[#b64d3e]" id="sku-error">{errors.sku}</span>}

            <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="category">
              Category
            </label>
            <input
              className={inputClass}
              id="category"
              maxLength={100}
              placeholder="e.g. Accessories"
              value={form.category}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? "category-error" : undefined}
              onChange={(event) => updateField("category", event.target.value)}
            />
            {errors.category && <span className="mt-1 block text-[10px] text-[#b64d3e]" id="category-error">{errors.category}</span>}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#45574d]" htmlFor="quantity">
                  Quantity
                </label>
                <input
                  className={inputClass}
                  id="quantity"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  type="number"
                  value={form.quantity}
                  aria-invalid={Boolean(errors.quantity)}
                  aria-describedby={errors.quantity ? "quantity-error" : undefined}
                  onChange={(event) => updateField("quantity", event.target.value)}
                />
                {errors.quantity && <span className="mt-1 block text-[10px] text-[#b64d3e]" id="quantity-error">{errors.quantity}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#45574d]" htmlFor="unitPrice">
                  Unit price
                </label>
                <input
                  className={inputClass}
                  id="unitPrice"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.unitPrice}
                  aria-invalid={Boolean(errors.unitPrice)}
                  aria-describedby={errors.unitPrice ? "unitPrice-error" : undefined}
                  onChange={(event) => updateField("unitPrice", event.target.value)}
                />
                {errors.unitPrice && <span className="mt-1 block text-[10px] text-[#b64d3e]" id="unitPrice-error">{errors.unitPrice}</span>}
              </div>
            </div>

            <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="description">
              Description
            </label>
            <textarea
              className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-[#e2e9e3] bg-white px-3 py-2.5 text-sm text-[#31463b] outline-none transition placeholder:text-[#aab5ad] focus:border-[#83a990] focus:ring-4 focus:ring-[#eaf3ed]"
              id="description"
              rows={3}
              placeholder="Optional item details"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
            />

            <div className="mt-5 flex items-center gap-3">
              <button
                className="rounded-md bg-[#326b57] px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#285641] disabled:cursor-wait disabled:opacity-60"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
                <span className="ml-3">→</span>
              </button>
              {editingId !== null && (
                <button
                  className="px-2 py-2 text-xs text-[#76837b] hover:text-[#22352f]"
                  type="button"
                  onClick={resetForm}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="-mx-5 mt-5 flex items-center gap-2 border-t border-[#f0f2f0] px-5 py-3 font-serif text-xs italic text-[#9ba69f]">
            <span className="text-base not-italic text-[#d6a184]">✳</span>
            Keep your stock details up to date.
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e9eeea] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#eff2ef] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
            <div>
              <span className="mb-1.5 block text-[8px] font-bold tracking-widest text-[#98a69d]">
                STOCK LIST
              </span>
              <h2 className="m-0 text-sm font-bold">
                All items{" "}
                <span className="ml-1 rounded-full bg-[#f2f5f2] px-1.5 py-0.5 text-[10px] font-medium text-[#829087]">
                  {items.length}
                </span>
              </h2>
            </div>
            <div className="flex h-9 w-full items-center gap-2 rounded border border-[#e9eeea] px-2.5 text-[#9aa69e] sm:h-8 sm:w-56">
              <span className="text-base">⌕</span>
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[#22352f] outline-none placeholder:text-[#adb6b0]"
                aria-label="Search inventory"
                placeholder="Search code, SKU, name..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="min-h-[210px]">
            {loading ? (
              <div className="flex min-h-[210px] items-center justify-center gap-3 text-xs text-[#9aa59e]">
                <span className="size-2 animate-pulse rounded-full bg-[#7eae8e]" />
                Loading inventory…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex min-h-[210px] flex-col items-center justify-center gap-2 px-4 text-center text-xs text-[#9aa59e]">
                <span className="mb-1 grid size-10 place-items-center rounded-full bg-[#f1f6f2] text-lg text-[#70937c]">
                  {search ? "⌕" : "▦"}
                </span>
                <strong className="font-semibold text-[#62756a]">
                  {search ? "No items found" : "No inventory items yet."}
                </strong>
                <span>
                  {search ? "Try another item code, SKU, or name." : "Add an item to start tracking stock."}
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#eff2ef] text-[9px] font-semibold uppercase tracking-wide text-[#98a69d]">
                      <th className="px-4 py-3">Item code</th>
                      <th className="px-3 py-3">Item / SKU</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Unit price</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr className="border-b border-[#f1f3f1] last:border-0" key={item.id}>
                        <td className="px-4 py-3 text-xs font-medium text-[#42574b]">
                          {item.item_code || <span className="text-[#a4ada7]">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <strong className="block max-w-40 truncate text-xs font-semibold text-[#42574b]">
                            {item.name}
                          </strong>
                          <span className="mt-1 block text-[10px] text-[#9aa49d]">{item.sku}</span>
                        </td>
                        <td className="px-3 py-3 text-xs text-[#78877e]">{item.category || "—"}</td>
                        <td className="px-3 py-3 text-right text-xs tabular-nums text-[#42574b]">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-3 text-right text-xs tabular-nums text-[#42574b]">
                          {Number(item.unit_price).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-3">
                            <button
                              className="py-1 text-[10px] text-[#4e7e62] hover:underline"
                              aria-label={`Edit ${item.name}`}
                              onClick={() => startEdit(item)}
                            >
                              Edit
                            </button>
                            <button
                              className="py-1 text-[10px] text-[#b27668] hover:underline disabled:opacity-50"
                              aria-label={`Delete ${item.name}`}
                              disabled={deletingId === item.id}
                              onClick={() => void deleteItem(item)}
                            >
                              {deletingId === item.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-[#eff2ef] px-3 py-3 text-[9px] tracking-wide text-[#a1aaa4] sm:px-4">
            <span>SHOWING {filteredItems.length} OF {items.length} ITEMS</span>
            <button className="text-[#688777] hover:text-[#326b57]" onClick={() => void loadInventory()}>
              ↻ Refresh
            </button>
          </div>
        </section>
      </div>
      <div className="mt-6 flex justify-between text-[8px] font-bold tracking-widest text-[#a5afa8]">
        <span>MEMBERLY</span>
        <span>Small details. Stronger connections.</span>
      </div>
    </div>
  );
}
