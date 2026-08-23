export function normalizeSessionUserName(userName: string): string {
  const normalizedName = userName.trim().replace(/\s+/g, " ");

  if (!normalizedName) {
    throw new Error("userName must not be blank");
  }

  if (normalizedName.length > 80) {
    throw new Error("userName must be 80 characters or fewer");
  }

  return normalizedName;
}
