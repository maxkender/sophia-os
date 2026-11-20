import { assert, assertEquals } from "jsr:@std/assert@1";

import { consigne, langueTraduite, normaliserLangue, proteger, restaurer, traduireChamps, traductionValide } from "./traduction_email.ts";
import { PIED_EN, rendreEmailRuul } from "./ruul.ts";

/** Une base en mémoire (traductions_emails) : ce qui est lu et écrit. */
function base() {
  const lignes = new Map<string, unknown>();
  const ecrites: { langue: string; cle: string; source: unknown; traduction: unknown }[] = [];
  const db = {
    from: (_t: string) => {
      const filtres: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: string) => {
          filtres[k] = v;
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: lignes.has(`${filtres.langue}:${filtres.cle}`) ? { traduction: lignes.get(`${filtres.langue}:${filtres.cle}`) } : null }),
        upsert: (l: { langue: string; cle: string; source: unknown; traduction: unknown }) => {
          lignes.set(`${l.langue}:${l.cle}`, l.traduction);
          ecrites.push(l);
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return { db, ecrites };
}

/** Un traducteur de test : « traduit » en mettant « HU: » devant chaque paragraphe, repères gardés. */
function traducteur(appels: string[]) {
  return (prompt: string) => {
    appels.push(prompt);
    const json = JSON.parse(prompt.slice(prompt.indexOf("{")));
    const sortie: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) sortie[k] = String(v).split("\n\n").map((p) => `HU: ${p}`).join("\n\n");
    return Promise.resolve("```json\n" + JSON.stringify(sortie) + "\n```");
  };
}

Deno.test("traduction : langues (pt-BR, es-419, anglais et inconnues non traduites)", () => {
  assertEquals(normaliserLangue("pt-br"), "pt-BR");
  assertEquals(normaliserLangue("es-419"), "es-419");
  assertEquals(normaliserLangue("HU"), "hu");
  assertEquals(normaliserLangue(null), "en");
  assert(langueTraduite("hu"));
  assert(langueTraduite("sr"));
  assert(!langueTraduite("en"));
  assert(!langueTraduite("xx"));
});

Deno.test("traduction : nom, mot de passe, liens, emails, @, montants et boutons « » protégés puis remis", () => {
  const valeurs: string[] = [];
  const t = proteger(
    "Hi Ana,\n\nPassword: Kx9-pQ2z. Analytics: go to https://os.example/r/done?t=abc or app.ruul.io/register with ana@mail.com.\n\nCreate @ana.posts and click « Start warmup ». You received $14.",
    ["Ana", "Kx9-pQ2z"],
    valeurs,
  );
  assert(!t.includes("Kx9-pQ2z"));
  assert(!t.includes("https://"));
  assert(!t.includes("ana@mail.com"));
  assert(!t.includes("@ana.posts"));
  assert(!t.includes("$14"));
  assert(!t.includes("Start warmup"));
  // Le mot entier seulement : « Analytics » reste.
  assert(t.includes("Analytics"));
  assert(/^Hi \[\[\d+\]\],/.test(t));
  assertEquals(restaurer(t, valeurs).includes("Kx9-pQ2z"), true);
  assertEquals(restaurer(t, valeurs), "Hi Ana,\n\nPassword: Kx9-pQ2z. Analytics: go to https://os.example/r/done?t=abc or app.ruul.io/register with ana@mail.com.\n\nCreate @ana.posts and click « Start warmup ». You received $14.");
});

Deno.test("traduction : refusée si un repère manque, est doublé, ou si les paragraphes changent", () => {
  const src = { corps: "Hi [[1]],\n\nGo to [[2]]." };
  assert(traductionValide(src, { corps: "Szia [[1]],\n\nMenj ide: [[2]]." }));
  assert(!traductionValide(src, { corps: "Szia [[1]],\n\nMenj ide." }));
  assert(!traductionValide(src, { corps: "Szia [[1]], [[1]]\n\nMenj ide: [[2]]." }));
  assert(!traductionValide(src, { corps: "Szia [[1]], menj ide: [[2]]." }));
  assert(!traductionValide(src, { autre: "x" }));
  assert(!traductionValide(src, null));
});

