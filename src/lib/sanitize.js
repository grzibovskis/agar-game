const USERNAME_ALLOWED_CHARS = /[^a-zA-Z0-9 _-]/g;

export function sanitizeUsername(input, maxLength = 18) {
  const raw = typeof input === "string" ? input : "";

  // Keep usernames predictable and scanner-friendly: alnum, space, underscore, dash.
  const cleaned = raw
    .replace(USERNAME_ALLOWED_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  return cleaned;
}
