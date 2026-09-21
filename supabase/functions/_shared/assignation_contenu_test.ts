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

import { contenuIdsDesLabels } from "./assignation_contenu.ts";
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

  // 1500 lignes en pages de 999 : 999 + 501 + une page VIDE. La sortie sur page
  // vide et non sur page courte coûte cet aller-retour, et supprime toute
  // hypothèse sur le plafond du serveur.
  assertEquals(traces.length, 3);
  assertEquals(traces.map((t) => t.apres), [null, idContenu(998), idContenu(1499)]);

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
  assertEquals(traces.map((t) => t.label), ["alpha_male", "alpha_male", "smart_girl", "smart_girl"]);
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
