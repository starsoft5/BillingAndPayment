import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function requireMemberAdmin() {
  const supabase = await getSupabase();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      supabase,
      response: NextResponse.json({ error: "Sign in to manage members." }, { status: 401 }),
    };
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_member_admin");
  if (adminError) throw adminError;
  if (!isAdmin) {
    return {
      supabase,
      response: NextResponse.json({ error: "You are not authorized to manage members." }, { status: 403 }),
    };
  }

  return { supabase, response: null };
}
