import type { LigneLot, LigneSuiviRuul } from "./api";

/** Les libellés des statuts Ruul. */
export const LIBELLE_STATUT: Record<string, string> = {
  a_ajouter: "À ajouter sur Ruul",
  invite: "Invité (compte à créer)",
  pret: "Prêt",
  paye_1x: "Payé au moins 1 fois",
  aucun: "Sans statut",
};

/** « 26/10 » */
export function jourMois(iso: string): string {
  const [, m, j] = iso.split("-").map(Number);
  return m && j ? `${j}/${m}` : iso;
}

export const dollars = (n: number) => `${Number(n).toFixed(2)} $`;

/** « 02/11 » (jour et mois sur deux chiffres, pour le fichier Ruul). */
export function jourMoisPadde(iso: string): string {
  const [, m, j] = iso.split("-").map(Number);
  return m && j ? `${String(j).padStart(2, "0")}/${String(m).padStart(2, "0")}` : iso;
}

/** « 26/10 » pour une date ou un horodatage ISO (on garde la partie date) ; « — » si vide. */
export function jourMoisOuTiret(iso: string | null | undefined): string {
  return iso ? jourMois(iso.slice(0, 10)) : "—";
}

/** L'en-tête du fichier d'import en masse de Ruul. */
export const ENTETE_CSV_RUUL = ["email", "amount_usd", "description"];

/**
 * Le fichier d'import en masse de Ruul : une ligne par posteur payé
 * [email Ruul, montant (2 décimales), description en anglais]. La description :
 * « Week of 26/10 + 02/11 », suivie de « + referral bonus » s'il y a un bonus.
 * Sans email Ruul ou sans montant : pas de ligne (Ruul refuserait le fichier).
 */
export function lignesCsvLot(lignes: LigneLot[]): (string | number)[][] {
  return lignes
    .filter((l) => Number(l.total) > 0 && l.ruul_email)
    .map((l) => {
      const semaines = l.semaines.map((s) => jourMoisPadde(s.semaine));
      const bonus = Number(l.bonus ?? 0) > 0;
      const description = semaines.length > 0
        ? `Week of ${semaines.join(" + ")}${bonus ? " + referral bonus" : ""}`
        : bonus ? "Referral bonus" : "Payment";
      return [String(l.ruul_email), Number(l.total).toFixed(2), description];
    });
}

/**
 * L'export Ruul (CSV) : la colonne email et la colonne montant, trouvées par
 * leur en-tête (email / e-mail ; amount / montant / total / paid). Séparateur
 * « , » ou « ; », guillemets gérés.
 */
export function lireExportRuul(texte: string): { email: string; montant: string }[] | { erreur: string } {
  const lignes = texte.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lignes.length < 2) return { erreur: "fichier vide" };
  const sep = (lignes[0].match(/;/g) ?? []).length > (lignes[0].match(/,/g) ?? []).length ? ";" : ",";
  const decouper = (l: string) => {
    const cases: string[] = [];
    let cur = "";
    let guill = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (guill && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else guill = !guill;
      } else if (c === sep && !guill) {
        cases.push(cur);
        cur = "";
      } else cur += c;
    }
    cases.push(cur);
    return cases.map((x) => x.trim());
  };
  const entetes = decouper(lignes[0]).map((h) => h.toLowerCase());
  const iEmail = entetes.findIndex((h) => /e-?mail/.test(h));
  const iMontant = entetes.findIndex((h) => /amount|montant|total|paid/.test(h));
  if (iEmail < 0 || iMontant < 0) return { erreur: "colonnes email et montant introuvables" };
  return lignes.slice(1).map(decouper)
    .filter((c) => c[iEmail])
    .map((c) => ({ email: c[iEmail], montant: (c[iMontant] ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".") }));
}

