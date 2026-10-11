/**
 * Test à blanc — LA PREUVE « zéro requête mutante ou externe sortante ».
 *
 * Le vrai supabase-js tourne au-dessus de l'intercepteur, lui-même posé devant
 * un faux `fetch` sous-jacent PIÉGÉ (a_blanc_test_utils.ts) : toute requête qui
 * n'est pas une lecture `/rest/v1/<table>` (ou un Gemini autorisé) et qui
 * traverserait l'intercepteur finit dans `violations`. Chaque test vérifie que
 * `violations` reste vide.
 */

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  type ContexteABlanc,
  creerContexteABlanc,
  executerDansContexte,
  installerIntercepteur,
  intercepteurActif,
} from "./a_blanc_intercepteur.ts";
import {
  avecIntercepteur,
  CLE_GEMINI_TEST,
  fauxGemini,
  fauxServeurPostgrest,
  instantane,
  URL_TEST,
} from "./a_blanc_test_utils.ts";
import { callWithFallback, TEXT_MODELS } from "./gemini.ts";
import { serviceClient } from "./supabase.ts";

// Importer les modules du test à blanc ne pose RIEN : seule `installerIntercepteur` le fait.
const FETCH_AU_CHARGEMENT = globalThis.fetch;

function base() {
  return {
    t: [{ id: "t1", v: 1 }],
    user_roles: [{ user_id: "u1", role: "admin" }],
    contenus: [
      { id: "c1", passages_prevus: 0, tier: "D", tier_cycle: 4, titre: "Un" },
      { id: "c2", passages_prevus: 2, tier: "B", tier_cycle: 1, titre: "Deux" },
    ],
    contenu_langues: [{ id: "cl-reel", contenu_id: "c2", langue: "en", slides: [], hashtags: null }],
    passages: [] as Record<string, unknown>[],
    post_slides: [] as Record<string, unknown>[],
    assignation_journal: [{ compte_id: "k1", jour: "2026-10-10", crees: 2, raison: null, quota: 2 }],
  };
}

const run = (ia = false): ContexteABlanc => creerContexteABlanc({ nature: "run", ia });

/** Les blocages hors contexte sont signalés par console.warn : silencieux le temps d'un test. */
async function sansAvertissements<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
}

Deno.test("chargement : importer les modules du test à blanc ne remplace pas fetch", () => {
  assertEquals(intercepteurActif(), false);
  assertEquals(FETCH_AU_CHARGEMENT, globalThis.fetch);
});

Deno.test("matrice : méthodes × formes d'entrée × chemins × contextes — seules les lectures de table en contexte sortent", async () => {
  const tables = base();
  const avant = instantane(tables);
  const serveur = fauxServeurPostgrest(tables);
  await sansAvertissements(() => avecIntercepteur(serveur.fetch, async () => {
    const methodes = ["post", "PATCH", "put", "delete", "options", "get", "head"];
    const chemins = [
      "/rest/v1/t",
      "/rest/v1/rpc/f",
      "/storage/v1/object/medias/x",
      "/functions/v1/assignation",
      "/auth/v1/admin/users",
      "/graphql/v1",
      "/realtime/v1",
      "/rest/v1/",
      "/rest/v1/t/../rpc/f",
    ];
    const ferme = run();
    ferme.etat.ferme = true;
    const contextes: Array<[string, ContexteABlanc | null]> = [
      ["aucun", null],
      ["auth", creerContexteABlanc({ nature: "auth", ia: false })],
      ["run", run()],
      ["fermé", ferme],
    ];
    let attendues = 0;
    for (const [nom, ctx] of contextes) {
      for (const chemin of chemins) {
        for (const m of methodes) {
          const lecture = m === "get" || m === "head";
          const init: RequestInit = { method: m, headers: { "content-type": "application/json" } };
          if (!lecture) init.body = JSON.stringify({ a: 1 });
          const formes: Array<() => Promise<Response>> = [
            () => fetch(`${URL_TEST}${chemin}`, init),
            () => fetch(new URL(`${URL_TEST}${chemin}`), init),
            () => fetch(new Request(`${URL_TEST}${chemin}`, init)),
          ];
          for (const appel of formes) {
            const lancer = async () => {
              try {
                await appel();
              } catch {
                // un blocage externe lève : attendu
              }
            };
            if (ctx) await executerDansContexte(ctx, lancer);
            else await lancer();
            if (lecture && chemin === "/rest/v1/t" && (nom === "auth" || nom === "run")) attendues += 1;
          }
        }
      }
    }
    assertEquals(serveur.violations, []);
    assertEquals(serveur.requetes.length, attendues, "seules les lectures de table en contexte ont atteint le serveur");
    for (const r of serveur.requetes) {
      assert(r.methode === "GET" || r.methode === "HEAD", r.methode);
      assert(r.url.startsWith(`${URL_TEST}/rest/v1/t`), r.url);
    }
  }));
  assertEquals(tables, avant);
});

