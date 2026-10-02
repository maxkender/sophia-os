/**
 * Le pool d'assignation lu EN ENTIER.
 *
 * Ces tests ne vérifient pas « la pagination marche » : ils reconstituent la
 * panne. Un faux PostgREST applique `max-rows` EXACTEMENT comme le vrai —
 * c'est-à-dire par-dessus le `limit` demandé, et en répondant 200 sans erreur —
 * de sorte que chaque test peut montrer les deux versions côte à côte : ce que
 * l'ancienne lecture rendait, ce que la nouvelle rend.
 */

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import { oublierSondeMultiApp } from "./applications_moteur.ts";
import {
  assignerCompteJour,
  contenuIdsDesLabels,
  creerMemoAssignation,
  decksAssignation,
  lireFenetreRepartition,
  lireHistoriquePassages,
  poolContenusPrets,
  programmerRappelsJ7,
} from "./assignation_contenu.ts";
import { PLAFOND_LIGNES, TAILLE_PAGE, lireTout } from "./lots.ts";
import { ID_SOPHIA, type ApplicationMoteur } from "./multi_app.ts";

interface Lien {
  label_id: string;
  contenu_id: string;
}

/** Ce qu'une requête a demandé — pour prouver la forme des pages, pas juste leur résultat. */
interface Trace {
  label: string | null;
  labelsIn: string[] | null;
  apres: string | null;
  limite: number | null;
  ordonne: boolean;
}

/**
 * Faux PostgREST.
 *
 * Le seul point qui compte : `max-rows` s'applique PAR-DESSUS le `limit`
 * demandé et la réponse reste un 200 sans `error`. C'est ce qui rend la
 * troncature indétectable côté appelant, et c'est ce que `.limit(5000)` ne
 * change pas.
 */
function fauxClient(liens: Lien[], traces: Trace[], erreurs: Array<string | null> = []) {
  const from = (_table: string) => {
    const etat: Trace = {
      label: null,
      labelsIn: null,
      apres: null,
      limite: null,
      ordonne: false,
    };

    const maillon = {
      select: (_colonnes: string) => maillon,
      eq: (colonne: string, valeur: string) => {
        if (colonne === "label_id") etat.label = valeur;
        return maillon;
      },
      in: (colonne: string, valeurs: string[]) => {
        if (colonne === "label_id") etat.labelsIn = valeurs;
        return maillon;
      },
      gt: (colonne: string, valeur: string) => {
        if (colonne === "contenu_id") etat.apres = valeur;
        return maillon;
      },
      order: (_colonne: string, _opts?: unknown) => {
        etat.ordonne = true;
        return maillon;
      },
      limit: (n: number) => {
        etat.limite = n;
        return maillon;
      },
      then: (
        onfulfilled?: (v: { data: Lien[] | null; error: { message: string } | null }) => unknown,
        onrejected?: (r: unknown) => unknown,
      ) => {
        traces.push({ ...etat });

        const erreur = erreurs.shift() ?? null;
        if (erreur) {
          return Promise.resolve(onfulfilled?.({ data: null, error: { message: erreur } }));
        }

        let lignes = liens.filter((l) => {
          if (etat.label !== null) return l.label_id === etat.label;
          if (etat.labelsIn !== null) return etat.labelsIn.includes(l.label_id);
          return true;
        });
        if (etat.ordonne) {
          lignes = [...lignes].sort((a, b) => (a.contenu_id < b.contenu_id ? -1 : 1));
        }
        if (etat.apres !== null) lignes = lignes.filter((l) => l.contenu_id > etat.apres!);

        // max-rows PAR-DESSUS le limit demandé : c'est toute la panne.
        const coupe = Math.min(etat.limite ?? PLAFOND_LIGNES, PLAFOND_LIGNES);
        const data = lignes.slice(0, coupe);
        void onrejected;
        return Promise.resolve(onfulfilled?.({ data, error: null }));
      },
    };
    return maillon;
  };

  // deno-lint-ignore no-explicit-any
  return { from } as any;
}

/** Ids triables dans le même ordre que leur numéro (le faux serveur trie en texte). */
function idContenu(n: number): string {
  return `c${String(n).padStart(5, "0")}`;
}

function liensDuLabel(label: string, combien: number, depuis = 0): Lien[] {
  return Array.from({ length: combien }, (_, i) => ({
    label_id: label,
    contenu_id: idContenu(depuis + i),
  }));
}

Deno.test("un label de 1500 liens : l'ancienne lecture en rendait 1000, sans erreur", async () => {
  const liens = liensDuLabel("alpha_male", 1500);
  const traces: Trace[] = [];
  const supabase = fauxClient(liens, traces);

  // Exactement l'ancien code : lireParLots découpait les label_id, donc les 9
  // labels du dépôt tenaient dans UN lot et une seule requête partait.
  const { data, error } = await supabase
    .from("contenu_labels")
    .select("contenu_id")
    .in("label_id", ["alpha_male"]);

  assertEquals(error, null, "PostgREST répond 200 : il n'y a rien à relire");
  assertEquals(data.length, PLAFOND_LIGNES);
  assert(
    data.length < liens.length,
    "500 liens manquaient, et le pool amputé passait pour le pool entier",
  );
});

Deno.test("un label de 1500 liens : la lecture paginée les rend tous", async () => {
  const liens = liensDuLabel("alpha_male", 1500);
  const traces: Trace[] = [];
  const supabase = fauxClient(liens, traces);

  const ids = await contenuIdsDesLabels(supabase, ["alpha_male"], "Slideshows du label");

  assertEquals(ids.length, 1500);
  assertEquals(new Set(ids).size, 1500);
  assertEquals(ids[0], idContenu(0));
  assertEquals(ids[1499], idContenu(1499));
});

Deno.test("chaque page déclare sa borne sous le plafond, et repart APRÈS le curseur", async () => {
  const traces: Trace[] = [];
  const supabase = fauxClient(liensDuLabel("alpha_male", 1500), traces);

  await contenuIdsDesLabels(supabase, ["alpha_male"], "Slideshows du label");

  // 1500 lignes en pages de 999 : 999 puis 501, et c'est fini.
  //
  // Ce test attendait une TROISIÈME requête, la page vide de confirmation.
  // `lireTout` sort désormais sur page COURTE, et l'attente a été corrigée ici
  // plutôt qu'affaiblie parce que la garantie a changé de nature : la taille
  // demandée (`TAILLE_PAGE` = plafond − 1) est STRICTEMENT sous `max-rows`, donc
  // le serveur n'a rien à rogner par-dessus notre propre borne et une page
  // courte ne peut venir que d'une table épuisée. Ce que le test continue
  // d'épingler ci-dessous — `limite < PLAFOND_LIGNES` sur CHAQUE page — est
  // exactement la prémisse qui rend cette sortie légitime : si quelqu'un
  // remontait la taille de page au plafond, l'assertion tomberait avant que la
  // sortie anticipée ne se mette à perdre des lignes en silence.
  //
  // Le gain n'est pas cosmétique : la sortie sur page vide DOUBLAIT les
  // allers-retours de tout appel tenant en une page (un label de 965 liens
  // payait une requête entière pour s'entendre dire qu'il n'y avait plus rien),
  // dans une fonction dont le mode de panne documenté est le timeout à 280 s.
  assertEquals(traces.length, 2);
  assertEquals(traces.map((t) => t.apres), [null, idContenu(998)]);

  for (const t of traces) {
    assert(t.ordonne, "sans order, PostgREST ne garantit pas la disjonction des pages");
    assert(t.limite !== null && t.limite < PLAFOND_LIGNES, `borne attendue sous le plafond`);
    assertEquals(t.limite, TAILLE_PAGE);
    assertEquals(t.labelsIn, null, "on ne passe plus par un in(label_id, …)");
  }
});

