import { NextResponse } from "next/server";
import { validateMember, type MemberInput } from "@/lib/member-validation";
import { requireMemberAdmin } from "@/lib/member-admin";
import { getErrorMessage } from "@/lib/error-message";

export const runtime = "nodejs";

function toRow(input: MemberInput) {
  return {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
  };
}

export async function GET() {
  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;

    const { data, error } = await supabase
      .from("member")
      .select("id, first_name, last_name, email, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unable to list members:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to load members.") },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  let input: MemberInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const errors = validateMember(input);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Please correct the member details.", fields: errors }, { status: 422 });
  }

  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;

    const { data, error } = await supabase
      .from("member")
      .insert(toRow(input))
      .select("id, first_name, last_name, email, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A member with this email already exists." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Unable to create member:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to create member.") },
      { status: 503 }
    );
  }
}
