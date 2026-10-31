/**
 * Recruitment Automation → Problems : seulement les alertes graves (les
 * messages ne partent plus, trop d'appels à l'API, une connexion ou une tâche
 * en panne, l'automatisation en pause), chacune avec une piste de débogage.
 * Tout vient de ce qu'Overview lit déjà (Health, fréquences, freins, pause).
 */
import type { EtatFrequences } from "@/features/frequences/api";

import type { SanteAuto } from "./api";
import type { FreinEnvoi } from "./freinsApi";
import type { EtatPause } from "./pauseApi";

export type Gravite = "grave" | "attention";

export interface Probleme {
  cle: string;
  gravite: Gravite;
  /** Clé de traduction sous auto.problemes.types (titre et proposition). */
  type: string;
  params: Record<string, string | number>;
  /** Où agir dans l'OS. */
  lien: string | null;
  depuis: string | null;
}

const heure = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));
const jourParis = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);

export function detecterProblemes(
  e: { sante?: SanteAuto | null; frequences?: EtatFrequences | null; freins?: FreinEnvoi[] | null; pause?: EtatPause | null },
  maintenant = new Date(),
): Probleme[] {
  const p: Probleme[] = [];
  if (e.pause?.actif) {
    p.push({ cle: "pause", gravite: "grave", type: "pause", params: { par: e.pause.par_nom ?? "?" }, lien: "/admin/auto", depuis: e.pause.depuis });
  }
  const comptes = e.sante?.upwork_comptes ?? [];
  const max = e.sante?.upwork_max ?? 0;
  for (const c of comptes) {
    const nom = c.compte === "secours" ? "Adrien" : "Max";
    if (c.connecte_une_fois && c.statut !== "connecte") {
      p.push({ cle: `upwork_deconnecte:${c.compte}`, gravite: "grave", type: "upwork_deconnecte", params: { compte: nom, erreur: c.derniere_erreur ?? c.statut }, lien: "/admin/auto", depuis: c.dernier_appel_at });
    } else if (c.renouvellement_erreur) {
      p.push({ cle: `upwork_jeton:${c.compte}`, gravite: "grave", type: "upwork_jeton", params: { compte: nom, erreur: c.renouvellement_erreur }, lien: "/admin/auto", depuis: c.renouvellement_at });
    } else if (c.expire_bientot) {
      p.push({ cle: `upwork_expire:${c.compte}`, gravite: "attention", type: "upwork_expire", params: { compte: nom }, lien: "/admin/auto", depuis: c.access_expire_at });
    }
  }
  const pleins = comptes.filter((c) => c.limite);
  if (comptes.length > 0 && pleins.length === comptes.length) {
    p.push({ cle: "upwork_plein", gravite: "grave", type: "upwork_plein", params: { max }, lien: "/admin/auto/sent?onglet=main", depuis: null });
  } else {
    for (const c of pleins) {
      p.push({ cle: `upwork_plein:${c.compte}`, gravite: "attention", type: "upwork_plein_un", params: { compte: c.compte === "secours" ? "Adrien" : "Max", n: c.utilises, max }, lien: "/admin/auto", depuis: null });
    }
  }
  const aujourdhui = jourParis(maintenant);
  const derniers429 = (e.frequences?.taches ?? []).map((t) => t.dernier_429_at).filter((x): x is string => Boolean(x) && jourParis(new Date(x as string)) === aujourdhui).sort();
  if (derniers429.length) {
    const dernier = derniers429[derniers429.length - 1]!;
    p.push({ cle: "upwork_429", gravite: "grave", type: "upwork_429", params: { heure: heure(dernier) }, lien: "/admin/auto", depuis: dernier });
  }
  const f = e.frequences;
  if (f && f.alerte > 0 && f.appels_jour >= f.alerte) {
    p.push({ cle: "appels_api", gravite: f.appels_jour >= f.limite ? "grave" : "attention", type: "appels_api", params: { n: f.appels_jour, limite: f.limite }, lien: "/admin/auto/logs", depuis: null });
  }
  for (const t of e.sante?.taches ?? []) {
    if (!t.existe || !t.actif) {
      p.push({ cle: `tache_off:${t.job}`, gravite: "grave", type: "tache_off", params: { tache: t.tache, job: t.job }, lien: "/admin/auto/logs", depuis: t.dernier_at });
    } else if (t.en_erreur) {
      p.push({ cle: `tache_erreur:${t.job}`, gravite: "grave", type: "tache_erreur", params: { tache: t.tache, job: t.job, message: (t.message ?? "").slice(0, 160) || "?" }, lien: "/admin/auto/logs", depuis: t.dernier_at });
    } else if (t.en_retard) {
      p.push({ cle: `tache_retard:${t.job}`, gravite: "attention", type: "tache_retard", params: { tache: t.tache, job: t.job }, lien: "/admin/auto/logs", depuis: t.dernier_at });
    }
  }
  for (const fr of e.freins ?? []) {
    p.push({ cle: `frein:${fr.id}`, gravite: "grave", type: `frein_${fr.motif}`, params: { type: fr.type, detail: fr.detail ?? "" }, lien: "/admin/auto", depuis: fr.cree_at });
  }
  return p.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === "grave" ? -1 : 1));
}