Deno.test("deux labels au-dessus du plafond à eux deux : 1916 liens, aucun perdu", async () => {
  // La volumétrie réelle du jour : alpha_male 965, smart_girl 951. Un compte
  // qui porte les deux en demandait 1916 et en recevait 1000.
  const liens = [
    ...liensDuLabel("alpha_male", 965, 0),
    ...liensDuLabel("smart_girl", 951, 965),
  ];
  const traces: Trace[] = [];
  const supabase = fauxClient(liens, traces);

  const ids = await contenuIdsDesLabels(
    supabase,
    ["alpha_male", "smart_girl"],
    "Slideshows du label",
  );

  assertEquals(ids.length, 1916);
  // Un label par requête : chaque page reste loin sous le plafond, ce qui est
  // le seul moyen d'être sûr que le serveur n'a rien rogné.
  //
  // UNE requête par label, et non deux : 965 et 951 liens tiennent chacun dans
  // une page de 999, donc la page est courte dès le premier tour et `lireTout`
  // s'arrête là. Le test attendait quatre requêtes du temps où la boucle
  // réclamait une page vide de confirmation ; l'attente est corrigée, pas
  // relâchée — ce qu'elle épingle reste le point qui compte, à savoir qu'un
  // label est lu SEUL et jamais dans un `in(label_id, …)` commun où les deux
  // volumétries s'additionneraient à 1916 pour se faire couper à 1000.
  assertEquals(traces.map((t) => t.label), ["alpha_male", "smart_girl"]);
});

Deno.test("un contenu portant deux labels du compte n'est rendu qu'une fois", async () => {
  const liens: Lien[] = [
    { label_id: "alpha_male", contenu_id: idContenu(1) },
    { label_id: "alpha_male", contenu_id: idContenu(2) },
    { label_id: "smart_girl", contenu_id: idContenu(2) },
    { label_id: "smart_girl", contenu_id: idContenu(3) },
  ];
  const supabase = fauxClient(liens, []);

  const ids = await contenuIdsDesLabels(
    supabase,
    ["alpha_male", "smart_girl"],
    "Slideshows du label",
  );

  assertEquals(ids, [idContenu(1), idContenu(2), idContenu(3)]);
});

Deno.test("l'ancre globale contenu_id perd des liens — et la perte est INVISIBLE", async () => {
  // C'est la raison d'être de la boucle label par label. Ici la page se termine
  // au milieu des lignes du contenu c00001 : reprendre à `contenu_id > c00001`
  // saute son lien smart_girl.
  const liens: Lien[] = [
    { label_id: "alpha_male", contenu_id: idContenu(0) },
    { label_id: "alpha_male", contenu_id: idContenu(1) },
    { label_id: "smart_girl", contenu_id: idContenu(1) },
    { label_id: "alpha_male", contenu_id: idContenu(2) },
    { label_id: "smart_girl", contenu_id: idContenu(2) },
  ];
  const labels = ["alpha_male", "smart_girl"];

  // La forme tentante : un seul passage sur tous les labels, ancré sur contenu_id.
  const supabaseGlobal = fauxClient(liens, []);
  const globale = await lireTout<Lien>(
    "Ancre globale (la forme qu'on écarte)",
    (curseur, _taille) => {
      let q = supabaseGlobal.from("contenu_labels").select("contenu_id, label_id").in(
        "label_id",
        labels,
      );
      if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
      return q.order("contenu_id").limit(2);
    },
    { ancre: (l) => l.contenu_id, taillePage: 2 },
  );

  assertEquals(globale.length, 4, "un lien sur cinq est perdu");
  assert(
    !globale.some((l) => l.contenu_id === idContenu(1) && l.label_id === "smart_girl"),
    "c'est le lien smart_girl de c00001 qui disparaît",
  );

  // Et voici pourquoi c'est un PIÈGE et non un bug : l'ensemble dédupliqué
  // d'ids est identique. La lecture ment déjà, mais l'appelant d'aujourd'hui
  // ne peut pas s'en apercevoir — il est correct par une propriété de SON code
  // (il déduplique), pas par une propriété de la lecture.
  const supabaseParLabel = fauxClient(liens, []);
  const parLabel = await contenuIdsDesLabels(supabaseParLabel, labels, "Slideshows du label");
  assertEquals(
    [...new Set(globale.map((l) => l.contenu_id))].sort(),
    [...parLabel].sort(),
  );

  // La différence se voit dès qu'on regarde les LIENS et non les ids : la
  // boucle label par label les rend tous les cinq.
  let liensLus = 0;
  for (const label of labels) {
    const supabase = fauxClient(liens, []);
    liensLus += (await lireTout<Lien>(
      `Liens de ${label}`,
      (curseur, taille) => {
        let q = supabase.from("contenu_labels").select("contenu_id").eq("label_id", label);
        if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
        return q.order("contenu_id").limit(taille);
      },
      { ancre: (l) => l.contenu_id, taillePage: 2 },
    )).length;
  }
  assertEquals(liensLus, 5);
});

Deno.test("une erreur de page est REMONTÉE, jamais confondue avec « plus rien à lire »", async () => {
  const traces: Trace[] = [];
  // La 2e requête échoue : la 1re page est pleine, donc une lecture qui
  // avalerait l'erreur rendrait 999 ids et aurait l'air d'un pool complet.
  const supabase = fauxClient(liensDuLabel("alpha_male", 1500), traces, [null, "boom"]);

  const erreur = await assertRejects(
    () => contenuIdsDesLabels(supabase, ["alpha_male"], "Slideshows du label"),
    Error,
  );
  assert(erreur.message.includes("Slideshows du label"), erreur.message);
  assert(erreur.message.includes("alpha_male"), "le message doit nommer le label fautif");
  assert(erreur.message.includes("boom"), erreur.message);
});

Deno.test("aucun label : aucune requête, et pas de pool fantôme", async () => {
  const traces: Trace[] = [];
  const supabase = fauxClient(liensDuLabel("alpha_male", 10), traces);

  assertEquals(await contenuIdsDesLabels(supabase, [], "Slideshows du label"), []);
  assertEquals(traces.length, 0);
});

/* ==========================================================================
 * Le mémo de run : mêmes candidats, moins d'allers-retours.
 *
 * Ces tests ne mesurent pas « le cache marche ». Ils épinglent la seule chose
 * qu'un cache peut casser ici : l'ENSEMBLE DE CANDIDATS. La boucle de pioche
 * appelle le pool jusqu'à `manquants + 8` fois par compte ; si la mémoïsation
 * changeait ne serait-ce qu'un élément entre deux tentatives, on aurait troqué
 * un timeout contre un bug d'assignation — un contenu servi à un créateur qui
 * n'y a pas droit, ce qui est bien pire que lent.
 * ======================================================================== */

interface LigneContenu {
  id: string;
  statut: string;
  import_statut: string;
  ugc_compatible: boolean;
  application_id: string | null;
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
}

interface LignePassage {
  id: string;
  compte_id: string;
  contenu_id: string;
  date_publication_prevue: string | null;
}

/** Ce qu'une requête a demandé, toutes tables confondues. */
interface Requete {
  table: string;
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  apres: { colonne: string; valeur: string } | null;
  ordonne: string | null;
  limite: number | null;
}

/**
 * Faux PostgREST multi-tables.
 *
 * Même règle que le faux client du haut de fichier, et c'est la règle qui
 * compte : `max-rows` s'applique PAR-DESSUS le `limit` demandé, et la réponse
 * reste un 200 sans `error`.
 */