Deno.test("traduction : la consigne ne contient aucune valeur du posteur et interdit bot / AI / automatique", () => {
  const valeurs: string[] = [];
  const c = consigne("hu", { corps: proteger("Hi Ana, your password is Kx9-pQ2z", ["Ana", "Kx9-pQ2z"], valeurs) });
  assert(!c.includes("Ana"));
  assert(!c.includes("Kx9-pQ2z"));
  assert(c.includes("Hungarian"));
  assert(c.includes("Never use the words bot, AI"));
});

Deno.test("traduction : traduite une fois, gardée, puis réutilisée pour un autre posteur (sans appel)", async () => {
  const { db, ecrites } = base();
  const appels: string[] = [];
  const t = traducteur(appels);
  const a = await traduireChamps(db, "hu", { objet: "Your access", corps: "Hi Ana,\n\nPassword: Kx9-pQ2z", bouton: null }, ["Ana", "Kx9-pQ2z"], t);
  assert(a.traduit);
  assertEquals(a.champs.objet, "HU: Your access");
  assertEquals(a.champs.corps, "HU: Hi Ana,\n\nHU: Password: Kx9-pQ2z");
  assertEquals(a.champs.bouton, null);
  assertEquals(appels.length, 1);
  // Rien de propre au posteur n'est gardé.
  assert(!JSON.stringify(ecrites).includes("Kx9-pQ2z"));
  assert(!JSON.stringify(ecrites).includes("Ana"));
  const b = await traduireChamps(db, "hu", { objet: "Your access", corps: "Hi Bob,\n\nPassword: Zz8-aa11", bouton: null }, ["Bob", "Zz8-aa11"], t);
  assertEquals(b.champs.corps, "HU: Hi Bob,\n\nHU: Password: Zz8-aa11");
  assertEquals(appels.length, 1);
});

Deno.test("traduction : anglais, langue inconnue, traducteur en panne ou réponse invalide → l'anglais d'origine", async () => {
  const { db } = base();
  const src = { objet: "Your access", corps: "Hi Ana,\n\nGo to https://x.example" };
  let appels = 0;
  const panne = () => {
    appels++;
    return Promise.reject(new Error("panne"));
  };
  assertEquals((await traduireChamps(db, "en", src, ["Ana"], panne)).champs, src);
  assertEquals((await traduireChamps(db, "xx", src, ["Ana"], panne)).champs, src);
  assertEquals(appels, 0);
  const r = await traduireChamps(db, "hu", src, ["Ana"], panne);
  assertEquals(r, { champs: src, traduit: false });
  assertEquals(appels, 2);
  const perdu = await traduireChamps(db, "hu", src, ["Ana"], () => Promise.resolve('{"objet":"Hozzáférés","corps":"Szia!\\n\\nMenj ide."}'));
  assertEquals(perdu, { champs: src, traduit: false });
});

Deno.test("rendu : pied traduit, langue de la page, phrase Help non répétée quand le texte la dit déjà", () => {
  const r = rendreEmailRuul({
    objet: "O", corps: "Szia!", bouton: { texte: "Kész", lien: "https://x/?pret=1" }, lienStop: "https://x/?stop=1", langue: "hu",
    pied: { help: "Kérdésed van? Kattints a Help gombra.", equipe: "A Vik Studios csapata", arret: "Nem szeretném folytatni" },
  });
  assert(r.html.includes('<html lang="hu">'));
  assert(r.html.includes("A Vik Studios csapata"));
  assert(r.html.includes("Nem szeretném folytatni"));
  assert(!r.html.includes("The Vik Studios team"));
  assert(r.texte.includes("Kérdésed van? Kattints a Help gombra."));
  const sans = rendreEmailRuul({ objet: "O", corps: "Szia!", lienStop: "https://x/?stop=1", aideDansTexte: true, pied: { help: "AIDE" } });
  assert(!sans.texte.includes("AIDE"));
  // Sans pied : l'anglais d'avant, inchangé.
  const en = rendreEmailRuul({ objet: "O", corps: "Hi", lienStop: "https://x/?stop=1" });
  assert(en.html.includes('<html lang="en">'));
  assert(en.texte.includes(PIED_EN.help));
  assert(en.texte.includes("The Vik Studios team"));
  assert(en.texte.includes("I do not wish to continue: https://x/?arreter=1"));
});
