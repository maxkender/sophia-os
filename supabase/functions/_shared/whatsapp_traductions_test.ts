import { assert, assertEquals } from "jsr:@std/assert@1";

import { MODELES_V2, requeteModele } from "./whatsapp_modeles_v2.ts";
import {
  aSoumettre, choisirLangueEnvoi, cleModeleLangue, LANGUES_MODELES, langueMeta, limiteMeta, modeleDepuisComposants, traduireModele,
  valeursProtegees,
} from "./whatsapp_traductions.ts";

Deno.test("la langue Meta d'un code de l'OS ou de Join", () => {
  const cas: [string | null | undefined, string][] = [
    ["fr", "fr"], ["FR", "fr"], ["fr-BE", "fr"], ["de", "de"], ["de_AT", "de"], ["it", "it"], ["pl", "pl"], ["ro", "ro"],
    ["hu", "hu"], ["cs", "cs"], ["el", "el"], ["el-GR", "el"], ["tr", "tr"],
    ["pt", "pt_BR"], ["pt-BR", "pt_BR"], ["pt_BR", "pt_BR"], ["pt-br", "pt_BR"], ["pt-PT", "pt_BR"],
    ["es", "es"], ["es-419", "es"], ["es-MX", "es"], ["es_ES", "es"],
    ["en", "en"], ["en-GB", "en"], ["sk", "en"], ["nl", "en"], ["no", "en"], ["", "en"], [null, "en"], [undefined, "en"],
  ];
  for (const [code, attendu] of cas) assertEquals(langueMeta(code), attendu, String(code));
  for (const l of LANGUES_MODELES) assertEquals(langueMeta(l), l);
});

Deno.test("la langue d'envoi : celle du posteur si le modèle y est APPROVED, sinon l'anglais", () => {
  const approuves = new Set([cleModeleLangue("warmup_start", "de"), cleModeleLangue("warmup_start", "pt_BR"), cleModeleLangue("account_ready", "es")]);
  assertEquals(choisirLangueEnvoi("warmup_start", "de", approuves), "de");
  assertEquals(choisirLangueEnvoi("warmup_start", "pt", approuves), "pt_BR");
  assertEquals(choisirLangueEnvoi("account_ready", "es-419", approuves), "es");
  assertEquals(choisirLangueEnvoi("warmup_start", "fr", approuves), "en");
  assertEquals(choisirLangueEnvoi("ruul_setup", "de", approuves), "en");
  assertEquals(choisirLangueEnvoi("warmup_start", "sk", approuves), "en");
  assertEquals(choisirLangueEnvoi("warmup_start", null, approuves), "en");
});

/** Les composants tels que Meta les renvoie (whatsapp_modeles.composants). */
const composants = (m = MODELES_V2[1]) => requeteModele(m).components;

