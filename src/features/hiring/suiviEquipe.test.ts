import { describe, expect, it } from "vitest";

import type { PosterProfil } from "@/features/moteur/types";
import {
  additionnerCompteurs,
  compteursDepuis,
  createursDuManager,
  equipesParDm,
  hmsDuDm,
  hmsSansDm,
  lienTikTok,
  nomProfil,
  resumeCreateur,
  resumeHm,
} from "./suiviEquipe";

function profil(over: Partial<PosterProfil> & { id: string; role: PosterProfil["role"] }): PosterProfil {
  return {
    prenom: "A",
    nom: "B",
    email: `${over.id}@t.test`,
    langues: ["fr"],
    nationalite: null,
    upwork_url: null,
    cout_mensuel: null,
    compte_id: null,
    handle_tiktok: null,
    reference_handle: null,
    persona_nom: null,
    persona_bio: null,
    avatar_url: null,
    score: null,
    score_maj_at: null,
    warmup_started_at: null,
    warmup_ends_at: null,
    manager_id: null,
    manager_nom: null,
    is_active: true,
    must_change_password: false,
    hm_ugc_ai_video: false,
    comptes: [],
    ...over,
  };
}

describe("nomProfil / lienTikTok", () => {
  it("compose le nom et normalise le @", () => {
    expect(nomProfil(profil({ id: "1", role: "poster", prenom: "Léa", nom: "M", email: "x" }))).toBe(
      "Léa M",
    );
    expect(lienTikTok("@@foo.bar")).toEqual({
      at: "@foo.bar",
      url: "https://www.tiktok.com/@foo.bar",
    });
    expect(lienTikTok("  ")).toBeNull();
  });
});

describe("phases et compteurs", () => {
  it("classe pas créé / warmup / actif", () => {
    const pas = resumeCreateur(profil({ id: "c1", role: "poster" }));
    const warm = resumeCreateur(
      profil({
        id: "c2",
        role: "poster",
        compte_id: "acc",
        warmup_started_at: "2026-01-01T00:00:00Z",
        warmup_ends_at: "2099-01-01T00:00:00Z",
      }),
    );
    const act = resumeCreateur(
      profil({
        id: "c3",
        role: "poster",
        compte_id: "acc2",
        warmup_started_at: "2020-01-01T00:00:00Z",
        warmup_ends_at: "2020-01-02T00:00:00Z",
      }),
    );
    expect(pas.phase).toBe("pas_cree");
    expect(warm.phase).toBe("warmup");
    expect(act.phase).toBe("actif");
    expect(compteursDepuis([pas, warm, act])).toEqual({
      total: 3,
      pasCree: 1,
      warmup: 1,
      actif: 1,
    });
    expect(additionnerCompteurs([compteursDepuis([pas]), compteursDepuis([warm, act])])).toEqual({
      total: 3,
      pasCree: 1,
      warmup: 1,
      actif: 1,
    });
  });
});

describe("équipes DM → HM → créateurs", () => {
  const dm = profil({ id: "dm1", role: "directing_manager", prenom: "Dana", nom: "D" });
  const hm = profil({
    id: "hm1",
    role: "hiring_manager",
    prenom: "Hugo",
    nom: "H",
    manager_id: "dm1",
  });
  const hmOrphelin = profil({ id: "hm2", role: "hiring_manager", prenom: "Zoe", nom: "Z" });
  const c1 = profil({
    id: "p1",
    role: "poster",
    prenom: "Cam",
    nom: "C",
    manager_id: "hm1",
    handle_tiktok: "cam.tt",
    compte_id: "acc",
    warmup_started_at: "2020-01-01T00:00:00Z",
    warmup_ends_at: "2020-01-02T00:00:00Z",
  });
  const cDm = profil({
    id: "p-dm",
    role: "poster",
    prenom: "Dana",
    nom: "P",
    manager_id: "dm1",
    handle_tiktok: "dana.tt",
    compte_id: "acc-dm",
    warmup_started_at: "2020-01-01T00:00:00Z",
    warmup_ends_at: "2020-01-02T00:00:00Z",
  });
  const tous = [dm, hm, hmOrphelin, c1, cDm];

  it("rattache les créateurs au HM et les HM au DM", () => {
    expect(createursDuManager(tous, "hm1").map((p) => p.id)).toEqual(["p1"]);
    expect(createursDuManager(tous, "dm1").map((p) => p.id)).toEqual(["p-dm"]);
    expect(hmsDuDm(tous, "dm1").map((p) => p.id)).toEqual(["hm1"]);
    const r = resumeHm(hm, tous);
    expect(r.compteurs.actif).toBe(1);
    expect(r.createurs[0]?.handle).toBe("@cam.tt");
    expect(r.createurs[0]?.lienTiktok).toContain("cam.tt");
  });

  it("groupe les équipes et isole les HM sans DM", () => {
    const equipes = equipesParDm(tous);
    expect(equipes).toHaveLength(1);
    expect(equipes[0]?.dm.id).toBe("dm1");
    expect(equipes[0]?.hms).toHaveLength(1);
    expect(equipes[0]?.createursDirects.map((c) => c.id)).toEqual(["p-dm"]);
    expect(equipes[0]?.compteurs.total).toBe(2);
    expect(hmsSansDm(tous).map((h) => h.hm.id)).toEqual(["hm2"]);
  });

  it("compte les posters créés par le DM même sans HM", () => {
    const solo = profil({ id: "dm2", role: "directing_manager", prenom: "Mia", nom: "M" });
    const poster = profil({ id: "p2", role: "poster", prenom: "Léa", nom: "L", manager_id: "dm2" });
    const equipes = equipesParDm([solo, poster]);
    expect(equipes[0]?.hms).toHaveLength(0);
    expect(equipes[0]?.createursDirects.map((c) => c.id)).toEqual(["p2"]);
    expect(equipes[0]?.compteurs.total).toBe(1);
  });
});
