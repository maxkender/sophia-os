/**
 * 10/11 : le site des posteurs est maintenant https://vik-studios-creators.com
 * (sophia-culture.com ne pointe plus dessus ; l'expéditeur des emails,
 * noreply@sophia-culture.com, ne change pas).
 */
export const URL_SITE = "https://vik-studios-creators.com";

/** L'envoi d'email par le site (os-email) ; os-candidatures en est déduit. */
export const URL_EMAIL_SITE = `${URL_SITE}/api/public/os-email`;

/**
 * L'URL d'envoi d'email du site : le secret HUB_EMAIL_URL, sauf s'il est vide
 * ou pointe encore sur l'ancien domaine sophia-culture.com.
 */
export function urlEmailSite(valeur: string | null | undefined = envHubEmail()): string {
  const v = (valeur ?? "").trim();
  return !v || /sophia-culture\.com/i.test(v) ? URL_EMAIL_SITE : v;
}

/** Le secret HUB_EMAIL_URL (Deno) ; aussi importable côté front (sans Deno). */
function envHubEmail(): string | undefined {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get("HUB_EMAIL_URL");
}
