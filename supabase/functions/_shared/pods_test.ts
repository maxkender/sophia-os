import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { oublierSondeMultiApp } from "./applications_moteur.ts";
import { ID_SOPHIA } from "./multi_app.ts";
import { NOTE_ORIGINAL_POD } from "./pertinence_apps.ts";
import {
  applicationsHorsSophia,
  AUTO_VALIDATION_HEURES,
  CHEMIN_POD,
  contenusLivresHorsApplication,
  contenusLivresHorsLangue,
  deckLivreApplication,
  deckLivrePret,
  decksApplicationDepuisBase,
  ecrireDecksApplications,
  estSlideApp,
  livraisonsAutoValidables,
  metadonneesJpeg,
  NOTE_TIER_POD,
  ouvrirApplicationsOriginal,
  pertinenceOriginalApplication,
  motsCherches,
  PODS_AVEC_PREUVE,
  prochainJour,
  sha256Hex,
  verifierDecksApplications,
  verifierDepot,
  verifierOriginal,
  verifierPreuve,
  verifierVideo,
} from "./pods.ts";
import { oublierSondeTiersApplication } from "./tiers_application.ts";

Deno.test("deckLivrePret : toutes les slides doivent avoir leur image", () => {
  assertEquals(deckLivrePret([]), false);
  assertEquals(deckLivrePret(null), false);
  assertEquals(deckLivrePret([{ position: 1, media_id: "a" }, { position: 2, media_id: null }]), false);
  assertEquals(deckLivrePret([{ position: 1, media_id: "a" }, { position: 2, media_id: "b" }]), true);
});

Deno.test("metadonneesJpeg : repère EXIF, ICC, C2PA, commentaires ; ignore JFIF", () => {
  const seg = (m: number, n = 4) => [0xff, m, 0, n + 2, ...new Array(n).fill(0)];
  const jpeg = (...segs: number[][]) => new Uint8Array([0xff, 0xd8, ...segs.flat(), 0xff, 0xda, 0, 2]);
  assertEquals(metadonneesJpeg(jpeg(seg(0xe0))), []);
  assertEquals(metadonneesJpeg(jpeg(seg(0xe0), seg(0xe1), seg(0xe2), seg(0xeb), seg(0xfe))), ["0xe1", "0xe2", "0xeb", "0xfe"]);
  assertEquals(metadonneesJpeg(new Uint8Array([0x89, 0x50])), null);
});

Deno.test("verifierDepot : langue source, slide de l'app, positions uniques", () => {
  const s = (position: number, position_sophia = false) => ({ position, position_sophia, jpeg_base64: "" });
  assertEquals(verifierDepot({ fr: { slides: [s(1), s(2, true)] } }, "fr"), []);
  assertEquals(verifierDepot({}, "fr"), ["aucun deck"]);
  assertEquals(verifierDepot({ de: { slides: [s(1, true)] } }, "fr"), ["pas de deck dans la langue source (fr)"]);
  assertEquals(verifierDepot({ fr: { slides: [s(1), s(1, true)] } }, "fr"), ["fr : positions en double"]);
  assertEquals(verifierDepot({ fr: { slides: [s(1)] } }, "fr"), ["fr : aucune slide de l'app"]);
});

Deno.test("verifierDepot (label hors Sophia) : une slide de l'application, jamais la couverture", () => {
  const s = (position: number, app?: "app" | "sophia") => ({
    position,
    jpeg_base64: "",
    ...(app === "app" ? { position_app: true } : {}),
    ...(app === "sophia" ? { position_sophia: true } : {}),
  });
  assertEquals(verifierDepot({ en: { slides: [s(1), s(2, "app")] } }, "en", "application"), []);
  // `position_sophia` reste l'alias de la slide de l'app.
  assertEquals(verifierDepot({ en: { slides: [s(1), s(2, "sophia")] } }, "en", "application"), []);
  assertEquals(
    verifierDepot({ en: { slides: [s(1), s(2)] } }, "en", "application"),
    ["en : 0 slide(s) de l'app (une seule attendue)"],
  );
  assertEquals(
    verifierDepot({ en: { slides: [s(1), s(2, "app"), s(3, "app")] } }, "en", "application"),
    ["en : 2 slide(s) de l'app (une seule attendue)"],
  );
  assertEquals(
    verifierDepot({ en: { slides: [s(1, "app"), s(2)] } }, "en", "application"),
    ["en : la slide de l'app ne peut pas être la couverture"],
  );
  // Le chemin Sophia ne lit toujours que `position_sophia`.
  assertEquals(verifierDepot({ en: { slides: [s(1), s(2, "app")] } }, "en"), ["en : aucune slide de l'app"]);
});