Deno.test("supabase-js : insert().select().single(), insert sans select, insert en tableau", async () => {
  const tables = base();
  const avant = instantane(tables);
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    await executerDansContexte(ctx, async () => {
      const supabase = serviceClient();
      const a = await supabase.from("passages").insert({ compte_id: "k1", statut: "assigne" }).select("id").single();
      assertEquals(a.error, null);
      assert(/^[0-9a-f-]{36}$/.test(String(a.data?.id)), "uuid fabriqué");
      assertEquals(Object.keys(a.data ?? {}), ["id"], "projection sur le select");

      const b = await supabase.from("passages").insert({ compte_id: "k1" });
      assertEquals([b.error, b.data, b.status], [null, null, 201]);

      const c = await supabase.from("post_slides").insert([
        { post_id: "p", position: 1, media_id: null },
        { post_id: "p", position: 2, media_id: null },
      ]).select("id, position");
      assertEquals(c.error, null);
      assertEquals((c.data ?? []).map((l) => l.position), [1, 2]);
    });
    assertEquals(ctx.etat.journal.map((e) => [e.table, e.operation, e.lignes]), [
      ["passages", "insert", 1],
      ["passages", "insert", 1],
      ["post_slides", "insert", 2],
    ]);
  });
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("supabase-js : update sans select, repêchage maybeSingle (valeurs RÉELLES), rejoué → null", async () => {
  const tables = base();
  const avant = instantane(tables);
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    await executerDansContexte(ctx, async () => {
      const supabase = serviceClient();
      const u = await supabase.from("contenus").update({ titre: "x" }).eq("id", "c2");
      assertEquals([u.error, u.data, u.status], [null, null, 204]);

      const repeche = () =>
        supabase
          .from("contenus")
          .update({ passages_prevus: 1 })
          .eq("id", "c1")
          .eq("passages_prevus", 0)
          .select("id, tier, tier_cycle")
          .maybeSingle();
      const r1 = await repeche();
      assertEquals(r1.error, null);
      assertEquals(r1.data, { id: "c1", tier: "D", tier_cycle: 4 });
      const r2 = await repeche();
      assertEquals([r2.error, r2.data], [null, null], "déjà repêché dans ce test : la nuit aussi verrait 0 ligne");

      const relu = await supabase.from("contenus").select("passages_prevus, titre").eq("id", "c1").single();
      assertEquals(relu.data, { passages_prevus: 1, titre: "Un" });
    });
    const ops = ctx.etat.journal.map((e) => [e.table, e.operation, e.lignes]);
    assertEquals(ops, [["contenus", "update", 1], ["contenus", "update", 1], ["contenus", "update", 0]]);
    assertEquals(ctx.etat.journal[1].cles, [{ id: "c1" }]);
  });
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("supabase-js : delete, puis upsert merge et ignoreDuplicates", async () => {
  const tables = base();
  const avant = instantane(tables);
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    await executerDansContexte(ctx, async () => {
      const supabase = serviceClient();
      const d = await supabase.from("contenus").delete().eq("id", "c2");
      assertEquals(d.error, null);
      const apres = await supabase.from("contenus").select("id").order("id");
      assertEquals(apres.data, [{ id: "c1" }]);

      const ignore = await supabase.from("assignation_journal").upsert(
        { compte_id: "k1", jour: "2026-10-10", crees: 9 },
        { onConflict: "compte_id,jour", ignoreDuplicates: true },
      );
      assertEquals(ignore.error, null);
      const j1 = await supabase.from("assignation_journal").select("crees").eq("compte_id", "k1").single();
      assertEquals(j1.data, { crees: 2 }, "ignoreDuplicates : la ligne existante reste");

      const merge = await supabase.from("assignation_journal").upsert(
        [{ compte_id: "k1", jour: "2026-10-10", crees: 1 }, { compte_id: "k2", jour: "2026-10-10", crees: 0 }],
        { onConflict: "compte_id,jour" },
      ).select("compte_id, crees");
      assertEquals(merge.error, null);
      assertEquals(merge.data, [{ compte_id: "k1", crees: 1 }, { compte_id: "k2", crees: 0 }]);
      const j2 = await supabase.from("assignation_journal").select("compte_id, crees, quota").order("compte_id");
      assertEquals(j2.data, [{ compte_id: "k1", crees: 1, quota: 2 }, { compte_id: "k2", crees: 0, quota: null }]);
    });
  });
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("lecture après écriture : insert contenu_langues → update slides → relecture finale .single()", async () => {
  const tables = base();
  const avant = instantane(tables);
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, async () => {
    await executerDansContexte(run(), async () => {
      const supabase = serviceClient();
      const { data: cl } = await supabase
        .from("contenu_langues")
        .insert({ contenu_id: "c1", langue: "de", slides: [], nb_passages: 0 })
        .select("id, langue, slides, slides_base, hashtags")
        .single();
      assertEquals(cl?.slides_base, null);
      const deck = [{ position: 1, texte_overlay: "Hallo", position_sophia: false }];
      await supabase.from("contenu_langues").update({ slides: deck, hashtags: "#a" }).eq("id", cl!.id);
      const frais = await supabase.from("contenu_langues").select("slides, hashtags").eq("id", cl!.id).single();
      assertEquals(frais.data, { slides: deck, hashtags: "#a" });

      // Même chemin sur une ligne RÉELLE.
      await supabase.from("contenu_langues").update({ slides: deck }).eq("id", "cl-reel");
      const reel = await supabase.from("contenu_langues").select("slides, hashtags").eq("id", "cl-reel").single();
      assertEquals(reel.data, { slides: deck, hashtags: null });
      // Et par la clé métier, comme assurerDeckPourLangue.
      const parCle = await supabase
        .from("contenu_langues")
        .select("id, slides")
        .eq("contenu_id", "c1")
        .eq("langue", "de")
        .maybeSingle();
      assertEquals(parCle.data?.slides, deck);
    });
  });
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("rpc (GET et POST), storage, functions, auth admin : refusés, rien ne sort", async () => {
  const tables = base();
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    await executerDansContexte(ctx, async () => {
      const supabase = serviceClient();
      const r1 = await supabase.rpc("claim_caption_rattrapage", { p_n: 1 });
      assertEquals(r1.error?.code, "ABLANC");
      const r2 = await supabase.rpc("une_lecture", {}, { get: true });
      assertEquals(r2.error?.code, "ABLANC");
      const up = await supabase.storage.from("medias").upload("x.png", new Uint8Array([1, 2]));
      assert(up.error, "upload refusé");
      const rm = await supabase.storage.from("medias").remove(["x.png"]);
      assert(rm.error, "remove refusé");
      const fn = await supabase.functions.invoke("assignation", { body: { drain: true } });
      assert(fn.error, "functions refusé");
      const au = await supabase.auth.admin.listUsers();
      assert(au.error, "auth admin refusé");
    });
    const motifs = new Set(ctx.etat.bloques.map((b) => b.motif));
    for (const m of ["supabase_rpc", "supabase_storage", "supabase_functions", "supabase_auth"]) {
      assert(motifs.has(m as never), m);
    }
  });
  assertEquals(serveur.violations, []);
  assertEquals(serveur.requetes, [], "le serveur n'a rien vu");
});

