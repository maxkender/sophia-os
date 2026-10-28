/** Système du 2 nov., partie A : l'accueil automatique, sans réseau. */
import { assertEquals } from "jsr:@std/assert@1";

import {
  type Annonce,
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
  assertEquals(planAccueil(d, annonce(), null, []), { statut: "a_creer", raison: null, pays: "PT", langue: "pt", hm_id: "hm1", tarif: 14 });
});

Deno.test("annonce inconnue ou générique → Contrats à relier ; pays choisi à la main → créer", () => {
  assertEquals(planAccueil(d, null, null, []).statut, "a_relier");
  assertEquals(planAccueil(d, annonce({ generique: true, pays: null }), null, []).raison, "annonce générique");
  const choisi = planAccueil(d, annonce({ generique: true, pays: null }), { statut: "a_creer", pays: "FR", langue: "fr", hm_id: "hm2" }, []);
  assertEquals([choisi.statut, choisi.pays, choisi.hm_id], ["a_creer", "FR", "hm2"]);
  // Pays sans langue : à relier.
  assertEquals(planAccueil(d, annonce({ langue: null }), null, []).statut, "a_relier");
});

Deno.test("doublon : contrat déjà relié, ou même nom et même pays actif → rien, signalé", () => {
  assertEquals(planAccueil(d, annonce(), null, [posteur({ upwork_contract_id: "44784407" })]).statut, "doublon");
  assertEquals(planAccueil(d, annonce(), null, [posteur()]).statut, "doublon");
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