Deno.test("decksApplicationDepuisBase : mêmes images, triées, la slide de l'app marquée", () => {
  const d = decksApplicationDepuisBase("unswipe", {
    en: {
      hashtags: "#a",
      slides: [
        { position: 2, media_id: "m2", url: "u2", app: true },
        { position: 1, media_id: "m1", url: null, app: false },
      ],
    },
    fr: { hashtags: "", slides: [{ position: 1, media_id: "f1", url: "v1", app: false }, { position: 2, media_id: "f2", url: "v2", app: true }] },
  });
  assertEquals(d, {
    unswipe: {
      en: {
        hashtags: "#a",
        slides: [
          { position: 1, media_id: "m1", url: null, position_sophia: false },
          { position: 2, media_id: "m2", url: "u2", position_sophia: true },
        ],
      },
      fr: {
        hashtags: "",
        slides: [
          { position: 1, media_id: "f1", url: "v1", position_sophia: false },
          { position: 2, media_id: "f2", url: "v2", position_sophia: true },
        ],
      },
    },
  });
});

Deno.test("applicationsHorsSophia : null dès que le label sert Sophia (ou n'a pas de ligne)", () => {
  assertEquals(applicationsHorsSophia([], "sophia-id"), null);
  assertEquals(applicationsHorsSophia(["sophia-id"], "sophia-id"), null);
  assertEquals(applicationsHorsSophia(["sophia-id", "unswipe-id"], "sophia-id"), null);
  assertEquals(applicationsHorsSophia(["unswipe-id"], "sophia-id"), ["unswipe-id"]);
  assertEquals(applicationsHorsSophia(["micabo-id", "unswipe-id"], "sophia-id"), ["micabo-id", "unswipe-id"]);
});

Deno.test("verifierDepot : accepte une variante régionale, refuse un code mal formé", () => {
  const s = (position: number, position_sophia = false) => ({ position, position_sophia, jpeg_base64: "" });
  // Le test « deux lettres » refusait tout deck brésilien ou latino-américain.
  assertEquals(verifierDepot({ "pt-BR": { slides: [s(1), s(2, true)] } }, "pt-BR"), []);
  assertEquals(verifierDepot({ "es-419": { slides: [s(1), s(2, true)] } }, "es-419"), []);
  assertEquals(
    verifierDepot({ "pt-br": { slides: [s(1), s(2, true)] } }, "pt-br"),
    ["langue invalide : pt-br"],
  );
  assertEquals(
    verifierDepot({ "pt-BRA": { slides: [s(1), s(2, true)] } }, "pt-BRA"),
    ["langue invalide : pt-BRA"],
  );
});

