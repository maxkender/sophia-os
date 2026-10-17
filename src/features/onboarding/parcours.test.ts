/**
 * Ce qui est testé ici, c'est le verrou — pas la mise en page.
 *
 * Le parcours n'a qu'une raison d'exister : qu'un créateur ne puisse pas le
 * traverser sans lire. Deux choses le garantissent, et elles se défont très
 * discrètement : la double condition d'avancement (temps ET bas de page), et
 * le quiz qui renvoie au bon écran. Un `||` à la place d'un `&&`, une attente
 * remise à zéro « pour tester », une question qui pointe vers un écran
 * renommé, et l'accueil redevient cliquable en six secondes sans que rien ne
 * casse à l'écran. D'où ces tests.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ETATS_MICO } from "./Mico";
import { ATTENTE_VIDEO_S, ECRANS, LIEN_GUIDE, QUESTIONS } from "./contenu";
import {
  basDePageAtteint,
  corrigerQuiz,
  etapeDeReprise,
  indexEcran,
  INDEX_QUIZ,
  NB_ETAPES,
  peutAvancer,
  secondesRestantes,
} from "./parcours";

/** Les bonnes réponses, telles que le contenu les déclare. */
const SANS_FAUTE = Object.fromEntries(QUESTIONS.map((q) => [q.cle, q.bonne]));

describe("avancer d'un écran", () => {
  it("exige le temps ET le bas de page, jamais l'un seulement", () => {
    expect(peutAvancer({ ecoulees: 99, attente: 8, basAtteint: false })).toBe(false);
    expect(peutAvancer({ ecoulees: 1, attente: 8, basAtteint: true })).toBe(false);
    expect(peutAvancer({ ecoulees: 8, attente: 8, basAtteint: true })).toBe(true);
  });

  it("n'ouvre pas le bouton une seconde trop tôt", () => {
    expect(peutAvancer({ ecoulees: 7, attente: 8, basAtteint: true })).toBe(false);
  });

  it("cohorte Ruul : reste verrouillé tant que le nom de la pièce d'identité n'est pas enregistré", () => {
    expect(peutAvancer({ ecoulees: 8, attente: 8, basAtteint: true, identiteManquante: true })).toBe(false);
    expect(peutAvancer({ ecoulees: 8, attente: 8, basAtteint: true, identiteManquante: false })).toBe(true);
  });

  it("décompte jusqu'à zéro et n'affiche jamais de négatif", () => {
    expect(secondesRestantes(0, 8)).toBe(8);
    expect(secondesRestantes(5, 8)).toBe(3);
    expect(secondesRestantes(8, 8)).toBe(0);
    expect(secondesRestantes(40, 8)).toBe(0);
  });
});

describe("bas de page", () => {
  // Le bug de production du 11/10 : l'écran 1 tient entièrement dans le
  // dialogue, donc rien à faire défiler, donc aucun événement de défilement, et
  // le bouton restait « Scroll to the bottom » à vie.
  it("un écran qui tient entièrement est lu d'emblée", () => {
    expect(basDePageAtteint({ scrollHeight: 300, scrollTop: 0, clientHeight: 300 })).toBe(true);
  });

  it("un écran long n'est pas lu tant qu'on est en haut", () => {
    expect(basDePageAtteint({ scrollHeight: 1200, scrollTop: 0, clientHeight: 300 })).toBe(false);
  });

  it("est lu une fois descendu en bas", () => {
    expect(basDePageAtteint({ scrollHeight: 1200, scrollTop: 900, clientHeight: 300 })).toBe(true);
  });

  it("tolère les derniers pixels, sans tolérer le milieu", () => {
    expect(basDePageAtteint({ scrollHeight: 1200, scrollTop: 880, clientHeight: 300 })).toBe(true);
    expect(basDePageAtteint({ scrollHeight: 1200, scrollTop: 600, clientHeight: 300 })).toBe(false);
  });

  it("un conteneur pas encore mesuré ne conclut rien", () => {
    // Pendant l'animation d'entrée du dialogue. Répondre « lu » ici ouvrirait
    // le bouton sur un écran long sans l'avoir montré.
    expect(basDePageAtteint({ scrollHeight: 1200, scrollTop: 0, clientHeight: 0 })).toBe(false);
  });
});

describe("reprise après fermeture de l'onglet", () => {
  it("revient où on en était", () => {
    expect(etapeDeReprise(3)).toBe(3);
  });

  it("ne laisse jamais une valeur abîmée sauter le parcours", () => {
    expect(etapeDeReprise(undefined)).toBe(0);
    expect(etapeDeReprise(null)).toBe(0);
    expect(etapeDeReprise("bonjour")).toBe(0);
    expect(etapeDeReprise(-4)).toBe(0);
    // Au-delà du parcours : on s'arrête au quiz, qui reste à passer.
    expect(etapeDeReprise(9999)).toBe(INDEX_QUIZ);
  });
});

describe("quiz", () => {
  it("laisse finir quand les quatre réponses sont bonnes", () => {
    const r = corrigerQuiz(SANS_FAUTE);
    expect(r.reussi).toBe(true);
    expect(r.fausses).toEqual([]);
    expect(r.ecranARelire).toBeNull();
  });

  it("ne laisse pas finir tant qu'une question est sans réponse", () => {
    const incomplet = { ...SANS_FAUTE };
    delete incomplet.son;
    const r = corrigerQuiz(incomplet);
    expect(r.complet).toBe(false);
    expect(r.reussi).toBe(false);
  });

  it("une seule faute suffit à renvoyer lire", () => {
    const son = QUESTIONS.find((q) => q.cle === "son")!;
    const r = corrigerQuiz({ ...SANS_FAUTE, son: (son.bonne + 1) % son.options.length });
    expect(r.reussi).toBe(false);
    expect(r.fausses.map((q) => q.cle)).toEqual(["son"]);
    expect(r.ecranARelire).toBe("posting");
  });

  it("renvoie à l'écran de la PREMIÈRE faute, pas à un écran au hasard", () => {
    const r = corrigerQuiz({});
    expect(r.ecranARelire).toBe(QUESTIONS[0]!.ecran);
  });
});