// deno-lint-ignore no-explicit-any
function fauxBase(tables: Record<string, any[]>, requetes: Requete[], erreurs: Array<string | null> = []) {
  const from = (table: string) => {
    const etat: Requete = { table, eq: {}, in: {}, apres: null, ordonne: null, limite: null };
    const maillon = {
      select: (_c: string) => maillon,
      eq: (colonne: string, valeur: unknown) => {
        etat.eq[colonne] = valeur;
        return maillon;
      },
      in: (colonne: string, valeurs: unknown[]) => {
        etat.in[colonne] = valeurs;
        return maillon;
      },
      gt: (colonne: string, valeur: string) => {
        etat.apres = { colonne, valeur };
        return maillon;
      },
      not: (_c: string, _op: string, _v: unknown) => maillon,
      order: (colonne: string, _opts?: unknown) => {
        etat.ordonne = colonne;
        return maillon;
      },
      limit: (n: number) => {
        etat.limite = n;
        return maillon;
      },
      lignes: () => {
        // deno-lint-ignore no-explicit-any
        let lignes: any[] = [...(tables[table] ?? [])];
        for (const [colonne, valeur] of Object.entries(etat.eq)) {
          lignes = lignes.filter((l) => l[colonne] === valeur);
        }
        for (const [colonne, valeurs] of Object.entries(etat.in)) {
          lignes = lignes.filter((l) => valeurs.includes(l[colonne]));
        }
        if (etat.ordonne) {
          const c = etat.ordonne;
          lignes.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1));
        }
        if (etat.apres) {
          const { colonne, valeur } = etat.apres;
          lignes = lignes.filter((l) => String(l[colonne]) > valeur);
        }
        return lignes.slice(0, Math.min(etat.limite ?? PLAFOND_LIGNES, PLAFOND_LIGNES));
      },
      maybeSingle: () => ({
        then: (onfulfilled?: (v: unknown) => unknown) => {
          requetes.push({ ...etat });
          return Promise.resolve(onfulfilled?.({ data: maillon.lignes()[0] ?? null, error: null }));
        },
      }),
      then: (onfulfilled?: (v: unknown) => unknown, _onrejected?: (r: unknown) => unknown) => {
        requetes.push({ ...etat });
        const erreur = erreurs.shift() ?? null;
        if (erreur) {
          return Promise.resolve(onfulfilled?.({ data: null, error: { message: erreur } }));
        }
        return Promise.resolve(onfulfilled?.({ data: maillon.lignes(), error: null }));
      },
    };
    return maillon;
  };
  // deno-lint-ignore no-explicit-any
  return { from } as any;
}

function contenuPret(n: number, sur: Partial<LigneContenu> = {}): LigneContenu {
  return {
    id: idContenu(n),
    statut: "valide",
    import_statut: "done",
    ugc_compatible: false,
    application_id: "app-1",
    musique_url: null,
    musique_titre: null,
    musique_plateforme: null,
    ...sur,
  };
}

/** Bibliothèque d'essai : `combien` contenus, tous tagués `label`. */
function bibliotheque(label: string, combien: number, sur: Partial<LigneContenu> = {}) {
  return {
    contenu_labels: Array.from({ length: combien }, (_, i) => ({
      label_id: label,
      contenu_id: idContenu(i),
    })),
    contenus: Array.from({ length: combien }, (_, i) => contenuPret(i, sur)),
  };
}

Deno.test("mémo : le pool est IDENTIQUE avec et sans mémoïsation", async () => {
  // Le cœur de l'invariance. Trois tentatives de pioche, comme la vraie boucle.
  const donnees = bibliotheque("alpha_male", 40);
  const args = { ugcAi: false };

  const sansRequetes: Requete[] = [];
  const sansMemo = fauxBase(donnees, sansRequetes);
  const poolsSansMemo = [];
  for (let t = 0; t < 3; t += 1) {
    poolsSansMemo.push(await poolContenusPrets(sansMemo, ["alpha_male"], args));
  }

  const avecRequetes: Requete[] = [];
  const avecMemo = fauxBase(donnees, avecRequetes);
  const memo = creerMemoAssignation();
  const poolsAvecMemo = [];
  for (let t = 0; t < 3; t += 1) {
    poolsAvecMemo.push(await poolContenusPrets(avecMemo, ["alpha_male"], args, memo));
  }

  // Même ensemble, même ordre, mêmes champs : l'aval (bandesDeTirage,
  // tirerAuHasard, repecherContenuD) ne peut pas voir la différence.
  assertEquals(poolsAvecMemo[0], poolsSansMemo[0]);
  assertEquals(poolsAvecMemo[1], poolsSansMemo[1]);
  assertEquals(poolsAvecMemo[2], poolsSansMemo[2]);
  assertEquals(poolsAvecMemo[2], poolsAvecMemo[0], "trois tentatives, un seul pool");

  // Et voilà ce qu'on a acheté : 3 tentatives × (1 page de labels + 1 lot de
  // contenus) = 6 allers-terours, ramenés à 2.
  assertEquals(sansRequetes.length, 6);
  assertEquals(avecRequetes.length, 2);
});

Deno.test("mémo : la clé porte le drapeau UGC ; l'application n'est plus un filtre des contenus", async () => {
  // Le risque réel d'un cache mal clé n'est pas la lenteur, c'est de servir le
  // pool d'un créateur UGC à un créateur classique. `ugc_compatible` est un
  // FILTRE de cette lecture : il doit donc être dans la clé.
  //
  // `contenus.application_id`, lui, n'en est PLUS un (multi-app : un contenu
  // sert toutes les applications de ses labels). Le test qui l'épinglait comme
  // partition est réécrit ici : un contenu dont la colonne historique dit
  // « app-2 » reste dans le pool, et aucune requête ne filtre dessus.
  const donnees = {
    contenu_labels: [
      { label_id: "alpha_male", contenu_id: idContenu(1) },
      { label_id: "alpha_male", contenu_id: idContenu(2) },
      { label_id: "alpha_male", contenu_id: idContenu(3) },
    ],
    contenus: [
      contenuPret(1, { ugc_compatible: false, application_id: "app-1" }),
      contenuPret(2, { ugc_compatible: true, application_id: "app-1" }),
      contenuPret(3, { ugc_compatible: false, application_id: "app-2" }),
    ],
  };
  const requetes: Requete[] = [];
  const supabase = fauxBase(donnees, requetes);
  const memo = creerMemoAssignation();
  const labels = ["alpha_male"];

  const classique = await poolContenusPrets(supabase, labels, { ugcAi: false }, memo);
  const ugc = await poolContenusPrets(supabase, labels, { ugcAi: true }, memo);
  const classiqueBis = await poolContenusPrets(supabase, labels, { ugcAi: false }, memo);

  assertEquals(classique.map((c) => c.id), [idContenu(1), idContenu(3)]);
  assertEquals(ugc.map((c) => c.id), [idContenu(2)]);
  assertEquals(classiqueBis, classique);

  // Le mapping label → contenus ne dépend pas de l'UGC : une seule lecture.
  // Les contenus : une par drapeau UGC, la troisième demande vient du mémo.
  assertEquals(requetes.filter((r) => r.table === "contenu_labels").length, 1);
  assertEquals(requetes.filter((r) => r.table === "contenus").length, 2);
  for (const r of requetes) {
    assert(!("application_id" in r.eq), "plus aucun filtre contenus.application_id");
  }
});

Deno.test("mémo : l'ordre des labels ne crée pas deux entrées", async () => {
  // Deux comptes portent les mêmes labels, saisis dans un ordre différent. Sans
  // clé triée le mémo raterait exactement le cas qui le justifie — la flotte
  // partage une poignée de labels.
  const donnees = {
    contenu_labels: [
      { label_id: "alpha_male", contenu_id: idContenu(1) },
      { label_id: "smart_girl", contenu_id: idContenu(2) },
    ],
    contenus: [contenuPret(1), contenuPret(2)],
  };
  const requetes: Requete[] = [];
  const supabase = fauxBase(donnees, requetes);
  const memo = creerMemoAssignation();

  const a = await contenuIdsDesLabels(supabase, ["alpha_male", "smart_girl"], "Pool", memo);
  const b = await contenuIdsDesLabels(supabase, ["smart_girl", "alpha_male"], "Pool", memo);
  const c = await contenuIdsDesLabels(supabase, ["alpha_male", "alpha_male", "smart_girl"], "Pool", memo);

  assertEquals(a, b);
  assertEquals(a, c);
  assertEquals(requetes.length, 2, "un aller-retour par label, une seule fois");
});

