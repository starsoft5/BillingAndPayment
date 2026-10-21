"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("Supabase is not configured. Set the project URL and anon key.");
  }

  if (/your-|example|placeholder/i.test(url) || /your-|example|placeholder/i.test(anonKey)) {
    throw new Error(
      "Replace the example Supabase URL and anon key in .env.local with your project settings, then restart the dev server."
    );
  }

  try {
    const parsedUrl = new URL(url);
    if (
      (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") ||
      !parsedUrl.hostname
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("The Supabase project URL in .env.local is not a valid HTTPS URL.");
  }

  return createBrowserClient(url, anonKey);
}
