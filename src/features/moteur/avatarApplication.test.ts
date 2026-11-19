/**
 * Photo de profil d'un compte : elle vient de la banque de SON application
 * (19/11). Avant, le choix lisait `comptes.application_id`, qui vaut Sophia
 * pour tous les comptes : un compte Atala recevait une photo `smart_girl` de
 * Sophia. Les décisions pures et le parcours complet sur une base simulée.
 */
import { describe, expect, it } from "vitest";

import { avatarPourCompte } from "../../../supabase/functions/_shared/avatar";
import {
  genreDuLabelPhoto,
  labelsFreres,
  slugApplicationDuCompte,
} from "../../../supabase/functions/_shared/avatar_application";
import { applicationReelleDuCompte } from "../../../supabase/functions/_shared/persona";

const SOPHIA = "app-sophia";
const ATALA = "app-atala";
const MICABO = "app-micabo";

const LABELS = [
  { id: "classic_girl_run", nom: "classic_girl_run", slug: "classic-girl-run", genre: "femme" },
  { id: "clean_girl_run", nom: "clean_girl_run", slug: "clean-girl-run", genre: "femme" },
  { id: "male_run", nom: "male_run", slug: "male-run", genre: "homme" },
  { id: "manga_tok", nom: "manga_tok", slug: "manga-tok", genre: "homme" },
  { id: "smart_girl", nom: "smart_girl", slug: "smart-girl", genre: "femme" },
  { id: "beau_smart_girl", nom: "beau_smart_girl", slug: "beau-smart-girl", genre: null },
  { id: "clean_study", nom: "clean_study", slug: "clean-study", genre: null },
];
const LIENS = [
  { label_id: "classic_girl_run", application_id: ATALA },
  { label_id: "clean_girl_run", application_id: ATALA },
  { label_id: "male_run", application_id: ATALA },
  { label_id: "manga_tok", application_id: ATALA },
  { label_id: "smart_girl", application_id: SOPHIA },
  { label_id: "beau_smart_girl", application_id: SOPHIA },
  { label_id: "beau_smart_girl", application_id: MICABO },
  { label_id: "clean_study", application_id: MICABO },
];

interface Media {
  id: string;
  application_id: string | null;
  labels: string[];
  source?: string | null;
  texte_restant?: boolean;
  storage_path?: string;
}
const photo = (id: string, application_id: string | null, labels: string[], plus: Partial<Media> = {}): Media => ({
  id, application_id, labels, ...plus,
});
const url = (id: string) => `https://x/medias/${id}.jpg`;

/** La banque du 19/11, en petit : les photos de Sophia, de micabo (rangées sous Sophia) et d'Atala. */
const BANQUE: Media[] = [
  photo("sg1", SOPHIA, ["smart_girl"]),
  photo("bsg1", SOPHIA, ["beau_smart_girl"]),
  photo("cs1", SOPHIA, ["clean_study"]),
  photo("cgr_s1", SOPHIA, ["clean_girl_run"]),
  photo("cgr_a1", ATALA, ["clean_girl_run"]),
  photo("mr_a1", ATALA, ["male_run"]),
];

interface Base {
  medias: Media[];
  /** Photos déjà portées par un compte. */
  prises?: string[];
  sources?: { id: string; avatar_url: string | null; avatar_media_id: string | null; application_id: string | null }[];
  /** Une table en panne : la lecture lève. */
  panne?: string;
}

