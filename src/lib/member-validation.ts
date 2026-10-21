export type MemberInput = {
  firstName: string;
  lastName: string;
  email: string;
};

export type MemberErrors = Partial<Record<keyof MemberInput, string>>;

const namePattern = /^[\p{L}\p{M}]+(?:[ '-.][\p{L}\p{M}]+)*$/u;
const emailLocalPattern =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const emailDomainPattern =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function validateMemberField(
  field: keyof MemberInput,
  value: unknown
): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (field === "firstName" || field === "lastName") {
    const label = field === "firstName" ? "First name" : "Last name";
    if (!normalized) return `Enter ${field === "firstName" ? "a first" : "a last"} name.`;
    if ([...normalized].length < 2 || [...normalized].length > 50) {
      return `${label} must be 2–50 characters.`;
    }
    if (!namePattern.test(normalized)) {
      return "Use letters, spaces, apostrophes, periods, or hyphens only.";
    }
    return undefined;
  }

  if (!normalized) return "Enter an email address.";
  if (normalized.length > 254) return "Email address must be 254 characters or fewer.";

  const parts = normalized.split("@");
  if (
    parts.length !== 2 ||
    parts[0].length > 64 ||
    !emailLocalPattern.test(parts[0]) ||
    !emailDomainPattern.test(parts[1])
  ) {
    return "Enter a valid email address.";
  }

  return undefined;
}

export function validateMember(input: MemberInput): MemberErrors {
  const errors: MemberErrors = {};

  for (const field of ["firstName", "lastName", "email"] as const) {
    const error = validateMemberField(field, input?.[field]);
    if (error) errors[field] = error;
  }

  return errors;
}
