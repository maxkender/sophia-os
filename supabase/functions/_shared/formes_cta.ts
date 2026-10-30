/**
 * Étape 4 de la réécriture native : le CTA mesurable (docs/cta.md).
 *
 * - La liste FIXE des formes de CTA : sans liste fixe, on ne peut rien compter.
 * - Le classement d'un CTA publié dans une forme (Gemini, une fois par texte).
 * - Les poids du tirage d'un label, calculés chaque lundi à contenu égal, et la
 *   fiche label qui les explique (`bleo_fiches`, sorte `label`).
 *
 * Copie côté OS : src/features/relectureNative/formesCta.ts (un test vérifie
 * que les deux listes restent identiques).
 */

export interface FormeCta {
  code: string;
  nom: string;
  definition: string;
  exemple: string;
}

/**
 * Les 7 formes, dans l'ordre de priorité du classement : un CTA qui relève de
 * deux formes prend la première de la liste.
 */
export const FORMES_CTA: ReadonlyArray<FormeCta> = [
  {
    code: "format_du_post",
    nom: "Dans le format du post",
    definition:
      "L'appli est glissée dans le gabarit propre au post : définition et exemple, ❌ / ✅, jour N, tier list, question-réponse.",
    exemple: "« érudit : qui a une grande culture. exemple : utilise une appli comme Sophia pour le devenir »",
  },
  {
    code: "avant_apres",
    nom: "Avant / après",
    definition:
      "Un récit à la 1re personne : un problème ou un déclic, puis ce qui a changé avec l'appli.",
    exemple: "« je pensais que ça venait avec l'expérience. maintenant j'utilise l'appli Sophia… »",
  },
  {
    code: "habitude_perso",
    nom: "Mon habitude",
    definition: "Le créateur dit qu'il utilise l'appli, au présent, souvent à un moment de sa journée.",
    exemple: "« j'utilise l'appli Sophia tous les matins pendant mon café »",
  },
  {
    code: "ce_quils_font",
    nom: "Ce que font les autres",
    definition: "À la 3e personne : ce que font les gens qu'on admire, l'appli parmi leurs habitudes.",
    exemple: "« les gens qui comptent investissent dans leur esprit, souvent avec une appli comme Sophia »",
  },
  {
    code: "mention_breve",
    nom: "Mention brève",
    definition: "L'appli citée en une ligne, sans argument ni histoire.",
    exemple: "« 5. apprendre tous les jours / avec une appli comme Sophia »",
  },
  {
    code: "quand_tu",
    nom: "Le problème, puis l'appli",
    definition: "Une situation du lecteur (« quand tu… »), puis l'appli comme réponse, hors d'une liste de conseils.",
    exemple: "« quand tu te fais distraire en révisant : l'appli UnSwipe enlève les Reels »",
  },
  {
    code: "point_liste",
    nom: "Un point de la liste",
    definition:
      "L'appli est l'un des conseils du post, adressé au lecteur (impératif ou « tu »), souvent numéroté.",
    exemple: "« 3. apprends un truc chaque jour : une appli de culture générale comme Sophia… »",
  },
];

/** Classement impossible (CTA illisible, aucune forme) : jamais tirée. */
export const FORME_AUTRE = "autre";
export const CODES_FORMES: ReadonlySet<string> = new Set([...FORMES_CTA.map((f) => f.code), FORME_AUTRE]);

/** Décision d'Adrien (30/10) : le CTA va n'importe où à partir de la slide 4. */
export const SLIDE_CTA_MIN = 4;

/** Une conclusion ne change qu'avec au moins 20 posts par forme (docs/bleo.md, D8). */
export const MIN_POSTS_FORME = 20;
/** Part du tirage gardée aux essais : jamais moins de 20 %. */
export const PART_ESSAI = 0.2;
/**
 * Effet à contenu égal : à partir de 1, la forme fait au moins aussi bien que
 * les autres versions du même contenu (prouvée) ; sous 0,85, elle perd plus de
 * 15 % de vues (à éviter).
 */
export const SEUIL_PROUVEE = 1;
export const SEUIL_A_EVITER = 0.85;

