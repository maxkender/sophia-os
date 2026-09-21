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

import {
  contenuIdsDesLabels,
  creerMemoAssignation,
  lireHistoriquePassages,
  poolContenusPrets,
} from "./assignation_contenu.ts";
import { PLAFOND_LIGNES, TAILLE_PAGE, lireTout } from "./lots.ts";

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
  const args = { applicationId: "app-1", ugcAi: false };

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

Deno.test("mémo : la clé porte l'application ET le drapeau UGC, pas seulement les labels", async () => {
  // Le risque réel d'un cache mal clé n'est pas la lenteur, c'est de servir le
  // pool d'un créateur UGC à un créateur classique — ou celui d'une autre
  // application. `ugc_compatible` et `application_id` sont des FILTRES de cette
  // lecture : ils doivent donc être dans la clé.
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

  const classique = await poolContenusPrets(supabase, labels, {
    applicationId: "app-1",
    ugcAi: false,
  }, memo);
  const ugc = await poolContenusPrets(supabase, labels, {
    applicationId: "app-1",
    ugcAi: true,
  }, memo);
  const autreApp = await poolContenusPrets(supabase, labels, {
    applicationId: "app-2",
    ugcAi: false,
  }, memo);

  assertEquals(classique.map((c) => c.id), [idContenu(1)]);
  assertEquals(ugc.map((c) => c.id), [idContenu(2)]);
  assertEquals(autreApp.map((c) => c.id), [idContenu(3)]);

  // Le mapping label → contenus, lui, ne dépend ni de l'application ni de
  // l'UGC : il n'est lu qu'une fois pour les trois pools.
  assertEquals(requetes.filter((r) => r.table === "contenu_labels").length, 1);
  assertEquals(requetes.filter((r) => r.table === "contenus").length, 3);
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

  const poolA = await poolContenusPrets(supabase, ["alpha_male"], {
    applicationId: "app-1",
    ugcAi: false,
  }, memo);
  poolA.length = 0;
  const poolB = await poolContenusPrets(supabase, ["alpha_male"], {
    applicationId: "app-1",
    ugcAi: false,
  }, memo);
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
