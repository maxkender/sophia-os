/** Système du 2 nov., partie A : l'accueil automatique, sans réseau. */
import { assertEquals } from "jsr:@std/assert@1";

import {
  type Annonce,
  bienvenueARattraper,
  codePays,
  hmDeNomUpwork,
  type InfosApi,
  langueDePays,
  lireDetailsContrat,
  lireModeAuto,
  messageAccueil,
  normaliserNom,
  planAccueil,
  type PosteurExistant,
} from "./accueil.ts";

const brut = {
  id: "44784407", status: "ACTIVE", startDate: "2026-10-28T12:01:47.325Z", offerId: "112925661",
  job: { id: "J1", content: { title: "TikTok poster (Portugal)" } },
  hiringManager: { id: "U1", name: "Aram" },
  freelancer: { id: "F1", name: "Ana S.", firstName: "Ana", lastName: "Silva" },
};
const d = lireDetailsContrat(brut)!;
const annonce = (o: Partial<Annonce> = {}): Annonce => ({ job_id: "J1", pays: "PT", langue: "pt", hm_id: "hm1", tarif: 14, generique: false, ...o });
const posteur = (o: Partial<PosteurExistant> = {}): PosteurExistant => ({
  id: "p1", prenom: "Ana", nom: "Silva", pays: "PT", is_active: true, upwork_contract_id: null, ...o,
});

Deno.test("interrupteur : test par défaut", () => {
  assertEquals(lireModeAuto(undefined), "test");
  assertEquals(lireModeAuto("on"), "on");
  assertEquals(lireModeAuto("off"), "off");
  assertEquals(lireModeAuto("simulation"), "test");
});

Deno.test("le contrat : annonce, prénom, nom, début, HM Upwork", () => {
  assertEquals([d.contrat_id, d.job_id, d.job_titre, d.prenom, d.nom, d.hm_upwork_id, d.offre_id], [
    "44784407", "J1", "TikTok poster (Portugal)", "Ana", "Silva", "U1", "112925661",
  ]);
  assertEquals(d.debut_at, "2026-10-28T12:01:47.325Z");
  assertEquals(lireDetailsContrat({ id: "1", freelancer: { name: "Bruno Costa Lima" } })?.nom, "Costa Lima");
  assertEquals(lireDetailsContrat(null), null);
  assertEquals(normaliserNom("  Élodie  D'Arc "), "elodie d arc");
});

Deno.test("annonce connue → créer (pays, langue, HM, tarif de l'annonce)", () => {
  assertEquals(planAccueil(d, annonce(), null, []), { statut: "a_creer", raison: null, pays: "PT", langue: "pt", hm_id: "hm1", tarif: 14, source: "annonce" });
});

Deno.test("annonce inconnue ou générique → Contrats à relier ; pays choisi à la main → créer", () => {
  assertEquals(planAccueil(d, null, null, []).statut, "a_relier");
  assertEquals(planAccueil(d, annonce({ generique: true, pays: null }), null, []).raison, "annonce générique, pays du freelance illisible");
  const choisi = planAccueil(d, annonce({ generique: true, pays: null }), { statut: "a_creer", pays: "FR", langue: "fr", hm_id: "hm2" }, []);
  assertEquals([choisi.statut, choisi.pays, choisi.hm_id], ["a_creer", "FR", "hm2"]);
  // Pays sans langue : à relier.
  assertEquals(planAccueil(d, annonce({ langue: null }), null, []).statut, "a_relier");
});

const api = (o: Partial<InfosApi> = {}): InfosApi => ({ freelance_pays: "HR", freelance_langue: "hr", hm_id: "hmC", hm_nom: "Lucia D.", ...o });