Deno.test("hôtes externes (fal, TikTok) : TypeError, comme une coupure réseau", async () => {
  const serveur = fauxServeurPostgrest(base());
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    await executerDansContexte(ctx, async () => {
      await assertRejects(() => fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", { method: "POST", body: "{}" }), TypeError);
      await assertRejects(() => fetch("https://www.tiktok.com/@x"), TypeError);
      await assertRejects(() => fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", { method: "POST" }), TypeError);
    });
    assertEquals(ctx.etat.bloques.map((b) => [b.hote, b.motif]), [
      ["queue.fal.run", "externe"],
      ["www.tiktok.com", "externe"],
      ["open.tiktokapis.com", "externe"],
    ]);
  });
  assertEquals(serveur.violations, []);
  assertEquals(serveur.requetes, []);
});

Deno.test("hors contexte, ou contexte fermé : même une lecture est refusée", async () => {
  const serveur = fauxServeurPostgrest(base());
  await sansAvertissements(() => avecIntercepteur(serveur.fetch, async () => {
    const supabase = serviceClient();
    const hors = await supabase.from("t").select("id");
    assertEquals(hors.error?.code, "ABLANC");
    const ctx = run();
    ctx.etat.ferme = true;
    // `await` DANS le contexte : un builder supabase-js est paresseux, la requête
    // part au `then`. Attendu dehors, il partirait hors contexte (bloqué aussi).
    const ferme = await executerDansContexte(ctx, async () => await supabase.from("t").select("id"));
    assertEquals(ferme.error?.code, "ABLANC");
    assertEquals(ctx.etat.bloques[0].motif, "contexte_ferme");
  }));
  assertEquals(serveur.requetes, []);
});

