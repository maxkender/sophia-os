/** Copie Deno de src/features/moteur/papierCmCompte.ts — naming Gmail + Instagram. */

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
  const row = CIBLES[code] ?? {
    iso: code.slice(0, 2) || "xx",
    slug: code || "unknown",
    paysEn: code.toUpperCase(),
  };
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
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function identifiantsCmDepuisLangue(
  langue: string,
  saisie: { handle?: string; email?: string; password?: string } = {},
) {
  const cible = cibleComptePapier(langue);
  const handle = String(saisie.handle ?? "").trim().replace(/^@+/, "");
  const email = String(saisie.email ?? "").trim();
  const password = String(saisie.password ?? "");
  return {
    handle_tiktok: handle || cible.instagram,
    tiktok_email: email || cible.email,
    tiktok_password: password || motDePasseComptePapier(),
  };
}