// ---------------------------------------------------------------------------
// Classement des CTA publiés
// ---------------------------------------------------------------------------

export interface CtaAClasser {
  /** md5 du texte du CTA, en minuscules, sans blancs autour. */
  cta_hash: string;
  cta_texte: string;
  /** La slide d'avant, pour voir si le CTA prolonge une liste. */
  avant: string | null;
}

/** La consigne de classement d'un lot de CTA (ids = rang dans le lot). */
export function promptClassement(lot: ReadonlyArray<CtaAClasser>): string {
  const formes = FORMES_CTA.map((f, i) => `${i + 1}. ${f.code} (${f.nom}) : ${f.definition} Exemple : ${f.exemple}`).join(
    "\n",
  );
  const lignes = lot
    .map((c, i) =>
      JSON.stringify({ id: i, avant: (c.avant ?? "").slice(0, 200), cta: c.cta_texte.slice(0, 500) })
    )
    .join("\n");
  return `Tu classes la phrase d'appel (CTA) de slideshows TikTok. Chaque CTA cite une appli (Sophia, micabo ou UnSwipe). Les textes sont dans toutes les langues ; les consignes sont en français.

Les formes possibles, par ordre de priorité. Si un CTA relève de deux formes, prends la première de la liste :
${formes}
${FORME_AUTRE} : seulement si aucune forme ne convient.

Juge la façon dont l'appli est amenée, pas le sujet. « avant » est la slide précédente : elle aide à voir si le CTA prolonge une liste numérotée.

Les CTA, un par ligne :
${lignes}

Réponds uniquement en JSON, sans bloc de code :
{"formes":[{"id":0,"forme":"point_liste"}]}`;
}

/** La forme de chaque CTA du lot, lue dans la réponse ; un id absent n'est pas classé. */
export function lireClassement(brut: string, taille: number): Map<number, string> {
  const formes = new Map<number, string>();
  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return formes;
  let sortie: { formes?: Array<{ id?: unknown; forme?: unknown }> };
  try {
    sortie = JSON.parse(brut.slice(debut, fin + 1));
  } catch {
    return formes;
  }
  for (const f of sortie.formes ?? []) {
    const id = Number(f.id);
    if (!Number.isInteger(id) || id < 0 || id >= taille) continue;
    const code = String(f.forme ?? "").trim();
    formes.set(id, CODES_FORMES.has(code) ? code : FORME_AUTRE);
  }
  return formes;
}

// ---------------------------------------------------------------------------
// Les poids du tirage, chaque lundi
// ---------------------------------------------------------------------------

/** Une ligne de `cta_agregats()` : une valeur d'une dimension, pour un label et une appli. */
export interface AgregatCta {
  /** `*` : tous les labels de l'appli (le repli d'un label sans preuve). */
  label: string;
  application_id: string;
  dimension: "forme" | "slide" | "place" | "voie";
  valeur: string;
  /** Posts des contenus où la dimension varie. */
  n: number;
  contenus: number;
  /** Médiane de r (vues ÷ médiane du compte). */
  r_med: number | null;
  /**
   * La comparaison à contenu égal : moyenne géométrique de r ÷ celle des autres
   * posts du même contenu (1,08 = +8 % de vues).
   */
  effet: number | null;
  /** Part des posts à r ≥ 3. */
  percee: number | null;
}

export type StatutForme = "prouvee" | "essai" | "a_eviter";

export interface PoidsForme {
  forme: string;
  statut: StatutForme;
  /** Part du tirage, entre 0 et 1 ; 0 pour une forme à éviter. */
  poids: number;
  n: number;
  effet: number | null;
  percee: number | null;
  /** Vrai quand la preuve vient de tous les labels de l'appli. */
  repli: boolean;
}

export function confiance(n: number): "forte" | "moyenne" | "faible" {
  return n >= 60 ? "forte" : n >= MIN_POSTS_FORME ? "moyenne" : "faible";
}

function statutDe(a: AgregatCta | undefined): StatutForme {
  if (!a || a.n < MIN_POSTS_FORME || a.effet === null) return "essai";
  if (a.effet >= SEUIL_PROUVEE) return "prouvee";
  if (a.effet < SEUIL_A_EVITER) return "a_eviter";
  return "essai";
}

