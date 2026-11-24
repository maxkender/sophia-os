import { describe, expect, it } from "vitest";

import type { SourceNeuve } from "./sources";
import { duree, ilYa, type LigneContenu, type LigneFile, type LigneJournal, phaseDuContenu, phaseDuPost, slideshowsDeLaSource, suivreSource } from "./suiviImport";

const MAINTENANT = Date.parse("2026-11-24T15:00:00Z");
const min = (m: number) => new Date(MAINTENANT - m * 60_000).toISOString();
const url = (n: number) => `https://www.tiktok.com/@mondorunning/photo/76000000000000000${n}`;

const contenu = (o: Partial<LigneContenu>): LigneContenu => ({
  id: "c1", compte_reference_id: "s1", source_url: url(1), statut: "brouillon", import_statut: "pending", import_etape: null, import_erreur: null,
  import_tentatives: 0, import_lease_until: null, pertinence_score: null, created_at: min(20), ...o,
});
const post = (o: Partial<LigneFile>): LigneFile => ({
  id: "f1", compte_reference_id: "s1", post_url: url(1), statut: "pending", erreur: null, tentatives: 0, created_at: min(25), updated_at: min(25),
  lease_until: null, contenu_id: null, ...o,
});
const journal = (o: Partial<LigneJournal>): LigneJournal => ({
  id: 1, at: min(1), compte_reference_id: "s1", contenu_id: null, post_url: null, niveau: "info", etape: "ocr", message: "Post 000001 : lecture des slides (OCR)", ...o,
});
const neuve = (o: Partial<SourceNeuve>): SourceNeuve => ({
  compteReferenceId: "s1", handle: "mondorunning", essais: 1, echec: null, lanceeLe: min(30), releve: true, enTraitement: 0, enfilees: 4, ...o,
});

describe("phase d'un slideshow", () => {
  it("le pipeline, étape par étape", () => {
    expect(phaseDuContenu(contenu({ import_etape: null })).phase).toBe("lecture");
    expect(phaseDuContenu(contenu({ import_etape: "ocr", import_statut: "running" })).phase).toBe("lecture");
    expect(phaseDuContenu(contenu({ import_etape: "pertinence" })).phase).toBe("pertinence");
    expect(phaseDuContenu(contenu({ import_etape: "elo" })).phase).toBe("note");
    expect(phaseDuContenu(contenu({ import_etape: "nettoyage" })).phase).toBe("nettoyage");
    expect(phaseDuContenu(contenu({ import_etape: "caption" })).phase).toBe("description");
  });

  it("l'issue : gardé, écarté (avec la raison), abandonné après 8 échecs ; avant, l'erreur est reprise", () => {
    expect(phaseDuContenu(contenu({ import_statut: "done", import_etape: "done", statut: "valide" }))).toEqual({ phase: "garde", erreur: null });
    expect(phaseDuContenu(contenu({ import_statut: "done", import_etape: "elo_insuffisant", statut: "rejete", import_erreur: "32 < 40" }))).toEqual({ phase: "ecarte", erreur: "note trop basse : 32 < 40" });
    expect(phaseDuContenu(contenu({ import_statut: "done", import_etape: "rejete", statut: "rejete" })).phase).toBe("ecarte");
    expect(phaseDuContenu(contenu({ import_statut: "done", import_etape: "nettoyage_rate", statut: "rejete", import_erreur: "Slide 3 impossible à nettoyer après 4 essais" })))
      .toEqual({ phase: "ecarte", erreur: "image impossible à nettoyer : Slide 3 impossible à nettoyer après 4 essais" });
    expect(phaseDuContenu(contenu({ import_statut: "failed", import_etape: "nettoyage", import_tentatives: 3, import_erreur: "fal 500" }))).toEqual({ phase: "nettoyage", erreur: "fal 500" });
    expect(phaseDuContenu(contenu({ import_statut: "failed", import_etape: "nettoyage", import_tentatives: 8, import_erreur: "fal 500" }))).toEqual({ phase: "abandon", erreur: "fal 500" });
  });

  it("un post de la file : à récupérer, reporté, en récupération (bail expiré : bloqué), raté puis abandonné à 5", () => {
    expect(phaseDuPost(post({}), MAINTENANT)).toMatchObject({ phase: "a_recuperer", reporte: false });
    expect(phaseDuPost(post({ erreur: "Report (capacité fournisseur) — Apify 402" }), MAINTENANT)).toMatchObject({ phase: "a_recuperer", reporte: true });
    expect(phaseDuPost(post({ statut: "running", lease_until: min(-3) }), MAINTENANT)).toMatchObject({ phase: "recuperation", bloque: false });
    expect(phaseDuPost(post({ statut: "running", lease_until: min(2) }), MAINTENANT)).toMatchObject({ phase: "recuperation", bloque: true });
    expect(phaseDuPost(post({ statut: "failed", tentatives: 2, erreur: "404" }), MAINTENANT)).toMatchObject({ phase: "a_recuperer", erreur: "404" });
    expect(phaseDuPost(post({ statut: "failed", tentatives: 5, erreur: "404" }), MAINTENANT)).toMatchObject({ phase: "abandon", erreur: "404" });
  });
});