/** Les étapes d'un posteur Ruul, dans l'ordre (page Cohortes Ruul). */
export const ETAPES_RUUL: { cle: string; libelle: string }[] = [
  { cle: "candidature", libelle: "Candidature" },
  { cle: "acceptee", libelle: "Acceptée" },
  { cle: "signee", libelle: "Signée" },
  { cle: "ajoute_ruul", libelle: "Ajouté Ruul" },
  { cle: "pret", libelle: "Prêt Ruul" },
  { cle: "slack", libelle: "Slack" },
  { cle: "os", libelle: "OS connecté" },
  { cle: "warmup", libelle: "Warm-up" },
  { cle: "premier_post", libelle: "1er post" },
  { cle: "premiere_paie", libelle: "1re paie" },
];

/**
 * L'étape bloquée : la première étape pas faite, si la précédente est faite
 * depuis plus de 48 h (en rouge). null : rien de bloqué.
 */
export function etapeBloquee(etapes: Record<string, string | null>, maintenant = new Date()): string | null {
  for (let i = 1; i < ETAPES_RUUL.length; i++) {
    const cle = ETAPES_RUUL[i].cle;
    if (etapes[cle]) continue;
    const avant = etapes[ETAPES_RUUL[i - 1].cle];
    if (avant && maintenant.getTime() - new Date(avant).getTime() > 48 * 3_600_000) return cle;
    return null;
  }
  return null;
}

/** Les jours entiers écoulés depuis un horodatage ISO. */
export function joursDepuis(iso: string, maintenant = new Date()): number {
  return Math.max(0, Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** Les colonnes d'étapes de la page « Ruul » (10/11), dans l'ordre, et le mot qui reconnaît le libellé de l'étape bloquée. */
export const COLONNES_SUIVI_RUUL: { cle: string; libelle: string; motif: RegExp; fait: (l: LigneSuiviRuul) => boolean; valeur: (l: LigneSuiviRuul) => string }[] = [
  { cle: "signe", libelle: "Signé", motif: /sign/i, fait: (l) => !!l.signe_at, valeur: (l) => jourMoisOuTiret(l.signe_at) },
  { cle: "compte_os", libelle: "Compte OS", motif: /compte/i, fait: (l) => !!l.compte_os_at, valeur: (l) => jourMoisOuTiret(l.compte_os_at) },
  { cle: "connexion", libelle: "1re connexion", motif: /connexion|connect/i, fait: (l) => !!l.premiere_connexion_at, valeur: (l) => jourMoisOuTiret(l.premiere_connexion_at) },
  { cle: "email", libelle: "Email Ruul", motif: /e-?mail/i, fait: (l) => !!l.ruul_email, valeur: (l) => l.ruul_email ?? "—" },
  { cle: "ajoute", libelle: "Ajouté dans Ruul", motif: /ajout/i, fait: (l) => !!l.ruul_ajoute_at, valeur: (l) => jourMoisOuTiret(l.ruul_ajoute_at) },
  { cle: "post", libelle: "1er post", motif: /post/i, fait: (l) => !!l.premier_post_at, valeur: (l) => jourMoisOuTiret(l.premier_post_at) },
  {
    cle: "paie",
    libelle: "Dernière paie",
    motif: /paie|pay/i,
    fait: (l) => !!(l.derniere_paie_at || l.derniere_paie_semaine),
    valeur: (l) =>
      l.derniere_paie_at
        ? jourMoisOuTiret(l.derniere_paie_at) + (l.derniere_paie_semaine ? ` (sem. du ${jourMois(l.derniere_paie_semaine)})` : "")
        : l.derniere_paie_semaine ? `sem. du ${jourMois(l.derniere_paie_semaine)}` : "—",
  },
];

/**
 * La colonne à mettre en rouge pour un posteur bloqué : celle que nomme
 * `bloque_etape` (libellé français de la base), sinon la première étape pas faite.
 */
export function colonneBloquee(l: LigneSuiviRuul): string | null {
  const etape = l.bloque_etape ?? "";
  const parLibelle = etape ? COLONNES_SUIVI_RUUL.find((c) => c.motif.test(etape)) : undefined;
  if (parLibelle) return parLibelle.cle;
  return COLONNES_SUIVI_RUUL.find((c) => !c.fait(l))?.cle ?? null;
}
