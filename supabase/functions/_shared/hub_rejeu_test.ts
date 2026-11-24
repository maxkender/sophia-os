/** 24/11 : le corps `creer_posteur` reconstruit pour les signés bloqués (`rejouer_bloques`). */
import { assertEquals } from "jsr:@std/assert@1";

import { type CandidatureBloquee, corpsRejeu, lundiDeDepart, type ReservationBloquee, separerNom } from "./hub_posteurs.ts";

const HUB = "3b5253a9-05e6-4068-9a96-9f38652c5800";
const ouverts = [{ pays: "GR", zone: "B" }, { pays: "US", zone: "A" }, { pays: "AR", zone: "C" }];
const tarifs = { A: 14, B: 10, C: 7 };
const cand = (x: Partial<CandidatureBloquee> = {}): CandidatureBloquee => ({
  site_id: HUB, nom: "Γιαννης Γιαννουλακης", email: "Gianni@Example.com", pays: "GR", pays_brut: "Greece",
  ref: "abc123", ruul_email: "ruul@example.com", start_monday: "2026-11-30", ...x,
});
const resa = (x: Partial<ReservationBloquee> = {}): ReservationBloquee => ({
  hub_id: HUB, email_perso: "gianni@example.com", pays_code: "GR", applications: ["sophia"], debut_le: "2026-11-30", ...x,
});

Deno.test("le corps reprend la candidature, la réservation, la zone et le tarif de l'OS", () => {
  const { corps, manques } = corpsRejeu(cand(), resa(), ouverts, tarifs, "2026-11-24");
  assertEquals(manques, []);
  assertEquals(corps, {
    action: "creer_posteur", hub_id: HUB, prenom: "Γιαννης", nom: "Γιαννουλακης", email_perso: "gianni@example.com",
    pays_code: "GR", pays_nom: "Greece", applications: ["sophia"], ruul_email: "ruul@example.com", ref: "abc123",
    plateforme_paie: "ruul", zone: "B", tarif_semaine: 10, start_monday: "2026-11-30", application_id: HUB,
  });
});

Deno.test("zone A et C : 14 $ et 7 $", () => {
  assertEquals(corpsRejeu(cand({ pays: "US" }), resa({ pays_code: "US" }), ouverts, tarifs, "2026-11-24").corps.tarif_semaine, 14);
  assertEquals(corpsRejeu(cand({ pays: "AR" }), resa({ pays_code: "AR" }), ouverts, tarifs, "2026-11-24").corps.zone, "C");
});

Deno.test("email perso absent de la réservation : celui de la candidature, en minuscules", () => {
  assertEquals(corpsRejeu(cand(), resa({ email_perso: null }), ouverts, tarifs, "2026-11-24").corps.email_perso, "gianni@example.com");
});

Deno.test("champs manquants ou douteux : signalés", () => {
  const { manques } = corpsRejeu(cand({ nom: "Madonna", ruul_email: null, pays: "PT" }), resa({ pays_code: "PT" }), ouverts, tarifs, "2026-11-24");
  assertEquals(manques, ["nom", "ruul_email", "pays_non_ouvert"]);
  assertEquals(corpsRejeu(cand(), resa(), ouverts, { B: null }, "2026-11-24").manques, ["tarif_semaine"]);
});

Deno.test("lundi de départ : gardé s'il n'est pas passé, sinon le lundi suivant", () => {
  assertEquals(lundiDeDepart("2026-11-30", "2026-11-24"), "2026-11-30");
  assertEquals(lundiDeDepart("2026-11-23", "2026-11-24"), "2026-11-30");
  assertEquals(lundiDeDepart("2026-11-23", "2026-11-30"), "2026-12-07");
  assertEquals(lundiDeDepart(null, "2026-11-29"), "2026-11-30");
});

Deno.test("nom complet : premier mot = prénom, le reste = nom", () => {
  assertEquals(separerNom("  Ana  María de la Cruz "), { prenom: "Ana", nom: "María de la Cruz" });
  assertEquals(separerNom(null), { prenom: "", nom: "" });
});