Deno.test("contexte d'authentification : lecture user_roles transmise, écriture refusée (hors_run)", async () => {
  const serveur = fauxServeurPostgrest(base());
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = creerContexteABlanc({ nature: "auth", ia: false });
    await executerDansContexte(ctx, async () => {
      const client = createClient(URL_TEST, "cle-anon-test", {
        global: { headers: { Authorization: "Bearer jeton" } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const r = await client.from("user_roles").select("role").eq("user_id", "u1");
      assertEquals(r.data, [{ role: "admin" }]);
      const w = await client.from("user_roles").insert({ user_id: "u2", role: "admin" });
      assertEquals(w.error?.code, "ABLANC");
    });
    assertEquals(ctx.etat.bloques.map((b) => b.motif), ["hors_run"]);
    assertEquals(ctx.etat.journal, []);
  });
  assertEquals(serveur.violations, []);
});

Deno.test("isolation : deux tests entrelacés gardent journaux et calques séparés", async () => {
  const tables = base();
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, async () => {
    const a = run();
    const b = run();
    const supabase = serviceClient();
    const travail = (ctx: ContexteABlanc, compte: string, delai: number) =>
      executerDansContexte(ctx, async () => {
        for (let i = 0; i < 3; i += 1) {
          await new Promise((ok) => setTimeout(ok, delai));
          await supabase.from("passages").insert({ compte_id: compte, rang: i });
        }
        const { data } = await supabase.from("passages").select("compte_id");
        return (data ?? []).map((l) => l.compte_id);
      });
    const [va, vb] = await Promise.all([travail(a, "A", 3), travail(b, "B", 2)]);
    assertEquals(va, ["A", "A", "A"]);
    assertEquals(vb, ["B", "B", "B"]);
    assertEquals(a.etat.journal.length, 3);
    assertEquals(b.etat.journal.length, 3);
  });
  assertEquals(serveur.violations, []);
});

Deno.test("IA décochée : callWithFallback lève après UN tour (< 1 s), 3 appels bloqués, sans la clé", async () => {
  const serveur = fauxServeurPostgrest(base());
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run(false);
    const debut = Date.now();
    const err = await executerDansContexte(
      ctx,
      () => assertRejects(() => callWithFallback(TEXT_MODELS, [{ text: "bonjour" }])),
    );
    assert(Date.now() - debut < 1000, `${Date.now() - debut} ms : aucune reprise`);
    assertEquals(ctx.etat.compteurIA, { autorises: 0, bloques: TEXT_MODELS.length });
    assert(!String((err as Error).message).includes(CLE_GEMINI_TEST));
    assert(!JSON.stringify(ctx.etat.bloques).includes(CLE_GEMINI_TEST));
    assert(ctx.etat.bloques.every((b) => b.motif === "ia_non_autorisee"));
  });
  assertEquals(serveur.violations, []);
});

Deno.test("IA cochée : generateContent transmis, journal sans la clé ; plafond respecté", async () => {
  const gemini = fauxGemini(() => '{"ok":true}');
  const serveur = fauxServeurPostgrest(base(), { gemini });
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = creerContexteABlanc({ nature: "run", ia: true, plafondIA: 2 });
    await executerDansContexte(ctx, async () => {
      await callWithFallback(TEXT_MODELS, [{ text: "un" }]);
      await callWithFallback(TEXT_MODELS, [{ text: "deux" }]);
      await assertRejects(() => callWithFallback(TEXT_MODELS, [{ text: "trois" }]));
    });
    assertEquals(gemini.appels.length, 2);
    assertEquals(ctx.etat.compteurIA.autorises, 2);
    assert(ctx.etat.bloques.every((b) => b.motif === "ia_plafond"));
    assert([...ctx.etat.limites].some((l) => l.includes("Plafond")));
    assert(!JSON.stringify(ctx.etat.bloques).includes("key="));
  });
  assertEquals(serveur.violations, []);
});

