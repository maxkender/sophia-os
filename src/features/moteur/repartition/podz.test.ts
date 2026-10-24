/**
 * La carte « Labels 100 % podz » : une ligne par label, toutes applications
 * réunies, avec ses comptes par langue livrée et les langues prêtes.
 */
import { describe, expect, it } from "vitest";

import { lignesPodz } from "./podz";
import { REGLAGES_CHOIX_LABEL_DEFAUT, type StatLabel } from "./scoreLabel";

const SOPHIA = { id: "id-sophia", slug: "sophia", langues: null };
const UNSWIPE = { id: "id-unswipe", slug: "unswipe", langues: null };

function stat(partiel: Partial<StatLabel> & { label_id: string }): StatLabel {
  return {
    label_nom: partiel.label_id,
    comptes_langue: 0,
    comptes_pays: 0,
    comptes_total: 0,
    passages_restants: 10,
    demande_jour: 0,
    passages: 0,
    perf_label: null,
    perf_flotte: 1,
    recents_langue: 0,
    recence_langue: 0,
    recents_pays: 0,
    recence_pays: 0,
    ...partiel,
  };
}

/** white_bg au 24/10 : fr 3, en 2, it 0 ; pas livré en hu. */
const WBG = (langue: string, comptes: number, niveau: number, livre = true) =>
  stat({ label_id: "wbg", label_nom: "white_bg", comptes_langue: comptes, comptes_total: 9, passages: 52, perf_label: 1.16, pod_seul: true, livre_langue: livre, niveau_pod: niveau });

describe("lignesPodz", () => {
  it("une ligne par label, ses applis, ses langues triées du moins rempli au plus rempli", () => {
    const marches = {
      "id-sophia": [
        { langue: "fr", pays: "FR", stats: [WBG("fr", 3, 0), stat({ label_id: "am" })] },
        { langue: "it", pays: "IT", stats: [WBG("it", 0, 2)] },
        { langue: "hu", pays: "HU", stats: [WBG("hu", 1, 0, false)] },
      ],
      "id-unswipe": [{ langue: "en", pays: "US", stats: [WBG("en", 2, 0)] }],
    };
    const [l, ...reste] = lignesPodz([SOPHIA, UNSWIPE], marches, REGLAGES_CHOIX_LABEL_DEFAUT);
    expect(reste).toEqual([]);
    expect(l.apps).toEqual(["sophia", "unswipe"]);
    expect(l.enTest).toBe(false);
    expect(l.langues.map((x) => [x.langue, x.comptes, x.prochaine])).toEqual([
      ["it", 0, true],
      ["en", 2, false],
      ["fr", 3, false],
    ]);
    expect(l.nonLivrees).toEqual(["hu"]);
  });

  it("un label neuf est en test, toutes ses langues prêtes", () => {
    const fat = () =>
      stat({ label_id: "fat", label_nom: "Fathomly", pod_seul: true, livre_langue: true, niveau_pod: 0 });
    const marches = { "id-sophia": [{ langue: "fr", pays: "FR", stats: [fat()] }, { langue: "en", pays: "US", stats: [fat()] }] };
    const [l] = lignesPodz([SOPHIA], marches, REGLAGES_CHOIX_LABEL_DEFAUT);
    expect(l.enTest).toBe(true);
    expect(l.langues.every((x) => x.prochaine)).toBe(true);
  });
});
