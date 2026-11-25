import { assert, assertEquals } from "jsr:@std/assert@1";

import { MODELES_V2, motsInterdits, problemesModele, problemesTraduction, requeteModele } from "./whatsapp_modeles_v2.ts";

Deno.test("les 5 modèles v2 respectent les règles de Meta et les nôtres", () => {
  assertEquals(MODELES_V2.length, 5);
  for (const m of MODELES_V2) assertEquals(problemesModele(m), [], m.nom);
});

Deno.test("le warm-up dit la niche, Ruul ne dépend pas d'un email", () => {
  const w = MODELES_V2.find((m) => m.nom === "warmup_start")!;
  assert(w.corps.includes("Follow at least 5 accounts about {{3}}"));
  const r = MODELES_V2.find((m) => m.nom === "ruul_payment_setup")!;
  assert(!/email/i.test(r.corps));
});

Deno.test("la requête Meta : corps, exemples et boutons lien", () => {
  const q = requeteModele(MODELES_V2[0]);
  assertEquals(q.category, "UTILITY");
  assertEquals(q.components.length, 2);
  assertEquals((q.components[0] as { example: { body_text: string[][] } }).example.body_text[0].length, 5);
});

Deno.test("les garde-fous attrapent un modèle invalide", () => {
  const p = problemesModele({ nom: "x", variables: ["a"], corps: "{{1}} hello bot", exemples: ["a"], boutons: [] });
  assert(p.includes("commence ou finit par une variable"));
  assert(p.some((x) => x.startsWith("mot interdit (bot / AI / automatique)")));
});

Deno.test("25/11 : la requête d'une traduction garde le nom, prend la langue Meta et la catégorie de l'anglais", () => {
  const q = requeteModele(MODELES_V2[1], "pt_BR", "MARKETING");
  assertEquals([q.name, q.language, q.category], ["warmup_start", "pt_BR", "MARKETING"]);
  const boutons = (q.components[1] as { buttons: { type: string; url: string }[] }).buttons;
  assertEquals(boutons.map((b) => b.url), MODELES_V2[1].boutons.map((b) => b.url));
});

Deno.test("25/11 : les mots interdits dans les langues des modèles (regex Unicode)", () => {
  const interdits = [
    "le bot te répond", "Bots", "un robot", "die KI hilft", "l'IA", "an AI tool", "envoi automatique", "automatisch",
    "automático", "automaticamente", "automatyczny", "otomatik olarak", "αυτόματα", "intelligence artificielle",
    "künstliche Intelligenz", "inteligencia artificial", "yapay zeka", "τεχνητή νοημοσύνη", "sztuczna inteligencja",
    "umělá inteligence", "mesterséges intelligencia", "inteligență artificială", "automazione", "automação",
  ];
  for (const t of interdits) assert(motsInterdits(t).length > 0, t);
  const permis = [
    "j'ai fini", "ai tuoi follower", "tu ai un cont", "el botón de abajo", "o botão abaixo", "die Botschaft",
    "Mi a helyzet?", "si tu veux", "Γεια σου Ana", "Merhaba Ana", "il bottone", "Ahoj Ana, tvůj účet je připravený",
  ];
  for (const t of permis) assertEquals(motsInterdits(t), [], t);
});

Deno.test("25/11 : une traduction garde les {{n}} dans le même ordre, les mêmes liens, des boutons de 25 caractères", () => {
  const en = MODELES_V2[1];
  const ok = { ...en, corps: en.corps.replace("Hi {{1}}", "Salut {{1}}"), boutons: [{ ...en.boutons[0], texte: "Ouvrir mon dashboard" }, en.boutons[1]] };
  assertEquals(problemesTraduction(en, ok), []);
  const inverse = { ...ok, corps: "Salut {{1}}, {{3}} puis {{2}} avant {{4}}." };
  assert(problemesTraduction(en, inverse).some((p) => p.includes("même ordre")));
  const long = { ...ok, boutons: [{ ...en.boutons[0], texte: "Ouvrir mon tableau de bord perso" }, en.boutons[1]] };
  assert(problemesTraduction(en, long).some((p) => p.startsWith("bouton trop long")));
  const lien = { ...ok, boutons: [{ ...en.boutons[0], url: "https://exemple.com" }, en.boutons[1]] };
  assert(problemesTraduction(en, lien).includes("lien du bouton 1 changé"));
  const fin = { ...ok, corps: `${ok.corps} {{4}}` };
  assert(problemesTraduction(en, fin).includes("commence ou finit par une variable"));
});
