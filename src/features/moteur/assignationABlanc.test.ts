import { describe, expect, it } from "vitest";

import { en } from "@/locales/en";
import { fr } from "@/locales/fr";
import {
  decouperLignesNdjson,
  iaBloqueeParLaNuit,
  motifBlocageCle,
  motifNuitCle,
  operationCle,
  origineDeckCle,
  totalEcritures,
} from "./assignationABlanc";

/** Clés à plat d'un objet de traductions (« a.b.c »). */
function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
  return Object.entries(objet).flatMap(([k, v]) =>
    v && typeof v === "object" ? cles(v as Record<string, unknown>, `${prefixe}${k}.`) : [`${prefixe}${k}`],
  );
}

function valeur(objet: Record<string, unknown>, chemin: string): unknown {
  return chemin.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], objet);
}

describe("decouperLignesNdjson", () => {
  it("garde la ligne coupée au milieu dans le reste, et la termine au morceau suivant", () => {
    const a = decouperLignesNdjson('{"detail":"un"}\n{"deta');
    expect(a.lignes).toEqual([{ detail: "un" }]);
    expect(a.reste).toBe('{"deta');
    const b = decouperLignesNdjson(`${a.reste}il":"deux"}\n`);
    expect(b.lignes).toEqual([{ detail: "deux" }]);
    expect(b.reste).toBe("");
  });

  it("plusieurs lignes par morceau, lignes vides et JSON illisible ignorés", () => {
    const r = decouperLignesNdjson('{"a":1}\n\n   \n{pas du json}\n{"b":2}\n');
    expect(r.lignes).toEqual([{ a: 1 }, { b: 2 }]);
    expect(r.reste).toBe("");
  });

  it("aucun saut de ligne : tout reste en attente", () => {
    expect(decouperLignesNdjson('{"a":1}')).toEqual({ lignes: [], reste: '{"a":1}' });
  });
});

describe("totalEcritures", () => {
  it("additionne les requêtes évitées", () => {
    expect(
      totalEcritures({
        ecrituresEvitees: [
          { table: "passages", operation: "insert", requetes: 2, lignes: 2 },
          { table: "posts", operation: "delete", requetes: 1, lignes: null },
        ],
      }),
    ).toBe(3);
    expect(totalEcritures({ ecrituresEvitees: [] })).toBe(0);
  });
});

describe("libellés du test à blanc", () => {
  const origines = ["existant", "livre", "cuit_ia", "a_fabriquer", "refuse", "echec", "budget", "inconnue"];
  const operations = ["insert", "update", "upsert", "delete"];
  const motifs = [
    "inactif",
    "pause",
    "quota_nuit",
    "warmup_non_demarre",
    "warmup_en_cours",
    "cm",
    "ugc_video",
    "videos_uniquement",
  ];
  const blocages = [
    "hors_contexte",
    "contexte_ferme",
    "supabase_rpc",
    "supabase_storage",
    "supabase_functions",
    "supabase_auth",
    "supabase_autre",
    "methode_refusee",
    "hors_run",
    "ia_non_autorisee",
    "ia_plafond",
    "externe",
    "requete_illisible",
    "erreur_interne",
  ];

  it("chaque origine, opération, motif et blocage a un texte FR et EN", () => {
    const toutes = [
      ...origines.map(origineDeckCle),
      ...operations.map(operationCle),
      ...motifs.map(motifNuitCle),
      ...blocages.map(motifBlocageCle),
    ];
    for (const cle of toutes) {
      expect(typeof valeur(fr.translation, cle), `fr ${cle}`).toBe("string");
      expect(typeof valeur(en.translation, cle), `en ${cle}`).toBe("string");
    }
  });

  it("une origine inconnue retombe sur un libellé générique", () => {
    expect(origineDeckCle("nouvelle")).toBe("aBlanc.deck.inconnue");
  });

  it("le bloc aBlanc a exactement les mêmes clés en FR et en EN", () => {
    expect(cles(en.translation.aBlanc).sort()).toEqual(cles(fr.translation.aBlanc).sort());
  });
});

describe("iaBloqueeParLaNuit (mêmes fenêtres UTC que le serveur)", () => {
  it.each([
    ["2026-10-09T21:44:00Z", false],
    ["2026-10-09T21:45:00Z", true],
    ["2026-10-09T23:59:00Z", true],
    ["2026-10-10T00:29:00Z", true],
    ["2026-10-10T00:30:00Z", false],
    ["2026-10-10T03:45:00Z", true],
    ["2026-10-10T05:29:00Z", true],
    ["2026-10-10T05:30:00Z", false],
    ["2026-10-10T12:00:00Z", false],
  ])("%s → %s", (iso, attendu) => {
    expect(iaBloqueeParLaNuit(new Date(iso))).toBe(attendu);
  });
});
