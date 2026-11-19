/**
 * L'état de préparation d'une application : ce qu'il lui faut pour publier,
 * point par point, dans l'ordre où on le fait. La carte Applications l'affiche
 * (ligne dépliée) : on y lit d'un coup d'œil ce qui manque à une application
 * neuve, sans chercher dans la doc. Le détail de chaque point est dans
 * `docs/applications.md`.
 */
import { ficheApplication } from "../catalogueApplications";
import { clePromptPertinence, clePromptPlacement, estSlugSophia } from "../applications";
import { estPromptBrouillon } from "./logique";

/** `ok` : fait · `a_relire` : en place mais à valider · `a_faire` : manque. */
export type EtatPoint = "ok" | "a_relire" | "a_faire";

export type ClePoint = "code" | "pertinence" | "placement" | "lien1000" | "labels" | "langues" | "active";

export interface PointPreparation {
  cle: ClePoint;
  etat: EtatPoint;
  /** Précision affichée à côté : la clé du prompt, le lien, le nombre de labels, les langues. */
  detail?: string;
}

export interface EntreePreparation {
  slug: string;
  actif: boolean;
  /** Langues ciblées ; `null` = toutes. */
  langues: readonly string[] | null;
  /** Le logo est-il dans `logosApplications.ts` ? */
  logo: boolean;
  /** Texte des prompts par clé ; `undefined` tant qu'ils ne sont pas lus. */
  prompts: Readonly<Record<string, string | null | undefined>>;
  /** Lien à 1 000 abonnés de l'application ; vide ou absent = manque. */
  lien1000: string | null | undefined;
  /** Nombre de labels qui servent l'application. */
  nbLabels: number;
}

function etatPrompt(contenu: string | null | undefined): EtatPoint {
  if (!(contenu ?? "").trim()) return "a_faire";
  return estPromptBrouillon(contenu) ? "a_relire" : "ok";
}

export function preparationApplication(e: EntreePreparation): PointPreparation[] {
  const clePertinence = clePromptPertinence(e.slug);
  const clePlacement = clePromptPlacement(e.slug);
  const lien = (e.lien1000 ?? "").trim();
  return [
    // 1. Le code : catalogue (nom, marque, concurrents, couleur) et logo.
    { cle: "code", etat: ficheApplication(e.slug) && e.logo ? "ok" : "a_faire" },
    // 2. Les deux prompts : sans eux rien n'est noté ni placé.
    { cle: "pertinence", etat: etatPrompt(e.prompts[clePertinence]), detail: clePertinence },
    { cle: "placement", etat: etatPrompt(e.prompts[clePlacement]), detail: clePlacement },
    // 3. Le lien que ses comptes mettent sur leur profil à 1 000 abonnés.
    { cle: "lien1000", etat: lien ? "ok" : "a_faire", detail: lien || undefined },
    // 4. Ses labels : sans label, aucun contenu ni aucun compte.
    { cle: "labels", etat: e.nbLabels > 0 ? "ok" : "a_faire", detail: String(e.nbLabels) },
    // 5. Ses langues : une liste vide = servie nulle part.
    {
      cle: "langues",
      etat: e.langues !== null && e.langues.length === 0 ? "a_faire" : "ok",
      detail: e.langues === null ? undefined : e.langues.join(" · "),
    },
    // 6. L'interrupteur, en dernier.
    { cle: "active", etat: e.actif || estSlugSophia(e.slug) ? "ok" : "a_faire" },
  ];
}

/** Tout est-il en place (rien à faire ni à relire) ? */
export function applicationPrete(points: readonly PointPreparation[]): boolean {
  return points.every((p) => p.etat === "ok");
}

/** Le prochain point à traiter, dans l'ordre : c'est lui que l'écran met en avant. */
export function prochainPoint(points: readonly PointPreparation[]): PointPreparation | null {
  return points.find((p) => p.etat !== "ok") ?? null;
}