describe("les slideshows d'une source", () => {
  it("un par post : le contenu l'emporte sur sa ligne de file ; ce qui coince d'abord, le fini à la fin", () => {
    const liste = slideshowsDeLaSource(
      [post({ statut: "done", contenu_id: "c1" }), post({ id: "f2", post_url: url(2) }), post({ id: "f3", post_url: `${url(3)}?lang=fr` })],
      [
        contenu({ import_statut: "done", import_etape: "done", statut: "valide" }),
        contenu({ id: "c3", source_url: url(3), import_statut: "failed", import_etape: "elo", import_tentatives: 1, import_erreur: "Gemini 503" }),
      ],
      MAINTENANT,
    );
    expect(liste.map((x) => [x.postUrl, x.phase])).toEqual([[url(3), "note"], [url(2), "a_recuperer"], [url(1), "garde"]]);
  });
});

describe("le suivi d'une source", () => {
  it("compte les étapes, l'avancement, et ce que le relevé a annoncé sans qu'on le voie encore", () => {
    const sv = suivreSource({ id: "s1", handle: "mondorunning", neuve: neuve({ enfilees: 5 }) }, {
      file: [post({ statut: "done", contenu_id: "c1" }), post({ id: "f2", post_url: url(2), statut: "running", lease_until: min(-6) })],
      contenus: [
        contenu({ import_statut: "done", import_etape: "done", statut: "valide" }),
        contenu({ id: "c4", source_url: url(4), import_statut: "done", import_etape: "rejete", statut: "rejete" }),
      ],
      journal: null,
    }, MAINTENANT);
    expect(sv.total).toBe(5);
    expect(sv.finis).toBe(2);
    expect(sv.enCours).toBe(3);
    expect(sv.compte).toMatchObject({ garde: 1, ecarte: 1, recuperation: 1, a_recuperer: 2 });
    expect(sv.releve).toEqual({ etat: "fait", essais: 1, echec: null, enfilees: 5 });
    // sans journal, pas de rythme
    expect(sv.rythme).toBeNull();
    expect(sv.resteMinutes).toBeNull();
  });

  it("le rythme et le temps restant viennent des fins notées dans la dernière demi-heure", () => {
    const sv = suivreSource({ id: "s1", handle: "mondorunning", neuve: neuve({ enfilees: 10 }) }, {
      file: [], contenus: [contenu({ import_statut: "done", import_etape: "done", statut: "valide" })],
      journal: [journal({ id: 3, at: min(2), etape: "fin" }), journal({ id: 2, at: min(10), etape: "fin" }), journal({ id: 1, at: min(50), etape: "fin" })],
    }, MAINTENANT);
    expect(sv.rythme).toBe(4); // 2 en 30 min
    expect(sv.resteMinutes).toBe(135); // 9 restants à 4 par heure
    expect(sv.derniereActivite).toBe(min(2));
    expect(sv.immobileDepuis).toBeNull();
  });

  it("signale une source immobile depuis 15 minutes alors qu'il lui reste du travail ; un relevé raté se dit", () => {
    const immobile = suivreSource({ id: "s1", handle: "mondorunning", neuve: neuve({}) }, {
      file: [post({ updated_at: min(40), created_at: min(40) })], contenus: [], journal: [journal({ at: min(22) })],
    }, MAINTENANT);
    expect(immobile.immobileDepuis).toBe(22);

    const rate = suivreSource({ id: "s1", handle: "x", neuve: neuve({ releve: false, lanceeLe: null, echec: "Apify 402", essais: 2, enfilees: null }) }, { file: [], contenus: [], journal: [] }, MAINTENANT);
    expect(rate.releve.etat).toBe("rate");
    expect(rate.total).toBe(0);
  });

  it("la prise d'un slideshow par le pipeline compte comme activité (bail de 8 minutes)", () => {
    const sv = suivreSource({ id: "s1", handle: "x", neuve: neuve({ enfilees: 1 }) }, {
      file: [post({ statut: "done", contenu_id: "c1", updated_at: min(60) })],
      contenus: [contenu({ import_statut: "running", import_etape: "nettoyage", import_lease_until: min(-5) })],
      journal: null,
    }, MAINTENANT);
    expect(sv.derniereActivite).toBe(min(3));
    expect(sv.immobileDepuis).toBeNull();
  });
});

describe("écritures", () => {
  it("il y a, durée", () => {
    expect(ilYa(min(0.5), MAINTENANT)).toBe("il y a 30 s");
    expect(ilYa(min(12), MAINTENANT)).toBe("il y a 12 min");
    expect(ilYa(min(65), MAINTENANT)).toBe("il y a 1 h 05");
    expect(ilYa(null, MAINTENANT)).toBe("jamais");
    expect(duree(12)).toBe("≈ 12 min");
    expect(duree(135)).toBe("≈ 2 h 15");
  });
});
