import { describe, expect, it } from "vitest";

import type { CompteCohorte, PostCohorte, ReleveWarmup } from "./api";
import { aFaireAujourdhui, aPublie, ligneSemaine, ligneWarmup, postsSansWarmup, problemesSemaine, raisonsPoste } from "./dashboardHm";

function compte(partiel: Partial<CompteCohorte> = {}): CompteCohorte {
  return {
    compte_id: "c1",
    poster_id: "p1",
    hm_id: "hm",
    handle: "jakub",
    pays: "PL",
    langue: "pl",
    application: "sophia",
    is_active: true,
    cree_le: "2026-10-19T10:00:00Z",
    warmup_lance_le: null,
    warmup_fin: null,
    premier_jour: null,
    glisse_de: null,
    seuil_mort: 50,
    seuil_bon: 5000,
    posts: [],
    releves: [],
    ...partiel,
  };
}

const post = (jour: string, url: string | null, vues: number | null = null): PostCohorte => ({
  jour,
  url,
  vues,
  mesure: vues !== null,
});

const releve = (partiel: Partial<ReleveWarmup>): ReleveWarmup => ({
  at: "2026-10-27T08:00:00Z",
  existe: true,
  cree_tiktok_at: null,
  abonnements: 0,
  likes: 0,
  abonnes: 0,
  videos: 0,
  ...partiel,
});

// Mardi 27 oct. 2026 : la cohorte du lundi 26 poste, celle du 2 nov. est en warm-up.
const MARDI = "2026-10-27";

describe("dashboard HM : posts d'hier", () => {
  it("0 post hier", () => {
    const c = compte({ posts: [post("2026-10-26", null), post("2026-10-26", null)] });
    expect(raisonsPoste(c, MARDI)).toEqual([{ cle: "zeroPostHier" }]);
  });

  it("1 post sur 2 hier", () => {
    const c = compte({ posts: [post("2026-10-26", "u"), post("2026-10-26", null)] });
    expect(raisonsPoste(c, MARDI)).toEqual([{ cle: "postsHier", valeurs: { publies: 1, prevus: 2 } }]);
  });

  it("tout publié hier, ou lundi (pas de posts le dimanche) : rien", () => {
    const c = compte({ posts: [post("2026-10-26", "u"), post("2026-10-26", "v")] });
    expect(raisonsPoste(c, MARDI)).toEqual([]);
    expect(raisonsPoste(compte({ posts: [post("2026-10-26", null)] }), "2026-10-26")).toEqual([]);
  });
});

describe("dashboard HM : cette semaine", () => {
  it("posts du jour x/2, semaine, À relancer dès un post manqué", () => {
    const c = compte({
      posts: [post("2026-10-26", "u", 120), post("2026-10-26", null), post(MARDI, "w"), post(MARDI, null)],
    });
    const l = ligneSemaine(c, MARDI);
    expect(l.jour).toEqual({ publies: 1, prevus: 2 });
    expect(l.semaine).toEqual({ publies: 2, prevus: 4 });
    expect(l.statut).toBe("a_relancer");
  });

  it("aucun manque (le jour même ne compte pas encore) : OK", () => {
    const c = compte({ posts: [post("2026-10-26", "u"), post("2026-10-26", "v"), post(MARDI, null)] });
    expect(ligneSemaine(c, MARDI).statut).toBe("ok");
  });
});

