import { nomApplicationPromue } from "./repartition/logique";
import { ID_SOPHIA } from "./multiApp";

/**
 * Planning du jour (page admin « Day schedule ») vu par application : chaque
 * post promeut UNE application (`posts.application_id`). Un post sans
 * application (d'avant 0256) promouvait Sophia.
 */

export function applicationDuPost(post: { application_id?: string | null }): string {
  return post.application_id ?? ID_SOPHIA;
}

export interface ResumeApplication {
  applicationId: string;
  nom: string;
  prevus: number;
  postes: number;
}

type Apps = ReadonlyArray<{ id: string; nom?: string | null; slug?: string | null }>;

/** Sophia d'abord, puis par nom : l'ordre ne dépend pas des volumes du jour. */
function comparerApplications(a: ResumeApplication, b: ResumeApplication): number {
  if (a.applicationId === ID_SOPHIA) return -1;
  if (b.applicationId === ID_SOPHIA) return 1;
  return a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" });
}

/** Posts prévus et postés par application, pour les posts donnés (déjà filtrés). */
export function resumeParApplication<P extends { application_id?: string | null }>(
  posts: readonly P[],
  estPoste: (p: P) => boolean,
  apps: Apps,
): ResumeApplication[] {
  const parApp = new Map<string, ResumeApplication>();
  for (const p of posts) {
    const id = applicationDuPost(p);
    const r = parApp.get(id) ?? { applicationId: id, nom: nomApplicationPromue(id, apps), prevus: 0, postes: 0 };
    r.prevus += 1;
    if (estPoste(p)) r.postes += 1;
    parApp.set(id, r);
  }
  return [...parApp.values()].sort(comparerApplications);
}

/** Les posts d'une application, regroupés dans l'ordre de `resumeParApplication`. */
export function postsParApplication<P extends { application_id?: string | null }>(
  posts: readonly P[],
  estPoste: (p: P) => boolean,
  apps: Apps,
): Array<ResumeApplication & { posts: P[] }> {
  return resumeParApplication(posts, estPoste, apps).map((r) => ({
    ...r,
    posts: posts.filter((p) => applicationDuPost(p) === r.applicationId),
  }));
}
