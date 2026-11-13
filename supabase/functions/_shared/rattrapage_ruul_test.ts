import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { emailRattrapage, estPret, prenomPropre, type SituationRattrapage } from "./rattrapage_ruul.ts";

const s = (x: Partial<SituationRattrapage> = {}): SituationRattrapage => ({
  prenom: "Ana", login: "anas@sophia.com", handle: "ana.x1", ruul_email: "ana@mail.com", connecte: false, tiktok: false,
  warmup_lance: false, abonnements: null, slack: false, ruul_fini: false, ruul_active: false, ...x,
});
const l = { dashboard: "https://os", slack: "https://slack", motDePasse: "https://os/r/password?t=j", pret: "https://os/r/done?t=j", stop: "https://os/r/stop?t=j" };
const o = { motDePasse: "bake2345", debut: "Monday 16 November", echeance: "Sunday 15 November, midnight (Paris time)" };

Deno.test("rattrapage : jamais connecté, tout en gras, son mot de passe unique écrit, liens vercel", () => {
  const m = emailRattrapage(s(), l, o);
  assertEquals(m.objet, "Ana, here's what's left before you start on Monday");
  assertStringIncludes(m.html, "<b>⬜ 1. Log in to your dashboard</b>");
  assertStringIncludes(m.html, "Get a new password");
  assertStringIncludes(m.html, "create your account with <b>ana@mail.com</b>");
  assertStringIncludes(m.html, "I do not wish to continue");
  assertStringIncludes(m.html, "https://os/r/stop?t=j");
  assertStringIncludes(m.html, ">Vik Studios</td>");
  assert(!m.html.includes("supabase.co"));
  assertStringIncludes(m.texte, "Your login: anas@sophia.com\nYour password: bake2345");
  assert(!/set my password|\b(bot|AI|automatic|automated)\b/i.test(`${m.objet} ${m.texte}`));
});

Deno.test("rattrapage : étapes faites en gris ; Ruul Active", () => {
  const m = emailRattrapage(s({ connecte: true, tiktok: true, warmup_lance: true, abonnements: 6, ruul_active: true }), l, o);
  assertStringIncludes(m.html, "color:#a1a1aa;padding:2px 0 6px\">✅ 1. Log in to your dashboard");
  assertStringIncludes(m.html, "<b>⬜ 4. Join Slack</b>");
  assertStringIncludes(m.html, "Your Ruul account is connected");
});

Deno.test("rattrapage : prêt = 5 étapes ; prénoms propres", () => {
  assert(estPret(s({ connecte: true, tiktok: true, warmup_lance: true, abonnements: 5, slack: true, ruul_fini: true })));
  assert(!estPret(s({ connecte: true, tiktok: true, warmup_lance: true, abonnements: 4, slack: true, ruul_fini: true })));
  assertEquals(prenomPropre("ΚΩΝΣΤΑΝΤΙΝΑ"), "Κωνσταντινα");
  assertEquals(prenomPropre("ayoub"), "Ayoub");
  assertEquals(prenomPropre("Ana-Marija"), "Ana-Marija");
});
