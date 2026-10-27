import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

import "@/locales";
import { versCsv } from "@/lib/csv";

import type { CompteExport, PostExport } from "./api";
import { tableauMarkdown, texteClaude } from "./claude";
import { COLONNES_DETAIL, COLONNES_RESUME, PRESETS } from "./colonnes";
import {
  blocDuCompte,
  bornesPeriode,
  filtrerBloc,
  garderColonnes,
  lignesDetail,
  lignesResume,
  nomFichier,
  type ContexteExport,
} from "./construire";

const AUJ = "2026-10-28"; // mercredi
const LUNDI = "2026-10-26";

function jour(k: number) {
  return new Date(Date.parse(`${AUJ}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
}
function p(k: number, rang: number, publie: boolean, vues = 800): PostExport {
  return {
    jour: jour(k),
    rang,
    url: publie ? `https://tiktok.com/v/${k}${rang}` : null,
    vues: publie ? vues : null,
    likes: publie ? 40 : null,
    publie_at: publie ? `${jour(k)}T10:00:00Z` : null,
    stats_maj_at: publie ? `${jour(k + 1)}T04:00:00Z` : null,
    mesure: publie,
  };
}

function compte(o: Partial<CompteExport>): CompteExport {
  return {
    compte_id: "c1",
    poster_id: "p1",
    hm_id: "hm",
    hm_prenom: "Lucía",
    hm_zone: "LATAM",
    poster_nom: "Ana Pérez",
    pays: "FR",
    langue: "fr",
    handle: "ana.fr",
    comptes_actifs: 1,
    upwork_contrat_url: "https://upwork.com/c/1",
    is_active: true,
    premier_jour: "2026-09-07",
    cree_le: "2026-09-01T10:00:00Z",
    warmup_started_at: "2026-09-02T10:00:00Z",
    warmup_ends_at: "2026-09-07T00:00:00+02:00",
    reposts_le: "2026-09-03T10:00:00Z",
    tiktok_existe: true,
    tiktok_cree_le: "2026-09-01T18:00:00Z",
    follows: 12,
    likes: 40,
    seuil_mort: 50,
    mediane_pays: 1000,
    // Lundi 2/2, mardi 1/2 (un lien oublié), aujourd'hui 1/2 ; la semaine d'avant tout publié.
    posts: [
      ...[-9, -8, -7, -6, -5, -4, -3].flatMap((k) => [p(k, 1, true), p(k, 2, true)]),
      p(-2, 1, true, 300),
      p(-2, 2, true, 900),
      p(-1, 1, true, 20),
      p(-1, 2, false),
      p(0, 1, true),
      p(0, 2, false),
    ],
    diagnostic: {
      badge: "posts_manquants",
      attendus: 14,
      publies: 13,
      liens_manquants: [jour(-1)],
      mediane: 800,
      mediane_ref: 1000,
      morts: 1,
      seuil_mort: 50,
      shadowban: false,
    },
    decision: { regle: "jeudi", action: "nudge", decision: "nudge", fait_at: null, jour: "2026-10-29" },
    ...o,
  };
}

let ctx: ContexteExport;
beforeAll(async () => {
  await i18next.changeLanguage("en");
  ctx = {
    aujourdhui: AUJ,
    maintenant: new Date(`${AUJ}T12:00:00Z`),
    t: i18next.t,
    langue: "en",
    etapes: new Map(),
    paie: new Map([
      [
        "p1",
        {
          id: "x", poster_id: "p1", semaine: "2026-10-19", nb_comptes: 2, comptes_payes: 2, prevus: 28, faits: 27,
          manques: 1, tarif: 20, retenue: 0, montant: 40, statut: "ok", raison: null, paye_at: null, paye_par: null,
          semaine_suivante_faite_at: null, poster: null,
        },
      ],
    ]),
    semainePayee: "2026-10-19",
    suivante: new Map(),
    bonus: [
      {
        poster_id: "p1", hm_id: "hm", type: "parrainage", detail: "referral", quantite: 2, montant: 25,
        lundi_bonus: "2026-11-30", etat: "apercu",
      },
    ],
  };
});

describe("périodes et blocs", () => {
  it("cette semaine, semaine dernière, 14 et 30 jours", () => {
    expect(bornesPeriode("cette_semaine", AUJ)).toEqual({ debut: LUNDI, fin: AUJ });
    expect(bornesPeriode("semaine_derniere", AUJ)).toEqual({ debut: "2026-10-19", fin: "2026-10-25" });
    expect(bornesPeriode("14j", AUJ)).toEqual({ debut: "2026-10-15", fin: AUJ });
    expect(bornesPeriode("30j", AUJ)).toEqual({ debut: "2026-09-29", fin: AUJ });
  });

  it("le bloc d'un compte : première semaine, warm-up, ancien", () => {
    expect(blocDuCompte(compte({}), AUJ)).toBe("anciens");
    expect(blocDuCompte(compte({ premier_jour: LUNDI }), AUJ)).toBe("cette_semaine");
    expect(blocDuCompte(compte({ premier_jour: null, warmup_ends_at: null }), AUJ)).toBe("semaine_prochaine");
    expect(blocDuCompte(compte({ premier_jour: null, warmup_ends_at: "2026-11-02T00:00:00+01:00" }), AUJ)).toBe(
      "semaine_prochaine",
    );
  });

  it("Paie : les posteurs qui ont une paie ou un bonus à venir", () => {
    const autre = compte({ compte_id: "c2", poster_id: "p2" });
    expect(filtrerBloc([compte({}), autre], "paie", ctx).map((c) => c.compte_id)).toEqual(["c1"]);
  });
});

describe("le Résumé", () => {
  it("une valeur par colonne, les mots de l'interface, les règles de format", () => {
    const [l] = lignesResume([compte({})], LUNDI, AUJ, ctx);
    expect(l).toMatchObject({
      hm: "Lucía",
      tiktok_url: "https://www.tiktok.com/@ana.fr",
      cohort_monday: "2026-09-07",
      posting_week_number: 8,
      posts_expected_week: 6,
      posts_done_week: 4,
      posts_missed_week: 1,
      links_missing_week: 1,
      posts_done_today: 1,
      posts_expected_today: 2,
      last_post_date: AUJ,
      views_best_7d: 900,
      dead_posts_7d: 1,
      tiktok_account_created: "2026-09-01",
      warmup_started_at: "2026-09-02T10:00:00.000Z",
      reposts_done: true,
      warmup_deadline: null,
      diagnostic: "Missing posts",
      decision_this_week: "Nudge",
      decision_done: false,
      pay_week_amount: 40,
      pay_status: "OK",
      bonus_upcoming_amount: 25,
      bonus_upcoming_date: "2026-11-30",
    });
    expect(String(l!.stage)).toMatch(/week 8/i);
  });

  it("paie et bonus seulement sur le premier compte du posteur", () => {
    const deux = lignesResume(
      [compte({}), compte({ compte_id: "c2", cree_le: "2026-10-01T10:00:00Z", handle: "ana.2" })],
      LUNDI,
      AUJ,
      ctx,
    );
    expect(deux.map((l) => [l.tiktok_handle, l.pay_week_amount, l.bonus_upcoming_amount])).toEqual([
      ["ana.fr", 40, 25],
      ["ana.2", null, null],
    ]);
  });

  it("un compte en warm-up : la date limite (lundi 00 h Paris, ISO UTC) et l'étape en retard", () => {
    const [l] = lignesResume(
      [
        compte({
          premier_jour: null,
          warmup_started_at: null,
          warmup_ends_at: null,
          cree_le: "2026-10-24T10:00:00Z",
          tiktok_existe: false,
          tiktok_cree_le: null,
          follows: null,
          likes: null,
          reposts_le: null,
          posts: [],
          decision: null,
        }),
      ],
      LUNDI,
      AUJ,
      ctx,
    );
    expect(l).toMatchObject({ warmup_deadline: "2026-11-01T23:00:00.000Z", diagnostic: null, reposts_done: false });
    expect(l!.suggested_action).toMatch(/^Late/);
  });
});

it("le Détail : une ligne par post, published / missed / planned, heures de mesure", () => {
  const d = lignesDetail([compte({})], jour(-1), AUJ, AUJ);
  expect(d.map((x) => [x.date, x.slot, x.status])).toEqual([
    [jour(-1), 1, "published"],
    [jour(-1), 2, "missed"],
    [AUJ, 1, "published"],
    [AUJ, 2, "planned"],
  ]);
  expect(d[0]).toMatchObject({ published_at: `${jour(-1)}T10:00:00.000Z`, views: 20, likes: 40, hours_measured_after: 18 });
});

describe("colonnes et sorties", () => {
  it("seules les colonnes cochées sont exportées, dans l'ordre", () => {
    const lignes = lignesResume([compte({})], LUNDI, AUJ, ctx);
    expect(garderColonnes(lignes, ["tiktok_handle", "posts_done_week"])).toEqual([["ana.fr", 4]]);
  });

  it("jamais d'email ni de login dans les colonnes", () => {
    const toutes = [...Object.keys(COLONNES_RESUME), ...Object.keys(COLONNES_DETAIL)];
    expect(toutes.filter((c) => /mail|login|password/i.test(c))).toEqual([]);
    expect(PRESETS.tout).toEqual(Object.keys(COLONNES_RESUME));
  });

  it("CSV : BOM UTF-8, accents, virgule ; nom du fichier", () => {
    const csv = versCsv(["hm", "poster_name"], garderColonnes(lignesResume([compte({})], LUNDI, AUJ, ctx), ["hm", "poster_name"]));
    expect(csv).toBe("﻿hm,poster_name\r\nLucía,Ana Pérez\r\n");
    expect(nomFichier("Lucía", "tout", AUJ)).toBe("hm_lucia_tout_2026-10-28.csv");
  });

  it("Copier pour Claude : 5 lignes de contexte, le sens des colonnes, un tableau Markdown valide", () => {
    const colonnes = ["tiktok_handle", "suggested_action"];
    const texte = texteClaude(
      { hm: "Lucía", zone: "LATAM", debut: LUNDI, fin: AUJ, periode: "this week", bloc: "All", niveau: "resume", exporteLe: new Date(`${AUJ}T12:00:00Z`) },
      colonnes,
      [["a|b", "line\nbreak"], ["c", null]],
    )!;
    const [contexte, sens, tableau] = texte.split("\n\n");
    expect(contexte!.split("\n").slice(1)).toHaveLength(5);
    expect(sens).toContain("- suggested_action: What the HM should do");
    const lignes = tableau!.trim().split("\n");
    const nb = (l: string) => l.replace(/\\\|/g, "").split("|").length;
    expect(lignes.every((l) => nb(l) === nb(lignes[0]!))).toBe(true);
    expect(lignes[2]).toBe("| a\\|b | line break |");
    expect(lignes[3]).toBe("| c |  |");
  });

  it("au-delà de 300 lignes, pas de texte : proposer le CSV", () => {
    const ctxC = { hm: "x", zone: null, debut: LUNDI, fin: AUJ, periode: "p", bloc: "b", niveau: "detail" as const, exporteLe: new Date() };
    expect(texteClaude(ctxC, ["date"], Array.from({ length: 300 }, () => ["d"]))).not.toBeNull();
    expect(texteClaude(ctxC, ["date"], Array.from({ length: 301 }, () => ["d"]))).toBeNull();
    expect(tableauMarkdown(["a"], []).split("\n")).toHaveLength(2);
  });
});
