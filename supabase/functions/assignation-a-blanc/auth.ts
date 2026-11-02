/**
 * Le secret des crons, vérifié par son empreinte (0634).
 *
 * Le bac à sable du test à blanc bloque tout appel RPC : `cron_secret_lire()`
 * (Vault, 0477) lui est fermé, et `assertAuthorised` retombait sur la variable
 * d'environnement CRON_SECRET, périmée depuis la rotation du secret. Une
 * lecture de table passe : la vue `cron_secret_empreinte` rend l'empreinte
 * SHA-256 du secret (jamais sa valeur), comparée à celle de l'en-tête reçu.
 */

/** Empreinte SHA-256, en hexadécimal minuscule. */
export async function empreinteSha256(texte: string): Promise<string> {
  const octets = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte)));
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/**
 * L'en-tête présenté est-il le secret des crons ? `lireEmpreinte` rend
 * l'empreinte attendue (ou null si illisible) : jamais bloquant, faux en cas de doute.
 */
export async function estSecretCronParEmpreinte(
  fourni: string | null | undefined,
  lireEmpreinte: () => Promise<string | null>,
): Promise<boolean> {
  if (!fourni || fourni.length < 16) return false;
  let attendue: string | null = null;
  try {
    attendue = await lireEmpreinte();
  } catch {
    return false;
  }
  if (!attendue || !/^[0-9a-f]{64}$/.test(attendue)) return false;
  return (await empreinteSha256(fourni)) === attendue;
}
