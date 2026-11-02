/**
 * Les formes de CTA et le classement des CTA publiés (0621, docs/cta.md).
 *
 * Depuis le 30/10, l'OS ne tire plus de forme et ne calcule plus de poids :
 * les vues ne jugent pas un CTA, qui arrive à la slide 4 ou plus loin. Le
 * classement reste une aide pour choisir les exemples des fiches label.
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

