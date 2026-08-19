import { phaseCreateur, type PhaseCreateur } from "@/features/moteur/warmup";
import type { PosterProfil } from "@/features/moteur/types";

export function nomProfil(p: Pick<PosterProfil, "prenom" | "nom" | "email" | "id">): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || p.id.slice(0, 8);
}

export function lienTikTok(handle: string | null | undefined): { at: string; url: string } | null {
  const raw = (handle ?? "").trim().replace(/^@+/, "");
  if (!raw) return null;
  return { at: `@${raw}`, url: `https://www.tiktok.com/@${raw}` };
}

export type ResumeCreateur = {
  id: string;
  nom: string;
  handle: string | null;
  lienTiktok: string | null;
  phase: PhaseCreateur;
  actif: boolean;
};

export type CompteursPhase = {
  total: number;
  pasCree: number;
  warmup: number;
  actif: number;
};

export type ResumeHm = {
  hm: PosterProfil;
  createurs: ResumeCreateur[];
  compteurs: CompteursPhase;
};

export type EquipeDm = {
  dm: PosterProfil;
  hms: ResumeHm[];
  compteurs: CompteursPhase;
};

export function resumeCreateur(p: PosterProfil): ResumeCreateur {
  const handle =
    p.comptes?.find((c) => c.handle_tiktok)?.handle_tiktok ?? p.handle_tiktok;
  const lien = lienTikTok(handle);
  return {
    id: p.id,
    nom: nomProfil(p),
    handle: lien?.at ?? null,
    lienTiktok: lien?.url ?? null,
    phase: phaseCreateur({
      compteId: p.compte_id,
      warmup_started_at: p.warmup_started_at,
      warmup_ends_at: p.warmup_ends_at,
    }),
    actif: p.is_active,
  };
}

export function compteursDepuis(createurs: ResumeCreateur[]): CompteursPhase {
  const compteurs: CompteursPhase = { total: createurs.length, pasCree: 0, warmup: 0, actif: 0 };
  for (const c of createurs) {
    if (c.phase === "pas_cree") compteurs.pasCree += 1;
    else if (c.phase === "warmup") compteurs.warmup += 1;
    else compteurs.actif += 1;
  }
  return compteurs;
}

export function additionnerCompteurs(liste: CompteursPhase[]): CompteursPhase {
  return liste.reduce(
    (acc, c) => ({
      total: acc.total + c.total,
      pasCree: acc.pasCree + c.pasCree,
      warmup: acc.warmup + c.warmup,
      actif: acc.actif + c.actif,
    }),
    { total: 0, pasCree: 0, warmup: 0, actif: 0 },
  );
}

export function createursDuManager(tous: PosterProfil[], managerId: string): PosterProfil[] {
  return tous.filter((p) => p.role === "poster" && p.manager_id === managerId);
}

export function hmsDuDm(tous: PosterProfil[], dmId: string): PosterProfil[] {
  return tous.filter((p) => p.role === "hiring_manager" && p.manager_id === dmId);
}

export function resumeHm(hm: PosterProfil, tous: PosterProfil[]): ResumeHm {
  const createurs = createursDuManager(tous, hm.id).map(resumeCreateur);
  return { hm, createurs, compteurs: compteursDepuis(createurs) };
}

export function equipesParDm(tous: PosterProfil[]): EquipeDm[] {
  const dms = tous.filter((p) => p.role === "directing_manager");
  return dms
    .map((dm) => {
      const hms = hmsDuDm(tous, dm.id).map((hm) => resumeHm(hm, tous));
      return {
        dm,
        hms,
        compteurs: additionnerCompteurs(hms.map((h) => h.compteurs)),
      };
    })
    .sort((a, b) => nomProfil(a.dm).localeCompare(nomProfil(b.dm), "fr"));
}

export function hmsSansDm(tous: PosterProfil[]): ResumeHm[] {
  const idsDm = new Set(tous.filter((p) => p.role === "directing_manager").map((p) => p.id));
  return tous
    .filter((p) => p.role === "hiring_manager" && (!p.manager_id || !idsDm.has(p.manager_id)))
    .map((hm) => resumeHm(hm, tous));
}

/** HM + DM, DMs d'abord, puis HM rattachés, puis HM sans DM. */
export function listerManagers(tous: PosterProfil[]): PosterProfil[] {
  return tous
    .filter((p) => p.role === "hiring_manager" || p.role === "directing_manager")
    .sort((a, b) => {
      const rang = (p: PosterProfil) =>
        p.role === "directing_manager" ? 0 : p.manager_id ? 1 : 2;
      const d = rang(a) - rang(b);
      if (d !== 0) return d;
      return nomProfil(a).localeCompare(nomProfil(b), "fr");
    });
}

export type GroupePosters = {
  manager: PosterProfil | null;
  posters: PosterProfil[];
};

/** Posters regroupés sous le hiring manager (ou DM) auquel ils sont assignés. */
export function postersParManager(
  posters: PosterProfil[],
  tous: PosterProfil[],
): GroupePosters[] {
  const par = new Map<string, PosterProfil[]>();
  for (const p of posters) {
    const k = p.manager_id ?? "__none__";
    const liste = par.get(k);
    if (liste) liste.push(p);
    else par.set(k, [p]);
  }

  const groupes: GroupePosters[] = [];
  for (const [k, liste] of par) {
    if (k === "__none__") continue;
    groupes.push({
      manager: tous.find((x) => x.id === k) ?? null,
      posters: liste,
    });
  }
  groupes.sort((a, b) => {
    const na = a.manager ? nomProfil(a.manager) : "\uFFFF";
    const nb = b.manager ? nomProfil(b.manager) : "\uFFFF";
    return na.localeCompare(nb, "fr");
  });

  const orphelins = par.get("__none__");
  if (orphelins?.length) groupes.push({ manager: null, posters: orphelins });
  return groupes;
}
