"use client";

import { useCallback, useEffect, useState } from "react";
import {
  inventoryOrderStatuses,
  validateInventoryDetail,
  validateInventoryMaster,
  type InventoryDetailErrors,
  type InventoryDetailInput,
  type InventoryMasterErrors,
  type InventoryMasterInput,
} from "@/lib/inventory-order-validation";
import {
  validateMember,
  type MemberErrors,
  type MemberInput,
} from "@/lib/member-validation";

type Member = { id: number; first_name: string; last_name: string; email: string };
type InventoryItem = { id: number; item_code: string | null; sku: string; name: string; unit_price: number };
type InventoryMaster = {
  id: number;
  customer_id: number;
  inventory_date: string;
  status: (typeof inventoryOrderStatuses)[number];
  notes: string | null;
  created_at: string;
};
type InventoryDetail = {
  id: number;
  inventory_master_id: number;
  inventory_id: number;
  quantity: number;
  unit_price: number;
  line_total: number;
};
type DraftLine = {
  key: string;
  inventoryId: number;
  quantity: number;
  unitPrice: number;
};

const now = new Date();
const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const emptyMaster: InventoryMasterInput = {
  customerId: "",
  inventoryDate: today,
  status: "draft",
  notes: "",
};
const emptyDetail: InventoryDetailInput = {
  inventoryMasterId: "",
  inventoryId: "",
  quantity: "1",
  unitPrice: "0.00",
};
const emptyMember: MemberInput = { firstName: "", lastName: "", email: "" };
const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-[#e2e9e3] bg-white px-3 text-sm text-[#31463b] outline-none transition placeholder:text-[#aab5ad] focus:border-[#83a990] focus:ring-4 focus:ring-[#eaf3ed] aria-[invalid=true]:border-[#d78372]";

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(result?.error || fallback);
  }
  return result as T;
}

