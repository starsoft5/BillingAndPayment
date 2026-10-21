"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  validateMember,
  validateMemberField,
  type MemberErrors,
  type MemberInput,
} from "@/lib/member-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import InventoryPanel from "./inventory-panel";
import OrdersPanel from "./orders-panel";

type Member = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
};

type InventoryOrder = {
  id: number;
  customer_id: number;
  inventory_date: string;
  status: string;
  created_at: string;
};

type MonthlyOrderItems = { month: string; itemCount: number };

type Section = "Home" | "About" | "Member" | "Inventory" | "Orders";
type Theme = "light" | "dark";

const emptyForm: MemberInput = { firstName: "", lastName: "", email: "" };
const menuItems: Section[] = ["Home", "About", "Member", "Inventory", "Orders"];
const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-[#e2e9e3] bg-white px-3 text-sm text-[#31463b] outline-none transition placeholder:text-[#aab5ad] focus:border-[#83a990] focus:ring-4 focus:ring-[#eaf3ed] aria-[invalid=true]:border-[#d78372]";

export default function Page() {
  const [section, setSection] = useState<Section>("Home");
  const [theme, setTheme] = useState<Theme>("light");
  const [members, setMembers] = useState<Member[]>([]);
  const [orders, setOrders] = useState<InventoryOrder[]>([]);
  const [monthlyOrderItems, setMonthlyOrderItems] = useState<MonthlyOrderItems[]>([]);
  const [form, setForm] = useState<MemberInput>(emptyForm);
  const [errors, setErrors] = useState<MemberErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof MemberInput, boolean>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("memberly-theme");
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    window.localStorage.setItem("memberly-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => current === "light" ? "dark" : "light");
  }

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/members");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load members.");
      setMembers(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load members.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const [ordersResponse, analyticsResponse] = await Promise.all([
        fetch("/api/inventory-masters", { cache: "no-store" }),
        fetch("/api/order-analytics", { cache: "no-store" }),
      ]);
      const [ordersResult, analyticsResult] = await Promise.all([
        ordersResponse.json(),
        analyticsResponse.json(),
      ]);
      if (!ordersResponse.ok) throw new Error(ordersResult.error || "Unable to load dashboard orders.");
      if (!analyticsResponse.ok) throw new Error(analyticsResult.error || "Unable to load order item analytics.");
      setOrders(ordersResult);
      setMonthlyOrderItems(analyticsResult);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load dashboard orders.");
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let sessionTimeout: number | undefined;
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        if (sessionTimeout !== undefined) window.clearTimeout(sessionTimeout);
        setUserEmail(session?.user.email ?? null);
        if (!session) setMembers([]);
        setAuthReady(true);
      });
      sessionTimeout = window.setTimeout(() => {
        if (!active) return;
        setErrorMessage("Checking your sign-in timed out. Check your connection and refresh the page.");
        setAuthReady(true);
      }, 10_000);
      void supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (!active) return;
        if (sessionTimeout !== undefined) window.clearTimeout(sessionTimeout);
        if (error) setErrorMessage(error.message);
        setUserEmail(session?.user.email ?? null);
        setAuthReady(true);
      }).catch((error: unknown) => {
        if (!active) return;
        if (sessionTimeout !== undefined) window.clearTimeout(sessionTimeout);
        setErrorMessage(error instanceof Error ? error.message : "Unable to check your sign-in.");
        setAuthReady(true);
      });
      return () => {
        active = false;
        if (sessionTimeout !== undefined) window.clearTimeout(sessionTimeout);
        subscription.unsubscribe();
      };
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Supabase is not configured.");
      setAuthReady(true);
      return () => { active = false; };
    }
  }, []);

  useEffect(() => {
    if (userEmail) void loadMembers();
    else setMembers([]);
  }, [loadMembers, userEmail]);

  useEffect(() => {
    if (!userEmail) {
      setOrders([]);
      return;
    }
    if (section === "Home") void loadOrders();
  }, [loadOrders, section, userEmail]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      `${member.first_name} ${member.last_name} ${member.email}`.toLowerCase().includes(query)
    );
  }, [members, search]);

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        label: date.toLocaleString("en", { month: "short" }),
        count: 0,
        orderCount: 0,
        orderItemCount: 0,
        cumulativeOrders: 0,
      };
    });
    let addedThisMonth = 0;
    let addedLastSevenDays = 0;
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    for (const member of members) {
      const createdAt = new Date(member.created_at);
      if (Number.isNaN(createdAt.getTime())) continue;
      if (createdAt.getFullYear() === now.getFullYear() && createdAt.getMonth() === now.getMonth()) addedThisMonth += 1;
      if (createdAt.getTime() >= sevenDaysAgo && createdAt.getTime() <= now.getTime()) addedLastSevenDays += 1;
      const month = months.find((item) => item.year === createdAt.getFullYear() && item.month === createdAt.getMonth());
      if (month) month.count += 1;
    }

    let ordersBeforeChart = 0;
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    for (const order of orders) {
      const [year, monthNumber, day] = order.inventory_date.split("-").map(Number);
      const orderDate = new Date(year, monthNumber - 1, day);
      if (
        !Number.isInteger(year) ||
        !Number.isInteger(monthNumber) ||
        !Number.isInteger(day) ||
        orderDate.getFullYear() !== year ||
        orderDate.getMonth() !== monthNumber - 1 ||
        orderDate.getDate() !== day
      ) continue;
      const monthStart = new Date(year, monthNumber - 1, 1);
      const nextMonthStart = new Date(lastMonth.year, lastMonth.month + 1, 1);
      if (monthStart < new Date(firstMonth.year, firstMonth.month, 1)) {
        ordersBeforeChart += 1;
      } else if (monthStart < nextMonthStart) {
        const month = months.find((item) => item.year === year && item.month === monthNumber - 1);
        if (month) month.orderCount += 1;
      }
    }
    let cumulativeOrders = ordersBeforeChart;
    for (const month of months) {
      cumulativeOrders += month.orderCount;
      month.cumulativeOrders = cumulativeOrders;
      const monthKey = `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
      month.orderItemCount = monthlyOrderItems.find((item) => item.month === monthKey)?.itemCount ?? 0;
    }

    return {
      addedThisMonth,
      addedLastSevenDays,
      totalOrders: orders.length,
      ordersThisMonth: months[months.length - 1]?.orderCount ?? 0,
      orderItemAxisMax: Math.max(1, ...months.map((month) => month.orderItemCount)),
      cumulativeOrderAxisMax: Math.max(1, ...months.map((month) => month.cumulativeOrders)),
      months,
      recentMembers: [...members]
        .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
        .slice(0, 5),
    };
  }, [members, monthlyOrderItems, orders]);

  function startEdit(member: Member) {
    setEditingId(String(member.id));
    setForm({ firstName: member.first_name, lastName: member.last_name, email: member.email });
    setErrors({});
    setTouched({});
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
    setTouched({});
  }

  function updateField(field: keyof MemberInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (touched[field]) {
      const error = validateMemberField(field, value);
      setErrors((current) => {
        const next = { ...current };
        if (error) next[field] = error;
        else delete next[field];
        return next;
      });
    }
  }

  function touchField(field: keyof MemberInput) {
    setTouched((current) => ({ ...current, [field]: true }));
    const error = validateMemberField(field, form[field]);
    setErrors((current) => {
      const next = { ...current };
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });
  }

  async function saveMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateMember(form);
    setErrors(validation);
    setTouched({ firstName: true, lastName: true, email: true });
    setNotice("");
    setErrorMessage("");
    if (Object.keys(validation).length) return;

    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/members/${editingId}` : "/api/members", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save member.");
      resetForm();
      setNotice(editingId ? "Member updated successfully." : "Member added successfully.");
      await loadMembers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save member.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMember(member: Member) {
    if (!window.confirm(`Remove ${member.first_name} ${member.last_name} from your members?`)) return;
    setErrorMessage("");
    setNotice("");
    try {
      const response = await fetch(`/api/members/${member.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Unable to delete member.");
      }
      if (editingId === String(member.id)) resetForm();
      setNotice("Member removed.");
      await loadMembers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete member.");
    }
  }

  function navigate(item: Section) {
    setSection(item);
    setNotice("");
    setErrorMessage("");
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setErrorMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      setLoginPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setErrorMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  if (!authReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8faf8] text-sm text-[#87938c]">
        <div className="flex items-center gap-3"><span className="size-2 animate-pulse rounded-full bg-[#7eae8e]" />Checking your session…</div>
      </main>
    );
  }

  if (!userEmail) {
    return (
      <main className="relative grid min-h-screen place-items-center bg-[#f5f8f5] px-4 py-20">
        <a className="absolute left-5 top-5 inline-flex items-center gap-2.5 font-bold tracking-tight text-[#263c32] sm:left-9 sm:top-8" href="#">
          <span className="grid size-8 place-items-center rounded-xl rounded-bl-sm bg-[#326b57] text-xl text-white">m</span>
          <span className="text-xl">memberly<span className="text-[#d99779]">.</span></span>
        </a>
        <button
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          className="absolute right-5 top-5 rounded-md border border-[#e2e9e3] bg-white px-3 py-2 text-xs font-semibold text-[#45574d] sm:right-9 sm:top-8"
          onClick={toggleTheme}
          type="button"
        >
          {theme === "light" ? "☾ Dark" : "☀ Light"}
        </button>
        <section className="w-full max-w-[400px] overflow-hidden rounded-xl border border-[#e9eeea] bg-white px-6 pt-8 shadow-[0_18px_60px_#3456410b] sm:px-9 sm:pt-9">
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-[#82988b]"><span className="h-px w-4 bg-[#a8c1b2]" />MEMBER WORKSPACE</div>
          <h1 className="mb-3 mt-6 text-4xl font-bold leading-tight tracking-[-.06em] text-[#263c32]">Welcome<br />back.</h1>
          <p className="mb-6 text-sm leading-6 text-[#87938c]">Sign in with your authorized admin account to manage members.</p>
          {errorMessage && <div role="alert" className="mb-4 rounded-md border border-[#f3d8d0] bg-[#fff3f0] px-3 py-2.5 text-xs text-[#a24838]">{errorMessage}</div>}
          <form onSubmit={signIn} noValidate>
            <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="loginEmail">Email address</label>
            <input className={inputClass} id="loginEmail" autoComplete="username" type="email" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
            <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="loginPassword">Password</label>
            <input className={inputClass} id="loginPassword" autoComplete="current-password" type="password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
            <button className="mt-6 flex w-full items-center justify-between rounded-md bg-[#326b57] px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-[#285641] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={authBusy}>{authBusy ? "Signing in…" : "Sign in"}<span>→</span></button>
          </form>
          <div className="-mx-6 mt-8 flex items-center gap-2 border-t border-[#f0f2f0] px-6 py-4 font-serif text-xs italic text-[#9ba69f] sm:-mx-9 sm:px-9"><span className="text-base not-italic text-[#d6a184]">✳</span>A private space for your community.</div>
        </section>
        <div className="absolute inset-x-5 bottom-5 flex justify-between text-[8px] font-semibold tracking-widest text-[#a5afa8] sm:inset-x-9"><span>MEMBERLY</span><span>SMALL DETAILS. STRONGER CONNECTIONS.</span></div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f8faf8] text-[#22352f] md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-[#e9eeea] bg-white px-4 py-3 sm:px-6 md:min-h-screen md:w-60 md:border-b-0 md:border-r md:px-5 md:py-7">
        <div className="flex items-center justify-between md:block">
          <a className="mb-0 inline-flex items-center gap-2.5 font-bold tracking-tight text-[#263c32] md:mb-12 md:ml-1.5" href="#" onClick={(event) => { event.preventDefault(); navigate("Home"); }}>
            <span className="grid size-8 place-items-center rounded-xl rounded-bl-sm bg-[#326b57] text-xl text-white">m</span>
            <span className="text-xl">memberly<span className="text-[#d99779]">.</span></span>
          </a>
          <div className="flex items-center gap-2 md:hidden">
            <span className="max-w-28 truncate text-xs text-[#7d8a83]">{userEmail}</span>
            <button
              aria-label="Log out"
              className="rounded border border-[#e9eeea] px-2 py-1 text-[10px] font-semibold text-[#688777]"
              onClick={() => void signOut()}
              type="button"
            >
              Log out
            </button>
          </div>
        </div>
        <div className="mb-3 mt-5 hidden pl-3 text-[9px] font-bold tracking-[.14em] text-[#a1aaa4] md:block">WORKSPACE</div>
        <nav aria-label="Main menu" className="mt-3 flex gap-1 overflow-x-auto md:mt-0 md:flex-col md:overflow-visible">
          {menuItems.map((item, index) => (
            <button
              aria-current={section === item ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs transition md:gap-3 ${section === item ? "bg-[#eef5f0] font-semibold text-[#326b57]" : "text-[#7d8a83] hover:bg-[#f6f8f6] hover:text-[#22352f]"}`}
              key={item}
              onClick={() => navigate(item)}
            >
              <span className="w-4 text-center text-base">{["⌂", "◉", "♙", "▦", "▤"][index]}</span>
              {item}
              {item === "Member" && members.length > 0 && <span className="ml-1 rounded-full border border-[#e8eee9] bg-white px-1.5 py-0.5 text-[10px] text-[#89958e] md:ml-auto">{members.length}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden items-center gap-2.5 border-t border-[#e9eeea] px-1 pt-4 md:flex">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f2e4d9] text-[10px] font-bold text-[#956a51]">{userEmail.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-[10px] font-semibold">{userEmail}</strong>
            <span className="text-[10px] text-[#89958e]">Workspace admin</span>
          </div>
          <button
            aria-label="Log out"
            className="rounded-md border border-[#e2e9e3] px-2.5 py-1.5 text-[10px] font-semibold text-[#688777] transition hover:bg-[#f6f8f6] hover:text-[#326b57]"
            onClick={() => void signOut()}
            type="button"
          >
            Log out
          </button>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="flex h-14 items-center justify-between border-b border-[#e9eeea] bg-white/70 px-4 sm:px-7 lg:px-12">
          <div className="flex items-center gap-2.5 text-xs text-[#99a49d]"><span>Workspace</span><span className="text-[#ccd3ce]">/</span><strong className="font-semibold text-[#40564c]">{section}</strong></div>
          <div className="flex items-center gap-3 text-[10px] text-[#91a097]">
            <button
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              className="rounded-md border border-[#e2e9e3] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#45574d] transition hover:bg-[#f6f8f6]"
              onClick={toggleTheme}
              type="button"
            >
              {theme === "light" ? "☾ Dark" : "☀ Light"}
            </button>
            <span className="size-1.5 rounded-full bg-[#80b99b]" /><span className="hidden sm:inline">All changes saved</span>
          </div>
        </header>

        {section === "Home" && (
          <div className="relative mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl overflow-hidden px-5 pb-24 pt-12 sm:px-9 sm:pt-20 lg:px-14">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-[#82988b]"><span className="h-px w-4 bg-[#a8c1b2]" />MEMBER MANAGEMENT</div>
            <h1 className="relative z-10 mb-4 mt-6 text-4xl font-bold leading-[1.12] tracking-[-.06em] text-[#263c32] sm:text-5xl">Your community,<br />in good company.</h1>
            <p className="relative z-10 max-w-md text-sm leading-7 text-[#7e8b83]">A clear view of the people who make your community what it is.</p>
            <div className="relative z-10 mt-4 flex flex-wrap gap-3">
              <button className="rounded-md bg-[#326b57] px-4 py-3 text-xs font-semibold text-white transition hover:bg-[#285641]" onClick={() => navigate("Member")}>Manage members <span className="ml-4">→</span></button>
              <button className="rounded-md border border-[#dce8de] bg-white px-4 py-3 text-xs font-semibold text-[#326b57] transition hover:bg-[#f2f7f3]" onClick={() => navigate("Orders")}>Create order <span className="ml-4">＋</span></button>
            </div>
            <div className="hidden">
              <div className="grid gap-1"><strong className="text-xl font-bold text-[#3a6351]">{members.length.toString().padStart(2, "0")}</strong><span className="text-[8px] tracking-widest text-[#9ba69f]">MEMBERS</span></div>
              <div className="grid gap-1"><strong className="text-xl font-bold text-[#3a6351]">01</strong><span className="text-[8px] tracking-widest text-[#9ba69f]">SHARED SPACE</span></div>
              <div className="grid gap-1"><strong className="text-xl font-bold text-[#3a6351]">∞</strong><span className="text-[8px] tracking-widest text-[#9ba69f]">POSSIBILITIES</span></div>
            </div>
            {(notice || errorMessage) && <div role={errorMessage ? "alert" : "status"} className={`relative z-10 mb-4 max-w-xl rounded-md border px-3 py-2.5 text-xs ${errorMessage ? "border-[#f3d8d0] bg-[#fff3f0] text-[#a24838]" : "border-[#d9ebdc] bg-[#edf6ef] text-[#356a52]"}`}>{errorMessage || notice}</div>}
            <div className="relative z-10 mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total members", value: members.length, note: "In your directory", color: "text-[#3a6351]", busy: loading },
                { label: "Added this month", value: dashboardStats.addedThisMonth, note: "So far this month", color: "text-[#b8795b]", busy: loading },
                { label: "Added this week", value: dashboardStats.addedLastSevenDays, note: "In the last 7 days", color: "text-[#7379a5]", busy: loading },
                { label: "Total orders", value: dashboardStats.totalOrders, note: `${dashboardStats.ordersThisMonth} this month`, color: "text-[#3a6351]", busy: ordersLoading },
              ].map((stat) => (
                <article className="rounded-lg border border-[#e9eeea] bg-white p-4 shadow-[0_2px_10px_#2d493a06]" key={stat.label}>
                  <span className="text-[10px] font-medium text-[#87938c]">{stat.label}</span>
                  <div className="mt-2 flex items-baseline gap-2"><strong className={`text-2xl font-bold ${stat.color}`}>{stat.busy ? "—" : stat.value}</strong><span className="text-[9px] text-[#9aa49d]">{stat.note}</span></div>
                </article>
              ))}
            </div>
            <div className="relative z-10 mt-4 grid max-w-5xl gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-[#e9eeea] bg-white p-5 shadow-[0_2px_10px_#2d493a06]">
                <div className="mb-4"><h2 className="m-0 text-sm font-bold text-[#33493d]">Monthly additions</h2><p className="mb-0 mt-1 text-[10px] text-[#9aa49d]">Members added each month</p></div>
                <div className="px-2">
                  <svg
                    aria-label={`Members added over the last six months: ${dashboardStats.months.map((month) => `${month.label} ${month.count}`).join(", ")}`}
                    className="h-36 w-full"
                    preserveAspectRatio="none"
                    role="img"
                    viewBox="0 0 600 150"
                  >
                    {[30, 75, 120].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#edf1ed" strokeDasharray="3 5" />)}
                    {dashboardStats.months.map((month, index) => {
                      const maximum = Math.max(1, ...dashboardStats.months.map((item) => item.count));
                      const x = 24 + index * 110.4;
                      const height = (month.count / maximum) * 90;
                      return <rect key={`${month.year}-${month.month}-bar`} x={x - 22} y={120 - height} width="44" height={height} rx="4" fill="#82b393"><title>{`${month.label}: ${month.count} ${month.count === 1 ? "member" : "members"} added`}</title></rect>;
                    })}
                  </svg>
                </div>
                <div className="grid grid-cols-6 gap-3 px-2 pt-2 text-center text-[9px] text-[#99a49d]">{dashboardStats.months.map((month) => <span key={`${month.year}-${month.month}`}>{month.label}</span>)}</div>
              </section>
              <section className="rounded-lg border border-[#e9eeea] bg-white p-5 shadow-[0_2px_10px_#2d493a06]">
                <div className="mb-4"><h2 className="m-0 text-sm font-bold text-[#33493d]">Growth trend</h2><p className="mb-0 mt-1 text-[10px] text-[#9aa49d]">Month-by-month member growth</p></div>
                <div className="px-2">
                  <svg
                    aria-label={`Member growth trend over the last six months: ${dashboardStats.months.map((month) => `${month.label} ${month.count}`).join(", ")}`}
                    className="h-36 w-full"
                    preserveAspectRatio="none"
                    role="img"
                    viewBox="0 0 600 150"
                  >
                    {[30, 75, 120].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#edf1ed" strokeDasharray="3 5" />)}
                    <polyline
                      fill="none"
                      points={dashboardStats.months.map((month, index) => {
                        const maximum = Math.max(1, ...dashboardStats.months.map((item) => item.count));
                        const x = 24 + index * 110.4;
                        const y = 120 - (month.count / maximum) * 90;
                        return `${x},${y}`;
                      }).join(" ")}
                      stroke="#75a886"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                      vectorEffect="non-scaling-stroke"
                    />
                    {dashboardStats.months.map((month, index) => {
                      const maximum = Math.max(1, ...dashboardStats.months.map((item) => item.count));
                      const x = 24 + index * 110.4;
                      const y = 120 - (month.count / maximum) * 90;
                      return <circle key={`${month.year}-${month.month}-point`} cx={x} cy={y} r="4.5" fill="#fff" stroke="#5f9471" strokeWidth="3"><title>{`${month.label}: ${month.count} ${month.count === 1 ? "member" : "members"} added`}</title></circle>;
                    })}
                  </svg>
                </div>
                <div className="grid grid-cols-6 gap-3 px-2 pt-2 text-center text-[9px] text-[#99a49d]">{dashboardStats.months.map((month) => <span key={`${month.year}-${month.month}`}>{month.label}</span>)}</div>
              </section>
              <section className="rounded-lg border border-[#e9eeea] bg-white p-5 shadow-[0_2px_10px_#2d493a06]">
                <div className="mb-4"><h2 className="m-0 text-sm font-bold text-[#33493d]">Monthly order items</h2><p className="mb-0 mt-1 text-[10px] text-[#9aa49d]">Total item quantity by order date</p></div>
                {ordersLoading ? <div className="grid h-36 place-items-center text-xs text-[#9aa59e]">Loading order activity…</div> : (
                  <>
                    <div className="px-2">
                      <svg
                        aria-label={`Inventory item quantities ordered over the last six months: ${dashboardStats.months.map((month) => `${month.label} ${month.orderItemCount}`).join(", ")}`}
                        className="h-36 w-full"
                        preserveAspectRatio="none"
                        role="img"
                        viewBox="0 0 640 150"
                      >
                        <text fill="#87938c" fontSize="9" textAnchor="middle" transform="rotate(-90 11 75)" x="11" y="75">Number of items</text>
                        {(dashboardStats.orderItemAxisMax === 1
                          ? [0, 1]
                          : [0, Math.ceil(dashboardStats.orderItemAxisMax / 2), dashboardStats.orderItemAxisMax]
                        ).map((value, index, values) => {
                          const y = 120 - index * (90 / (values.length - 1));
                          return <g key={`monthly-order-item-tick-${index}`}><line x1="52" x2="630" y1={y} y2={y} stroke="#edf1ed" strokeDasharray="3 5" /><text fill="#87938c" fontSize="9" textAnchor="end" x="45" y={y + 3}>{value}</text></g>;
                        })}
                        {dashboardStats.months.map((month, index) => {
                          const x = 72 + index * 100;
                          const height = (month.orderItemCount / dashboardStats.orderItemAxisMax) * 90;
                          return <rect key={`${month.year}-${month.month}-order-bar`} x={x - 22} y={120 - height} width="44" height={height} rx="4" fill="#d3a083"><title>{`${month.label}: ${month.orderItemCount} ${month.orderItemCount === 1 ? "item" : "items"} ordered`}</title></rect>;
                        })}
                      </svg>
                    </div>
                    <div className="grid grid-cols-6 gap-3 px-2 pt-2 text-center text-[9px] text-[#99a49d]">{dashboardStats.months.map((month) => <span key={`${month.year}-${month.month}-order-label`}>{month.label}</span>)}</div>
                  </>
                )}
              </section>
              <section className="rounded-lg border border-[#e9eeea] bg-white p-5 shadow-[0_2px_10px_#2d493a06]">
                <div className="mb-4"><h2 className="m-0 text-sm font-bold text-[#33493d]">Order growth trend</h2><p className="mb-0 mt-1 text-[10px] text-[#9aa49d]">Cumulative orders over six months</p></div>
                {ordersLoading ? <div className="grid h-36 place-items-center text-xs text-[#9aa59e]">Loading order activity…</div> : (
                  <>
                    <div className="px-2">
                      <svg
                        aria-label={`Cumulative order growth over the last six months: ${dashboardStats.months.map((month) => `${month.label} ${month.cumulativeOrders}`).join(", ")}`}
                        className="h-36 w-full"
                        preserveAspectRatio="none"
                        role="img"
                        viewBox="0 0 640 150"
                      >
                        <text fill="#87938c" fontSize="9" textAnchor="middle" transform="rotate(-90 11 75)" x="11" y="75">Number of orders</text>
                        {(dashboardStats.cumulativeOrderAxisMax === 1
                          ? [0, 1]
                          : [0, Math.ceil(dashboardStats.cumulativeOrderAxisMax / 2), dashboardStats.cumulativeOrderAxisMax]
                        ).map((value, index, values) => {
                          const y = 120 - index * (90 / (values.length - 1));
                          return <g key={`order-growth-tick-${index}`}><line x1="52" x2="630" y1={y} y2={y} stroke="#edf1ed" strokeDasharray="3 5" /><text fill="#87938c" fontSize="9" textAnchor="end" x="45" y={y + 3}>{value}</text></g>;
                        })}
                        <polyline
                          fill="none"
                          points={dashboardStats.months.map((month, index) => {
                            const x = 72 + index * 100;
                            const y = 120 - (month.cumulativeOrders / dashboardStats.cumulativeOrderAxisMax) * 90;
                            return `${x},${y}`;
                          }).join(" ")}
                          stroke="#75a886"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                          vectorEffect="non-scaling-stroke"
                        />
                        {dashboardStats.months.map((month, index) => {
                          const x = 72 + index * 100;
                          const y = 120 - (month.cumulativeOrders / dashboardStats.cumulativeOrderAxisMax) * 90;
                          return <circle key={`${month.year}-${month.month}-order-point`} cx={x} cy={y} r="4.5" fill="#fff" stroke="#5f9471" strokeWidth="3"><title>{`${month.label}: ${month.cumulativeOrders} cumulative ${month.cumulativeOrders === 1 ? "order" : "orders"}`}</title></circle>;
                        })}
                      </svg>
                    </div>
                    <div className="grid grid-cols-6 gap-3 px-2 pt-2 text-center text-[9px] text-[#99a49d]">{dashboardStats.months.map((month) => <span key={`${month.year}-${month.month}-order-trend-label`}>{month.label}</span>)}</div>
                  </>
                )}
              </section>
              <section className="overflow-hidden rounded-lg border border-[#e9eeea] bg-white shadow-[0_2px_10px_#2d493a06] lg:col-span-2">
                <div className="flex items-center justify-between border-b border-[#eff2ef] px-4 py-4"><div><h2 className="m-0 text-sm font-bold text-[#33493d]">Recently added</h2><p className="mb-0 mt-1 text-[10px] text-[#9aa49d]">Latest additions to your community</p></div><button className="text-[10px] font-semibold text-[#4d8062]" onClick={() => navigate("Member")}>View all</button></div>
                {loading ? <div className="p-6 text-center text-xs text-[#9aa59e]">Loading members...</div> : dashboardStats.recentMembers.length ? dashboardStats.recentMembers.slice(0, 4).map((member, index) => (
                  <div className="flex items-center gap-3 border-b border-[#f1f3f1] px-4 py-3 last:border-0" key={member.id}>
                    <div className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${["bg-[#e7f0e8] text-[#588067]", "bg-[#f9e9e2] text-[#af765e]", "bg-[#e9eafb] text-[#6f72a0]", "bg-[#f4efdc] text-[#9c8c4d]"][index % 4]}`}>{member.first_name[0]}{member.last_name[0]}</div>
                    <div className="min-w-0 flex-1"><strong className="block truncate text-xs font-semibold text-[#42574b]">{member.first_name} {member.last_name}</strong><span className="block truncate pt-1 text-[10px] text-[#9aa49d]">{member.email}</span></div>
                    <span className="shrink-0 text-[9px] text-[#a4ada7]">{new Date(member.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </div>
                )) : <div className="px-4 py-8 text-center"><strong className="text-xs font-semibold text-[#62756a]">Your community starts here</strong><p className="mb-0 mt-1 text-[10px] text-[#9aa49d]">Add your first member to see them here.</p></div>}
              </section>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute right-[-6rem] top-20 hidden h-96 w-96 place-items-center opacity-70 sm:hidden lg:right-10">
              <div className="absolute size-72 rounded-full border border-[#e7eee8]" />
              <div className="absolute size-60 rounded-full border border-[#e7eee8]" />
              <div className="absolute right-14 top-24 flex w-48 rotate-6 items-center gap-3 rounded-lg border border-[#eef1ed] bg-white p-4 shadow-xl">
                <span className="grid size-9 place-items-center rounded-full bg-[#fae9e2] font-bold text-[#b67e69]">A</span><span className="h-2 w-16 rounded-full bg-[#edf1ed]" />
              </div>
              <div className="absolute left-12 top-40 flex w-64 items-center gap-3 rounded-lg border border-[#eef1ed] bg-white p-4 shadow-xl">
                <span className="grid size-10 place-items-center rounded-full bg-[#e4f0e7] font-bold text-[#55836b]">J</span>
                <span className="grid gap-1"><b className="text-xs">Jordan Lee</b><small className="text-[10px] text-[#9aa49d]">Member since today</small></span>
                <span className="ml-auto grid size-6 place-items-center rounded-full bg-[#eef6ef] text-xs text-[#579271]">✓</span>
              </div>
              <span className="absolute bottom-14 right-16 font-serif text-xs italic text-[#a5afa8]">Good things grow together.</span>
            </div>
            <div className="absolute inset-x-5 bottom-5 flex justify-between text-[8px] font-bold tracking-widest text-[#a6b0a9] sm:inset-x-9 lg:inset-x-14"><span>MADE FOR PEOPLE, NOT SPREADSHEETS</span><span>01 — 03</span></div>
          </div>
        )}

        {section === "About" && (
          <div className="mx-auto max-w-7xl px-5 pt-12 sm:px-9 sm:pt-20 lg:px-14">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-[#82988b]"><span className="h-px w-4 bg-[#a8c1b2]" />A LITTLE ABOUT US</div>
            <h1 className="mb-4 mt-6 text-4xl font-bold leading-tight tracking-[-.06em] text-[#263c32] sm:text-5xl">People make<br />the whole thing.</h1>
            <p className="mb-8 max-w-lg text-sm leading-7 text-[#7e8b83]">Memberly keeps the practical details out of the way, so you can spend more time building a community that matters.</p>
            <div className="flex max-w-xl gap-4 rounded-lg border border-[#e9eeea] bg-white p-5 sm:p-6">
              <span className="text-xl text-[#71947f]">✳</span><div><strong className="text-sm">Simple by design</strong><p className="mb-0 mt-2 text-xs leading-6 text-[#87938c]">A tidy home for names and contact details. Add a member, make a change, or find exactly who you need.</p></div>
            </div>
            <button className="mt-6 text-xs font-semibold text-[#326b57] hover:text-[#285641]" onClick={() => navigate("Member")}>Meet your members <span className="ml-2">→</span></button>
          </div>
        )}

        {section === "Member" && (
          <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-7 sm:pt-10 lg:px-12">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div><div className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-[#82988b]"><span className="h-px w-4 bg-[#a8c1b2]" />YOUR COMMUNITY</div><h1 className="mb-1 mt-3 text-3xl font-bold tracking-tight text-[#263c32]">Members</h1><p className="mb-0 text-xs text-[#87928b]">The people who make this community what it is.</p></div>
              <div className="grid shrink-0 gap-1 text-right"><strong className="text-2xl font-bold text-[#416c57]">{members.length.toString().padStart(2, "0")}</strong><span className="text-[8px] font-bold tracking-widest text-[#9ba69f]">TOTAL MEMBERS</span></div>
            </div>

            {(notice || errorMessage) && <div role="status" className={`mb-4 rounded-md border px-3 py-2.5 text-xs ${errorMessage ? "border-[#f3d8d0] bg-[#fff3f0] text-[#a24838]" : "border-[#d9ebdc] bg-[#edf6ef] text-[#356a52]"}`}>{errorMessage || notice}</div>}

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,0.76fr)_minmax(0,1.35fr)]">
              <section className="rounded-lg border border-[#e9eeea] bg-white px-5 pt-5">
                <div className="mb-5 flex items-start justify-between">
                  <div><span className="mb-1.5 block text-[8px] font-bold tracking-widest text-[#98a69d]">{editingId ? "UPDATE DETAILS" : "NEW MEMBER"}</span><h2 className="m-0 text-base font-bold tracking-tight">{editingId ? "Edit member" : "Add a member"}</h2></div>
                  <span className="grid size-8 place-items-center rounded-md bg-[#edf5ef] text-lg text-[#5b856e]">＋</span>
                </div>
                <form onSubmit={saveMember} noValidate>
                  <label className="mt-3 block text-xs font-semibold text-[#45574d]" htmlFor="firstName">First name</label>
                  <input className={inputClass} id="firstName" autoComplete="given-name" placeholder="e.g. Jamie" value={form.firstName} aria-invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? "firstName-error" : undefined} onBlur={() => touchField("firstName")} onChange={(event) => updateField("firstName", event.target.value)} />
                  {errors.firstName && <span className="mt-1 block text-[10px] leading-4 text-[#b64d3e]" id="firstName-error">{errors.firstName}</span>}

                  <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="lastName">Last name</label>
                  <input className={inputClass} id="lastName" autoComplete="family-name" placeholder="e.g. Parker" value={form.lastName} aria-invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? "lastName-error" : undefined} onBlur={() => touchField("lastName")} onChange={(event) => updateField("lastName", event.target.value)} />
                  {errors.lastName && <span className="mt-1 block text-[10px] leading-4 text-[#b64d3e]" id="lastName-error">{errors.lastName}</span>}

                  <label className="mt-4 block text-xs font-semibold text-[#45574d]" htmlFor="email">Email address</label>
                  <input className={inputClass} id="email" autoComplete="email" type="email" placeholder="jamie@example.com" value={form.email} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} onBlur={() => touchField("email")} onChange={(event) => updateField("email", event.target.value)} />
                  {errors.email && <span className="mt-1 block text-[10px] leading-4 text-[#b64d3e]" id="email-error">{errors.email}</span>}
                  <span className="mt-1.5 block text-[10px] text-[#a1aaa4]">We’ll only use this to identify your member.</span>

                  <div className="mt-5 flex items-center gap-3">
                    <button className="rounded-md bg-[#326b57] px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#285641] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add member"} <span className="ml-3">→</span></button>
                    {editingId && <button className="px-2 py-2 text-xs text-[#76837b] hover:text-[#22352f]" type="button" onClick={resetForm}>Cancel</button>}
                  </div>
                </form>
                <div className="-mx-5 mt-5 flex items-center gap-2 border-t border-[#f0f2f0] px-5 py-3 font-serif text-xs italic text-[#9ba69f]"><span className="text-base not-italic text-[#d6a184]">✳</span>Every person belongs here.</div>
              </section>

              <section className="min-w-0 overflow-hidden rounded-lg border border-[#e9eeea] bg-white">
                <div className="flex flex-col gap-3 border-b border-[#eff2ef] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
                  <div><span className="mb-1.5 block text-[8px] font-bold tracking-widest text-[#98a69d]">DIRECTORY</span><h2 className="m-0 text-sm font-bold">All members <span className="ml-1 rounded-full bg-[#f2f5f2] px-1.5 py-0.5 text-[10px] font-medium text-[#829087]">{members.length}</span></h2></div>
                  <div className="flex h-9 w-full items-center gap-2 rounded border border-[#e9eeea] px-2.5 text-[#9aa69e] sm:h-8 sm:w-48">
                    <span className="text-base">⌕</span><input className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[#22352f] outline-none placeholder:text-[#adb6b0]" aria-label="Search members" placeholder="Find someone..." value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                </div>
                <div className="min-h-[210px]">
                  {loading ? <div className="flex min-h-[210px] items-center justify-center gap-3 text-xs text-[#9aa59e]"><span className="size-2 animate-pulse rounded-full bg-[#7eae8e]" />Loading your members…</div> :
                    filteredMembers.length === 0 ? (
                      <div className="flex min-h-[210px] flex-col items-center justify-center gap-2 px-4 text-center text-xs text-[#9aa59e]">
                        <span className="mb-1 grid size-10 place-items-center rounded-full bg-[#f1f6f2] text-lg text-[#70937c]">{search ? "⌕" : "♙"}</span>
                        <strong className="font-semibold text-[#62756a]">{search ? "No one found" : "A little quiet in here."}</strong>
                        <span>{search ? "Try another name or email." : "Your first member is just a few details away."}</span>
                      </div>
                    ) : filteredMembers.map((member, index) => (
                      <article className="group flex min-w-0 items-center gap-2.5 border-b border-[#f1f3f1] px-3 py-3 sm:gap-3 sm:px-4" key={member.id}>
                        <div className={`grid size-9 shrink-0 place-items-center rounded-full text-[10px] font-bold ${["bg-[#e7f0e8] text-[#588067]", "bg-[#f9e9e2] text-[#af765e]", "bg-[#e9eafb] text-[#6f72a0]", "bg-[#f4efdc] text-[#9c8c4d]"][index % 4]}`}>{member.first_name[0]}{member.last_name[0]}</div>
                        <div className="min-w-0 flex-1"><strong className="block truncate text-xs font-semibold text-[#42574b]">{member.first_name} {member.last_name}</strong><span className="block truncate pt-1 text-[10px] text-[#9aa49d]">{member.email}</span></div>
                        <span className="hidden shrink-0 text-[10px] text-[#a4ada7] sm:inline">{new Date(member.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        <div className="flex shrink-0 gap-2 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                          <button className="py-1 text-[10px] text-[#4e7e62] hover:underline" aria-label={`Edit ${member.first_name} ${member.last_name}`} onClick={() => startEdit(member)}>Edit</button>
                          <button className="py-1 text-[10px] text-[#b27668] hover:underline" aria-label={`Delete ${member.first_name} ${member.last_name}`} onClick={() => void deleteMember(member)}>Delete</button>
                        </div>
                      </article>
                    ))}
                </div>
                <div className="flex items-center justify-between border-t border-[#eff2ef] px-3 py-3 text-[9px] tracking-wide text-[#a1aaa4] sm:px-4">
                  <span>SHOWING {filteredMembers.length} OF {members.length} MEMBERS</span><button className="text-[#688777] hover:text-[#326b57]" onClick={() => void loadMembers()}>↻ Refresh</button>
                </div>
              </section>
            </div>
            <div className="mt-6 flex justify-between text-[8px] font-bold tracking-widest text-[#a5afa8]"><span>MEMBERLY</span><span>Small details. Stronger connections.</span></div>
          </div>
        )}

        {section === "Inventory" && <InventoryPanel />}
        {section === "Orders" && <OrdersPanel />}
      </section>
    </main>
  );
}
