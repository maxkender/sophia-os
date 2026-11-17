/**
 * Tirage de l'identité d'un compte (pseudo, nom affiché, bio) : pur, sans base
 * ni réseau, pour être testé. Les listes sont dans persona_donnees.ts, les
 * bios dans persona_bios.ts.
 *
 * Format du @ : `prenom.mot` + 3 chiffres — ex. « jakob.disziplin473 ».
 * — Prénom / nom : selon la LANGUE du compte + le GENRE
 * — Mot : selon le thème du LABEL, dans la langue du compte ou en anglais
 */
import { themeMotsDuLabel, type Genre } from "./label_theme.ts";
import { composerBio } from "./persona_bios.ts";
import { MOTS_PAR_THEME, MOTS_UNIVERSELS, NOMS_PAR_LANGUE } from "./persona_donnees.ts";

type Hasard = () => number;

/** TikTok refuse un @ de plus de 24 caractères. */
export const HANDLE_MAX = 24;
const CHIFFRES = 3;

/** Part des @ dont le mot est pris dans la langue du compte (le reste : anglais). */
const PART_MOT_LOCAL = 0.65;

/** La racine d'un @ : sans ses chiffres de fin, en minuscules. */
export function racineHandle(handle: string): string {
  return handle.replace(/\d+$/, "").toLowerCase();
}

function capitaliser(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Mélange une copie du tableau (Fisher-Yates). */
function melanger<T>(arr: T[], hasard: Hasard): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(hasard() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Les mots du @ pour un label et une langue : ceux de la langue, puis l'anglais commun. */
export function motsDuHandle(
  labelNom: string | null | undefined,
  langue: string,
): { locaux: string[]; universels: string[] } {
  const theme = themeMotsDuLabel(labelNom);
  const parLangue = MOTS_PAR_THEME[theme] ?? MOTS_PAR_THEME.default;
  const locaux = parLangue[langue] ?? parLangue.en ?? [];
  const universels = (MOTS_UNIVERSELS[theme] ?? MOTS_UNIVERSELS.default).filter(
    (m) => !locaux.includes(m),
  );
  return { locaux, universels };
}

export function composerIdentite(
  entree: {
    langue: string;
    genre: Genre;
    labelNom?: string | null;
    /** Racines de @ déjà prises dans la base (voir `racineHandle`). */
    racinesPrises: Set<string>;
    /** Noms affichés déjà pris, en minuscules. */
    nomsPris: Set<string>;
    annee: number;
  },
  hasard: Hasard = Math.random,
): { handle: string; nom: string; bio: string } {
  const jeu = NOMS_PAR_LANGUE[entree.langue] ?? NOMS_PAR_LANGUE.en!;
  const prenoms = entree.genre === "homme" ? jeu.prenomsH : jeu.prenomsF;
  const { locaux, universels } = motsDuHandle(entree.labelNom, entree.langue);

  const racineMax = HANDLE_MAX - CHIFFRES;
  const ordreMots = () =>
    hasard() < PART_MOT_LOCAL
      ? [...melanger(locaux, hasard), ...melanger(universels, hasard)]
      : [...melanger(universels, hasard), ...melanger(locaux, hasard)];

  // Première paire prénom.mot libre ; à défaut (tout est pris), la première
  // paire assez courte, que seuls ses chiffres distingueront.
  let prenom = "";
  let racine = "";
  let secours: { prenom: string; racine: string } | null = null;
  for (const p of melanger(prenoms, hasard)) {
    for (const mot of ordreMots()) {
      const r = `${p}.${mot}`;
      if (r.length > racineMax) continue;
      secours ??= { prenom: p, racine: r };
      if (!entree.racinesPrises.has(r)) {
        prenom = p;
        racine = r;
        break;
      }
    }
    if (racine) break;
  }
  if (!racine) {
    prenom = secours?.prenom ?? prenoms[0] ?? "alex";
    racine = secours?.racine ?? `${prenom}.culture`.slice(0, racineMax);
  }

  let nom = `${capitaliser(prenom)} ${capitaliser(jeu.noms[0] ?? "martin")}`;
  for (const nf of melanger(jeu.noms, hasard)) {
    const candidat = `${capitaliser(prenom)} ${capitaliser(nf)}`;
    if (!entree.nomsPris.has(candidat.toLowerCase())) {
      nom = candidat;
      break;
    }
  }

  const handle = `${racine}${Math.floor(hasard() * 900) + 100}`;
  const bio = composerBio(
    {
      prenom,
      langue: entree.langue,
      theme: themeMotsDuLabel(entree.labelNom),
      annee: entree.annee,
    },
    hasard,
  );
  return { handle, nom, bio };
}
