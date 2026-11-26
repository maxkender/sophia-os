/**
 * 0867 (26/11, Max) : les États-Unis à 30 $/semaine pour les NOUVELLES recrues ; les posteurs US d'avant gardent 14 $.
 * Le parcours d'un candidat US fictif, avec les fonctions pures (rien n'est envoyé, aucun posteur créé) :
 * page Join (paysEtPaie) → signature (join_signatures.zone / tarif_semaine) → corps envoyé à hub-posteurs
 * (paieSignee) → fiche OS (zoneEtTarifSignes : ruul_zone, ruul_tarif_semaine). La paie Ruul part ensuite de
 * ruul_tarif_semaine (posteur_tarif_semaine dans paie_calculer_v3, vérifié en base par la migration 0867).
 */
import { assertEquals } from "jsr:@std/assert@1";

import { corpsRejeu, zoneEtTarifSignes } from "./hub_posteurs.ts";
import { paieSignee, paysEtPaie } from "./join.ts";

// zones_paie et zones_paie_pays après 0867.
const ZONES = [{ zone: "A", tarif: 14 }, { zone: "B", tarif: "10" }, { zone: "C", tarif: 7 }, { zone: "US", tarif: 30 }];
const PAYS = [
  { pays: "US", zone: "US", retire_at: null },
  { pays: "GB", zone: "A", retire_at: null },
  { pays: "IL", zone: "A", retire_at: null },
  { pays: "HU", zone: "B", retire_at: null },
  { pays: "PT", zone: "B", retire_at: "2026-11-02T11:32:23Z" },
];
const TARIFS: Record<string, number | null> = { A: 14, B: 10, C: 7, US: 30 };

Deno.test("Join : un candidat US voit 30 $, le Royaume-Uni et Israël restent à 14 $", () => {
  const { zones, pays } = paysEtPaie(ZONES, PAYS, []);
  assertEquals(pays.find((p) => p.pays === "US"), { pays: "US", zone: "US", tarif: 30 });
  assertEquals(pays.find((p) => p.pays === "GB")?.tarif, 14);
  assertEquals(pays.find((p) => p.pays === "IL")?.tarif, 14);
  assertEquals(pays.find((p) => p.pays === "PT"), undefined);
  assertEquals(zones.map((z) => `${z.zone}:${z.tarif}`), ["A:14", "B:10", "C:7", "US:30"]);
});

Deno.test("Candidat US fictif : page Join → signature → fiche OS à 30 $", () => {
  const affiche = paysEtPaie(ZONES, PAYS, []).pays.find((p) => p.pays === "US");
  // Signature : la zone et le tarif affichés sont gardés avec elle.
  const signature = { zone: affiche?.zone ?? null, tarif_semaine: affiche?.tarif ?? null };
  assertEquals(signature, { zone: "US", tarif_semaine: 30 });
  // Création de la fiche (plus tard, même si la zone a changé entre-temps) : le tarif de la signature.
  const envoye = paieSignee(signature, { pays: "US", zone: "US", tarif: 45 });
  assertEquals(envoye, { zone: "US", tarif: 30 });
  // hub-posteurs creer_posteur : ce qui est écrit sur la fiche.
  assertEquals(zoneEtTarifSignes({ zone: envoye.zone, tarif_semaine: envoye.tarif }, "US", TARIFS), { zone: "US", tarif: 30 });
});

Deno.test("Signé AVANT le passage à 30 $ : la fiche garde les 14 $ de la signature", () => {
  const envoye = paieSignee({ zone: "A", tarif_semaine: "14" }, { pays: "US", zone: "US", tarif: 30 });
  assertEquals(envoye, { zone: "A", tarif: 14 });
  assertEquals(zoneEtTarifSignes({ zone: envoye.zone, tarif_semaine: envoye.tarif }, "US", TARIFS), { zone: "A", tarif: 14 });
});

Deno.test("Signature sans tarif noté (avant 0867) : le tarif du pays au moment de la création", () => {
  assertEquals(paieSignee(null, { pays: "US", zone: "US", tarif: 30 }), { zone: "US", tarif: 30 });
  assertEquals(paieSignee({ zone: null, tarif_semaine: null }, { pays: "HU", zone: "B", tarif: 10 }), { zone: "B", tarif: 10 });
  assertEquals(paieSignee({ zone: "A", tarif_semaine: "" }, undefined), { zone: null, tarif: null });
});

Deno.test("Ancien site (Hub) : ni zone ni tarif envoyés → zone US et 30 $ de l'OS, figés sur la fiche", () => {
  // Le site envoie seulement son propre zone_paiement (« A » tant que sa table n'est pas changée) : jamais lu.
  assertEquals(zoneEtTarifSignes({ zone_paiement: "A" } as Record<string, unknown>, "US", TARIFS), { zone: "US", tarif: 30 });
  // Royaume-Uni (zone A du pays dans l'OS) : 14 $.
  assertEquals(zoneEtTarifSignes({}, "A", TARIFS), { zone: "A", tarif: 14 });
});

Deno.test("zoneEtTarifSignes : zone inconnue, tarif absent ou hors bornes", () => {
  assertEquals(zoneEtTarifSignes({ zone: "z", tarif_semaine: 30 }, "US", TARIFS), { zone: "US", tarif: 30 });
  assertEquals(zoneEtTarifSignes({ zone: "us", tarif_semaine: 0 }, "A", TARIFS), { zone: "US", tarif: 30 });
  assertEquals(zoneEtTarifSignes({ zone: "B", tarif_semaine: 250 }, "B", TARIFS), { zone: "B", tarif: 10 });
  assertEquals(zoneEtTarifSignes({ tarif_semaine: "14" }, null, TARIFS), { zone: null, tarif: 14 });
  assertEquals(zoneEtTarifSignes({}, null, TARIFS), { zone: null, tarif: null });
});

Deno.test("Rejeu d'un signé bloqué du site, aux États-Unis : 30 $", () => {
  const { corps, manques } = corpsRejeu(
    { site_id: "s1", nom: "Test Fictif", email: "test@example.com", pays: "US", pays_brut: "United States", ref: null, ruul_email: "r@example.com", start_monday: "2026-11-30" },
    { hub_id: "0b0e3c1e-1c1a-4d4e-9a9a-0c0c0c0c0c0c", email_perso: "test@example.com", pays_code: "US", applications: [], debut_le: "2026-11-30" },
    [{ pays: "US", zone: "US" }],
    TARIFS,
    "2026-11-26",
  );
  assertEquals(manques, []);
  assertEquals([corps.zone, corps.tarif_semaine], ["US", 30]);
});
