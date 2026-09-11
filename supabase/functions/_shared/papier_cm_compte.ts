/** Copie Deno de src/features/moteur/papierCmCompte.ts — garder synchro. */
/** Handles Gmail + Instagram Paper CM (Schedule A du contrat). */

export type ComptePapierCible = {
  langue: string;
  iso: string;
  slug: string;
  paysEn: string;
  email: string;
  instagram: string;
};

const CIBLES: Record<string, { iso: string; slug: string; paysEn: string }> = {
  fr: { iso: "fr", slug: "france", paysEn: "France" },
  en: { iso: "us", slug: "usa", paysEn: "United States" },
  de: { iso: "de", slug: "germany", paysEn: "Germany" },
  it: { iso: "it", slug: "italy", paysEn: "Italy" },
  es: { iso: "es", slug: "spain", paysEn: "Spain" },
  pt: { iso: "br", slug: "brazil", paysEn: "Brazil" },
  cs: { iso: "cz", slug: "czechia", paysEn: "Czechia" },
  nl: { iso: "nl", slug: "netherlands", paysEn: "Netherlands" },
  el: { iso: "gr", slug: "greece", paysEn: "Greece" },
  hu: { iso: "hu", slug: "hungary", paysEn: "Hungary" },
  pl: { iso: "pl", slug: "poland", paysEn: "Poland" },
  ro: { iso: "ro", slug: "romania", paysEn: "Romania" },
  sv: { iso: "se", slug: "sweden", paysEn: "Sweden" },
  tr: { iso: "tr", slug: "turkey", paysEn: "Turkey" },
};

export function cibleComptePapier(langue: string): ComptePapierCible {
  const code = String(langue ?? "").trim().toLowerCase();
  const row = CIBLES[code] ?? { iso: code.slice(0, 2) || "xx", slug: code || "unknown", paysEn: code.toUpperCase() };
  return {
    langue: code,
    iso: row.iso,
    slug: row.slug,
    paysEn: row.paysEn,
    email: `sophia.knowledge.${row.slug}@gmail.com`,
    instagram: `sophia.app.${row.iso}`,
  };
}

export function motDePasseComptePapier(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