Deno.test("sha256Hex", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("verifierOriginal : positions, images, une slide Sophia, inspiration, aucune autre appli", () => {
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const ref = (n: number) => `https://abc.supabase.co/storage/v1/object/public/medias/brut/7667/${n}.jpg`;
  const ok = [1, 2, 3, 4, 5, 6].map((p) => ({
    position: p,
    media_id: id(p),
    texte_overlay: `slide ${p}`,
    reference_url: ref(p),
    texte_sophia: p === 5 ? "a micro-learning app like the Sophia app" : undefined,
  }));
  const avec = (i: number, champ: Record<string, unknown>) => ok.map((s, k) => (k === i ? { ...s, ...champ } : s));
  assertEquals(verifierOriginal(ok), []);
  assertEquals(verifierOriginal(ok.slice(0, 3)).length > 0, true);
  assertEquals(verifierOriginal(avec(5, { position: 7 })).length > 0, true);
  assertEquals(verifierOriginal(avec(5, { media_id: id(1) })), ["même image utilisée deux fois"]);
  assertEquals(verifierOriginal(avec(5, { texte_overlay: "i use the sophia app" })).length, 1);
  assertEquals(verifierOriginal(avec(5, { texte_overlay: "the vent now app helped" })).length, 1);
  assertEquals(verifierOriginal(avec(4, { texte_overlay: "adapté à l'offre avec turboresume" })).length, 1);
  assertEquals(verifierOriginal(avec(4, { texte_overlay: "je mets mes cours dans bycat" })).length, 1);
  assertEquals(verifierOriginal(avec(4, { texte_overlay: "i practice on elqo.app every day" })).length, 1);
  assertEquals(verifierOriginal(avec(4, { texte_overlay: "j'apprends avec Micabo" })).length, 1);
  assertEquals(verifierOriginal(avec(0, { texte_overlay: "x".repeat(121) })).length, 1);
  assertEquals(verifierOriginal(avec(5, { texte_overlay: " " })), ["#6 : texte vide"]);
  assertEquals(verifierOriginal(avec(4, { texte_sophia: null })), ["0 slide(s) Sophia (une seule attendue)"]);
  assertEquals(verifierOriginal(avec(3, { texte_sophia: "the Sophia app" })).length, 1);
  assertEquals(verifierOriginal(avec(4, { texte_sophia: "a micro-learning app" })).length, 1);
  assertEquals(verifierOriginal(avec(2, { reference_url: "https://p16.tiktokcdn.com/x.jpg" })).length, 1);
});

Deno.test("PODS_AVEC_PREUVE : pods 4, 5, 7, 8 et 9 seulement", () => {
  assertEquals([...PODS_AVEC_PREUVE].sort(), [
    "originaux_alpha_male",
    "originaux_alpha_yellow",
    "originaux_beau_smart_girl",
    "originaux_rh",
    "originaux_smart_girl",
  ]);
});

Deno.test("verifierPreuve : 200 k vues en 30 jours suffisent ; sinon des contenus du label à faire mesurer par l'OS", () => {
  const jour = "2026-10-15";
  const tiktok = (vues: number, publie_le: string, url = "https://www.tiktok.com/@stonemag.co/video/7689427930929319176") => ({
    type: "tiktok",
    url,
    vues,
    publie_le,
  });
  const os = { type: "os", contenu_id: "2A9D2D47-9EBA-4122-BBBA-49A09BA8A933" };
  const preuve = (...references: unknown[]) => ({ schema: "N skills that'll make you dangerously X in your 20s", references });

  assertEquals(verifierPreuve(preuve(tiktok(1_300_000, "2026-09-25")), jour), { erreurs: [], tiktokSuffit: true, contenusOs: [] });
  // Pile 30 jours : encore valable ; 31 : trop vieux. Sous 200 k : ne suffit pas.
  assertEquals(verifierPreuve(preuve(tiktok(200_000, "2026-09-15")), jour).tiktokSuffit, true);
  assertEquals(verifierPreuve(preuve(tiktok(900_000, "2026-09-14")), jour).tiktokSuffit, false);
  assertEquals(verifierPreuve(preuve(tiktok(199_999, "2026-10-10")), jour).tiktokSuffit, false);
  // Un contenu du label : rien ne suffit encore, l'OS recalcule son r (uuid en minuscules, sans doublon).
  assertEquals(verifierPreuve(preuve(os, os, tiktok(5_000, "2026-10-01")), jour), {
    erreurs: [],
    tiktokSuffit: false,
    contenusOs: ["2a9d2d47-9eba-4122-bbba-49a09ba8a933"],
  });

  assertEquals(verifierPreuve(null, jour).erreurs.length, 2);
  assertEquals(verifierPreuve({ schema: " ", references: [tiktok(300_000, "2026-10-01")] }, jour).erreurs, [
    "preuve : schéma d'accroche manquant",
  ]);
  assertEquals(verifierPreuve(preuve(tiktok(300_000, "2026-10-16")), jour).erreurs, ["preuve #1 : date de publication dans le futur"]);
  assertEquals(verifierPreuve(preuve(tiktok(300_000, "16/10/2026")), jour).erreurs.length, 1);
  const lienFaux = verifierPreuve(preuve(tiktok(300_000, "2026-10-01", "https://tiktok.com/x")), jour);
  assertEquals(lienFaux.erreurs, ["preuve #1 : lien TikTok invalide"]);
  assertEquals(lienFaux.tiktokSuffit, false);
  assertEquals(verifierPreuve(preuve(tiktok(-3, "2026-10-01")), jour).erreurs, ["preuve #1 : vues invalides"]);
  assertEquals(verifierPreuve(preuve({ type: "os", contenu_id: "2a9d2d47" }), jour).erreurs.length, 1);
  assertEquals(verifierPreuve(preuve({ type: "instagram" }), jour).erreurs.length, 1);
  assertEquals(verifierPreuve(preuve(...Array(7).fill(os)), jour).erreurs.length, 1);
});

/** Client minimal : `from(table)` → filtres eq/in appliqués sur des lignes fixes. */
function faux(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let lignes = tables[table] ?? [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((lignes = lignes.filter((l) => l[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((lignes = lignes.filter((l) => vs.includes(l[c]))), q),
        then: (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve(ok({ data: lignes, error: null })),
      };
      return q;
    },
  };
}

Deno.test("contenusLivresHorsLangue : retire les livrés sans deck complet dans la langue", async () => {
  const sb = faux({
    contenus: [
      { id: "a", livre: true },
      { id: "b", livre: true },
      { id: "c", livre: false },
    ],
    contenu_langues: [
      { contenu_id: "a", langue: "en", slides: [{ position: 1, media_id: "m1" }] },
      { contenu_id: "b", langue: "en", slides: [{ position: 1, media_id: null }] },
      { contenu_id: "a", langue: "fr", slides: [{ position: 1, media_id: "m2" }] },
      { contenu_id: "b", langue: "fr", slides: [{ position: 1, media_id: "m3" }] },
    ],
  });
  assertEquals([...(await contenusLivresHorsLangue(sb, "en"))], ["b"]);
  assertEquals([...(await contenusLivresHorsLangue(sb, "fr"))], []);
  assertEquals([...(await contenusLivresHorsLangue(sb, "de"))].sort(), ["a", "b"]);
});

Deno.test("verifierVideo : chemins du pod, textes, comptes uniques", () => {
  const c = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const item = (n: number) => ({
    compte_id: c(n),
    reaction_path: `pods/reactions_ugc/reactions/hook-01/${c(n)}.mp4`,
    texte_ecran: "je pourrais EMBRASSER la personne qui m'a montré ça",
    legende: "#culture #apprendre #astuce",
  });
  assertEquals(verifierVideo("reactions_ugc", [item(1), item(2)]), []);
  assertEquals(verifierVideo("reactions_ugc", []), ["aucun compte"]);
  assertEquals(verifierVideo("reactions_ugc", [item(1), item(1)]), ["même compte deux fois"]);
  assertEquals(verifierVideo("reactions_ugc", [{ ...item(1), reaction_path: "autre/x.mp4" }]).length, 1);
  assertEquals(verifierVideo("reactions_ugc", [{ ...item(1), texte_ecran: " " }]).length, 1);
});

Deno.test("prochainJour : demain au plus tôt, puis le lendemain de la dernière vidéo", () => {
  assertEquals(prochainJour(null, "2026-10-06"), "2026-10-07");
  assertEquals(prochainJour("2026-10-01", "2026-10-06"), "2026-10-07");
  assertEquals(prochainJour("2026-10-09", "2026-10-06"), "2026-10-10");
  assertEquals(prochainJour("2026-12-31", "2026-12-30"), "2027-01-01");
});

Deno.test("CHEMIN_POD : personas, réactions et sources seulement", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assertEquals(CHEMIN_POD.test(`personas/${id}.jpg`), true);
  assertEquals(CHEMIN_POD.test(`reactions/hook-01/${id}.mp4`), true);
  assertEquals(CHEMIN_POD.test(`../propre/x.jpg`), false);
  assertEquals(CHEMIN_POD.test(`reactions/hook-01/${id}.mov`), false);
  assertEquals(CHEMIN_POD.test(`sources/hook-01/reaction.mp4`), true);
  assertEquals(CHEMIN_POD.test(`sources/hook-01/${id}.jpg`), true);
  assertEquals(CHEMIN_POD.test(`sources/hook-01/autre.mp4`), false);
  assertEquals(CHEMIN_POD.test(`sources/../x/reaction.mp4`), false);
});

// ---------------------------------------------------------------------------
// Decks d'application livrés (0276)
// ---------------------------------------------------------------------------

Deno.test("verifierDecksApplications : slug, langue Sophia, positions, une slide de l'app hors couverture", () => {
  const img = (position: number, app = false) => ({ position, position_app: app, jpeg_base64: "x" });
  const rep = (position: number) => ({ position, reprendre: true });
  const langues = new Set(["fr", "en"]);
  const positions = new Map([["fr", [1, 2, 3]], ["en", [1, 2, 3]]]);
  const pubs = new Map([["fr", [3]]]);
  const ok = { unswipe: { fr: { slides: [rep(1), img(2, true), rep(3)] } } };
  const v = (d: unknown, p: Map<string, number[]> = positions) =>
    verifierDecksApplications(d as Parameters<typeof verifierDecksApplications>[0], langues, p);
  assertEquals(v(ok), []);
  assertEquals(v(undefined), []);
  // position_sophia vaut alias de position_app.
  assertEquals(v({ unswipe: { fr: { slides: [rep(1), { position: 2, position_sophia: true, jpeg_base64: "x" }, rep(3)] } } }), []);
  assertEquals(v({ "Un Swipe": { fr: ok.unswipe.fr } }), ["application invalide : Un Swipe"]);
  assertEquals(v({ sophia: { fr: ok.unswipe.fr } }).length, 1);
  assertEquals(v({ unswipe: {} }), ["unswipe : aucun deck"]);
  assertEquals(v({ unswipe: { de: ok.unswipe.fr } }), ["unswipe de : pas de deck Sophia dans cette langue"]);
  assertEquals(v({ unswipe: { fra: ok.unswipe.fr } }), ["unswipe : langue invalide : fra"]);
  assertEquals(v({ unswipe: { fr: { slides: [] } } }), ["unswipe fr : deck vide"]);
  assertEquals(v({ unswipe: { fr: { slides: [rep(1), img(1, true), rep(3)] } } }).includes("unswipe fr : positions en double"), true);
  assertEquals(v({ unswipe: { fr: { slides: [rep(1), img(2), rep(3)] } } }), [
    "unswipe fr : 0 slide(s) de l'app (une seule attendue)",
  ]);
  assertEquals(v({ unswipe: { fr: { slides: [rep(1), img(2, true), img(3, true)] } } }), [
    "unswipe fr : 2 slide(s) de l'app (une seule attendue)",
  ]);
  assertEquals(v({ unswipe: { fr: { slides: [img(1, true), rep(2), rep(3)] } } }), [
    "unswipe fr : la slide de l'app ne peut pas être la couverture",
  ]);
  assertEquals(v({ unswipe: { fr: { slides: [rep(1), img(2, true)] } } }), [
    "unswipe fr : positions 1,2 au lieu de celles du deck Sophia (1,2,3)",
  ]);
  assertEquals(v({ unswipe: { fr: { slides: [rep(1), { position: 2, position_app: true, reprendre: true }, rep(3)] } } }), [
    "unswipe fr #2 : la slide de l'app doit être une image (pas reprendre)",
  ]);
  assertEquals(v({ unswipe: { fr: { slides: [{ position: 1 }, img(2, true), rep(3)] } } }), [
    "unswipe fr #1 : image manquante (jpeg_base64 ou reprendre)",
  ]);
  // Reprendre la slide Sophia : ce serait la pub Sophia dans le deck Unswipe.
  assertEquals(verifierDecksApplications(ok, langues, positions, pubs), ["unswipe fr #3 : reprendrait la slide Sophia"]);
  // Langue sans positions connues : pas de comparaison.
  assertEquals(v(ok, new Map()), []);
  assertEquals(estSlideApp({ position_app: true }), true);
  assertEquals(estSlideApp({ position_sophia: true }), true);
  assertEquals(estSlideApp({}), false);
});

type L = Record<string, unknown>;
interface Ecrit {
  table: string;
  op: "update" | "upsert";
  valeurs: unknown;
  options?: { onConflict?: string; ignoreDuplicates?: boolean };
}

/** Faux PostgREST à état, qui journalise les écritures. */
function fauxEtat(tables: Record<string, L[]>, ecrits: Ecrit[]) {
  return {
    from(table: string) {
      const filtres: Array<(l: L) => boolean> = [];
      let op: "select" | "update" | "upsert" = "select";
      let valeurs: unknown = null;
      let options: Ecrit["options"];
      let mode: "liste" | "un" = "liste";
      const lignes = () => (tables[table] ??= []);
      const executer = () => {
        if (op === "select") {
          const r = lignes().filter((l) => filtres.every((f) => f(l)));
          return mode === "un" ? { data: r[0] ?? null, error: null } : { data: r, error: null };
        }
        ecrits.push({ table, op, valeurs, options });
        if (op === "update") {
          for (const l of lignes().filter((l) => filtres.every((f) => f(l)))) Object.assign(l, valeurs);
        } else {
          const cles = (options?.onConflict ?? "id").split(",");
          const v = valeurs as L;
          const ex = lignes().find((l) => cles.every((c) => l[c] === v[c]));
          if (ex && !options?.ignoreDuplicates) Object.assign(ex, v);
          if (!ex) lignes().push({ ...v });
        }
        return { data: null, error: null };
      };
      const q = {
        select: () => q,
        limit: () => q,
        eq: (c: string, v: unknown) => (filtres.push((l) => l[c] === v), q),
        in: (c: string, vs: unknown[]) => (filtres.push((l) => vs.includes(l[c])), q),
        update: (v: unknown) => ((op = "update"), (valeurs = v), q),
        upsert: (v: unknown, o?: Ecrit["options"]) => ((op = "upsert"), (valeurs = v), (options = o), q),
        maybeSingle: () => ((mode = "un"), q),
        single: () => ((mode = "un"), q),
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(executer()).then(ok, ko),
      };
      return q;
    },
  };
}

const UNSWIPE_APP = { id: "app-unswipe", slug: "unswipe" };
const deckApp = (statut: string, slides: L[]) => ({ contenu_id: "c1", langue: "fr", variante: "unswipe", statut, slides });

Deno.test("deckLivreApplication : deck pret fourni par le pod, tel quel, sans écriture", async () => {
  const ecrits: Ecrit[] = [];
  const slides = [
    { position: 1, media_id: "m1", texte_overlay: "", position_sophia: false },
    { position: 2, media_id: "m2u", texte_overlay: "", position_sophia: true },
  ];
  const sb = fauxEtat({
    contenu_langue_decks: [deckApp("pret", slides)],
    contenu_langues: [{ contenu_id: "c1", langue: "fr", hashtags: " #a #b " }],
  }, ecrits);
  assertEquals(await deckLivreApplication(sb, "c1", "fr", UNSWIPE_APP), { statut: "pret", slides, hashtags: "#a #b", cuit: false });
  assertEquals(await deckLivreApplication(sb, "c1", "en", UNSWIPE_APP), {
    statut: "ineligible",
    raison: "contenu livré : pas de deck unswipe en en",
  });
  assertEquals(ecrits, []);
});

Deno.test("deckLivreApplication : deck incomplet ou non prêt → inéligible", async () => {
  for (const ligne of [deckApp("pret", [{ position: 1, media_id: null }]), deckApp("echec", [{ position: 1, media_id: "m" }])]) {
    const sb = fauxEtat({ contenu_langue_decks: [ligne], contenu_langues: [] }, []);
    assertEquals((await deckLivreApplication(sb, "c1", "fr", UNSWIPE_APP)).statut, "ineligible");
  }
});

Deno.test("contenusLivresHorsApplication : retire les livrés sans deck de CETTE application prêt dans la langue", async () => {
  const sb = faux({
    contenus: [
      { id: "a", livre: true },
      { id: "b", livre: true },
      { id: "c", livre: true },
      { id: "d", livre: false },
    ],
    contenu_langue_decks: [
      { contenu_id: "a", langue: "fr", variante: "unswipe", statut: "pret", slides: [{ position: 1, media_id: "m" }] },
      { contenu_id: "b", langue: "fr", variante: "unswipe", statut: "pret", slides: [{ position: 1, media_id: null }] },
      { contenu_id: "c", langue: "fr", variante: "autre", statut: "pret", slides: [{ position: 1, media_id: "m" }] },
      { contenu_id: "c", langue: "en", variante: "unswipe", statut: "pret", slides: [{ position: 1, media_id: "m" }] },
    ],
  });
  assertEquals([...(await contenusLivresHorsApplication(sb, "fr", UNSWIPE_APP))].sort(), ["b", "c"]);
  assertEquals([...(await contenusLivresHorsApplication(sb, "en", UNSWIPE_APP))].sort(), ["a", "b"]);
});

function mondeValidation() {
  return {
    applications: [{ id: "app-unswipe", slug: "unswipe" }] as L[],
    contenu_langues: [{ id: "cl-fr", contenu_id: "c1", langue: "fr" }] as L[],
    contenu_langue_decks: [] as L[],
    contenu_pertinences: [] as L[],
    contenu_tiers_application: [] as L[],
    contenu_application_tier_etat: [] as L[],
    media_library: [{ id: "m1" }, { id: "m2u" }] as L[],
  };
}
const LIVRAISON = {
  id: "liv-1",
  decks_applications: {
    unswipe: {
      fr: {
        hashtags: "#pod",
        slides: [
          { position: 2, media_id: "m2u", url: "u2", position_sophia: true },
          { position: 1, media_id: "m1", url: "u1", position_sophia: false },
        ],
      },
    },
  },
};

Deno.test("ecrireDecksApplications : deck pret origine pod, réserve éligible (note 60), rang B sans écraser", async () => {
  oublierSondeTiersApplication();
  const ecrits: Ecrit[] = [];
  const tables = mondeValidation();
  // Rang déjà vécu pour Unswipe : jamais écrasé (ignoreDuplicates).
  tables.contenu_tiers_application.push({ contenu_id: "c1", application_id: "app-unswipe", tier: "S" });
  const sb = fauxEtat(tables, ecrits);
  const slugs = await ecrireDecksApplications(sb, "c1", LIVRAISON, { tierForce: null, pertinenceScore: 32.4, pod: "page_blanche" });
  assertEquals(slugs, ["unswipe"]);
  const [deck] = tables.contenu_langue_decks;
  assertEquals(deck.contenu_langue_id, "cl-fr");
  assertEquals(deck.application_id, "app-unswipe");
  assertEquals(deck.variante, "unswipe");
  assertEquals(deck.statut, "pret");
  assertEquals(deck.raison, null);
  assertEquals(deck.slides, [
    { position: 1, media_id: "m1", texte_overlay: "", position_sophia: false },
    { position: 2, media_id: "m2u", texte_overlay: "", position_sophia: true },
  ]);
  assertEquals(deck.placement, { origine: "pod", pod: "page_blanche", livraison_id: "liv-1", hashtags_pod: "#pod" });
  const [p] = tables.contenu_pertinences;
  assertEquals([p.eligible, p.note, p.score, p.prompt_cle], [true, 60, 50, "pod"]);
  const tiers = ecrits.find((e) => e.table === "contenu_tiers_application")!;
  assertEquals(tiers.options, { onConflict: "contenu_id,application_id", ignoreDuplicates: true });
  assertEquals((tiers.valeurs as L).tier, "B");
  assertEquals((tiers.valeurs as L).passages_prevus, 2);
  assertEquals(tables.contenu_tiers_application[0].tier, "S");
  assertEquals(tables.media_library.every((m) => m.contenu_id === "c1"), true);
  // Jamais le deck Sophia.
  assertEquals(ecrits.some((e) => e.table === "contenu_langues"), false);
  oublierSondeTiersApplication();
});

Deno.test("ecrireDecksApplications : rang imposé A → note 70, tier A ; pertinence haute gardée", async () => {
  oublierSondeTiersApplication();
  const tables = mondeValidation();
  await ecrireDecksApplications(fauxEtat(tables, []), "c1", LIVRAISON, { tierForce: "A", pertinenceScore: 88, pod: "page_blanche" });
  assertEquals([tables.contenu_pertinences[0].note, tables.contenu_pertinences[0].score], [70, 88]);
  assertEquals([tables.contenu_tiers_application[0].tier, tables.contenu_tiers_application[0].passages_prevus], ["A", 4]);
  oublierSondeTiersApplication();
});

Deno.test("ecrireDecksApplications : label hors Sophia → le rang calculé (tierApp) va à l'application", async () => {
  oublierSondeTiersApplication();
  const tables = mondeValidation();
  await ecrireDecksApplications(fauxEtat(tables, []), "c1", LIVRAISON, {
    tierForce: null,
    pertinenceScore: 91,
    pod: "remakes_mentalapp",
    tierApp: "A",
  });
  assertEquals([tables.contenu_pertinences[0].note, tables.contenu_pertinences[0].score], [70, 91]);
  assertEquals([tables.contenu_tiers_application[0].tier, tables.contenu_tiers_application[0].passages_prevus], ["A", 4]);
  // Rang imposé par l'admin : il passe aussi par `tierApp` (la validation le lui donne).
  const t2 = mondeValidation();
  await ecrireDecksApplications(fauxEtat(t2, []), "c1", LIVRAISON, { tierForce: "C", pertinenceScore: 91, pod: "p", tierApp: "C" });
  assertEquals(t2.contenu_tiers_application[0].tier, "C");
  oublierSondeTiersApplication();
});

Deno.test("ecrireDecksApplications : rien à écrire sans decks ; lève si la langue manque au contenu", async () => {
  const ecrits: Ecrit[] = [];
  const opts = { tierForce: null, pertinenceScore: 0, pod: "p" };
  assertEquals(await ecrireDecksApplications(fauxEtat(mondeValidation(), ecrits), "c1", { id: "x" }, opts), []);
  assertEquals(ecrits, []);
  const tables = mondeValidation();
  tables.contenu_langues = [];
  await assertRejects(() => ecrireDecksApplications(fauxEtat(tables, []), "c1", LIVRAISON, opts));
});

// ---------------------------------------------------------------------------
// Originaux ouverts aux autres applications du label
// ---------------------------------------------------------------------------

Deno.test("pertinenceOriginalApplication : note d'un original (B), seul le sujet décide hors Sophia", () => {
  assertEquals(NOTE_ORIGINAL_POD, NOTE_TIER_POD.B);
  assertEquals(pertinenceOriginalApplication("app-unswipe", 50), { note: 60, eligible: true });
  assertEquals(pertinenceOriginalApplication("app-unswipe", 49), { note: 60, eligible: false });
  assertEquals(pertinenceOriginalApplication(ID_SOPHIA, 0), { note: 60, eligible: true });
});

function mondeOriginal() {
  return {
    label_applications: [
      { label_id: "l1", application_id: ID_SOPHIA },
      { label_id: "l1", application_id: "app-unswipe" },
      { label_id: "l1", application_id: "app-micabo" },
      { label_id: "l-sophia", application_id: ID_SOPHIA },
    ] as L[],
    applications: [
      { id: ID_SOPHIA, slug: "sophia" },
      { id: "app-unswipe", slug: "unswipe" },
      { id: "app-micabo", slug: "micabo" },
    ] as L[],
    prompts: [
      { cle: "pertinence_unswipe", contenu: "P UNSWIPE" },
      { cle: "pertinence_micabo", contenu: "P MICABO" },
    ] as L[],
    // Ligne de la campagne de rattrapage : note des vues (27,5), inéligible.
    contenu_pertinences: [
      { contenu_id: "c1", application_id: "app-unswipe", score: 55, note: 27.5, eligible: false, raison: "campagne", prompt_cle: "pertinence_unswipe" },
    ] as L[],
    contenu_tiers_application: [] as L[],
    contenu_application_tier_etat: [] as L[],
    passages: [] as L[],
  };
}

Deno.test("ouvrirApplicationsOriginal : score repris sans appel, sinon noté ; rang B pour l'éligible seulement", async () => {
  oublierSondeMultiApp();
  oublierSondeTiersApplication();
  const tables = mondeOriginal();
  const ecrits: Ecrit[] = [];
  const appels: unknown[] = [];
  const noter = (i: unknown) => (appels.push(i), Promise.resolve({ score: 40, reason: "hors sujet" }));
  const r = await ouvrirApplicationsOriginal(
    fauxEtat(tables, ecrits),
    "c1",
    "l1",
    { accroche: "hook", legende: "légende", pod: "originaux_weird_alpha" },
    noter,
  );
  assertEquals(r, [
    { slug: "micabo", score: 40, eligible: false, repris: false },
    { slug: "unswipe", score: 55, eligible: true, repris: true },
  ]);
  assertEquals(appels, [{ caption: "légende", hookText: "hook", instructions: "P MICABO" }]);
  const unswipe = tables.contenu_pertinences.find((l) => l.application_id === "app-unswipe")!;
  assertEquals([unswipe.score, unswipe.note, unswipe.eligible, unswipe.raison, unswipe.prompt_cle], [55, 60, true, "campagne", "pertinence_unswipe"]);
  const micabo = tables.contenu_pertinences.find((l) => l.application_id === "app-micabo")!;
  assertEquals([micabo.score, micabo.note, micabo.eligible, micabo.raison, micabo.prompt_cle], [40, 60, false, "hors sujet", "pertinence_micabo"]);
  // Jamais de ligne Sophia.
  assertEquals(tables.contenu_pertinences.some((l) => l.application_id === ID_SOPHIA), false);
  assertEquals(tables.contenu_tiers_application.map((l) => [l.application_id, l.tier, l.passages_prevus]), [["app-unswipe", "B", 2]]);
  const rang = ecrits.find((e) => e.table === "contenu_tiers_application")!;
  assertEquals(rang.options, { onConflict: "contenu_id,application_id", ignoreDuplicates: true });

  // Rejouer : tout est repris, aucun appel.
  const r2 = await ouvrirApplicationsOriginal(fauxEtat(tables, []), "c1", "l1", { accroche: "", legende: "", pod: "p" }, noter);
  assertEquals(r2.map((x) => [x.slug, x.repris]), [["micabo", true], ["unswipe", true]]);
  assertEquals(appels.length, 1);
  oublierSondeMultiApp();
  oublierSondeTiersApplication();
});

Deno.test("ouvrirApplicationsOriginal : label Sophia seul, ou application sans prompt → rien", async () => {
  oublierSondeMultiApp();
  oublierSondeTiersApplication();
  const ecrits: Ecrit[] = [];
  const noter = () => Promise.reject(new Error("appel inattendu"));
  const texte = { accroche: "a", legende: "l", pod: "p" };
  assertEquals(await ouvrirApplicationsOriginal(fauxEtat(mondeOriginal(), ecrits), "c2", "l-sophia", texte, noter), []);
  const sansPrompt = mondeOriginal();
  sansPrompt.prompts = [];
  assertEquals(await ouvrirApplicationsOriginal(fauxEtat(sansPrompt, ecrits), "c2", "l1", texte, noter), []);
  assertEquals(ecrits, []);
  oublierSondeMultiApp();
  oublierSondeTiersApplication();
});

// ---------------------------------------------------------------------------
// Validation automatique des podz sûrs
// ---------------------------------------------------------------------------

Deno.test("livraisonsAutoValidables : podz sûr et actif, délai écoulé, ni vidéo ni échec, la plus ancienne d'abord", () => {
  assertEquals(AUTO_VALIDATION_HEURES, 12);
  const pods = [
    { slug: "sur", actif: true, auto_validation: true, auto_validation_heures: 12 },
    { slug: "vite", actif: true, auto_validation: true, auto_validation_heures: 2 },
    { slug: "defaut", actif: true, auto_validation: true, auto_validation_heures: null },
    { slug: "manuel", actif: true, auto_validation: false, auto_validation_heures: 12 },
    { slug: "pause", actif: false, auto_validation: true, auto_validation_heures: 12 },
  ];
  const maintenant = new Date("2026-10-21T12:00:00Z");
  const l = (id: string, pod: string, heures: number, autre: Record<string, unknown> = {}) => ({
    id,
    pod,
    type: "original",
    statut: "a_valider",
    depose_le: new Date(maintenant.getTime() - heures * 3_600_000).toISOString(),
    auto_erreur: null as string | null,
    ...autre,
  });
  const livraisons = [
    l("trop-tot", "sur", 11.9),
    l("pile", "sur", 12),
    l("vieille", "sur", 30),
    l("manuel", "manuel", 30),
    l("pause", "pause", 30),
    l("vite", "vite", 3),
    l("video", "sur", 30, { type: "video" }),
    l("echec", "sur", 30, { auto_erreur: "déjà rejetee" }),
    l("rejetee", "sur", 30, { statut: "rejetee" }),
    l("sans-date", "sur", 30, { depose_le: null }),
    l("defaut", "defaut", 12.5),
  ];
  assertEquals(livraisonsAutoValidables(pods, livraisons, maintenant).map((x) => x.id), ["vieille", "defaut", "pile", "vite"]);
  assertEquals(livraisonsAutoValidables([], livraisons, maintenant), []);
});

Deno.test("motsCherches : 3 lettres au moins, 5 mots au plus, sans caractères de filtre", () => {
  assertEquals(motsCherches("Desk  laptop, a"), ["desk", "laptop"]);
  assertEquals(motsCherches("café%_ (night)"), ["café", "night"]);
  assertEquals(motsCherches("one two three four five six seven"), ["one", "two", "three", "four", "five"]);
  assertEquals(motsCherches("  "), []);
});
