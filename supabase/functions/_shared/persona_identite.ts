/**
 * Tirage de l'identité d'un compte (pseudo, nom affiché, bio) : pur, sans base
 * ni réseau, pour être testé. Les listes sont dans persona_donnees.ts, les
 * bios dans persona_bios.ts.
 *
 * Deux façons d'écrire le @, selon le thème du label :
 *  - le format classique, `prenom.mot` + 3 chiffres (« jakob.disziplin473 ») :
 *    prénom selon la LANGUE et le GENRE du compte, mot selon le thème du LABEL,
 *    dans la langue du compte ou en anglais ;
 *  - les @ VARIÉS (`THEMES_VARIES` : le running d'Atala, l'art d'Artura) : une forme
 *    différente à chaque compte, et un mot du thème moins d'une fois sur cinq.
 *    Voir persona_handles_varies.ts.
 */
import { themeMotsDuLabel, type Genre, type ThemeMots } from "./label_theme.ts";
import { composerBio } from "./persona_bios.ts";
import { MOTS_PAR_THEME, MOTS_UNIVERSELS, NOMS_PAR_LANGUE } from "./persona_donnees.ts";
import { HANDLE_MAX, tirerHandleVarie } from "./persona_handles_varies.ts";

export { HANDLE_MAX };

type Hasard = () => number;

const CHIFFRES = 3;

/**
 * Les thèmes dont les comptes prennent un @ varié plutôt que `prenom.mot123`.
 * Le running d'abord (19/11) : trente comptes Atala « prenom.<mot de course>123 »
 * se reconnaissaient au premier coup d'œil. Ajouter un thème ici suffit à le
 * faire passer aux @ variés (ses mots restent ceux de persona_donnees.ts).
 * L'art ensuite (23/11) : mêmes raisons pour les comptes Artura.
 */
export const THEMES_VARIES: ReadonlySet<ThemeMots> = new Set<ThemeMots>(["running", "art"]);

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

interface EntreeIdentite {
  langue: string;
  genre: Genre;
  labelNom?: string | null;
  /** Racines de @ déjà prises dans la base (voir `racineHandle`). */
  racinesPrises: Set<string>;
  /** Noms affichés déjà pris, en minuscules. */
  nomsPris: Set<string>;
  annee: number;
}

/**
 * L'identité d'un compte à @ varié. Le prénom et le nom de famille sont tirés
 * d'abord : le @ les reprend souvent (« emma.mrtn » pour Emma Martin), le nom
 * affiché est toujours le même couple. Jamais une racine de @ déjà prise tant
 * qu'il en reste ; pendant la première moitié des essais, jamais un nom
 * affiché déjà pris non plus.
 */
function composerIdentiteVariee(
  entree: EntreeIdentite,
  theme: ThemeMots,
  hasard: Hasard,
): { handle: string; nom: string; bio: string } {
  const jeu = NOMS_PAR_LANGUE[entree.langue] ?? NOMS_PAR_LANGUE.en!;
  const prenoms = entree.genre === "homme" ? jeu.prenomsH : jeu.prenomsF;
  const { locaux, universels } = motsDuHandle(entree.labelNom, entree.langue);
  // Les mots de la langue du compte comptent double : sans ça l'anglais, plus fourni, les noierait.
  const motsTheme = [...locaux, ...locaux, ...universels];
  const tirer = <T>(liste: readonly T[], defaut: T): T => liste[Math.floor(hasard() * liste.length)] ?? defaut;
  const nomAffiche = (prenom: string, nomFamille: string) => `${capitaliser(prenom)} ${capitaliser(nomFamille)}`;

  const ESSAIS = 400;
  let choisi: { handle: string; prenom: string; nomFamille: string } | null = null;
  let secours: { handle: string; prenom: string; nomFamille: string } | null = null;
  for (let essai = 0; essai < ESSAIS && !choisi; essai += 1) {
    const prenom = tirer(prenoms, "alex");
    const nomFamille = tirer(jeu.noms, "martin");
    const handle = tirerHandleVarie(
      { prenom, nomFamille, genre: entree.genre, langue: entree.langue, annee: entree.annee, motsTheme, theme },
      hasard,
    );
    const candidat = { handle, prenom, nomFamille };
    secours ??= candidat;
    if (entree.racinesPrises.has(racineHandle(handle))) continue;
    if (essai < ESSAIS / 2 && entree.nomsPris.has(nomAffiche(prenom, nomFamille).toLowerCase())) continue;
    choisi = candidat;
  }
  // Tout est pris (jamais vu) : la première racine tirée, que seuls ses chiffres distingueront.
  const retenu = choisi ?? {
    ...secours!,
    handle: `${racineHandle(secours!.handle).slice(0, HANDLE_MAX - CHIFFRES)}${Math.floor(hasard() * 900) + 100}`,
  };
  const bio = composerBio(
    { prenom: retenu.prenom, langue: entree.langue, theme, annee: entree.annee },
    hasard,
  );
  return { handle: retenu.handle, nom: nomAffiche(retenu.prenom, retenu.nomFamille), bio };
}

export function composerIdentite(
  entree: EntreeIdentite,
  hasard: Hasard = Math.random,
): { handle: string; nom: string; bio: string } {
  const theme = themeMotsDuLabel(entree.labelNom);
  if (THEMES_VARIES.has(theme)) return composerIdentiteVariee(entree, theme, hasard);
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