Deno.test("méthodes en minuscules (Request post, « patch ») : simulées, jamais transmises", async () => {
  const serveur = fauxServeurPostgrest(base());
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    await executerDansContexte(ctx, async () => {
      const r1 = await fetch(new Request(`${URL_TEST}/rest/v1/passages`, { method: "post", body: '{"compte_id":"k"}' }));
      assertEquals(r1.status, 201);
      const r2 = await fetch(`${URL_TEST}/rest/v1/contenus?id=eq.c1`, { method: "patch", body: '{"titre":"z"}' });
      assertEquals(r2.status, 204);
    });
    assertEquals(ctx.etat.journal.map((e) => e.operation), ["insert", "update"]);
  });
  assertEquals(serveur.violations, []);
});

Deno.test("surcharge de méthode, corps illisible, erreur interne : bloqués, rien ne sort", async () => {
  const serveur = fauxServeurPostgrest(base());
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    await executerDansContexte(ctx, async () => {
      const r1 = await fetch(`${URL_TEST}/rest/v1/t`, { headers: { "x-http-method-override": "DELETE" } });
      assertEquals(r1.status, 403);
      const r2 = await fetch(`${URL_TEST}/rest/v1/passages`, { method: "POST", body: "{pas du json" });
      assertEquals(r2.status, 403);
      ctx.etat.calque.inserer = () => {
        throw new Error("panne simulée du calque");
      };
      const r3 = await fetch(`${URL_TEST}/rest/v1/passages`, { method: "POST", body: "{}" });
      assertEquals(r3.status, 403);
    });
    assertEquals(ctx.etat.bloques.map((b) => b.motif), ["methode_refusee", "requete_illisible", "erreur_interne"]);
    assert([...ctx.etat.limites].some((l) => l.includes("panne simulée")));
  });
  assertEquals(serveur.violations, []);
  assertEquals(serveur.requetes, []);
});

Deno.test("une vraie erreur réseau d'une lecture autorisée remonte telle quelle", async () => {
  const coupure = new TypeError("coupure réseau réelle");
  const sousJacent: typeof fetch = () => Promise.reject(coupure);
  await avecIntercepteur(sousJacent, async () => {
    const recu = await executerDansContexte(run(), () => assertRejects(() => fetch(`${URL_TEST}/rest/v1/t`)));
    assertEquals(recu, coupure);
  });
});

Deno.test("un émetteur d'événements qui lève ne change aucune décision", async () => {
  const serveur = fauxServeurPostgrest(base());
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    ctx.etat.onEvenement = () => {
      throw new Error("flux fermé");
    };
    await executerDansContexte(ctx, async () => {
      const r = await serviceClient().from("passages").insert({ compte_id: "k" }).select("id").single();
      assertEquals(r.error, null);
    });
    assertEquals(ctx.etat.journal.length, 1);
  });
  assertEquals(serveur.violations, []);
});

Deno.test("client supabase-js créé AVANT l'installation : quand même intercepté (fetch relu à chaque appel)", async () => {
  Deno.env.set("SUPABASE_URL", URL_TEST);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "cle-service-test");
  const avant = serviceClient();
  const serveur = fauxServeurPostgrest(base());
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = run();
    await executerDansContexte(ctx, async () => {
      const r = await avant.from("passages").insert({ compte_id: "k" });
      assertEquals(r.status, 201);
    });
    assertEquals(ctx.etat.journal.length, 1);
  });
  assertEquals(serveur.violations, []);
});

Deno.test("désinstallation : fetch restauré, intercepteurActif suit", () => {
  const original = globalThis.fetch;
  const pose = installerIntercepteur({ supabaseUrl: URL_TEST, fetchOrigine: () => Promise.reject(new Error("x")) });
  assert(intercepteurActif());
  assert(globalThis.fetch !== original);
  pose.desinstaller();
  assertEquals(globalThis.fetch, original);
  assertEquals(intercepteurActif(), false);
});
