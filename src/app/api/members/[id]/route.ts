import { NextResponse } from "next/server";
import { validateMember, type MemberInput } from "@/lib/member-validation";
import { requireMemberAdmin } from "@/lib/member-admin";
import { getErrorMessage } from "@/lib/error-message";

type RouteContext = { params: Promise<{ id: string }> };

function parseMemberId(id: string) {
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function toRow(input: MemberInput) {
  return {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
  };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const memberId = parseMemberId(id);
  if (memberId === null) return NextResponse.json({ error: "Invalid member ID." }, { status: 400 });

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
      .update(toRow(input))
      .eq("id", memberId)
      .select("id, first_name, last_name, email, created_at")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A member with this email already exists." }, { status: 409 });
      }
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unable to update member:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to update member.") },
      { status: 503 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const memberId = parseMemberId(id);
  if (memberId === null) return NextResponse.json({ error: "Invalid member ID." }, { status: 400 });

  try {
    const { supabase, response } = await requireMemberAdmin();
    if (response) return response;

    const { data, error } = await supabase
      .from("member")
      .delete()
      .eq("id", memberId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Unable to delete member:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to delete member.") },
      { status: 503 }
    );
  }
}
