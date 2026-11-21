import { assert, assertEquals } from "jsr:@std/assert@1";

import { estReactiver2eCompte, estRienPrevu, reponseRienPrevu, situationFixe, TEXTES_SITUATIONS } from "./support_situations.ts";

const cle = (m: string) => situationFixe(m)?.cle ?? null;

Deno.test("contenu : jamais « we're checking »", () => {
  assertEquals(cle("I've replaced them twice. At the moment, none of the five images have any text."), "contenu_images_sans_texte");
  assertEquals(cle("Good evening. None of the images have any text"), "contenu_images_sans_texte");
  const faux = situationFixe("My morning post has an issue: the images I have do not match the text.");
  assertEquals(faux?.cle, "contenu_texte_faux");
  assert(faux?.qualite && faux.jourCompte && faux.fermer);
  assertEquals(cle("But it is impossible to do it. The text is too long. It couldn't be pasted all."), "contenu_texte_faux");
  assertEquals(cle("On today's post I have 2 identical pictures (the last 2). Should I post the slide as it is?"), "contenu_texte_faux");
  assertEquals(cle("The images sometimes have nothing to do with the caption and sometimes are visibly worse in quality"), "contenu_texte_faux");
  assertEquals(cle("today's slideshow doesn't make sense"), "contenu_texte_faux");
  assertEquals(cle("My profile identifies me as a teenage girl, but my posts are about men's fitness"), "contenu_hors_sujet");
});

Deno.test("son, petites libertés, commentaires", () => {
  assertEquals(cle("For my second post for today, it says “sound isn’t available”. What should I do?"), "son_indisponible");
  assertEquals(cle("Today for my first post, the sound wasnt available so I used one of the previous ones. Is that fine?"), "petite_liberte");
  assertEquals(cle("Hello! I used white instead of black font in order for the text to be visible."), "petite_liberte");
  assertEquals(cle("I get asked a lot in the comments about the sophia app link"), "commentaires");
  assertEquals(cle("I received this comment saying that what it's stated is not true"), "commentaires");
  assertEquals(cle("People comment that it's AI"), "commentaires");
});

Deno.test("Ruul, test de l'app, avis, nom du compte", () => {
  assertEquals(situationFixe("the ruul fee on the 10 dollars, do you send it on top?")?.texte, TEXTES_SITUATIONS.frais_ruul);
  assertEquals(cle("I would like to clarify that I am not a freelancer, and this was not a requirement"), "pas_freelance");
  assertEquals(cle("I've done one more additional work for you which is the testing the app."), "test_app");
  assertEquals(cle("Will I get a good review in upwork, if I end my contract first week"), "bon_avis");
  assertEquals(cle("Could you please change the name on my account? I've been assigned a feminine name"), "nom_compte");
});

Deno.test("pas de faux positif", () => {
  for (const m of ["When will I be paid?", "I can't log in", "STOP", "Thanks!", "How many posts per day?", "I posted it"]) {
    assertEquals(cle(m), null, m);
  }
});

Deno.test("règles 1 et 2 : rien de prévu", () => {
  assert(estRienPrevu("Hi, it says nothing planned today"));
  assert(estRienPrevu("I haven't been assigned any tasks today. What should I do?"));
  assert(estRienPrevu("Today is meant to be my first day of posting but it says there is nothing planned"));
  assert(!estRienPrevu("I posted both posts today"));
  const base = { aujourdhui: "2026-11-23", actif: true, warmup: { pret: false, existe: true, abonnements: 3 } };
  const r = reponseRienPrevu({ ...base, cohorte: "2026-11-30" });
  assert(r.texte?.startsWith("Your first posting day was moved to Monday, November 30 because your warm-up"));
  assertEquals(r.incident, false);
  assertEquals(reponseRienPrevu({ ...base, cohorte: "2026-11-23" }), { texte: "We're checking the situation.", incident: true });
  assertEquals(reponseRienPrevu({ ...base, actif: false, cohorte: null }), { texte: null, incident: false });
});

Deno.test("tickets et 2e compte", () => {
  const b = situationFixe("I'm trying to get help directly through the Sophia app, but no matter what I ask, it keeps repeating the reply");
  assertEquals(b?.cle, "assistant_boucle");
  assert(b?.ticket && !b.fermer);
  assert(estReactiver2eCompte("Could you please reactivate my second TikTok account (Personal) in the dashboard?"));
  assert(!estReactiver2eCompte("Can I have a second account?"));
});