Deno.test("un modèle anglais lu depuis ses composants Meta", () => {
  const { modele, probleme } = modeleDepuisComposants("warmup_start", composants());
  assertEquals(probleme, null);
  assertEquals(modele?.corps, MODELES_V2[1].corps);
  assertEquals(modele?.exemples, MODELES_V2[1].exemples);
  assertEquals(modele?.boutons, MODELES_V2[1].boutons);
  assertEquals(modele?.variables, MODELES_V2[1].variables);
  const ancien = modeleDepuisComposants("account_ready", [{ type: "BODY", text: "Hi {{1}}, log in here: {{2}}\n\nThank you.", example: { body_text: [["Ana", "https://exemple.com"]] } }]);
  assertEquals(ancien.modele?.variables, ["{{1}}", "{{2}}"]);
  assertEquals(ancien.modele?.boutons, []);
  assertEquals(modeleDepuisComposants("x", [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi" }]).modele, null);
  assertEquals(modeleDepuisComposants("x", null).probleme, "composants illisibles");
});

Deno.test("les valeurs protégées : {{n}}, noms de boutons du dashboard entre guillemets, STOP", () => {
  const w = MODELES_V2[1];
  const v = valeursProtegees(w);
  for (const x of ["{{1}}", "{{2}}", "{{3}}", "{{4}}", '"Start warmup"']) assert(v.includes(x), x);
  assert(valeursProtegees({ ...w, corps: "Hi {{1}}, to end it, reply STOP. Thanks" }).includes("STOP"));
});

/** Une base en mémoire (traductions_emails). */
function base() {
  const lignes = new Map<string, unknown>();
  const db = {
    from: (_t: string) => {
      const f: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: string) => {
          f[k] = v;
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: lignes.has(`${f.langue}:${f.cle}`) ? { traduction: lignes.get(`${f.langue}:${f.cle}`) } : null }),
        upsert: (l: { langue: string; cle: string; traduction: unknown }) => {
          lignes.set(`${l.langue}:${l.cle}`, l.traduction);
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return { db, lignes };
}

/** Un faux traducteur : « Hi » → « Salut », les boutons selon `boutons` ; il note ce qu'il reçoit. */
function traducteur(boutons: string[][]) {
  const recus: string[] = [];
  let appel = 0;
  const f = (prompt: string) => {
    recus.push(prompt);
    const json = JSON.parse(prompt.slice(prompt.lastIndexOf("\n{") + 1)) as Record<string, string>;
    const b = boutons[Math.min(appel++, boutons.length - 1)];
    const sortie: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      sortie[k] = k.startsWith("bouton_") ? b[Number(k.slice(7)) - 1] : v.replace(/^Hi /, "Salut ");
    }
    return Promise.resolve(JSON.stringify(sortie));
  };
  return { f, recus };
}

Deno.test("la traduction d'un modèle : {{n}} et boutons du dashboard jamais envoyés, liens gardés, cache", async () => {
  const { db, lignes } = base();
  const t = traducteur([["Ouvrir mon dashboard", "Rejoindre Slack"]]);
  const r = await traduireModele(db, "fr", MODELES_V2[1], t.f);
  assertEquals(r.problemes, []);
  assert(r.modele);
  assert(r.modele.corps.startsWith("Salut {{1}}, you start posting on {{2}}"));
  assert(r.modele.corps.includes('"Start warmup"'));
  assertEquals(r.modele.boutons.map((b) => b.texte), ["Ouvrir mon dashboard", "Rejoindre Slack"]);
  assertEquals(r.modele.boutons.map((b) => b.url), MODELES_V2[1].boutons.map((b) => b.url));
  assertEquals(r.modele.exemples, MODELES_V2[1].exemples);
  // Ce qui part au traducteur : aucun {{n}}, aucun nom de bouton du dashboard, la langue et les règles WhatsApp.
  assert(!/\{\{\d+\}\}/.test(t.recus[0]) && !t.recus[0].includes("Start warmup"));
  assert(t.recus[0].includes("French") && t.recus[0].includes("at most 25 characters"));
  assertEquals(lignes.size, 1);
  // La deuxième fois : depuis le cache, sans traducteur.
  const encore = await traduireModele(db, "fr", MODELES_V2[1], () => Promise.reject(new Error("pas d'appel")));
  assertEquals(encore.depuisCache, true);
  assertEquals(encore.modele?.corps, r.modele.corps);
});

Deno.test("la traduction : un bouton trop long est redemandé, avec la raison ; 3 échecs : rien n'est gardé", async () => {
  const { db, lignes } = base();
  const t = traducteur([["Ouvrir mon tableau de bord personnel", "Slack"], ["Mon dashboard", "Slack"]]);
  const r = await traduireModele(db, "de", MODELES_V2[1], t.f);
  assertEquals(t.recus.length, 2);
  assert(t.recus[1].includes("bouton trop long"));
  assertEquals(r.modele?.boutons[0].texte, "Mon dashboard");

  const { db: db2, lignes: l2 } = base();
  const mauvais = traducteur([["Le bot de ton dashboard", "Slack"]]);
  const r2 = await traduireModele(db2, "it", MODELES_V2[1], mauvais.f);
  assertEquals(mauvais.recus.length, 3);
  assertEquals(r2.modele, null);
  assert(r2.problemes.some((p) => p.startsWith("mot interdit")));
  assertEquals(l2.size, 0);
  assertEquals(lignes.size, 1);
  assertEquals((await traduireModele(db, "xx", MODELES_V2[1], t.f)).modele, null);
});

Deno.test("à soumettre : sans ce qui existe chez Meta, langue par langue, max au plus", () => {
  const existants = new Set([cleModeleLangue("a", "es"), cleModeleLangue("b", "de")]);
  assertEquals(aSoumettre(["a", "b"], ["es", "de"], existants, 50), [{ nom: "b", langue: "es" }, { nom: "a", langue: "de" }]);
  assertEquals(aSoumettre(["a", "b"], ["es", "de", "fr"], existants, 3).length, 3);
  assertEquals(aSoumettre(["a", "b"], ["es", "de"], existants, 0), []);
  assertEquals(aSoumettre(["a"], ["es"], existants, 10), []);
});

Deno.test("la limite de Meta arrête la soumission", () => {
  assert(limiteMeta("80008 There have been too many calls to this WhatsApp Business account."));
  assert(limiteMeta("4 Application request limit reached"));
  assert(limiteMeta("100 Message template creation rate limit reached"));
  assert(!limiteMeta("100 Invalid parameter"));
  assert(!limiteMeta(null));
});