describe("le contenu tient ses promesses", () => {
  it("chaque question renvoie vers un écran qui existe", () => {
    for (const q of QUESTIONS) {
      expect(indexEcran(q.ecran), `question ${q.cle}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("chaque question a une bonne réponse dans ses options", () => {
    for (const q of QUESTIONS) {
      expect(q.bonne, `question ${q.cle}`).toBeGreaterThanOrEqual(0);
      expect(q.bonne, `question ${q.cle}`).toBeLessThan(q.options.length);
    }
  });

  it("aucun écran n'est franchissable instantanément", () => {
    for (const e of ECRANS) {
      expect(e.attente, `écran ${e.cle}`).toBeGreaterThan(0);
    }
  });

  it("l'écran de la vidéo impose une attente nettement plus longue que les autres", () => {
    const posting = ECRANS.find((e) => e.cle === "posting")!;
    expect(posting.attente).toBe(ATTENTE_VIDEO_S);
    expect(posting.blocs.some((b) => b.type === "video")).toBe(true);
    const autres = ECRANS.filter((e) => e.cle !== "posting").map((e) => e.attente);
    expect(posting.attente).toBeGreaterThan(Math.max(...autres) * 3);
  });

  it("le quiz couvre les deux erreurs qui coûtent cher : le son et le lien", () => {
    const cles = QUESTIONS.map((q) => q.cle);
    expect(cles).toContain("son");
    expect(cles).toContain("lien");
  });

  it("le guide est proposé à la fin", () => {
    const fin = ECRANS.at(-1)!;
    expect(
      fin.blocs.some((b) => b.type === "lien" && b.href === LIEN_GUIDE),
    ).toBe(true);
  });

  it("chaque écran donne une humeur connue à Mico", () => {
    for (const e of ECRANS) {
      expect(ETATS_MICO, `écran ${e.cle}`).toContain(e.mico);
    }
  });

  it("« how we work » est bien éclaté en trois écrans distincts", () => {
    // Un seul écran empilait Slack, les paiements et la plateforme ; trois
    // sujets sans rapport sur une même page, qu'on survole donc.
    for (const cle of ["slack", "paiements", "plateforme"]) {
      expect(indexEcran(cle), cle).toBeGreaterThanOrEqual(0);
    }
    expect(indexEcran("fonctionnement")).toBe(-1);
  });

  it("le créateur rejoint Vik Studios, pas Sophia", () => {
    // Sophia est UNE des apps du studio, pas l'employeur. Le texte d'accueil
    // présentait l'inverse ; le quiproquo revient vite si on ne le fige pas.
    const texte = ECRANS.flatMap((e) => [
      e.titre,
      ...e.blocs.flatMap((b) =>
        b.type === "p" || b.type === "titre"
          ? [b.texte]
          : b.type === "liste" || b.type === "etapes"
          ? b.items
          : b.type === "alerte"
          ? [b.titre ?? "", ...b.items]
          : [],
      ),
    ]).join(" ");
    expect(texte).toContain("Vik Studios");
    expect(texte).not.toMatch(/Sophia team|Welcome to Sophia|Sophia System/i);
  });

  it("aucune clé d'écran n'est en double", () => {
    const cles = ECRANS.map((e) => e.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("le quiz est bien la dernière étape", () => {
    expect(INDEX_QUIZ).toBe(ECRANS.length);
    expect(NB_ETAPES).toBe(ECRANS.length + 1);
  });
});

/**
 * Le parcours ne doit pas pouvoir se fermer côté créateur. C'est une
 * exigence, pas un détail : un accueil qu'on esquive ne sert à rien.
 *
 * Trois choses le garantissent, et elles tiennent à trois props qu'une
 * refonte de l'habillage peut faire sauter sans que rien ne casse à l'écran.
 * On lit donc la source, comme `pagesHeadOfOps.test.ts` lit le routeur.
 * Vérifié en vrai par ailleurs (Échap, clics sur le fond, Tab) : rien ne ferme.
 */
describe("le créateur ne peut pas fermer", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "OnboardingParcours.tsx"),
    "utf8",
  );

  it("pas de croix, sauf en aperçu admin", () => {
    expect(source).toContain("showCloseButton={simulation}");
  });

  it("pas de fermeture au clic à côté, sauf en aperçu admin", () => {
    expect(source).toContain("disablePointerDismissal={!simulation}");
  });

  it("Échap est neutralisé", () => {
    expect(source).toMatch(/Escape.*preventDefault|preventDefault.*Escape/s);
  });
});

/**
 * L'aperçu admin montre l'accueil choisi (standard ou cohorte Ruul), jamais
 * celui qui découlerait du compte de l'admin.
 */
describe("aperçu admin", () => {
  const source = fs.readFileSync(path.join(__dirname, "OnboardingParcours.tsx"), "utf8");

  it("l'accueil vient du choix de l'aperçu, pas du compte connecté", () => {
    expect(source).toContain("enabled: !simulation");
    expect(source).toContain("const contexte = simulation ? contexteSimule : cohorte.data;");
    expect(source).toContain("ecransPour(contexte)");
  });
});