/** Un client Supabase minimal : les seules lectures que fait le choix de la photo. */
function fauxSupabase(base: Base) {
  const lus: { table: string; filtres: [string, string, unknown][] }[] = [];
  const client = {
    lus,
    from(table: string) {
      if (base.panne === table) throw new Error(`${table} en panne`);
      const filtres: [string, string, unknown][] = [];
      let unSeul = false;
      const vaut = (op: string, col: string) => filtres.find((f) => f[0] === op && f[1] === col)?.[2];
      const resoudre = (): { data: unknown; error: null } => {
        lus.push({ table, filtres });
        if (table === "comptes") return { data: (base.prises ?? []).map((id) => ({ avatar_url: url(id) })), error: null };
        if (table === "applications") {
          return { data: [{ id: SOPHIA, slug: "sophia" }, { id: ATALA, slug: "atala" }, { id: MICABO, slug: "micabo" }], error: null };
        }
        if (table === "label_applications") {
          const app = vaut("eq", "application_id");
          const label = vaut("eq", "label_id");
          return { data: LIENS.filter((l) => (!app || l.application_id === app) && (!label || l.label_id === label)), error: null };
        }
        if (table === "labels") {
          const ids = vaut("in", "id") as string[] | undefined;
          return { data: LABELS.filter((l) => !ids || ids.includes(l.id)), error: null };
        }
        if (table === "comptes_reference") {
          const s = (base.sources ?? []).find((x) => x.id === vaut("eq", "id")) ?? null;
          return { data: unSeul ? s : s ? [s] : [], error: null };
        }
        if (table === "media_library") {
          const app = vaut("eq", "application_id");
          const unLabel = vaut("eq", "media_labels.label_id") as string | undefined;
          const desLabels = vaut("in", "media_labels.label_id") as string[] | undefined;
          const source = vaut("eq", "compte_reference_id");
          const data = base.medias
            .filter((m) => m.texte_restant !== true && (m.storage_path ?? "propre/x").startsWith("propre/"))
            .filter((m) => !app || m.application_id === app)
            .filter((m) => !unLabel || m.labels.includes(unLabel))
            .filter((m) => !desLabels || m.labels.some((l) => desLabels.includes(l)))
            .filter((m) => !source || m.source === source)
            .map((m) => ({ id: m.id, url: url(m.id), used_count: 0 }));
          return { data, error: null };
        }
        throw new Error(`table inattendue : ${table}`);
      };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filtres.push(["eq", c, v]), q),
        in: (c: string, v: unknown) => (filtres.push(["in", c, v]), q),
        not: (c: string, _op: string, v: unknown) => (filtres.push(["not", c, v]), q),
        like: (c: string, v: unknown) => (filtres.push(["like", c, v]), q),
        order: () => q,
        limit: () => q,
        maybeSingle: () => ((unSeul = true), q),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve().then(resoudre).then(ok, ko),
      };
      return q;
    },
  };
  // Le type du client des fonctions Edge (Deno) n'existe pas côté front.
  return client as unknown as Parameters<typeof avatarPourCompte>[0] & { lus: typeof lus };
}

/** Le choix pour un compte de ce label et de cette application. */
async function choisir(base: Base, labelId: string, applicationId: string | null, genre: "homme" | "femme" | null, source: string | null = null) {
  const r = await avatarPourCompte(fauxSupabase(base), {
    compteReferenceId: source,
    labelId,
    labelNom: labelId,
    applicationId,
    genre,
  });
  return r?.id ?? null;
}

describe("l'application d'un compte, pour sa photo de profil", () => {
  it("sa répartition la dit : un compte 100 % Atala est un compte Atala", () => {
    expect(slugApplicationDuCompte({ atala: 100 }, ["atala"])).toBe("atala");
    // Même si son label servait aussi Sophia.
    expect(slugApplicationDuCompte({ atala: 100 }, ["sophia", "atala"])).toBe("atala");
    expect(slugApplicationDuCompte({ micabo: 100 }, [])).toBe("micabo");
    // Compte mixte : la plus grosse part ; à égalité Sophia, puis l'alphabet.
    expect(slugApplicationDuCompte({ sophia: 30, unswipe: 70 }, [])).toBe("unswipe");
    expect(slugApplicationDuCompte({ unswipe: 50, sophia: 50 }, [])).toBe("sophia");
    expect(slugApplicationDuCompte({ unswipe: 50, micabo: 50 }, [])).toBe("micabo");
  });

  it("sans répartition : Sophia si son label la sert (toute la flotte), sinon l'application de son label", () => {
    expect(slugApplicationDuCompte(null, ["sophia"])).toBe("sophia");
    expect(slugApplicationDuCompte(null, ["micabo", "sophia"])).toBe("sophia");
    expect(slugApplicationDuCompte(null, ["atala"])).toBe("atala");
    expect(slugApplicationDuCompte({}, ["micabo"])).toBe("micabo");
    expect(slugApplicationDuCompte({ atala: 0 }, ["micabo"])).toBe("micabo");
    // Rien de connu : null, l'appelant garde ce qu'il avait.
    expect(slugApplicationDuCompte(null, [])).toBeNull();
    expect(slugApplicationDuCompte("n'importe quoi", [])).toBeNull();
  });

  it("applicationReelleDuCompte : lue en base, jamais dans la colonne historique quand on sait mieux", async () => {
    const base = fauxSupabase({ medias: [] });
    // Les 5 comptes du 19/11 : colonne = Sophia, répartition = Atala.
    expect(await applicationReelleDuCompte(base, { application_id: SOPHIA, parts_applications: { atala: 100 } }, "classic_girl_run")).toBe(ATALA);
    // Pas de répartition : les cases de son label.
    expect(await applicationReelleDuCompte(base, { application_id: SOPHIA, parts_applications: null }, "clean_study")).toBe(MICABO);
    expect(await applicationReelleDuCompte(base, { application_id: SOPHIA, parts_applications: null }, "beau_smart_girl")).toBe(SOPHIA);
    expect(await applicationReelleDuCompte(base, { application_id: SOPHIA, parts_applications: null }, "smart_girl")).toBe(SOPHIA);
    // Ni répartition ni label, ou application inconnue de la base : la colonne, comme avant.
    expect(await applicationReelleDuCompte(base, { application_id: SOPHIA, parts_applications: null }, null)).toBe(SOPHIA);
    expect(await applicationReelleDuCompte(base, { application_id: SOPHIA, parts_applications: { disparue: 100 } }, null)).toBe(SOPHIA);
  });

  it("applicationReelleDuCompte ne lève jamais : lecture en panne, la colonne", async () => {
    const enPanne = fauxSupabase({ medias: [], panne: "applications" });
    expect(await applicationReelleDuCompte(enPanne, { application_id: SOPHIA, parts_applications: { atala: 100 } }, "classic_girl_run")).toBe(SOPHIA);
    expect(await applicationReelleDuCompte(enPanne, { parts_applications: { atala: 100 } }, null)).toBeNull();
  });
});