Deno.test("0470 : pays du freelance si l'annonce n'en a pas ; HM du contrat, pas celle de l'annonce", () => {
  const p = planAccueil(d, annonce({ pays: null, langue: null }), null, [], api());
  assertEquals([p.statut, p.pays, p.langue, p.hm_id, p.source], ["a_creer", "HR", "hr", "hmC", "freelance"]);
  // L'annonce a un pays : il gagne ; la HM reste celle du contrat.
  const a = planAccueil(d, annonce(), null, [], api({ freelance_pays: "PT" }));
  assertEquals([a.pays, a.hm_id, a.source, a.ecart], ["PT", "hmC", "annonce", undefined]);
  // Le freelance vit ailleurs : pays de l'annonce, l'écart est noté.
  assertEquals(planAccueil(d, annonce(), null, [], api()).ecart, { vit: "HR", annonce: "PT" });
  // Ni annonce ni pays du freelance : la carte.
  assertEquals(planAccueil(d, null, null, [], api({ freelance_pays: null })).statut, "a_relier");
  // Pays du freelance sans langue connue : la carte, avec la raison.
  assertEquals(planAccueil(d, null, null, [], api({ freelance_pays: "IS", freelance_langue: null })).raison, "le freelance vit en IS, aucune langue connue pour ce pays");
  // HM du contrat pas dans l'OS : la carte (pays gardé).
  const sansHm = planAccueil(d, null, null, [], api({ hm_id: null, hm_nom: "Dzenita S." }));
  assertEquals([sansHm.statut, sansHm.pays, sansHm.raison], ["a_relier", "HR", "HM du contrat (Dzenita S.) pas dans l'OS : choisis la HM"]);
});

Deno.test("0470 : un choix à la main reste après une simulation (statut simule, relie_at)", () => {
  const p = planAccueil(d, null, { statut: "simule", pays: "SK", langue: "sk", hm_id: "hmX", relie_at: "2026-10-30T10:00:00Z" }, [], api({ freelance_pays: null, hm_id: null }));
  assertEquals([p.statut, p.pays, p.langue, p.hm_id, p.source], ["a_creer", "SK", "sk", "hmX", "main"]);
  // Simulé par l'annonce (sans relie_at) : pas un choix à la main.
  assertEquals(planAccueil(d, null, { statut: "simule", pays: "SK", langue: "sk", hm_id: null }, [], api({ freelance_pays: null })).statut, "a_relier");
});

Deno.test("0470 : HM par le nom Upwork, langue d'un pays, code d'un pays", () => {
  const hms = [{ id: "l", prenom: "Lucia", nom: "D" }, { id: "r", prenom: "Rana", nom: "Barakli" }, { id: "s", prenom: "Sara", nom: "B" }];
  assertEquals(hmDeNomUpwork("Lucia D.", hms), "l");
  assertEquals(hmDeNomUpwork("Rana B.", hms), "r");
  assertEquals(hmDeNomUpwork("Dzenita S.", hms), null);
  assertEquals(hmDeNomUpwork(null, hms), null);
  assertEquals(langueDePays("IL", [{ pays: "IL", langue: "he" }, { pays: "IL", langue: "he" }, { pays: "IL", langue: "ar" }]), "he");
  assertEquals(langueDePays("IS", [{ pays: "IL", langue: "he" }]), null);
  assertEquals([codePays("Croatia"), codePays("Slovakia"), codePays("hr"), codePays("United States"), codePays("Atlantis")], ["HR", "SK", "HR", "US", null]);
  // Jamais un code retiré (FX, DD, SU, YU…).
  assertEquals(
    ["France", "FX", "Germany", "Lithuania", "Israel", "Russia", "Serbia", "Myanmar (Burma)", "United Kingdom", "Romania", "Slovakia"].map(codePays),
    ["FR", "FR", "DE", "LT", "IL", "RU", "RS", "MM", "GB", "RO", "SK"],
  );
});

Deno.test("doublon : contrat déjà relié, ou même nom et même pays actif → rien, signalé", () => {
  assertEquals(planAccueil(d, annonce(), null, [posteur({ upwork_contract_id: "44784407" })]).statut, "doublon");
  assertEquals(planAccueil(d, annonce(), null, [posteur()]).statut, "doublon");
  // Prompt 25 MAJ : le profil existant est donné (contrat relié et bienvenue quand même, jamais un 2e profil).
  assertEquals(planAccueil(d, annonce(), null, [posteur({ upwork_contract_id: "44784407" })]).poster_id, posteur().id);
  assertEquals(planAccueil(d, annonce(), null, [posteur()]).poster_id, posteur().id);
  // Même nom, autre pays, ou inactif : pas un doublon.
  assertEquals(planAccueil(d, annonce(), null, [posteur({ pays: "FR" })]).statut, "a_creer");
  assertEquals(planAccueil(d, annonce(), null, [posteur({ is_active: false })]).statut, "a_creer");
});

