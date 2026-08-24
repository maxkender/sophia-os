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
  /** Posters créés directement par le DM (manager_id = DM), pas via un HM. */
  createursDirects: ResumeCreateur[];
  compteurs: CompteursPhase;
};

export function resumeCreateur(p: PosterProfil): ResumeCreateur {
  const lien = lienTikTok(p.handle_tiktok);
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
      const createursDirects = createursDuManager(tous, dm.id).map(resumeCreateur);
      return {
        dm,
        hms,
        createursDirects,
        compteurs: additionnerCompteurs([
          compteursDepuis(createursDirects),
          ...hms.map((h) => h.compteurs),
        ]),
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