describe("les labels frères, dans l'application du compte", () => {
  const ATALA_LABELS = LABELS.filter((l) => LIENS.some((x) => x.label_id === l.id && x.application_id === ATALA));

  it("classic_girl_run : aucun label Atala du même thème ; clean_girl_run a le même genre, pas male_run ni manga_tok", () => {
    expect(labelsFreres({ labelId: "classic_girl_run", labelNom: "classic_girl_run", genre: "femme", labels: ATALA_LABELS })).toEqual({
      memeTheme: [],
      memeGenre: ["clean_girl_run"],
    });
    expect(labelsFreres({ labelId: "male_run", labelNom: "male_run", genre: "homme", labels: ATALA_LABELS })).toEqual({
      memeTheme: [],
      memeGenre: ["manga_tok"],
    });
  });

  it("le thème d'abord, jamais le label du compte, jamais un label de l'autre genre", () => {
    const sophia = [
      { id: "smart_girl", nom: "smart_girl", genre: "femme" },
      { id: "beau_smart_girl", nom: "beau_smart_girl", genre: null },
      { id: "smart_boy", nom: "smart_boy", genre: "homme" },
      { id: "clean_girl", nom: "clean_girl", genre: "femme" },
      { id: "white_bg", nom: "white_bg", genre: null },
    ];
    expect(labelsFreres({ labelId: "smart_girl", labelNom: "smart_girl", genre: "femme", labels: sophia })).toEqual({
      // smart_boy a le thème « smart » mais c'est un label homme.
      memeTheme: ["beau_smart_girl"],
      memeGenre: ["clean_girl"],
    });
    // Genre du compte inconnu : le thème seul, aucun frère par genre.
    expect(labelsFreres({ labelId: "smart_girl", labelNom: "smart_girl", genre: null, labels: sophia })).toEqual({
      memeTheme: ["beau_smart_girl", "smart_boy"],
      memeGenre: [],
    });
    // Sans label, « default » ne désigne aucune famille.
    expect(labelsFreres({ labelId: null, labelNom: null, genre: "femme", labels: sophia }).memeTheme).toEqual([]);
  });

  it("le genre d'un label : sa colonne, sinon son nom", () => {
    expect(genreDuLabelPhoto({ id: "x", nom: "manga_tok", genre: "homme" })).toBe("homme");
    expect(genreDuLabelPhoto({ id: "x", nom: "clean_girl_run", genre: null })).toBe("femme");
    expect(genreDuLabelPhoto({ id: "x", nom: "white_bg" })).toBeNull();
  });
});