Deno.test("le message de bienvenue, rempli, en anglais", () => {
  const m = messageAccueil("Hi {prenom}! {url} · {email} · {mot_de_passe} · {slack} · {guide} · Monday {date} · {inconnu}", {
    prenom: "Ana", url: "https://os", email: "ana@vik.co", mot_de_passe: "12345678", slack: "https://slack", guide: "https://guide",
    cohorte_lundi: "2026-11-02",
  });
  assertEquals(m, "Hi Ana! https://os · ana@vik.co · 12345678 · https://slack · https://guide · Monday 2 November · {inconnu}");
});

Deno.test("prompt 13 : le @ TikTok à créer, ou la ligne retirée s'il n'est pas connu", () => {
  const modele = "Hi {prenom}\n• Login: {email}\n• Your TikTok account to create: @{handle} (use exactly this name)\n• Slack: {slack}";
  const v = { prenom: "Ana", url: "u", email: "a@b", mot_de_passe: "x", slack: "s", guide: "g", cohorte_lundi: "2026-11-02" };
  assertEquals(
    messageAccueil(modele, { ...v, handle: "@ana.studies" }),
    "Hi Ana\n• Login: a@b\n• Your TikTok account to create: @ana.studies (use exactly this name)\n• Slack: s",
  );
  assertEquals(messageAccueil(modele, { ...v, handle: null }), "Hi Ana\n• Login: a@b\n• Slack: s");
});

Deno.test("annonces déduites des posteurs déjà embauchés", async () => {
  const { annoncesDepuisPosteurs } = await import("./accueil.ts");
  const p = (job_id: string, pays: string | null, langue: string | null, hm: string | null, tarif: number | null) => ({
    job_id, titre: `Job ${job_id}`, pays, langue, hm_id: hm, tarif,
  });
  const r = annoncesDepuisPosteurs([
    p("j1", "TR", "tr", "h1", 30), p("j1", "tr", "tr", "h1", 30), p("j1", "TR", "tr", "h2", 30),
    p("j2", "GR", "el", "h1", 30), p("j2", "CY", "el", "h1", 25),
    p("j3", null, null, null, null),
  ]);
  const de = (id: string) => r.find((x) => x.job_id === id)!;
  assertEquals(de("j1"), { job_id: "j1", titre: "Job j1", pays: "TR", langue: "tr", hm_id: "h1", tarif: 30, generique: false, posteurs: 3 });
  assertEquals([de("j2").generique, de("j2").pays, de("j2").tarif], [true, null, null]);
  assertEquals([de("j3").generique, de("j3").pays], [false, null]);
});

Deno.test("prompt 25, 16 : recrue déjà créée par la HM, notée doublon avant On → la bienvenue part sur On, une fois", () => {
  const d = { statut: "doublon", raison: "contrat déjà relié à un posteur", message_at: null };
  assertEquals(bienvenueARattraper(d, "on"), true);
  assertEquals(bienvenueARattraper({ ...d, raison: "même nom et même pays qu'un posteur actif" }, "on"), true);
  // Pas sur Test ou Approve, jamais deux fois, jamais un profil relié à un autre contrat.
  assertEquals(bienvenueARattraper(d, "approve"), false);
  assertEquals(bienvenueARattraper(d, "test"), false);
  assertEquals(bienvenueARattraper({ ...d, message_at: "2026-10-30T10:00:00Z" }, "on"), false);
  assertEquals(bienvenueARattraper({ ...d, raison: "profil existant inactif ou relié à un autre contrat" }, "on"), false);
  assertEquals(bienvenueARattraper({ ...d, statut: "envoye" }, "on"), false);
});