Deno.test("mémo : l'appelant peut trier sa copie sans abîmer l'entrée suivante", async () => {
  // Le mémo rend une COPIE. Sans ça, le premier appelant qui trie ou vide son
  // tableau en place corromprait le pool de tous les comptes suivants du lot —
  // une famine parfaitement silencieuse, et impossible à relier à sa cause.
  const donnees = bibliotheque("alpha_male", 5);
  const supabase = fauxBase(donnees, []);
  const memo = creerMemoAssignation();

  const premier = await contenuIdsDesLabels(supabase, ["alpha_male"], "Pool", memo);
  premier.length = 0;
  const second = await contenuIdsDesLabels(supabase, ["alpha_male"], "Pool", memo);
  assertEquals(second.length, 5);

  const poolA = await poolContenusPrets(supabase, ["alpha_male"], { ugcAi: false }, memo);
  poolA.length = 0;
  const poolB = await poolContenusPrets(supabase, ["alpha_male"], { ugcAi: false }, memo);
  assertEquals(poolB.length, 5);
});

Deno.test("mémo : une lecture EN ÉCHEC n'est pas conservée", async () => {
  // Une erreur réseau transitoire sur un label resterait sinon collée au mémo
  // pour tout le run et ferait échouer tous les comptes qui partagent ce label.
  // On transformerait une lecture ratée en famine de flotte : exactement ce que
  // ce chantier cherche à éviter.
  const donnees = bibliotheque("alpha_male", 5);
  const requetes: Requete[] = [];
  const supabase = fauxBase(donnees, requetes, ["réseau coupé"]);
  const memo = creerMemoAssignation();

  await assertRejects(
    () => contenuIdsDesLabels(supabase, ["alpha_male"], "Slideshows du label", memo),
    Error,
  );

  const apres = await contenuIdsDesLabels(supabase, ["alpha_male"], "Slideshows du label", memo);
  assertEquals(apres.length, 5, "la demande suivante relit au lieu de rejouer l'échec");
});

/* ==========================================================================
 * L'historique des passages : découper le FILTRE ne borne pas la RÉPONSE.
 * ======================================================================== */

