/** Normalise un @handle TikTok pour insert / lookup. */
export function normaliserHandleTiktok(handle: string): string {
  const brut = handle.trim();
  const depuisUrl = brut.match(
    /^https?:\/\/(?:www\.)?tiktok\.com\/@([^/?#]+)/iu,
  );
  const noyau = depuisUrl?.[1] ?? brut;
  return noyau.replace(/^@+/u, "").replace(/\/+$/u, "").trim();
}

export function estErreurHandleUnique(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "23505" ||
    /comptes_reference_handle_tiktok_key/i.test(message) ||
    /duplicate key value/i.test(message)
  );
}