const arrondi = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Les poids du tirage d'un label pour une appli, à partir de ses formes
 * mesurées (dimension `forme`) :
 * - prouvée : au moins MIN_POSTS_FORME posts et un effet ≥ SEUIL_PROUVEE ;
 * - à éviter : au moins MIN_POSTS_FORME posts et un effet < SEUIL_A_EVITER ;
 * - essai : tout le reste (pas assez de posts, ou entre les deux seuils).
 * Les prouvées se partagent 80 % au prorata de leur effet, les essais 20 %
 * à parts égales. Sans forme prouvée pour le label, on prend celles de l'appli
 * tous labels confondus (`repli`) ; sans preuve du tout, tirage égal.
 */
export function poidsDesFormes(
  formes: ReadonlyArray<AgregatCta>,
  repli: ReadonlyArray<AgregatCta> = [],
): PoidsForme[] {
  const parCode = new Map(formes.map((a) => [a.valeur, a]));
  const parCodeRepli = new Map(repli.map((a) => [a.valeur, a]));
  const avecRepli = !FORMES_CTA.some((f) => statutDe(parCode.get(f.code)) === "prouvee");

  const lignes = FORMES_CTA.map((f) => {
    const propre = parCode.get(f.code);
    let statut = statutDe(propre);
    let estRepli = false;
    if (avecRepli && statut !== "a_eviter" && statutDe(parCodeRepli.get(f.code)) === "prouvee") {
      statut = "prouvee";
      estRepli = true;
    }
    const source = estRepli ? parCodeRepli.get(f.code) : propre;
    return {
      forme: f.code,
      statut,
      poids: 0,
      n: propre?.n ?? 0,
      effet: (source ?? propre)?.effet ?? null,
      percee: (source ?? propre)?.percee ?? null,
      repli: estRepli,
    } satisfies PoidsForme;
  });

  const prouvees = lignes.filter((l) => l.statut === "prouvee");
  const essais = lignes.filter((l) => l.statut === "essai");
  if (prouvees.length === 0) {
    for (const l of essais) l.poids = arrondi(1 / essais.length);
    return lignes;
  }
  const partProuvees = essais.length > 0 ? 1 - PART_ESSAI : 1;
  const somme = prouvees.reduce((s, l) => s + (l.effet ?? 0), 0);
  for (const l of prouvees) l.poids = arrondi((partProuvees * (l.effet ?? 0)) / somme);
  for (const l of essais) l.poids = arrondi(PART_ESSAI / essais.length);
  return lignes;
}

// ---------------------------------------------------------------------------
// La fiche label (Markdown, une version par lundi)
// ---------------------------------------------------------------------------

export interface BlocAppli {
  appli: string;
  posts: number;
  formes: ReadonlyArray<PoidsForme>;
  slides: ReadonlyArray<AgregatCta>;
  places: ReadonlyArray<AgregatCta>;
  voies: ReadonlyArray<AgregatCta>;
  /** Statut de chaque forme la semaine d'avant, pour le journal. */
  avant?: ReadonlyMap<string, StatutForme>;
}