describe("dashboard HM : semaine prochaine (warm-up)", () => {
  it("créé il y a 2 jours, pas de TikTok, pas de Start : à relancer avec les deux raisons", () => {
    const c = compte({ cree_le: "2026-10-25T10:00:00Z", releves: [releve({ existe: false, abonnements: null, likes: null })] });
    const l = ligneWarmup(c, MARDI);
    expect(l.statut).toBe("a_relancer");
    expect(l.raisons.map((r) => r.cle)).toEqual(["tiktokPasCree", "startPasClique"]);
  });

  it("TikTok créé mais aucun follow ni like : warm-up pas commencé", () => {
    const c = compte({ cree_le: "2026-10-24T10:00:00Z", warmup_lance_le: "2026-10-25T10:00:00Z", releves: [releve({})] });
    expect(ligneWarmup(c, MARDI).raisons.map((r) => r.cle)).toEqual(["warmupPasCommence"]);
  });

  it("TikTok créé, warm-up commencé, Start cliqué : prêt", () => {
    const c = compte({
      cree_le: "2026-10-24T10:00:00Z",
      warmup_lance_le: "2026-10-25T10:00:00Z",
      releves: [releve({ abonnements: 6, likes: 12 })],
    });
    const l = ligneWarmup(c, MARDI);
    expect(l.statut).toBe("pret");
    expect(l.raisons).toEqual([]);
  });

  it("créé hier : en cours, pas encore à relancer", () => {
    const c = compte({ cree_le: "2026-10-26T10:00:00Z" });
    expect(ligneWarmup(c, MARDI).statut).toBe("en_cours");
  });
});

describe("dashboard HM : à faire aujourd'hui", () => {
  it("rassemble les deux cohortes, sans les posteurs désactivés ni ceux à jour", () => {
    const poste = [
      compte({ compte_id: "a", posts: [post("2026-10-26", null)] }),
      compte({ compte_id: "b", posts: [post("2026-10-26", "u")] }),
      compte({ compte_id: "c", is_active: false, posts: [post("2026-10-26", null)] }),
    ];
    const warmup = [compte({ compte_id: "d", cree_le: "2026-10-24T10:00:00Z" })];
    const lignes = aFaireAujourdhui(poste, warmup, MARDI);
    expect(lignes.map((l) => [l.compte.compte_id, l.cohorte])).toEqual([
      ["a", "poste"],
      ["d", "warmup"],
    ]);
  });
});

describe("dashboard HM : posts sans warm-up", () => {
  it("introuvable à chaque relevé du warm-up mais publie : NO WARM-UP", () => {
    const c = compte({ releves: [releve({ existe: false }), releve({ existe: false })], posts: [post(MARDI, "https://t/1")] });
    expect(postsSansWarmup(c)).toBe(true);
    expect(aPublie(c)).toBe(true);
  });

  it("existait pendant le warm-up, ou ne publie pas, ou jamais relevé : rien à signaler", () => {
    expect(postsSansWarmup(compte({ releves: [releve({ existe: false }), releve({ existe: true })], posts: [post(MARDI, "https://t/1")] }))).toBe(false);
    expect(postsSansWarmup(compte({ releves: [releve({ existe: false })], posts: [post(MARDI, null)] }))).toBe(false);
    expect(postsSansWarmup(compte({ posts: [post(MARDI, "https://t/1")] }))).toBe(false);
  });
});

describe("dashboard HM : le problème de chaque compte, en clair", () => {
  const posting = { etape: "posting" as const, semaine: 1 };
  const semaine = (publies: number) =>
    ["2026-10-26", "2026-10-26", "2026-10-27", "2026-10-27"].map((jour, i) => post(jour, i < publies ? `https://t/${i}` : null));

  it("compte introuvable : ce seul problème", () => {
    expect(problemesSemaine(compte({ posts: semaine(0) }), { etape: "not_created", semaine: null }, MARDI)).toEqual([
      { cle: "compteIntrouvable" },
    ]);
  });

  it("rien publié : « aucun post publié » ; en retard : combien manquent ; à jour : rien", () => {
    expect(problemesSemaine(compte({ posts: semaine(0) }), posting, "2026-10-28").map((r) => r.cle)).toEqual(["aucunPostPublie"]);
    const retard = problemesSemaine(compte({ posts: semaine(2) }), posting, "2026-10-28");
    expect(retard).toEqual([{ cle: "postsManquants", valeurs: { n: 2 } }]);
    expect(problemesSemaine(compte({ posts: semaine(4) }), posting, "2026-10-28")).toEqual([]);
  });

  it("posté sans warm-up : signalé même s'il est à jour", () => {
    const c = compte({ releves: [releve({ existe: false })], posts: semaine(4) });
    expect(problemesSemaine(c, posting, "2026-10-28").map((r) => r.cle)).toEqual(["sansWarmup"]);
  });
});
