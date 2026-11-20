/**
 * Ce qu'est un podz, dit avec les mots de `pods/GLOSSAIRE.md` : son format, son
 * compte modèle, l'état de ses langues. Rien n'est décidé ici : tout se lit
 * dans ce que l'OS sait déjà (`pods`, `pods_fiches`, `pods_tableau`,
 * `bleo_langues_ouvertes`).
 */
import { SLUGS_APPLICATIONS } from "@/features/moteur/catalogueApplications";

import { POD_VIDEO, type FichePod, type Livraison, type OuvertureLangue, type Pod, type PodTableau } from "./api";

/**
 * Le format dit ce que le podz livre :
 *   - texte_banque : le texte et des images de la banque, l'OS traduit et place l'appli ;
 *   - images_finies : les slides finies, langue par langue (il déclare `pods.langues`) ;
 *   - video : une vidéo par compte (réactions UGC).
 */
export type FormatPodz = "texte_banque" | "images_finies" | "video";

export function formatPodz(pod: Pick<Pod, "slug" | "langues">): FormatPodz {
  if (pod.slug === POD_VIDEO) return "video";
  return pod.langues?.length ? "images_finies" : "texte_banque";
}

/** Les comptes modèles cités dans le nom du podz (« Remakes @fathom0g (Sophia) » → fathom0g). */
export function modelesDuNom(nom: string): string[] {
  const trouves = [...nom.matchAll(/@([a-z0-9._]+)/gi)].map((m) => m[1]!.replace(/[._]+$/, "").toLowerCase());
  return [...new Set(trouves.filter(Boolean))];
}

/** Un podz et tout ce que la page en sait. */
export interface LignePodz {
  pod: Pod;
  fiche: FichePod | null;
  tableau: PodTableau | null;
  format: FormatPodz;
  modeles: string[];
  /** Le nom à lire : celui de son label ; à défaut, celui du podz. */
  titre: string;
  /** Les autres podz du même label. */
  freres: string[];
}

export function assemblerPodz(pods: Pod[], fiches: FichePod[] = [], tableau: PodTableau[] = []): LignePodz[] {
  return pods.map((pod) => ({
    pod,
    fiche: fiches.find((f) => f.slug === pod.slug) ?? null,
    tableau: tableau.find((t) => t.slug === pod.slug) ?? null,
    format: formatPodz(pod),
    // Le vrai champ (0785) ; avant lui, ou s'il est vide, le compte cité dans le nom.
    modeles: pod.modeles?.length ? pod.modeles : modelesDuNom(pod.nom),
    titre: pod.label ?? pod.nom,
    freres: pod.label_id ? pods.filter((p) => p.label_id === pod.label_id && p.slug !== pod.slug).map((p) => p.slug) : [],
  }));
}

export type FiltreEtat = "actifs" | "pause" | "tous";

export function filtrerPodz(lignes: LignePodz[], filtre: { format: FormatPodz | "tous"; etat: FiltreEtat }): LignePodz[] {
  return lignes.filter(
    (l) =>
      (filtre.format === "tous" || l.format === filtre.format) &&
      (filtre.etat === "tous" || (filtre.etat === "actifs" ? l.pod.actif : !l.pod.actif)),
  );
}

/** La clé du groupe des podz sans application (la vidéo, un label retiré). */
export const SANS_APPLICATION = "aucune";

export interface GroupePodz {
  application: string;
  lignes: LignePodz[];
  comptes: number;
}

/**
 * Les podz rangés par application (ordre du catalogue, puis les inconnues, puis
 * « aucune »), et dans chacune par label : deux podz d'un même label se suivent.
 * Un label qui sert deux applications est rangé sous la première du catalogue.
 */
export function grouperParApplication(lignes: LignePodz[]): GroupePodz[] {
  const rang = (app: string) => {
    if (app === SANS_APPLICATION) return Number.MAX_SAFE_INTEGER;
    const i = SLUGS_APPLICATIONS.indexOf(app);
    return i === -1 ? SLUGS_APPLICATIONS.length : i;
  };
  const groupes = new Map<string, LignePodz[]>();
  for (const l of lignes) {
    const app = [...l.pod.apps].sort((a, b) => rang(a) - rang(b))[0] ?? SANS_APPLICATION;
    groupes.set(app, [...(groupes.get(app) ?? []), l]);
  }
  return [...groupes.entries()]
    .sort((a, b) => rang(a[0]) - rang(b[0]) || a[0].localeCompare(b[0]))
    .map(([application, ls]) => ({
      application,
      lignes: [...ls].sort(
        (a, b) =>
          Number(b.pod.actif) - Number(a.pod.actif) ||
          a.titre.localeCompare(b.titre, undefined, { sensitivity: "base" }) ||
          (a.pod.cree_le ?? "").localeCompare(b.pod.cree_le ?? ""),
      ),
      comptes: ls.reduce((n, l) => n + (l.fiche?.comptes ?? 0), 0),
    }));
}

/**
 * L'état d'une langue pour un podz :
 *   - servie : ouverte, prête, et au moins un compte du label la poste ;
 *   - a_preparer : ouverte, mais l'atelier du podz ne sait pas encore la produire ;
 *   - sans_compte : ouverte et prête, aucun compte ne la poste encore ;
 *   - hors_liste : pas dans la liste du podz (un compte y est quand même, ou elle a été fermée).
 */