function passagesDuCompte(compteId: string, combien: number): LignePassage[] {
  return Array.from({ length: combien }, (_, i) => ({
    id: `p${String(i).padStart(5, "0")}`,
    compte_id: compteId,
    // Volontairement peu de contenus distincts : c'est le point, la relation
    // est many-to-one et le lot de 100 contenus ne borne rien.
    contenu_id: idContenu(i % 20),
    date_publication_prevue: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
}

Deno.test("historique : l'ancienne lecture s'arrêtait à 1000 passages, sans erreur", async () => {
  const passages = passagesDuCompte("compte-1", 1500);
  const supabase = fauxBase({ passages }, []);

  // Exactement l'ancienne forme : `lireParLots` découpait les contenu_id, donc
  // 20 contenus tenaient dans UN lot et une seule requête partait — sans limite.
  const { data, error } = await supabase
    .from("passages")
    .select("contenu_id, date_publication_prevue")
    .eq("compte_id", "compte-1")
    .in("contenu_id", Array.from({ length: 20 }, (_, i) => idContenu(i)));

  assertEquals(error, null, "PostgREST répond 200 : il n'y a rien à relire");
  assertEquals(data.length, PLAFOND_LIGNES);
});

Deno.test("historique : la lecture paginée rend tous les passages du compte", async () => {
  const passages = passagesDuCompte("compte-1", 1500);
  const requetes: Requete[] = [];
  const supabase = fauxBase({ passages }, requetes);

  const hist = await lireHistoriquePassages(
    supabase,
    "compte-1",
    Array.from({ length: 20 }, (_, i) => idContenu(i)),
  );

  assertEquals(hist.length, 1500);
  assertEquals(new Set(hist.map((h) => h.id)).size, 1500, "ni doublon ni trou");
  // L'ancre est `passages.id` et non `contenu_id` : avec 20 contenus pour 1500
  // passages, une ancre `contenu_id` reboucherait ou sauterait des lignes.
  for (const r of requetes) {
    assertEquals(r.ordonne, "id");
    assert(r.limite !== null && r.limite < PLAFOND_LIGNES);
  }
});

Deno.test("historique : un compte de volumétrie réelle ne coûte QU'UN aller-retour", async () => {
  // 131 comptes × plusieurs tentatives de pioche : paginer ne doit rien coûter
  // dans le cas normal, sinon on échange une troncature contre un timeout.
  // ~2 passages/jour depuis juillet ≈ 120, très loin des 999 d'une page.
  const requetes: Requete[] = [];
  const supabase = fauxBase({ passages: passagesDuCompte("compte-1", 120) }, requetes);

  const hist = await lireHistoriquePassages(
    supabase,
    "compte-1",
    Array.from({ length: 20 }, (_, i) => idContenu(i)),
  );

  assertEquals(hist.length, 120);
  assertEquals(requetes.length, 1, "page courte = fin de lecture, pas de page de confirmation");
});

Deno.test("historique : le filtre reste découpé par lots de 100 contenus", async () => {
  // L'autre borne, celle du 20/08 : au-delà de ~650 ids l'URL PostgREST déborde
  // et la requête part en 400. Paginer la réponse ne dispense pas de découper
  // le filtre — ce sont deux pannes différentes.
  const requetes: Requete[] = [];
  const supabase = fauxBase({ passages: passagesDuCompte("compte-1", 10) }, requetes);

  await lireHistoriquePassages(
    supabase,
    "compte-1",
    Array.from({ length: 250 }, (_, i) => idContenu(i)),
  );

  assertEquals(requetes.length, 3, "250 contenus → 100 + 100 + 50");
  assertEquals(requetes.map((r) => r.in.contenu_id.length), [100, 100, 50]);
});

/* ==========================================================================
 * Multi-applications : l'application de chaque créneau.
 *
 * Ces tests font tourner `assignerCompteJour` de bout en bout sur un faux
 * PostgREST qui tient la base en mémoire (lectures, insertions, mises à jour),
 * decks remplacés (ils appellent un modèle). Ils épinglent d'abord ce qui ne
 * doit PAS changer — le chemin Sophia d'aujourd'hui, requête pour requête —,
 * puis la répartition, le repli et ce qu'il ne doit jamais déclencher : une
 * baisse de quota sur la foi d'une réserve Unswipe vide.
 * ======================================================================== */

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const JOUR = "2026-10-03";

/** Une opération vue par le faux serveur. */
interface Op {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  colonnes: string | null;
  head: boolean;
  filtres: Array<[string, string, unknown]>;
  ordres: Array<{ colonne: string; asc: boolean }>;
  limite: number | null;
  valeurs: unknown;
}

/**
 * Faux PostgREST à état : assez de PostgREST pour la boucle d'assignation, et
 * rien de plus. Une table « absente » répond en erreur à toute requête — c'est
 * ainsi que la sonde du schéma 0256 voit une base d'avant la migration.
 */
// deno-lint-ignore no-explicit-any
function fauxMoteur(tables: Record<string, any[]>, opts: { absentes?: string[] } = {}) {
  const journal: Op[] = [];
  let seq = 0;
  const from = (table: string) => {
    const op: Op = {
      table,
      op: "select",
      colonnes: null,
      head: false,
      filtres: [],
      ordres: [],
      limite: null,
      valeurs: null,
    };
    let mode: "liste" | "single" | "maybe" = "liste";
    // deno-lint-ignore no-explicit-any
    const lignes = (): any[] => (tables[table] ??= []);
    // deno-lint-ignore no-explicit-any
    const valeur = (l: any, colonne: string): unknown => {
      if (!colonne.includes(".")) return l[colonne];
      const [rel, champ] = colonne.split(".");
      let emb = l[rel];
      if (emb === undefined && table === "passages" && rel === "posts") {
        emb = (tables.posts ?? []).find((p) => p.id === l.post_id);
      }
      if (Array.isArray(emb)) emb = emb[0];
      return emb?.[champ];
    };
    const compare = (a: unknown, b: unknown) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    const filtrer = () =>
      lignes().filter((l) =>
        op.filtres.every(([c, o, v]) => {
          const x = valeur(l, c);
          switch (o) {
            case "eq":
              return x === v;
            case "in":
              return (v as unknown[]).includes(x);
            case "gt":
              return x !== undefined && x !== null && compare(x, v) > 0;
            case "gte":
              return x !== undefined && x !== null && compare(x, v) >= 0;
            case "lt":
              return x !== undefined && x !== null && compare(x, v) < 0;
            case "lte":
              return x !== undefined && x !== null && compare(x, v) <= 0;
            case "is":
              return v === null ? x === null || x === undefined : x === v;
            case "notnull":
              return x !== null && x !== undefined;
            default:
              return true;
          }
        })
      );
    const executer = () => {
      journal.push({ ...op, filtres: [...op.filtres], ordres: [...op.ordres] });
      if (opts.absentes?.includes(table)) {
        return { data: null, count: null, error: { message: `relation "${table}" does not exist` } };
      }
      // deno-lint-ignore no-explicit-any
      let data: any[] = [];
      if (op.op === "select") {
        data = filtrer();
        if (op.ordres.length > 0) {
          data = [...data].sort((a, b) => {
            for (const o of op.ordres) {
              const d = compare(valeur(a, o.colonne), valeur(b, o.colonne));
              if (d !== 0) return o.asc ? d : -d;
            }
            return 0;
          });
        }
        data = data.slice(0, Math.min(op.limite ?? PLAFOND_LIGNES, PLAFOND_LIGNES));
        if (op.head) return { data: null, count: data.length, error: null };
      } else if (op.op === "insert") {
        const valeurs = Array.isArray(op.valeurs) ? op.valeurs : [op.valeurs];
        data = valeurs.map((v) => ({ id: `${table}-${++seq}`, ...(v as object) }));
        lignes().push(...data);
      } else if (op.op === "update") {
        data = filtrer();
        for (const l of data) Object.assign(l, op.valeurs);
      } else if (op.op === "delete") {
        data = filtrer();
        tables[table] = lignes().filter((l) => !data.includes(l));
      }
      if (mode === "single") {
        return data.length === 1
          ? { data: data[0], error: null }
          : { data: null, error: { message: `single : ${data.length} ligne(s)` } };
      }
      if (mode === "maybe") return { data: data[0] ?? null, error: null };
      return { data, error: null };
    };
    const maillon = {
      select: (colonnes?: string, o?: { head?: boolean }) => {
        op.colonnes = colonnes ?? "*";
        op.head = Boolean(o?.head);
        return maillon;
      },
      insert: (v: unknown) => {
        op.op = "insert";
        op.valeurs = v;
        return maillon;
      },
      update: (v: unknown) => {
        op.op = "update";
        op.valeurs = v;
        return maillon;
      },
      delete: () => {
        op.op = "delete";
        return maillon;
      },
      eq: (c: string, v: unknown) => (op.filtres.push([c, "eq", v]), maillon),
      in: (c: string, v: unknown[]) => (op.filtres.push([c, "in", v]), maillon),
      gt: (c: string, v: unknown) => (op.filtres.push([c, "gt", v]), maillon),
      gte: (c: string, v: unknown) => (op.filtres.push([c, "gte", v]), maillon),
      lt: (c: string, v: unknown) => (op.filtres.push([c, "lt", v]), maillon),
      lte: (c: string, v: unknown) => (op.filtres.push([c, "lte", v]), maillon),
      is: (c: string, v: unknown) => (op.filtres.push([c, "is", v]), maillon),
      not: (c: string, o: string, v: unknown) => {
        if (o === "is" && v === null) op.filtres.push([c, "notnull", null]);
        return maillon;
      },
      like: (_c: string, _v: string) => maillon,
      order: (colonne: string, o?: { ascending?: boolean }) => {
        op.ordres.push({ colonne, asc: o?.ascending !== false });
        return maillon;
      },
      limit: (n: number) => ((op.limite = n), maillon),
      single: () => ((mode = "single"), maillon),
      maybeSingle: () => ((mode = "maybe"), maillon),
      then: (onfulfilled?: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
        Promise.resolve(executer()).then(onfulfilled, onrejected),
    };
    return maillon;
  };
  // deno-lint-ignore no-explicit-any
  return { client: { from } as any, journal, tables };
}

const APPS = [
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true, created_at: "1" },
  { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: null, actif: true, created_at: "2" },
];

/**
 * Une base d'essai : un compte, un label servant Sophia ET Unswipe, `n`
 * contenus prêts avec des passages à faire, et un historique de `fenetre`
 * passages (applications dans l'ordre chronologique).
 */
function baseEssai(args: {
  n?: number;
  // deno-lint-ignore no-explicit-any
  compte?: Record<string, any>;
  liens?: Array<{ label_id: string; application_id: string }>;
  pertinences?: Array<{ contenu_id: string; application_id: string; eligible: boolean }>;
  fenetre?: string[];
  ugc?: boolean;
}) {
  const n = args.n ?? 6;
  const ids = Array.from({ length: n }, (_, i) => idContenu(i));
  // Historique : un passage par jour avant JOUR, sur un contenu hors pool.
  const fenetre = args.fenetre ?? [];
  const passages = fenetre.map((app, i) => {
    const jour = new Date(Date.parse(`${JOUR}T00:00:00Z`) - (fenetre.length - i) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      id: `hist-${String(i).padStart(3, "0")}`,
      compte_id: "k1",
      contenu_id: `ancien-${i}`,
      date_publication_prevue: jour,
      created_at: `${jour}T01:00:00Z`,
      application_id: app === "unswipe" ? UNSWIPE : ID_SOPHIA,
      post_id: `post-hist-${i}`,
      posts: { est_test: false },
    };
  });
  return {
    comptes: [{
      id: "k1",
      langue: "fr",
      posts_par_jour: 1,
      is_active: true,
      parts_applications: null,
      ...args.compte,
    }],
    compte_labels: [{ compte_id: "k1", label_id: "L1", labels: { nom: "smart_girl", slug: "smart-girl" } }],
    label_applications: args.liens ?? [
      { label_id: "L1", application_id: ID_SOPHIA },
      { label_id: "L1", application_id: UNSWIPE },
    ],
    applications: APPS.map((a) => ({ ...a })),
    contenu_labels: ids.map((id) => ({ label_id: "L1", contenu_id: id })),
    contenus: ids.map((id) => ({
      id,
      statut: "valide",
      import_statut: "done",
      ugc_compatible: Boolean(args.ugc),
      musique_url: null,
      musique_titre: null,
      musique_plateforme: null,
      sujet_id: null,
      structure_slides: [],
      titre: id,
    })),
    contenu_tier_etat: ids.map((id) => ({
      contenu_id: id,
      tier: "B",
      tier_cycle: 1,
      passages_prevus: 2,
      restants: 2,
    })),
    contenu_pertinences: args.pertinences ?? [],
    contenu_langue_decks: [] as unknown[],
    passages,
    posts: passages.map((p) => ({ id: p.post_id, compte_id: "k1", est_test: false })),
    reglages: [],
  };
}

const DECK = [{ position: 1, texte_overlay: "texte", position_sophia: false }];

/** Remplace les decks le temps d'un test ; rend les appels faits. */
async function avecDecks<T>(
  application: (contenuId: string, app: ApplicationMoteur) =>
    | { statut: "pret"; slides: typeof DECK; hashtags: string | null }
    | { statut: "ineligible" | "echec"; raison: string },
  corps: (appels: { sophia: string[]; application: string[] }) => Promise<T>,
): Promise<T> {
  const avant = { ...decksAssignation };
  const appels = { sophia: [] as string[], application: [] as string[] };
  decksAssignation.sophia = (_s, contenuId, _langue) => {
    appels.sophia.push(contenuId);
    return Promise.resolve({ slides: DECK, hashtags: "#sophia" });
  };
  // deno-lint-ignore no-explicit-any
  (decksAssignation as any).application = (_s: unknown, contenuId: string, _l: string, app: ApplicationMoteur) => {
    appels.application.push(contenuId);
    return Promise.resolve(application(contenuId, app));
  };
  try {
    oublierSondeMultiApp();
    return await corps(appels);
  } finally {
    decksAssignation.sophia = avant.sophia;
    decksAssignation.application = avant.application;
    oublierSondeMultiApp();
  }
}

const REGLAGES = { postsParJour: 1, repechagePassages: 1 };
const COLONNES_NOUVELLES = ["application_id", "application_visee_id", "repli_motif"];
const jamaisPret = () => ({ statut: "echec" as const, raison: "ne doit pas être appelé" });

function insertsPassages(journal: Op[]) {
  return journal.filter((o) => o.table === "passages" && o.op === "insert")
    .map((o) => o.valeurs as Record<string, unknown>);
}
function insertsPosts(journal: Op[]) {
  return journal.filter((o) => o.table === "posts" && o.op === "insert")
    .map((o) => o.valeurs as Record<string, unknown>);
}
function estLectureFenetre(o: Op) {
  return o.table === "passages" && o.op === "select" && o.filtres.some(([, f]) => f === "lte");
}

Deno.test("multi-app — schéma 0256 absent : le chemin d'avant, aucune table ni colonne nouvelle", async () => {
  await avecDecks(jamaisPret, async (appels) => {
    const base = baseEssai({ compte: { parts_applications: { sophia: 50, unswipe: 50 } } });
    const { client, journal } = fauxMoteur(base, { absentes: ["label_applications"] });

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

    assertEquals(detail.ids.length, 1);
    assertEquals(detail.replis, undefined);
    assertEquals(appels.application, [], "aucun deck d'application");
    // Seule la sonde touche une table 0256 ; rien d'autre de nouveau n'est lu.
    const nouvelles = ["contenu_pertinences", "contenu_langue_decks", "applications"];
    assertEquals(journal.filter((o) => nouvelles.includes(o.table)), []);
    assertEquals(journal.filter((o) => o.table === "label_applications").length, 1);
    assertEquals(journal.filter(estLectureFenetre), []);
    for (const v of [...insertsPassages(journal), ...insertsPosts(journal)]) {
      for (const c of COLONNES_NOUVELLES) assert(!(c in v), `colonne ${c} écrite sans 0256`);
    }
  });
});

Deno.test("multi-app — compte 100 % Sophia, schéma prêt : pas de fenêtre, pas de deck d'application, insert d'avant", async () => {
  await avecDecks(jamaisPret, async (appels) => {
    // Le label sert AUSSI Unswipe (active) : le compte y est éligible, mais sans
    // part. C'est l'état de la flotte le jour où Unswipe est cochée.
    const base = baseEssai({});
    const { client, journal } = fauxMoteur(base);

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

    assertEquals(detail.ids.length, 1);
    assertEquals(appels.application, []);
    assertEquals(appels.sophia.length, 1);
    assertEquals(journal.filter(estLectureFenetre), [], "aucune fenêtre lue");
    assertEquals(journal.filter((o) => o.table === "contenu_langue_decks"), []);
    // Une seule lecture de pertinence : les exclusions Sophia explicites.
    const pertinences = journal.filter((o) => o.table === "contenu_pertinences");
    assertEquals(pertinences.length, 1);
    assert(pertinences[0].filtres.some(([c, , v]) => c === "application_id" && v === ID_SOPHIA));
    assert(pertinences[0].filtres.some(([c, , v]) => c === "eligible" && v === false));
    // L'historique est lu SANS application_id (select d'avant).
    const histo = journal.filter((o) =>
      o.table === "passages" && o.op === "select" && o.filtres.some(([c, f]) => c === "contenu_id" && f === "in")
    );
    assert(histo.length > 0);
    for (const h of histo) assert(!String(h.colonnes).includes("application_id"));
    for (const v of [...insertsPassages(journal), ...insertsPosts(journal)]) {
      for (const c of COLONNES_NOUVELLES) assert(!(c in v), `colonne ${c} écrite au chemin historique`);
    }
  });
});

Deno.test("multi-app — la fenêtre : 10 derniers posts réels, jusqu'au jour inclus, du plus ancien au plus récent", async () => {
  const base = baseEssai({ fenetre: ["sophia", "unswipe", "sophia"] });
  // Un passage de test et un passage futur : ni l'un ni l'autre ne comptent.
  base.passages.push(
    {
      id: "test-1",
      compte_id: "k1",
      contenu_id: "x",
      date_publication_prevue: JOUR,
      created_at: `${JOUR}T02:00:00Z`,
      application_id: UNSWIPE,
      post_id: "post-test",
      posts: { est_test: true },
    },
    {
      id: "futur-1",
      compte_id: "k1",
      contenu_id: "y",
      date_publication_prevue: "2026-10-10",
      created_at: `${JOUR}T02:00:00Z`,
      application_id: UNSWIPE,
      post_id: "post-futur",
      posts: { est_test: false },
    },
  );
  const { client, journal } = fauxMoteur(base);

  const fenetre = await lireFenetreRepartition(
    client,
    "k1",
    JOUR,
    new Map([[ID_SOPHIA, "sophia"], [UNSWIPE, "unswipe"]]),
  );

  assertEquals(fenetre.map((e) => e.application), ["sophia", "unswipe", "sophia"]);
  assertEquals(journal.length, 1, "UNE lecture par compte");
  const lecture = journal[0];
  assertEquals(lecture.limite, 10);
  assert(lecture.limite! < PLAFOND_LIGNES, "bornée sous le plafond");
  assertEquals(lecture.ordres, [
    { colonne: "date_publication_prevue", asc: false },
    { colonne: "created_at", asc: false },
  ]);
  assert(lecture.filtres.some(([c, f, v]) => c === "date_publication_prevue" && f === "lte" && v === JOUR));
  assert(lecture.filtres.some(([c, f, v]) => c === "posts.est_test" && f === "eq" && v === false));
  assert(String(lecture.colonnes).includes("posts!inner(est_test)"));
});

Deno.test("multi-app — 70/30 dont la fenêtre est toute Sophia : le créneau part sur Unswipe", async () => {
  const pret = () => ({ statut: "pret" as const, slides: DECK, hashtags: "#unswipe" });
  await avecDecks(pret, async (appels) => {
    const base = baseEssai({
      compte: { parts_applications: { sophia: 70, unswipe: 30 } },
      fenetre: Array(9).fill("sophia"),
      pertinences: [0, 1, 2].map((i) => ({
        contenu_id: idContenu(i),
        application_id: UNSWIPE,
        eligible: true,
      })),
    });
    const { client, journal } = fauxMoteur(base);

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

    assertEquals(detail.ids.length, 1);
    assertEquals(detail.replis, undefined);
    assertEquals(appels.sophia, [], "pas de deck Sophia pour un créneau Unswipe");
    assertEquals(appels.application.length, 1);
    assert([0, 1, 2].map(idContenu).includes(appels.application[0]), "tiré dans la réserve Unswipe");
    const [passage] = insertsPassages(journal);
    assertEquals(passage.application_id, UNSWIPE);
    assert(!("application_visee_id" in passage));
    assertEquals(passage.hashtags, "#unswipe");
    assertEquals(insertsPosts(journal)[0].application_id, UNSWIPE);
    assertEquals(journal.filter(estLectureFenetre).length, 1, "fenêtre lue une fois");
  });
});

Deno.test("multi-app — réserve Unswipe vide : repli Sophia tracé, et le quota n'est PAS baissé", async () => {
  await avecDecks(jamaisPret, async (appels) => {
    // Deux créneaux, la répartition en réclame deux Unswipe, la réserve Unswipe
    // est vide (aucune ligne éligible). Sophia a de quoi servir : les deux
    // créneaux se replient, et rien ne doit atteindre la baisse de quota.
    const base = baseEssai({
      compte: { parts_applications: { sophia: 70, unswipe: 30 }, posts_par_jour: 2 },
      fenetre: Array(9).fill("sophia"),
    });
    const { client, journal } = fauxMoteur(base);

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

    assertEquals(detail.ids.length, 2);
    assertEquals(detail.quotaBaisse, undefined);
    assertEquals(detail.raison, undefined);
    assertEquals(appels.application, []);
    assertEquals(appels.sophia.length, 2);
    assertEquals(detail.replis, [
      { visee: "unswipe", motif: "reserve_vide" },
      { visee: "unswipe", motif: "reserve_vide" },
    ]);
    for (const p of insertsPassages(journal)) {
      assertEquals(p.application_id, ID_SOPHIA);
      assertEquals(p.application_visee_id, UNSWIPE);
      assertEquals(p.repli_motif, "reserve_vide");
    }
    assertEquals(
      journal.filter((o) => o.table === "comptes" && o.op === "update"),
      [],
      "aucune écriture de posts_par_jour",
    );
  });
});

Deno.test("multi-app — réserve Unswipe vide ET compte sans label Sophia : pas de diagnostic, pas de baisse", async () => {
  await avecDecks(jamaisPret, async () => {
    // Le label ne sert QUE Unswipe : il n'y a pas de pool Sophia où se replier.
    // Un passage déjà là aujourd'hui rendrait la baisse possible (2 → 1) : elle
    // ne doit pas avoir lieu, le problème est un réglage, pas un pool mince.
    const base = baseEssai({
      compte: { posts_par_jour: 2 },
      liens: [{ label_id: "L1", application_id: UNSWIPE }],
    });
    base.passages.push({
      id: "deja-1",
      compte_id: "k1",
      contenu_id: "z",
      date_publication_prevue: JOUR,
      created_at: `${JOUR}T00:30:00Z`,
      application_id: UNSWIPE,
      post_id: "post-deja",
      posts: { est_test: false },
    });
    base.posts.push({ id: "post-deja", compte_id: "k1", est_test: false });
    const { client, journal } = fauxMoteur(base);

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

    assertEquals(detail.ids, []);
    assertEquals(detail.quotaBaisse, undefined);
    assert(detail.raison?.includes("ne sert Sophia"), detail.raison);
    assertEquals(detail.nonServable, true, "le drain doit l'écarter de la suite de la chaîne");
    assertEquals(journal.filter((o) => o.table === "comptes" && o.op === "update"), []);
    assertEquals(journal.filter((o) => o.table === "contenu_tier_etat" && o.filtres.some(([c]) => c === "contenu_id") && o.colonnes === "contenu_id, restants, passages_prevus"), [], "pas de diagnostic");
  });
});

Deno.test("multi-app — budget de cuisson du lot dépassé : repli Sophia immédiat, aucun deck d'application cuit", async () => {
  const pret = () => ({ statut: "pret" as const, slides: DECK, hashtags: "#unswipe" });
  await avecDecks(pret, async (appels) => {
    const base = baseEssai({
      compte: { parts_applications: { sophia: 70, unswipe: 30 } },
      fenetre: Array(9).fill("sophia"),
      pertinences: [0, 1, 2].map((i) => ({
        contenu_id: idContenu(i),
        application_id: UNSWIPE,
        eligible: true,
      })),
    });
    const { client, journal } = fauxMoteur(base);

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {
      echeance: Date.now() - 1,
    });

    assertEquals(detail.ids.length, 1);
    assertEquals(appels.application, [], "aucune cuisson après l'échéance");
    assertEquals(appels.sophia.length, 1);
    assertEquals(detail.replis, [{ visee: "unswipe", motif: "budget" }]);
    const [passage] = insertsPassages(journal);
    assertEquals(passage.application_id, ID_SOPHIA);
    assertEquals(passage.repli_motif, "budget");
  });
});

Deno.test("multi-app — échecs de deck répétés : le lot cesse d'essayer cette application × langue", async () => {
  const echec = () => ({ statut: "echec" as const, raison: "modèle muet" });
  await avecDecks(echec, async (appels) => {
    const base = baseEssai({
      compte: { parts_applications: { sophia: 70, unswipe: 30 } },
      fenetre: Array(9).fill("sophia"),
      pertinences: [0, 1, 2].map((i) => ({
        contenu_id: idContenu(i),
        application_id: UNSWIPE,
        eligible: true,
      })),
    });
    const memo = creerMemoAssignation();
    const { client } = fauxMoteur(base);

    const premier = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {}, memo);
    assertEquals(appels.application.length, 3, "3 essais pour le premier compte");
    assertEquals(premier.replis, [{ visee: "unswipe", motif: "deck_echec" }]);

    // Même lot (même mémo), nouveau passage du même profil : la panne est
    // connue, plus d'essai de cuisson.
    const second = await assignerCompteJour(
      client,
      base.comptes[0],
      JOUR,
      REGLAGES,
      { forcer: true },
      memo,
    );
    assertEquals(appels.application.length, 3, "aucun nouvel essai de cuisson");
    assertEquals(second.replis, [{ visee: "unswipe", motif: "deck_echec" }]);
  });
});

Deno.test("multi-app — deck inéligible : contenu suivant, puis repli Sophia (3 essais au plus)", async () => {
  const ineligible = () => ({ statut: "ineligible" as const, raison: "base polluée" });
  await avecDecks(ineligible, async (appels) => {
    const base = baseEssai({
      n: 8,
      compte: { parts_applications: { unswipe: 100 } },
      pertinences: [0, 1, 2, 3, 4].map((i) => ({
        contenu_id: idContenu(i),
        application_id: UNSWIPE,
        eligible: true,
      })),
    });
    const { client, journal } = fauxMoteur(base);

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

    assertEquals(appels.application.length, 3, "trois contenus essayés, pas un de plus");
    assertEquals(new Set(appels.application).size, 3, "jamais deux fois le même");
    assertEquals(detail.ids.length, 1);
    assertEquals(detail.replis, [{ visee: "unswipe", motif: "deck_ineligible" }]);
    const [passage] = insertsPassages(journal);
    assertEquals(passage.application_id, ID_SOPHIA);
    assertEquals(passage.repli_motif, "deck_ineligible");
    // Les contenus refusés pour Unswipe sont écartés du repli de CE créneau.
    assert(!appels.application.includes(passage.contenu_id as string));
  });
});

Deno.test("multi-app — deck inéligible sur toute la réserve (2 contenus) : repli après le 2e", async () => {
  const ineligible = () => ({ statut: "ineligible" as const, raison: "base polluée" });
  await avecDecks(ineligible, async (appels) => {
    const base = baseEssai({
      compte: { parts_applications: { unswipe: 100 } },
      pertinences: [0, 1].map((i) => ({
        contenu_id: idContenu(i),
        application_id: UNSWIPE,
        eligible: true,
      })),
    });
    const { client, journal } = fauxMoteur(base);

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

    assertEquals(appels.application.sort(), [idContenu(0), idContenu(1)]);
    // Le motif est celui du dernier essai, pas « réserve vide ».
    assertEquals(detail.replis, [{ visee: "unswipe", motif: "deck_ineligible" }]);
    assertEquals(insertsPassages(journal)[0].application_visee_id, UNSWIPE);
  });
});

Deno.test("multi-app — un compte UGC reste Sophia, quelle que soit sa répartition", async () => {
  await avecDecks(jamaisPret, async (appels) => {
    const base = baseEssai({
      ugc: true,
      compte: {
        ugc_ai: true,
        ugc_persona_id: "persona-1",
        parts_applications: { sophia: 10, unswipe: 90 },
      },
      pertinences: [0, 1].map((i) => ({
        contenu_id: idContenu(i),
        application_id: UNSWIPE,
        eligible: true,
      })),
    });
    // deno-lint-ignore no-explicit-any
    (base as any).ugc_personas = [{ id: "persona-1", image_face_url: "https://x/face.png" }];
    const { client, journal } = fauxMoteur(base);

    const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

    assertEquals(detail.ids.length, 1);
    assertEquals(appels.application, []);
    assertEquals(appels.sophia.length, 1);
    assertEquals(journal.filter(estLectureFenetre), [], "chemin historique : pas de fenêtre");
    assert(!("application_id" in insertsPassages(journal)[0]));
  });
});

Deno.test("multi-app — même contenu, autre application, à moins de 7 jours : écarté", async () => {
  // Sophia doit tirer c00001 et jamais c00000, passé en Unswipe il y a 3 jours
  // sur ce même compte. Tirage aléatoire : on rejoue pour ne pas réussir par
  // chance.
  for (let essai = 0; essai < 8; essai += 1) {
    await avecDecks(jamaisPret, async (appels) => {
      const base = baseEssai({
        n: 2,
        compte: { parts_applications: { sophia: 70, unswipe: 30 } },
        // 6 Sophia + 3 Unswipe sur 9 : le créneau revient à Sophia.
        fenetre: ["sophia", "sophia", "unswipe", "sophia", "sophia", "unswipe", "sophia", "sophia", "unswipe"],
      });
      base.passages.push({
        id: "recent-unswipe",
        compte_id: "k1",
        contenu_id: idContenu(0),
        date_publication_prevue: "2026-09-30",
        created_at: "2026-09-30T01:00:00Z",
        application_id: UNSWIPE,
        post_id: "post-recent",
        posts: { est_test: false },
      });
      // c00001 a lui aussi déjà tourné sur ce compte (Sophia, il y a un mois) :
      // les deux tombent dans la même bande « déjà posté », et seul l'écart
      // entre applications peut les départager.
      base.passages.push({
        id: "ancien-sophia",
        compte_id: "k1",
        contenu_id: idContenu(1),
        date_publication_prevue: "2026-09-01",
        created_at: "2026-09-01T01:00:00Z",
        application_id: ID_SOPHIA,
        post_id: "post-ancien",
        posts: { est_test: false },
      });
      base.posts.push(
        { id: "post-recent", compte_id: "k1", est_test: false },
        { id: "post-ancien", compte_id: "k1", est_test: false },
      );
      const { client, journal } = fauxMoteur(base);

      const detail = await assignerCompteJour(client, base.comptes[0], JOUR, REGLAGES, {});

      assertEquals(detail.ids.length, 1);
      assertEquals(appels.sophia, [idContenu(1)]);
      assertEquals(insertsPassages(journal)[0].application_id, ID_SOPHIA);
    });
  }
});

Deno.test("multi-app — pool Sophia : seule une ligne Sophia EXPLICITEMENT non éligible exclut", async () => {
  oublierSondeMultiApp();
  const base = baseEssai({
    n: 4,
    pertinences: [
      { contenu_id: idContenu(0), application_id: ID_SOPHIA, eligible: false },
      { contenu_id: idContenu(1), application_id: ID_SOPHIA, eligible: true },
      // Non éligible pour Unswipe : sans effet sur Sophia.
      { contenu_id: idContenu(2), application_id: UNSWIPE, eligible: false },
      // c00003 : aucune ligne — stock historique, éligible.
    ],
  });
  const { client, journal } = fauxMoteur(base);
  const memo = creerMemoAssignation();
  const sophia = APPS[0] as ApplicationMoteur;
  const regle = { application: sophia, langue: "fr" };

  const pool = await poolContenusPrets(client, ["L1"], { ugcAi: false, regle }, memo);
  const encore = await poolContenusPrets(client, ["L1"], { ugcAi: false, regle }, memo);

  assertEquals(pool.map((c) => c.id), [idContenu(1), idContenu(2), idContenu(3)]);
  assertEquals(encore, pool);
  assertEquals(
    journal.filter((o) => o.table === "contenu_pertinences").length,
    1,
    "l'ensemble exclu est lu une fois par run",
  );

  // Pool Unswipe : il FAUT une ligne éligible, aucun contenu sans ligne.
  const unswipe = APPS[1] as ApplicationMoteur;
  const poolUnswipe = await poolContenusPrets(
    client,
    ["L1"],
    { ugcAi: false, regle: { application: unswipe, langue: "fr" } },
    memo,
  );
  assertEquals(poolUnswipe, []);
});

Deno.test("multi-app — pool Unswipe : ligne éligible requise, deck inéligible écarté, jamais d'UGC", async () => {
  const base = baseEssai({
    n: 4,
    pertinences: [0, 1, 2].map((i) => ({
      contenu_id: idContenu(i),
      application_id: UNSWIPE,
      eligible: true,
    })),
  });
  base.contenu_langue_decks.push(
    { id: "d1", contenu_id: idContenu(1), application_id: UNSWIPE, langue: "fr", variante: "unswipe", statut: "ineligible" },
    // Inéligible dans une AUTRE langue : sans effet en fr.
    { id: "d2", contenu_id: idContenu(2), application_id: UNSWIPE, langue: "de", variante: "unswipe", statut: "ineligible" },
  );
  const { client } = fauxMoteur(base);
  const unswipe = APPS[1] as ApplicationMoteur;

  const pool = await poolContenusPrets(client, ["L1"], {
    ugcAi: false,
    regle: { application: unswipe, langue: "fr" },
  });
  assertEquals(pool.map((c) => c.id), [idContenu(0), idContenu(2)]);

  const ugc = await poolContenusPrets(client, ["L1"], {
    ugcAi: true,
    regle: { application: unswipe, langue: "fr" },
  });
  assertEquals(ugc, []);
});

/* -------------------------------------------------------------------------
 * Rappel J+7 : le rappel rejoue le MÊME post, donc la même application.
 * ---------------------------------------------------------------------- */

function baseRappel() {
  const il5Jours = new Date(Date.now() - 5 * 86_400_000).toISOString();
  return {
    reglages: [{ cle: "tierlist", valeur: {} }],
    comptes: [{ id: "k1", posts_par_jour: 2 }],
    contenus: [{ id: "c-perce", sujet_id: null, structure_slides: [], titre: "t" }],
    passages: [{
      id: "p-source",
      contenu_id: "c-perce",
      compte_id: "k1",
      langue: "fr",
      vues: 80_000,
      statut: "publie",
      publie_at: il5Jours,
      date_publication_prevue: il5Jours.slice(0, 10),
      slides: DECK,
      musique_url: null,
      musique_titre: null,
      musique_plateforme: null,
      hashtags: "#a",
      rappel_rang: 0,
      rappel_source_id: null,
      tier_cycle: 1,
      application_id: UNSWIPE,
    }],
    posts: [] as unknown[],
    label_applications: [],
  };
}

Deno.test("rappel J+7 — schéma prêt : application_id lue sur la source et recopiée (passage + post)", async () => {
  oublierSondeMultiApp();
  const base = baseRappel();
  const { client, journal } = fauxMoteur(base);

  const res = await programmerRappelsJ7(client);

  assertEquals(res.erreurs, []);
  assertEquals(res.programmes, 1);
  const lecture = journal.find((o) =>
    o.table === "passages" && o.op === "select" && o.filtres.some(([c]) => c === "statut")
  )!;
  assert(String(lecture.colonnes).includes("application_id"));
  const [rappel] = insertsPassages(journal);
  assertEquals(rappel.application_id, UNSWIPE);
  assertEquals(rappel.est_rappel, true);
  assertEquals(insertsPosts(journal)[0].application_id, UNSWIPE);
  oublierSondeMultiApp();
});

Deno.test("rappel J+7 — schéma absent : ni lecture ni écriture de application_id", async () => {
  oublierSondeMultiApp();
  const base = baseRappel();
  const { client, journal } = fauxMoteur(base, { absentes: ["label_applications"] });

  const res = await programmerRappelsJ7(client);

  assertEquals(res.erreurs, []);
  assertEquals(res.programmes, 1);
  const lecture = journal.find((o) =>
    o.table === "passages" && o.op === "select" && o.filtres.some(([c]) => c === "statut")
  )!;
  assert(!String(lecture.colonnes).includes("application_id"), "la liste statique d'avant");
  assert(!("application_id" in insertsPassages(journal)[0]));
  assert(!("application_id" in insertsPosts(journal)[0]));
  oublierSondeMultiApp();
});