describe("avatarPourCompte : la photo vient de la banque de l'application du compte", () => {
  it("un compte Atala prend la photo Atala de son label (avant : jamais, le choix ne cherchait que sous Sophia)", async () => {
    const base = { medias: [...BANQUE, photo("classic_a1", ATALA, ["classic_girl_run"])] };
    expect(await choisir(base, "classic_girl_run", ATALA, "femme")).toBe("classic_a1");
    // Même vu comme Sophia (la colonne historique), il prend désormais la photo de SON label, plus celle de smart_girl.
    expect(await choisir(base, "classic_girl_run", SOPHIA, "femme")).toBe("classic_a1");
  });

  it("son label sans photo : une photo Atala d'un label Atala du même genre, jamais une photo de Sophia", async () => {
    expect(await choisir({ medias: BANQUE }, "classic_girl_run", ATALA, "femme")).toBe("cgr_a1");
    // La photo Atala prise : l'autre photo du MÊME label clean_girl_run, pas celle de smart_girl.
    expect(await choisir({ medias: BANQUE, prises: ["cgr_a1"] }, "classic_girl_run", ATALA, "femme")).toBe("cgr_s1");
  });

  it("plus aucune photo de femme chez Atala : le reste du rayon Atala, puis rien ; jamais une autre application", async () => {
    expect(await choisir({ medias: BANQUE, prises: ["cgr_a1", "cgr_s1"] }, "classic_girl_run", ATALA, "femme")).toBe("mr_a1");
    expect(await choisir({ medias: BANQUE, prises: ["cgr_a1", "cgr_s1", "mr_a1"] }, "classic_girl_run", ATALA, "femme")).toBeNull();
    // Une application sans aucune photo : rien, pas une photo de Sophia.
    const sansAtala = BANQUE.filter((m) => !m.labels.some((l) => l.endsWith("_run")));
    expect(await choisir({ medias: sansAtala }, "classic_girl_run", ATALA, "femme")).toBeNull();
  });

  it("un compte micabo garde les photos de son label, même rangées sous Sophia (le label fait la banque)", async () => {
    expect(await choisir({ medias: BANQUE }, "clean_study", MICABO, null)).toBe("cs1");
  });

  it("un compte Sophia : son label, puis son thème ; jamais une photo d'un label Atala", async () => {
    expect(await choisir({ medias: BANQUE }, "smart_girl", SOPHIA, "femme")).toBe("sg1");
    expect(await choisir({ medias: BANQUE, prises: ["sg1"] }, "smart_girl", SOPHIA, "femme")).toBe("bsg1");
    // Label et thème épuisés : le reste du rayon Sophia (dont une photo de clean_girl_run rangée sous Sophia), jamais le rayon Atala.
    const reste = await choisir({ medias: BANQUE, prises: ["sg1", "bsg1"] }, "smart_girl", SOPHIA, "femme");
    expect(["cs1", "cgr_s1"]).toContain(reste);
  });

  it("la photo préparée d'une source d'une AUTRE application n'est pas prise (tous les comptes naissent avec une source Sophia)", async () => {
    const sources = [{ id: "src-sophia", avatar_url: url("pdp_source"), avatar_media_id: "pdp_source", application_id: SOPHIA }];
    const sansPhotoAtala = { medias: BANQUE.filter((m) => m.application_id !== ATALA && !m.labels.includes("clean_girl_run")), sources };
    expect(await choisir(sansPhotoAtala, "classic_girl_run", ATALA, "femme", "src-sophia")).toBeNull();
    // Pour un compte Sophia, elle sert toujours, après son label et son thème.
    expect(await choisir({ medias: [], sources }, "smart_girl", SOPHIA, "femme", "src-sophia")).toBe("pdp_source");
  });

  it("ne lit que des photos nettoyées (dossier propre/, sans texte restant)", async () => {
    const medias = [
      photo("sale", ATALA, ["classic_girl_run"], { texte_restant: true }),
      photo("brut", ATALA, ["classic_girl_run"], { storage_path: "brut/x.jpg" }),
      photo("ok", ATALA, ["classic_girl_run"], { storage_path: "propre/banque/ok.jpg" }),
    ];
    expect(await choisir({ medias }, "classic_girl_run", ATALA, "femme")).toBe("ok");
  });

  it("application inconnue (aucune répartition, aucun label lisible) : pas de filtre, comme avant", async () => {
    expect(await choisir({ medias: [photo("x1", SOPHIA, ["classic_girl_run"])] }, "classic_girl_run", null, "femme")).toBe("x1");
  });
});
