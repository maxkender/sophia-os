/** Handles Gmail + Instagram Paper CM (Schedule A du contrat). */

export const CONTRAT_PAPIER_VERSION = "vik-sm-2026-09-11-auto";

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

/** Handle Instagram + Gmail du contrat — le HM ne les tape plus. */
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

export type StatutContratPapier = "envoye" | "signe" | "annule";

export function contratPapierEnAttente(statut: string | null | undefined): boolean {
  return statut === "envoye";
}

export function contratPapierSigne(statut: string | null | undefined): boolean {
  return statut === "signe";
}

export function normaliserNomLegal(nom: string): string {
  return nom.trim().replace(/\s+/g, " ");
}

export function signaturesCorrespondent(nomLegal: string, signature: string): boolean {
  const a = normaliserNomLegal(nomLegal).toLowerCase();
  const b = normaliserNomLegal(signature).toLowerCase();
  return a.length >= 3 && a === b;
}

export function validerSignatureContrat(input: {
  nomLegal: string;
  pays: string;
  signature: string;
  lu: boolean;
  accepte: boolean;
}): string | null {
  if (normaliserNomLegal(input.nomLegal).length < 3) return "papierContrat.errNom";
  if (!input.pays.trim()) return "papierContrat.errPays";
  if (!signaturesCorrespondent(input.nomLegal, input.signature)) return "papierContrat.errSignature";
  if (!input.lu || !input.accepte) return "papierContrat.errCases";
  return null;
}
