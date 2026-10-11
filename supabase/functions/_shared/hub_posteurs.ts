/**
 * Helpers purs de `hub-posteurs` (le point d'entrée que le Hub appelle pour les
 * posteurs venus du site). Sans I/O, testés dans `hub_posteurs_test.ts`.
 *
 * Deux règles métier vivent ici :
 *   - À QUEL RECRUTEUR rattacher un posteur selon son pays : la zone d'un
 *     recruteur est un texte de la master list (« Spain + Portugal »,
 *     « Estonia + Finland + Russian-speaking »). On cherche le nom du pays comme
 *     MOT ENTIER, sans casse ni accents, pour que « Russia » ne matche jamais
 *     « Russian-speaking » et que « Portugal » tombe bien sur « Spain +
 *     Portugal ». Plusieurs recruteurs pour le même pays : le premier actif,
 *     dans l'ordre reçu (l'appelant trie comme il veut).
 *   - LES BORNES D'UNE SEMAINE Paris : lundi 00:00 → lundi suivant 00:00,
 *     exprimées en instants UTC pour comparer des `timestamptz`. Sans ça, un
 *     post publié dimanche 23:30 à Paris (21:30 UTC en été) tomberait dans la
 *     mauvaise semaine.
 */

export interface RecruteurZone {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  zone_recrutement: string | null;
  is_active?: boolean | null;
}

/** Minuscules, sans accents ni diacritiques, espaces réduits. */
export function normaliserTexte(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Le pays apparaît-il comme mot entier dans la zone ? */
export function zoneCouvrePays(zone: string | null | undefined, paysNom: string): boolean {
  const z = normaliserTexte(zone);
  const p = normaliserTexte(paysNom);
  if (!z || !p) return false;
  // Découpe sur tout ce qui n'est pas une lettre : « + », virgules, « / »…
  // Le tiret reste DANS le mot (« russian-speaking » ≠ « russian »).
  const mots = z.split(/[^a-z-]+/).filter(Boolean);
  const cible = p.split(/[^a-z-]+/).filter(Boolean);
  if (cible.length === 0) return false;
  // Pays à plusieurs mots (« united kingdom ») : séquence contiguë.
  for (let i = 0; i + cible.length <= mots.length; i += 1) {
    let ok = true;
    for (let j = 0; j < cible.length; j += 1) {
      if (mots[i + j] !== cible[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Premier recruteur actif dont la zone couvre ce pays, sinon null. */
export function trouverRecruteurPourPays(
  recruteurs: RecruteurZone[],
  paysNom: string,
): RecruteurZone | null {
  for (const r of recruteurs) {
    if (r.is_active === false) continue;
    if (zoneCouvrePays(r.zone_recrutement, paysNom)) return r;
  }
  return null;
}

/** Décalage Paris (minutes) à un instant donné : +120 en été, +60 en hiver. */
function decalageParisMinutes(instant: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "00" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((local - instant.getTime()) / 60_000);
}

/** Instant UTC de `YYYY-MM-DD 00:00` à Paris. */
export function minuitParis(jourIso: string): Date {
  const [a, m, j] = jourIso.split("-").map(Number);
  if (!a || !m || !j) throw new Error(`Date invalide : ${jourIso}`);
  const approx = new Date(Date.UTC(a, m - 1, j, 0, 0, 0));
  // Deux passes : le décalage lu à l'approximation suffit sauf à l'heure même
  // du changement d'heure, où la seconde lecture corrige.
  let decalage = decalageParisMinutes(approx);
  let instant = new Date(approx.getTime() - decalage * 60_000);
  decalage = decalageParisMinutes(instant);
  instant = new Date(approx.getTime() - decalage * 60_000);
  return instant;
}

export interface BornesSemaine {
  /** Lundi 00:00 Paris, en ISO UTC. */
  debut: string;
  /** Lundi suivant 00:00 Paris, en ISO UTC (borne exclue). */
  fin: string;
  /** Les 7 dates `YYYY-MM-DD` de la semaine. */
  jours: string[];
}

/** La semaine Paris qui commence au lundi `lundiIso`. Refuse un jour qui n'est pas un lundi. */
export function bornesSemaineParis(lundiIso: string): BornesSemaine {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lundiIso)) throw new Error(`Lundi attendu au format YYYY-MM-DD : ${lundiIso}`);
  const [a, m, j] = lundiIso.split("-").map(Number);
  const jourSemaine = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  if (jourSemaine !== 1) throw new Error(`${lundiIso} n'est pas un lundi`);
  const jours: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(Date.UTC(a, m - 1, j + i));
    jours.push(d.toISOString().slice(0, 10));
  }
  const finDate = new Date(Date.UTC(a, m - 1, j + 7)).toISOString().slice(0, 10);
  return { debut: minuitParis(lundiIso).toISOString(), fin: minuitParis(finDate).toISOString(), jours };
}

const ALPHABET_MDP = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Mot de passe temporaire : 12 caractères lisibles (ni 0/O ni l/1/I). */
export function genererMotDePasse(longueur = 12, aleatoire: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < longueur; i += 1) {
    s += ALPHABET_MDP[Math.floor(aleatoire() * ALPHABET_MDP.length)];
  }
  return s;
}

/** Comparaison en temps constant de deux secrets (évite de dater la comparaison). */
export function secretsEgaux(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i += 1) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Stats d'une semaine pour un posteur, à partir de ses passages / vidéos. */
export interface LigneSemaine {
  profile_id: string;
  prevus: number;
  publies: number;
  manques: number;
  dernier_post_at: string | null;
  is_active: boolean;
}

export interface PassageSemaine {
  compte_id: string;
  date_publication_prevue: string | null;
  statut: string | null;
  publie_at: string | null;
}

/**
 * Agrège les passages d'un posteur sur une semaine. `prevus` = passages dont
 * la date prévue tombe dans la semaine, hors brouillons ; `publies` = passages
 * publiés dans la fenêtre [debut, fin) ; `manques` = max(prevus − publies, 0).
 */
export function agregerSemaine(
  profileId: string,
  isActive: boolean,
  passages: PassageSemaine[],
  bornes: BornesSemaine,
): LigneSemaine {
  const jours = new Set(bornes.jours);
  let prevus = 0;
  let publies = 0;
  let dernier: string | null = null;
  for (const p of passages) {
    if (p.date_publication_prevue && jours.has(p.date_publication_prevue) && p.statut !== "brouillon") {
      prevus += 1;
    }
    if (p.publie_at) {
      if (p.publie_at >= bornes.debut && p.publie_at < bornes.fin) publies += 1;
      if (!dernier || p.publie_at > dernier) dernier = p.publie_at;
    }
  }
  return {
    profile_id: profileId,
    prevus,
    publies,
    manques: Math.max(prevus - publies, 0),
    dernier_post_at: dernier,
    is_active: isActive,
  };
}
