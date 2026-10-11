export function getSystemUserId(): string {
  const id = process.env.SYSTEM_USER_ID?.trim();
  if (!id) {
    throw new Error("SYSTEM_USER_ID is not configured");
  }
  return id;
}