export type EtatLangue = "servie" | "a_preparer" | "sans_compte" | "hors_liste";

export interface LangueDuPodz {
  langue: string;
  etat: EtatLangue;
  comptes: number;
  /** Les variantes de compte servies par cette langue (« es » sert « es-419 »). */
  variantes: { langue: string; comptes: number }[];
  /** Le journal de cette langue (ouvertures et fermetures), du plus ancien au plus récent. */
  journal: Pick<OuvertureLangue, "action" | "par" | "ouvert_le">[];
}

const bas = (l: string) => l.trim().toLowerCase();
const base = (l: string) => bas(l).split("-")[0]!;

/**
 * Les langues d'un podz, dans l'ordre : servies (les plus remplies d'abord), à
 * préparer, ouvertes sans compte, hors liste.
 *
 * `ouvertes` nul (texte + banque) : l'OS traduit partout, chaque langue qui a
 * un compte est servie. Sinon la règle de `pod_langues` (0654) : un compte est
 * servi par sa langue exacte, ou par sa langue de base quand sa variante n'est
 * pas ouverte à part. `pretes` (0781) : ce que l'atelier sait produire ; nul,
 * on ne sait pas, tout ce qui est ouvert est tenu pour prêt.
 */
export function etatLangues(
  ouvertes: string[] | null,
  comptesParLangue: Record<string, number>,
  journal: Pick<OuvertureLangue, "langue" | "ouvert_le" | "action" | "par">[] = [],
  pretes: string[] | null = null,
): LangueDuPodz[] {
  const evenements = new Map<string, LangueDuPodz["journal"]>();
  for (const o of journal) {
    evenements.set(bas(o.langue), [...(evenements.get(bas(o.langue)) ?? []), { action: o.action, par: o.par, ouvert_le: o.ouvert_le }]);
  }
  const sait = pretes ? new Set(pretes.map(bas)) : null;
  const comptes = Object.entries(comptesParLangue).filter(([, n]) => n > 0);
  const lignes = new Map<string, LangueDuPodz>();
  const ligne = (langue: string, etat: EtatLangue): LangueDuPodz => {
    const cle = bas(langue);
    let l = lignes.get(cle);
    if (!l) {
      l = { langue, etat, comptes: 0, variantes: [], journal: evenements.get(cle) ?? [] };
      lignes.set(cle, l);
    }
    return l;
  };

  if (!ouvertes?.length) {
    for (const [langue, n] of comptes) ligne(langue, "servie").comptes += n;
  } else {
    for (const d of ouvertes) ligne(d, sait && !sait.has(bas(d)) ? "a_preparer" : "sans_compte");
    for (const [langue, n] of comptes) {
      const exacte = lignes.get(bas(langue));
      const parBase = exacte ? undefined : lignes.get(base(langue));
      const cible = exacte ?? parBase;
      if (cible && cible.etat !== "hors_liste") {
        if (cible.etat === "sans_compte") cible.etat = "servie";
        cible.comptes += n;
        if (parBase) cible.variantes.push({ langue, comptes: n });
      } else {
        ligne(langue, "hors_liste").comptes += n;
      }
    }
    // Au journal (ouverte puis fermée, ou effacée avant 0781), mais plus dans la liste du podz.
    for (const cle of evenements.keys()) if (!lignes.has(cle)) ligne(cle, "hors_liste");
  }

  const ordre: Record<EtatLangue, number> = { servie: 0, a_preparer: 1, sans_compte: 2, hors_liste: 3 };
  return [...lignes.values()].sort(
    (a, b) => ordre[a.etat] - ordre[b.etat] || b.comptes - a.comptes || a.langue.localeCompare(b.langue),
  );
}

/** Le compte des langues par état. */
export function resumeLangues(langues: LangueDuPodz[]): Record<EtatLangue, number> & { comptes: number; max: number } {
  return {
    servie: langues.filter((l) => l.etat === "servie").length,
    a_preparer: langues.filter((l) => l.etat === "a_preparer").length,
    sans_compte: langues.filter((l) => l.etat === "sans_compte").length,
    hors_liste: langues.filter((l) => l.etat === "hors_liste").length,
    comptes: langues.reduce((n, l) => n + l.comptes, 0),
    max: langues.reduce((n, l) => Math.max(n, l.comptes), 0),
  };
}

/** La langue d'écriture d'un podz : celle de la plupart de ses livraisons (hors compléments de langues). */
export function langueEcriture(livraisons: Pick<Livraison, "type" | "langue_source">[]): string | null {
  const n = new Map<string, number>();
  for (const l of livraisons) if (l.type !== "langues" && l.langue_source) n.set(l.langue_source, (n.get(l.langue_source) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** À partir de combien de comptes d'un même label dans une langue on parle d'empilement (les mêmes posts traduits). */
export const SEUIL_EMPILEMENT = 2;

/** Les candidats à une place libre : seulement les comptes empilés, ou tous (`tous`). L'ordre de la base est gardé. */
export function candidatsMontres<T extends { empilement: number }>(candidats: T[], tous: boolean): T[] {
  return tous ? candidats : candidats.filter((c) => c.empilement >= SEUIL_EMPILEMENT);
}
