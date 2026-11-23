/**
 * Les labels rangés par application, pour la carte Labels : un groupe par
 * application (dans l'ordre du catalogue), puis les labels qui ne servent
 * personne. Un label qui sert deux applications est dans les deux groupes :
 * chaque groupe répond à « qu'est-ce que cette application peut publier ? ».
 */
import { applicationsDuLabel, type LienLabelApplication } from "../multiApp";
import { themeMotsDuLabel, type ThemeMots } from "../themeLabel";

export interface GroupeLabels<L, A> {
  /** L'application du groupe ; `null` = les labels sans application. */
  application: A | null;
  labels: L[];
}

export function grouperLabelsParApplication<L extends { id: string }, A extends { id: string }>(
  labels: readonly L[],
  applications: readonly A[],
  liens: readonly LienLabelApplication[],
): GroupeLabels<L, A>[] {
  const serviesPar = new Map(labels.map((l) => [l.id, applicationsDuLabel(l.id, liens)]));
  const groupes: GroupeLabels<L, A>[] = applications.map((application) => ({
    application,
    labels: labels.filter((l) => serviesPar.get(l.id)!.includes(application.id)),
  }));
  const connues = new Set(applications.map((a) => a.id));
  // Sans application, ou seulement des applications que la liste ne connaît pas.
  const sans = labels.filter((l) => !serviesPar.get(l.id)!.some((id) => connues.has(id)));
  if (sans.length > 0) groupes.push({ application: null, labels: sans });
  return groupes;
}

/**
 * Le thème qu'on attend des labels d'une application, et la fin de nom qui le
 * donne. Un label Atala qui ne finit pas par « _run » marche, mais ses comptes
 * auraient un @ et une bio de culture générale : le formulaire le dit.
 */
export const THEME_ATTENDU: Readonly<Record<string, { theme: ThemeMots; suffixe: string }>> = {
  atala: { theme: "running", suffixe: "_run" },
  artura: { theme: "art", suffixe: "_art" },
  micabo: { theme: "etude", suffixe: "_study" },
};

/**
 * Les thèmes dont les comptes prennent des @ variés (une forme différente à
 * chaque compte, le thème dans moins d'un @ sur cinq, toujours un nombre) au
 * lieu de `prenom.mot123`, avec quelques exemples de ce que ça donne. Les
 * mêmes thèmes que `THEMES_VARIES` du moteur (persona_identite.ts) : un test
 * le vérifie.
 */
export const EXEMPLES_VARIES: Readonly<Partial<Record<ThemeMots, readonly string[]>>> = {
  running: ["emma.mrtn04", "itsleaa217", "clara_bonnet482", "lou2003.sunday", "slow.mornings914"],
  art: ["chloe.drnd07", "ines.museum2002", "itsjulia318", "sunday.frames461", "lou_canvas88"],
};

/** Un @ d'exemple par thème, pour montrer à quoi ressembleront les comptes du label. */
export const EXEMPLE_HANDLE: Readonly<Record<ThemeMots, string>> = {
  running: "emma.mrtn04",
  art: "chloe.drnd07",
  etude: "lea.revisions318",
  carriere: "emma.career204",
  psycho: "noah.mind611",
  philo: "marc.stoic530",
  alpha_male: "jakob.discipline473",
  smart_girl: "lena.books129",
  clean_girl: "mia.glow385",
  cinema: "leo.cinema742",
  anciens: "max.history356",
  default: "lea.culture218",
};

/**
 * L'identité que le nom d'un label donne à ses comptes, et si elle colle à
 * l'application choisie. `varies` : les exemples d'un thème aux @ variés,
 * `null` pour le format classique (`exemple`).
 */
export function identiteDuNom(
  nom: string,
  slugApplication: string | null,
): {
  theme: ThemeMots;
  exemple: string;
  varies: readonly string[] | null;
  attendu: { theme: ThemeMots; suffixe: string } | null;
} {
  const theme = themeMotsDuLabel(nom);
  const attendu = slugApplication ? (THEME_ATTENDU[slugApplication] ?? null) : null;
  return {
    theme,
    exemple: EXEMPLE_HANDLE[theme],
    varies: EXEMPLES_VARIES[theme] ?? null,
    attendu: attendu && attendu.theme !== theme ? attendu : null,
  };
}