export default function OrdersPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<InventoryMaster[]>([]);
  const [details, setDetails] = useState<InventoryDetail[]>([]);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [draftLineForm, setDraftLineForm] = useState<Omit<InventoryDetailInput, "inventoryMasterId">>({
    inventoryId: "",
    quantity: "1",
    unitPrice: "0.00",
  });
  const [form, setForm] = useState<InventoryMasterInput>(emptyMaster);
  const [detailForm, setDetailForm] = useState<InventoryDetailInput>(emptyDetail);
  const [memberForm, setMemberForm] = useState<MemberInput>(emptyMember);
  const [masterErrors, setMasterErrors] = useState<InventoryMasterErrors>({});
  const [detailErrors, setDetailErrors] = useState<InventoryDetailErrors>({});
  const [memberErrors, setMemberErrors] = useState<MemberErrors>({});
  const [editingMasterId, setEditingMasterId] = useState<number | null>(null);
  const [editingDetailId, setEditingDetailId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showNewMember, setShowNewMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadOrders = useCallback(async () => {
    const response = await fetch("/api/inventory-masters");
    return readResponse<InventoryMaster[]>(response, "Unable to load orders.");
  }, []);

  const loadDetails = useCallback(async (masterId: number) => {
    const response = await fetch(`/api/inventory-details?inventoryMasterId=${masterId}`);
    return readResponse<InventoryDetail[]>(response, "Unable to load order lines.");
  }, []);

  const refreshReferences = useCallback(async () => {
    const [memberResponse, itemResponse] = await Promise.all([
      fetch("/api/members"),
      fetch("/api/inventory"),
    ]);
    const [memberRows, itemRows] = await Promise.all([
      readResponse<Member[]>(memberResponse, "Unable to load customers."),
      readResponse<InventoryItem[]>(itemResponse, "Unable to load inventory items."),
    ]);
    setMembers(memberRows);
    setItems(itemRows);
  }, []);

  const refreshOrders = useCallback(async () => {
    const rows = await loadOrders();
    setOrders(rows);
    return rows;
  }, [loadOrders]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([refreshReferences(), refreshOrders()])
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Unable to load order data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refreshOrders, refreshReferences]);

  useEffect(() => {
    if (selectedOrderId === null) {
      setDetails([]);
      return;
    }
    let active = true;
    void loadDetails(selectedOrderId)
      .then((rows) => { if (active) setDetails(rows); })
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Unable to load order lines.");
      });
    return () => { active = false; };
  }, [loadDetails, selectedOrderId]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  function clearMasterError(field: keyof InventoryMasterInput) {
    setMasterErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function resetMasterForm() {
    setEditingMasterId(null);
    setForm(emptyMaster);
    setMasterErrors({});
  }

  function editOrder(order: InventoryMaster) {
    setSelectedOrderId(order.id);
    setDraftLines([]);
    setEditingMasterId(order.id);
    setForm({
      customerId: order.customer_id,
      inventoryDate: order.inventory_date,
      status: order.status,
      notes: order.notes ?? "",
    });
    setMasterErrors({});
    setNotice("");
    setErrorMessage("");
  }

  async function saveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingMasterId === null) return;
    const validation = validateInventoryMaster(form);
    setMasterErrors(validation.errors);
    setNotice("");
    setErrorMessage("");
    if (!validation.row) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/inventory-masters/${editingMasterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const order = await readResponse<InventoryMaster>(response, "Unable to save order.");
      setSelectedOrderId(order.id);
      resetMasterForm();
      setNotice("Order updated.");
      await refreshOrders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save order.");
    } finally {
      setSaving(false);
    }
  }

  function startNewOrder() {
    setSelectedOrderId(null);
    setEditingMasterId(null);
    setForm(emptyMaster);
    setDraftLines([]);
    setDraftLineForm({ inventoryId: "", quantity: "1", unitPrice: "0.00" });
    setMasterErrors({});
    setDetailErrors({});
    setNotice("");
    setErrorMessage("");
  }

  function addDraftLine(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateInventoryDetail({ ...draftLineForm, inventoryMasterId: 1 });
    setDetailErrors(validation.errors);
    if (!validation.row) return;
    setDraftLines((current) => [...current, {
      key: `${Date.now()}-${Math.random()}`,
      inventoryId: validation.row!.inventory_id,
      quantity: validation.row!.quantity,
      unitPrice: validation.row!.unit_price,
    }]);
    setDraftLineForm({ inventoryId: "", quantity: "1", unitPrice: "0.00" });
    setDetailErrors({});
    setErrorMessage("");
  }

  async function createOrder() {
    const masterValidation = validateInventoryMaster(form);
    setMasterErrors(masterValidation.errors);
    const lineValidations = draftLines.map((line) => validateInventoryDetail({
      inventoryMasterId: 1,
      inventoryId: line.inventoryId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    }));
    if (!masterValidation.row || lineValidations.length === 0 || lineValidations.some((line) => !line.row)) {
      setErrorMessage(lineValidations.length === 0 ? "Add at least one inventory line before creating the order." : "");
      return;
    }
    setSaving(true);
    setNotice("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/inventory-masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          master: form,
          details: lineValidations.map((line) => ({
            inventoryId: line.row!.inventory_id,
            quantity: line.row!.quantity,
            unitPrice: line.row!.unit_price,
          })),
        }),
      });
      const order = await readResponse<InventoryMaster>(response, "Unable to create order.");
      setSelectedOrderId(order.id);
      setDraftLines([]);
      resetMasterForm();
      setNotice("Order and inventory lines created.");
      await refreshOrders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create order.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder(order: InventoryMaster) {
    const customer = members.find((member) => member.id === order.customer_id);
    if (!window.confirm(`Delete the order for ${customer ? `${customer.first_name} ${customer.last_name}` : "this customer"} and all its lines?`)) return;
    setErrorMessage("");
    setNotice("");
    try {
      const response = await fetch(`/api/inventory-masters/${order.id}`, { method: "DELETE" });
      await readResponse<null>(response, "Unable to delete order.");
      if (selectedOrderId === order.id) {
        setSelectedOrderId(null);
        setDetails([]);
      }
      if (editingMasterId === order.id) resetMasterForm();
      setNotice("Order deleted.");
      await refreshOrders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete order.");
    }
  }

  function editDetail(detail: InventoryDetail) {
    setEditingDetailId(detail.id);
    setDetailForm({
      inventoryMasterId: detail.inventory_master_id,
      inventoryId: detail.inventory_id,
      quantity: String(detail.quantity),
      unitPrice: String(detail.unit_price),
    });
    setDetailErrors({});
    setNotice("");
    setErrorMessage("");
  }

  function resetDetailForm() {
    setEditingDetailId(null);
    setDetailForm({ ...emptyDetail, inventoryMasterId: selectedOrderId ?? "" });
    setDetailErrors({});
  }

  async function saveDetail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateInventoryDetail({ ...detailForm, inventoryMasterId: selectedOrderId ?? "" });
    setDetailErrors(validation.errors);
    setNotice("");
    setErrorMessage("");
    if (!validation.row || selectedOrderId === null) return;

    setSaving(true);
    try {
      const response = await fetch(
        editingDetailId === null ? "/api/inventory-details" : `/api/inventory-details/${editingDetailId}`,
        {
          method: editingDetailId === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...detailForm, inventoryMasterId: selectedOrderId }),
        }
      );
      await readResponse<InventoryDetail>(response, "Unable to save order line.");
      resetDetailForm();
      setNotice(editingDetailId === null ? "Inventory line added." : "Inventory line updated.");
      setDetails(await loadDetails(selectedOrderId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save order line.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDetail(detail: InventoryDetail) {
    const item = items.find((candidate) => candidate.id === detail.inventory_id);
    if (!window.confirm(`Remove ${item?.name ?? "this item"} from the order?`)) return;
    setErrorMessage("");
    setNotice("");
    try {
      const response = await fetch(`/api/inventory-details/${detail.id}`, { method: "DELETE" });
      await readResponse<null>(response, "Unable to delete order line.");
      if (editingDetailId === detail.id) resetDetailForm();
      setDetails(await loadDetails(detail.inventory_master_id));
      setNotice("Inventory line removed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete order line.");
    }
  }

  async function addCustomer() {
    const validation = validateMember(memberForm);
    setMemberErrors(validation);
    if (Object.keys(validation).length) return;
    setSavingMember(true);
    setErrorMessage("");
    setNotice("");
    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberForm),
      });
      const member = await readResponse<Member>(response, "Unable to add customer.");
      setMembers((current) => [...current, member].sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      ));
      setForm((current) => ({ ...current, customerId: member.id }));
      setMemberForm(emptyMember);
      setMemberErrors({});
      setShowNewMember(false);
      setNotice("Customer added and selected.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add customer.");
    } finally {
      setSavingMember(false);
    }
  }

  function customerLabel(customerId: number) {
    const customer = members.find((member) => member.id === customerId);
    return customer ? `${customer.first_name} ${customer.last_name}` : `Customer #${customerId}`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-7 sm:pt-10 lg:px-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-[#82988b]"><span className="h-px w-4 bg-[#a8c1b2]" />ORDER MANAGEMENT</div>
          <h1 className="mb-1 mt-3 text-3xl font-bold tracking-tight text-[#263c32]">Orders</h1>
          <p className="mb-0 text-xs text-[#87928b]">Create customer orders and manage their inventory lines.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="grid shrink-0 gap-1 text-right"><strong className="text-2xl font-bold text-[#416c57]">{orders.length.toString().padStart(2, "0")}</strong><span className="text-[8px] font-bold tracking-widest text-[#9ba69f]">TOTAL ORDERS</span></div>
          <button type="button" className="rounded-md bg-[#326b57] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#285641]" onClick={startNewOrder}>New order <span className="ml-2">＋</span></button>
        </div>
      </div>

      {(notice || errorMessage) && <div role={errorMessage ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2.5 text-xs ${errorMessage ? "border-[#f3d8d0] bg-[#fff3f0] text-[#a24838]" : "border-[#d9ebdc] bg-[#edf6ef] text-[#356a52]"}`}>{errorMessage || notice}</div>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.35fr)]">
        <div className="grid gap-4">
          <section className="rounded-lg border border-[#e9eeea] bg-white px-5 pt-5">
            <div className="mb-5 flex items-start justify-between">
              <div><span className="mb-1.5 block text-[8px] font-bold tracking-widest text-[#98a69d]">{editingMasterId === null ? "NEW ORDER" : "UPDATE DETAILS"}</span><h2 className="m-0 text-base font-bold tracking-tight">{editingMasterId === null ? "Create an order" : "Edit order"}</h2></div>
              <span className="grid size-8 place-items-center rounded-md bg-[#edf5ef] text-lg text-[#5b856e]">＋</span>
            </div>
            <form onSubmit={saveOrder} noValidate>
              <label className="block text-xs font-semibold text-[#45574d]" htmlFor="orderCustomer">Customer</label>
              <select className={inputClass} id="orderCustomer" value={form.customerId} aria-invalid={Boolean(masterErrors.customerId)} onChange={(event) => { clearMasterError("customerId"); setForm((current) => ({ ...current, customerId: event.target.value })); }}>
                <option value="">Select a customer</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name} — {member.email}</option>)}
              </select>
              {masterErrors.customerId && <span className="mt-1 block text-[10px] text-[#b64d3e]">{masterErrors.customerId}</span>}
              <button type="button" className="mt-2 text-[10px] font-semibold text-[#4e7e62] hover:underline" onClick={() => setShowNewMember((current) => !current)}>{showNewMember ? "Cancel adding customer" : "+ Add a new customer"}</button>

              {showNewMember && <div className="mt-3 rounded-md border border-[#e9eeea] bg-[#f8faf8] p-3">
                <p className="mb-2 text-xs font-semibold text-[#45574d]">New customer</p>
                {(["firstName", "lastName", "email"] as const).map((field) => {
                  const labels = { firstName: "First name", lastName: "Last name", email: "Email address" };
                  const errorId = `newCustomer-${field}-error`;
                  return <div key={field}>
                    <label className="mt-2 block text-[10px] font-semibold text-[#45574d]" htmlFor={`newCustomer-${field}`}>{labels[field]}</label>
                    <input className={inputClass} id={`newCustomer-${field}`} type={field === "email" ? "email" : "text"} value={memberForm[field]} aria-invalid={Boolean(memberErrors[field])} aria-describedby={memberErrors[field] ? errorId : undefined} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onChange={(event) => { setMemberForm((current) => ({ ...current, [field]: event.target.value })); setMemberErrors((current) => ({ ...current, [field]: undefined })); }} />
                    {memberErrors[field] && <span className="mt-1 block text-[10px] text-[#b64d3e]" id={errorId}>{memberErrors[field]}</span>}
                  </div>;
                })}
                <button className="mt-3 rounded-md bg-[#326b57] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-60" type="button" disabled={savingMember} onClick={() => void addCustomer()}>{savingMember ? "Saving…" : "Save customer"}</button>
              </div>}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#45574d]" htmlFor="inventoryDate">Order date</label>
                  <input className={inputClass} id="inventoryDate" type="date" value={form.inventoryDate} aria-invalid={Boolean(masterErrors.inventoryDate)} onChange={(event) => { clearMasterError("inventoryDate"); setForm((current) => ({ ...current, inventoryDate: event.target.value })); }} />
                  {masterErrors.inventoryDate && <span className="mt-1 block text-[10px] text-[#b64d3e]">{masterErrors.inventoryDate}</span>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#45574d]" htmlFor="orderStatus">Status</label>
                  <select className={inputClass} id="orderStatus" value={form.status} aria-invalid={Boolean(masterErrors.status)} onChange={(event) => { clearMasterError("status"); setForm((current) => ({ ...current, status: event.target.value })); }}>
                    {inventoryOrderStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                  </select>
                  {masterErrors.status && <span className="mt-1 block text-[10px] text-[#b64d3e]">{masterErrors.status}</span>}
                </div>
              </div>
              <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="orderNotes">Notes</label>
              <textarea className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-[#e2e9e3] bg-white px-3 py-2.5 text-sm text-[#31463b] outline-none focus:border-[#83a990] focus:ring-4 focus:ring-[#eaf3ed] aria-[invalid=true]:border-[#d78372]" id="orderNotes" maxLength={2000} rows={3} value={form.notes} aria-invalid={Boolean(masterErrors.notes)} onChange={(event) => { clearMasterError("notes"); setForm((current) => ({ ...current, notes: event.target.value })); }} />
              {masterErrors.notes && <span className="mt-1 block text-[10px] text-[#b64d3e]">{masterErrors.notes}</span>}
              <div className="mt-5 flex items-center gap-3">
                {editingMasterId !== null && <button className="rounded-md bg-[#326b57] px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#285641] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}<span className="ml-3">→</span></button>}
                {editingMasterId !== null && <button className="px-2 py-2 text-xs text-[#76837b]" type="button" onClick={resetMasterForm}>Cancel</button>}
              </div>
              {editingMasterId === null && <p className="mb-0 mt-3 text-[10px] text-[#9aa49d]">Order details are kept as a draft until you create the order with its inventory lines.</p>}
              {members.length === 0 && <p className="mb-0 mt-3 text-[10px] text-[#9aa49d]">Add a customer before creating an order.</p>}
            </form>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#e9eeea] bg-white">
            <div className="border-b border-[#eff2ef] px-4 py-4"><span className="mb-1.5 block text-[8px] font-bold tracking-widest text-[#98a69d]">ORDERS</span><h2 className="m-0 text-sm font-bold">All orders <span className="ml-1 rounded-full bg-[#f2f5f2] px-1.5 py-0.5 text-[10px] font-medium text-[#829087]">{orders.length}</span></h2></div>
            <div className="max-h-[420px] overflow-y-auto">
              {loading ? <div className="p-6 text-center text-xs text-[#9aa59e]">Loading orders…</div> : orders.length === 0 ? <div className="p-6 text-center text-xs text-[#9aa59e]">No orders yet.</div> : orders.map((order) => (
                <article className={`border-b border-[#f1f3f1] px-4 py-3 last:border-0 ${selectedOrderId === order.id ? "bg-[#f5f9f5]" : ""}`} key={order.id}>
                  <button type="button" className="block w-full text-left" onClick={() => { setSelectedOrderId(order.id); setEditingMasterId(null); setDraftLines([]); setNotice(""); setErrorMessage(""); }}>
                    <strong className="block truncate text-xs font-semibold text-[#42574b]">{customerLabel(order.customer_id)}</strong>
                    <span className="mt-1 block text-[10px] text-[#9aa49d]">{order.inventory_date} · {order.status}</span>
                  </button>
                  <div className="mt-2 flex gap-3">
                    <button type="button" className="text-[10px] text-[#4e7e62] hover:underline" onClick={() => editOrder(order)}>Edit</button>
                    <button type="button" className="text-[10px] text-[#b27668] hover:underline" onClick={() => void deleteOrder(order)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
            <div className="flex justify-end border-t border-[#eff2ef] px-4 py-3"><button type="button" className="text-[9px] text-[#688777] hover:text-[#326b57]" onClick={() => { setLoading(true); void Promise.all([refreshReferences(), refreshOrders()]).catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Unable to refresh orders.")).finally(() => setLoading(false)); }}>↻ Refresh</button></div>
          </section>
        </div>

        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e9eeea] bg-white">
          <div className="border-b border-[#eff2ef] px-4 py-4 sm:px-5">
            <span className="mb-1.5 block text-[8px] font-bold tracking-widest text-[#98a69d]">ORDER LINES</span>
            <h2 className="m-0 text-sm font-bold">{selectedOrder ? `Inventory for ${customerLabel(selectedOrder.customer_id)}` : "Select an order"}</h2>
            {selectedOrder && <p className="mb-0 mt-1 text-[10px] text-[#9aa49d]">Order #{selectedOrder.id} · {selectedOrder.inventory_date}</p>}
          </div>
          {!selectedOrder ? <>
            <form className="grid gap-3 border-b border-[#eff2ef] bg-[#fbfcfb] p-4 sm:grid-cols-2" onSubmit={addDraftLine} noValidate>
              <div className="sm:col-span-2"><h3 className="mb-0 text-xs font-semibold text-[#45574d]">Add inventory lines to this draft</h3><p className="mb-0 mt-1 text-[10px] text-[#9aa49d]">These lines are not saved until you create the order.</p></div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-[#45574d]" htmlFor="draftInventory">Inventory item</label>
                <select className={inputClass} id="draftInventory" value={draftLineForm.inventoryId} aria-invalid={Boolean(detailErrors.inventoryId)} onChange={(event) => {
                  const selected = items.find((item) => item.id === Number(event.target.value));
                  setDraftLineForm((current) => ({ ...current, inventoryId: event.target.value, unitPrice: selected ? String(selected.unit_price) : current.unitPrice }));
                  setDetailErrors((current) => ({ ...current, inventoryId: undefined }));
                }}>
                  <option value="">Select an inventory item</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.item_code ? `${item.item_code} · ` : ""}{item.name} ({item.sku})</option>)}
                </select>
                {detailErrors.inventoryId && <span className="mt-1 block text-[10px] text-[#b64d3e]">{detailErrors.inventoryId}</span>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#45574d]" htmlFor="draftQuantity">Quantity</label>
                <input className={inputClass} id="draftQuantity" type="number" min="1" step="1" value={draftLineForm.quantity} aria-invalid={Boolean(detailErrors.quantity)} onChange={(event) => { setDraftLineForm((current) => ({ ...current, quantity: event.target.value })); setDetailErrors((current) => ({ ...current, quantity: undefined })); }} />
                {detailErrors.quantity && <span className="mt-1 block text-[10px] text-[#b64d3e]">{detailErrors.quantity}</span>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#45574d]" htmlFor="draftPrice">Unit price</label>
                <input className={inputClass} id="draftPrice" type="number" min="0" step="0.01" value={draftLineForm.unitPrice} aria-invalid={Boolean(detailErrors.unitPrice)} onChange={(event) => { setDraftLineForm((current) => ({ ...current, unitPrice: event.target.value })); setDetailErrors((current) => ({ ...current, unitPrice: undefined })); }} />
                {detailErrors.unitPrice && <span className="mt-1 block text-[10px] text-[#b64d3e]">{detailErrors.unitPrice}</span>}
              </div>
              <div className="sm:col-span-2"><button className="rounded-md border border-[#dce8de] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#326b57] hover:bg-[#f2f7f3] disabled:opacity-60" type="submit" disabled={items.length === 0}>Add line to draft</button>{items.length === 0 && <span className="ml-3 text-[10px] text-[#9aa49d]">Add an inventory item first.</span>}</div>
            </form>
            <div className="min-h-[180px]">
              {draftLines.length === 0 ? <div className="p-8 text-center text-xs text-[#9aa59e]">Your draft has no inventory lines yet.</div> : <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] border-collapse text-left">
                  <thead><tr className="border-b border-[#eff2ef] text-[9px] font-semibold uppercase tracking-wide text-[#98a69d]"><th className="px-4 py-3">Inventory item</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">Line total</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
                  <tbody>{draftLines.map((line) => {
                    const item = items.find((candidate) => candidate.id === line.inventoryId);
                    return <tr className="border-b border-[#f1f3f1] last:border-0" key={line.key}>
                      <td className="px-4 py-3"><strong className="block text-xs font-semibold text-[#42574b]">{item?.name ?? `Item #${line.inventoryId}`}</strong><span className="mt-1 block text-[10px] text-[#9aa49d]">{item?.item_code || item?.sku || "Inventory item"}</span></td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">{line.quantity}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">${line.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">${(line.quantity * line.unitPrice).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right"><button type="button" className="text-[10px] text-[#b27668] hover:underline" onClick={() => setDraftLines((current) => current.filter((currentLine) => currentLine.key !== line.key))}>Remove</button></td>
                    </tr>;
                  })}</tbody>
                  <tfoot><tr className="border-t border-[#eff2ef]"><td className="px-4 py-3 text-xs font-semibold text-[#42574b]" colSpan={3}>Draft total</td><td className="px-3 py-3 text-right text-xs font-bold tabular-nums text-[#326b57]">${draftLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0).toFixed(2)}</td><td /></tr></tfoot>
                </table>
              </div>}
            </div>
          </> : <>
            <form className="grid gap-3 border-b border-[#eff2ef] bg-[#fbfcfb] p-4 sm:grid-cols-2" onSubmit={saveDetail} noValidate>
              <div className="sm:col-span-2"><h3 className="mb-0 text-xs font-semibold text-[#45574d]">{editingDetailId === null ? "Add inventory item" : "Edit inventory line"}</h3></div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-[#45574d]" htmlFor="detailInventory">Inventory item</label>
                <select className={inputClass} id="detailInventory" value={detailForm.inventoryId} aria-invalid={Boolean(detailErrors.inventoryId)} onChange={(event) => {
                  const selected = items.find((item) => item.id === Number(event.target.value));
                  setDetailForm((current) => ({ ...current, inventoryId: event.target.value, unitPrice: selected ? String(selected.unit_price) : current.unitPrice }));
                  setDetailErrors((current) => ({ ...current, inventoryId: undefined }));
                }}>
                  <option value="">Select an inventory item</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.item_code ? `${item.item_code} · ` : ""}{item.name} ({item.sku})</option>)}
                </select>
                {detailErrors.inventoryId && <span className="mt-1 block text-[10px] text-[#b64d3e]">{detailErrors.inventoryId}</span>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#45574d]" htmlFor="detailQuantity">Quantity</label>
                <input className={inputClass} id="detailQuantity" type="number" min="1" step="1" value={detailForm.quantity} aria-invalid={Boolean(detailErrors.quantity)} onChange={(event) => { setDetailForm((current) => ({ ...current, quantity: event.target.value })); setDetailErrors((current) => ({ ...current, quantity: undefined })); }} />
                {detailErrors.quantity && <span className="mt-1 block text-[10px] text-[#b64d3e]">{detailErrors.quantity}</span>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#45574d]" htmlFor="detailPrice">Unit price</label>
                <input className={inputClass} id="detailPrice" type="number" min="0" step="0.01" value={detailForm.unitPrice} aria-invalid={Boolean(detailErrors.unitPrice)} onChange={(event) => { setDetailForm((current) => ({ ...current, unitPrice: event.target.value })); setDetailErrors((current) => ({ ...current, unitPrice: undefined })); }} />
                {detailErrors.unitPrice && <span className="mt-1 block text-[10px] text-[#b64d3e]">{detailErrors.unitPrice}</span>}
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <button className="rounded-md bg-[#326b57] px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-60" type="submit" disabled={saving || items.length === 0}>{saving ? "Saving…" : editingDetailId === null ? "Add line" : "Save line"}</button>
                {editingDetailId !== null && <button className="px-2 py-2 text-xs text-[#76837b]" type="button" onClick={resetDetailForm}>Cancel</button>}
                {items.length === 0 && <span className="text-[10px] text-[#9aa49d]">Add an inventory item first.</span>}
              </div>
            </form>
            <div className="min-h-[180px]">
              {details.length === 0 ? <div className="p-8 text-center text-xs text-[#9aa59e]">No inventory lines on this order yet.</div> : <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead><tr className="border-b border-[#eff2ef] text-[9px] font-semibold uppercase tracking-wide text-[#98a69d]"><th className="px-4 py-3">Inventory item</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">Line total</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                  <tbody>{details.map((detail) => {
                    const item = items.find((candidate) => candidate.id === detail.inventory_id);
                    return <tr className="border-b border-[#f1f3f1] last:border-0" key={detail.id}>
                      <td className="px-4 py-3"><strong className="block text-xs font-semibold text-[#42574b]">{item?.name ?? `Item #${detail.inventory_id}`}</strong><span className="mt-1 block text-[10px] text-[#9aa49d]">{item?.item_code || item?.sku || "Inventory item"}</span></td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">{detail.quantity}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">${Number(detail.unit_price).toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">${Number(detail.line_total).toFixed(2)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-3"><button type="button" className="text-[10px] text-[#4e7e62] hover:underline" onClick={() => editDetail(detail)}>Edit</button><button type="button" className="text-[10px] text-[#b27668] hover:underline" onClick={() => void deleteDetail(detail)}>Delete</button></div></td>
                    </tr>;
                  })}</tbody>
                  <tfoot><tr className="border-t border-[#eff2ef]"><td className="px-4 py-3 text-xs font-semibold text-[#42574b]" colSpan={3}>Order total</td><td className="px-3 py-3 text-right text-xs font-bold tabular-nums text-[#326b57]">${details.reduce((sum, detail) => sum + Number(detail.line_total), 0).toFixed(2)}</td><td /></tr></tfoot>
                </table>
              </div>}
            </div>
          </>}
        </section>
      </div>
      {!selectedOrder && <div className="mt-4 flex flex-col items-end gap-2 rounded-lg border border-[#e9eeea] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="mb-0 text-xs text-[#87928b]">The order and all {draftLines.length} inventory line{draftLines.length === 1 ? "" : "s"} will be saved together. If saving fails, none of them will be committed.</p>
        <button className="w-full shrink-0 rounded-md bg-[#326b57] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[#285641] disabled:cursor-wait disabled:opacity-60 sm:w-auto" type="button" disabled={saving || members.length === 0 || items.length === 0} onClick={() => void createOrder()}>{saving ? "Creating order…" : "Create order"}<span className="ml-3">→</span></button>
      </div>}
      <div className="mt-6 flex justify-between text-[8px] font-bold tracking-widest text-[#a5afa8]"><span>MEMBERLY</span><span>Small details. Stronger connections.</span></div>
    </div>
  );
}