const NOM_FORME = new Map(FORMES_CTA.map((f) => [f.code, f.nom]));
const NOM_STATUT: Record<StatutForme, string> = { prouvee: "prouvée", essai: "essai", a_eviter: "à éviter" };
const NOM_PLACE: Record<string, string> = {
  debut: "slides 1 à 3",
  milieu: "milieu",
  avant_derniere: "avant-dernière",
  derniere: "dernière",
};

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)} %`);
const num = (x: number | null) => (x === null ? "–" : x.toFixed(2).replace(".", ","));

function tableau(entetes: string[], lignes: string[][]): string {
  return [
    `| ${entetes.join(" | ")} |`,
    `| ${entetes.map(() => "---").join(" | ")} |`,
    ...lignes.map((l) => `| ${l.join(" | ")} |`),
  ].join("\n");
}

function ordreSlide(v: string): number {
  return v === "8+" ? 8 : Number(v);
}

/** La fiche label d'un lundi : tirage, formes, slide du CTA, voies et journal, appli par appli. */
export function ficheLabel(label: string, jour: string, blocs: ReadonlyArray<BlocAppli>): string {
  const sorties: string[] = [
    `# Fiche label : ${label}`,
    "",
    `> Calculée le ${jour} sur les posts publiés depuis 45 jours, mûrs (72 h), hors rappels. ` +
      "r = vues ÷ médiane du compte. Effet = r du post comparé aux autres versions du même contenu " +
      "(autres langues, autres comptes), seulement sur les contenus où la forme, la slide ou la voie varie : " +
      "1,08 = +8 % de vues à contenu égal. " +
      `Une forme est jugée à partir de ${MIN_POSTS_FORME} posts. Le CTA va n'importe où à partir de la slide ${SLIDE_CTA_MIN}.`,
  ];
  for (const b of blocs) {
    const prouvees = b.formes.filter((f) => f.statut === "prouvee");
    const essais = b.formes.filter((f) => f.statut === "essai");
    const aEviter = b.formes.filter((f) => f.statut === "a_eviter");
    const liste = (fs: ReadonlyArray<PoidsForme>) =>
      fs.map((f) => `${NOM_FORME.get(f.forme)} ${pct(f.poids)}${f.repli ? " (preuve tous labels)" : ""}`).join(", ");

    sorties.push("", `## ${b.appli} · ${b.posts} posts`, "", "### Tirage de la voie");
    if (prouvees.length) {
      sorties.push(`- **Prouvée** : ${liste(prouvees)}`);
      if (essais.length) sorties.push(`- **Essai** : ${liste(essais)}`);
    } else {
      sorties.push(`- Pas encore de forme prouvée : tirage égal entre ${liste(essais)}.`);
    }
    if (aEviter.length) sorties.push(`- **À éviter** (jamais tirée) : ${aEviter.map((f) => NOM_FORME.get(f.forme)).join(", ")}`);

    sorties.push(
      "",
      "### Les formes",
      "",
      tableau(
        ["Forme", "Posts", "Effet", "Percée (r ≥ 3)", "Confiance", "Statut"],
        [...b.formes]
          .sort((x, y) => (y.effet ?? -1) - (x.effet ?? -1))
          .map((f) => [
            NOM_FORME.get(f.forme) ?? f.forme,
            String(f.n),
            num(f.effet),
            pct(f.percee),
            confiance(f.n),
            NOM_STATUT[f.statut] + (f.repli ? " (tous labels)" : ""),
          ]),
      ),
    );

    if (b.slides.length) {
      sorties.push(
        "",
        "### La slide du CTA",
        "",
        tableau(
          ["Slide", "Posts", "Effet"],
          [...b.slides].sort((x, y) => ordreSlide(x.valeur) - ordreSlide(y.valeur)).map((s) => [
            s.valeur,
            String(s.n),
            num(s.effet),
          ]),
        ),
      );
      if (b.places.length) {
        sorties.push(
          "",
          b.places.map((p) => `${NOM_PLACE[p.valeur] ?? p.valeur} : ${num(p.effet)} (${p.n} posts)`).join(" · "),
        );
      }
    }

    const voies = b.voies.filter((v) => v.valeur !== "aucune");
    if (voies.length) {
      sorties.push(
        "",
        "### Les voies",
        "",
        tableau(["Voie", "Posts", "Effet"], voies.map((v) => [v.valeur, String(v.n), num(v.effet)])),
      );
    }

    if (b.avant && b.avant.size) {
      const changes = b.formes.filter((f) => b.avant!.get(f.forme) && b.avant!.get(f.forme) !== f.statut);
      sorties.push(
        "",
        "### Journal",
        changes.length
          ? changes
            .map((f) => `- ${NOM_FORME.get(f.forme)} : ${NOM_STATUT[b.avant!.get(f.forme)!]} → ${NOM_STATUT[f.statut]}`)
            .join("\n")
          : "- Aucun changement de statut depuis la semaine dernière.",
      );
    }
  }
  return sorties.join("\n") + "\n";
}
