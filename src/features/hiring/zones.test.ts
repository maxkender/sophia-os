import { describe, expect, it } from "vitest";

import type { PosterProfil } from "@/features/moteur/types";
import {
  CLE_SANS_ZONE,
  cleZone,
  estRecruteur,
  normaliserZone,
  regrouperParZone,
  zoneDuCreateur,
  zonesConnues,
} from "./zones";

function profil(over: Partial<PosterProfil> & { id: string; role: PosterProfil["role"] }): PosterProfil {
  return {
    prenom: over.id,
    nom: null,
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
    classement: null,
    classement_maj_at: null,
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

const amanda = profil({ id: "amanda", role: "directing_manager", zone_recrutement: "Turkey + Israel" });
const kris = profil({ id: "kris", role: "hiring_manager", zone_recrutement: "Spain + Portugal" });
const waqas = profil({
  id: "waqas",
  role: "hiring_manager",
  manager_id: "regina",
  zone_recrutement: "Romania + Sweden",
});
const regina = profil({ id: "regina", role: "directing_manager", zone_recrutement: "Germany + Norway" });
const aram = profil({ id: "aram", role: "head_of_ops" });
const remi = profil({ id: "remi", role: "hiring_manager", zone_recrutement: "  " });
const taimoor = profil({ id: "taimoor", role: "hiring_manager", is_active: false });
const admin = profil({ id: "admin", role: "admin" });

const c = (id: string, manager_id: string | null, over: Partial<PosterProfil> = {}) =>
  profil({ id, role: "poster", manager_id, ...over });

const tous: PosterProfil[] = [
  amanda,
  kris,
  waqas,
  regina,
  aram,
  remi,
  taimoor,
  admin,
  c("beyza", "amanda"),
  c("omer", "amanda"),
  c("marta", "kris"),
  c("laia", "kris", { is_active: false }),
  c("ion", "waqas"),
  c("lennart", "regina"),
  c("agnes", "aram"),
  c("amira", "remi"),
  c("orphelin", null),
  c("sous-admin", "admin"),
  c("manager-supprime", "inconnu"),
];

describe("normaliserZone / cleZone / estRecruteur", () => {
  it("réduit les espaces, vide → null", () => {
    expect(normaliserZone("  Turkey   +  Israel ")).toBe("Turkey + Israel");
    expect(normaliserZone("   ")).toBeNull();
    expect(normaliserZone(null)).toBeNull();
    expect(normaliserZone(undefined)).toBeNull();
  });

  it("la casse ne sépare pas deux zones ; pas de zone → clé dédiée", () => {
    expect(cleZone("France")).toBe(cleZone(" france "));
    expect(cleZone("")).toBe(CLE_SANS_ZONE);
    expect(cleZone(null)).toBe(CLE_SANS_ZONE);
  });

  it("HM, DM et Head of Ops recrutent ; ni l'admin ni le poster", () => {
    expect([kris, amanda, aram].every(estRecruteur)).toBe(true);
    expect(estRecruteur(admin)).toBe(false);
    expect(estRecruteur(c("x", null))).toBe(false);
    expect(estRecruteur(profil({ id: "n", role: null }))).toBe(false);
  });
});

describe("regrouperParZone", () => {
  const r = regrouperParZone(tous);

  it("range les zones par ordre alphabétique, chaque créateur sous son recruteur", () => {
    expect(r.zones.map((z) => z.zone)).toEqual([
      "Germany + Norway",
      "Romania + Sweden",
      "Spain + Portugal",
      "Turkey + Israel",
    ]);
    const turquie = r.zones.find((z) => z.zone === "Turkey + Israel")!;
    expect(turquie.recruteurs.map((b) => b.recruteur.id)).toEqual(["amanda"]);
    expect(turquie.recruteurs[0].createurs.map((p) => p.id)).toEqual(["beyza", "omer"]);
    expect(turquie.compteurs.total).toBe(2);
  });

  it("un HM sous un DM garde SA zone, pas celle du DM", () => {
    expect(r.zones.find((z) => z.zone === "Romania + Sweden")!.recruteurs[0].recruteur.id).toBe("waqas");
    expect(r.zones.find((z) => z.zone === "Germany + Norway")!.recruteurs.map((b) => b.recruteur.id)).toEqual([
      "regina",
    ]);
  });

  it("un créateur désactivé reste sous son recruteur", () => {
    const espagne = r.zones.find((z) => z.zone === "Spain + Portugal")!;
    expect(espagne.recruteurs[0].createurs.map((p) => p.id)).toEqual(["laia", "marta"]);
  });

  it("recruteurs sans zone (Head of Ops compris, zone blanche) → groupe Sans zone", () => {
    expect(r.sansZone?.cle).toBe(CLE_SANS_ZONE);
    expect(r.sansZone?.zone).toBeNull();
    expect(r.sansZone?.recruteurs.map((b) => b.recruteur.id).sort()).toEqual(["aram", "remi"]);
    expect(r.sansZone?.compteurs.total).toBe(2);
  });

  it("aucun créateur perdu : sans manager, manager admin ou inconnu → Sans recruteur", () => {
    expect(r.sansRecruteur.map((p) => p.id).sort()).toEqual(["manager-supprime", "orphelin", "sous-admin"]);
    const places =
      r.zones.flatMap((z) => z.recruteurs.flatMap((b) => b.createurs)).length +
      (r.sansZone?.recruteurs.flatMap((b) => b.createurs).length ?? 0) +
      r.sansRecruteur.length;
    expect(places).toBe(tous.filter((p) => p.role === "poster").length);
  });

  it("recruteur désactivé sans créateur : à part, hors des zones", () => {
    expect(r.recruteursInactifs.map((p) => p.id)).toEqual(["taimoor"]);
    const ids = [...r.zones, r.sansZone!].flatMap((z) => z.recruteurs.map((b) => b.recruteur.id));
    expect(ids).not.toContain("taimoor");
  });

  it("recruteur désactivé qui a encore des créateurs : reste dans sa zone", () => {
    const hm = profil({ id: "hm-off", role: "hiring_manager", is_active: false, zone_recrutement: "France" });
    const out = regrouperParZone([hm, c("x", "hm-off")]);
    expect(out.zones.map((z) => z.zone)).toEqual(["France"]);
    expect(out.recruteursInactifs).toEqual([]);
  });

  it("recruteur actif sans créateur : visible sans filtre", () => {
    const hm = profil({ id: "nouveau", role: "hiring_manager", zone_recrutement: "Hungary + Serbia" });
    const out = regrouperParZone([hm]);
    expect(out.zones[0].recruteurs[0].createurs).toEqual([]);
  });

  it("filtre actif : seuls les créateurs retenus, recruteurs vides masqués", () => {
    const out = regrouperParZone(tous, {
      garderCreateur: (p) => p.id === "marta" || p.id === "orphelin",
      filtreActif: true,
    });
    expect(out.zones.map((z) => z.zone)).toEqual(["Spain + Portugal"]);
    expect(out.zones[0].recruteurs[0].createurs.map((p) => p.id)).toEqual(["marta"]);
    expect(out.sansZone).toBeNull();
    expect(out.sansRecruteur.map((p) => p.id)).toEqual(["orphelin"]);
    expect(out.recruteursInactifs).toEqual([]);
  });

  it("deux recruteurs, même zone à la casse près : un seul groupe, DM d'abord", () => {
    const hm = profil({ id: "zz-hm", role: "hiring_manager", zone_recrutement: "turkey + israel" });
    const out = regrouperParZone([hm, amanda, c("a", "zz-hm")]);
    expect(out.zones).toHaveLength(1);
    expect(out.zones[0].recruteurs.map((b) => b.recruteur.id)).toEqual(["amanda", "zz-hm"]);
  });

  it("ordre des créateurs : celui demandé par la page", () => {
    const out = regrouperParZone(tous, { trierCreateurs: (l) => [...l].reverse() });
    expect(out.zones.find((z) => z.zone === "Turkey + Israel")!.recruteurs[0].createurs.map((p) => p.id)).toEqual([
      "omer",
      "beyza",
    ]);
  });
});

describe("zonesConnues / zoneDuCreateur", () => {
  it("liste les zones des recruteurs, sans doublon de casse ni zone vide", () => {
    const hm = profil({ id: "dup", role: "hiring_manager", zone_recrutement: "spain + portugal" });
    expect(zonesConnues([...tous, hm])).toEqual([
      "Germany + Norway",
      "Romania + Sweden",
      "Spain + Portugal",
      "Turkey + Israel",
    ]);
  });

  it("un créateur hérite de la zone de son recruteur", () => {
    expect(zoneDuCreateur(c("q", "kris"), tous)).toBe("Spain + Portugal");
    expect(zoneDuCreateur(c("q", "aram"), tous)).toBeNull();
    expect(zoneDuCreateur(c("q", "admin"), [...tous, { ...admin, zone_recrutement: "X" }])).toBeNull();
    expect(zoneDuCreateur(c("q", null), tous)).toBeNull();
  });
});
