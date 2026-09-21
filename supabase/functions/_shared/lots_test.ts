import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";

import {
  IN_MAX_VALEURS,
  LOT_IDS,
  PLAFOND_LIGNES,
  TAILLE_PAGE,
  decouperEnLots,
  lireParLots,
  lireTout,
} from "./lots.ts";
import { verifierTailleIn } from "./supabase.ts";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

Deno.test("decouperEnLots — aucun lot ne dépasse la taille demandée", () => {
  const lots = decouperEnLots(ids(965), LOT_IDS);
  assertEquals(Math.max(...lots.map((l) => l.length)) <= LOT_IDS, true);
  assertEquals(lots.flat().length, 965);
});

Deno.test("lireParLots — un label de 965 slideshows passe sous la borne", async () => {
  // Régression 20-21/08 : `alpha_male` (965) partait en un seul `in(...)`,
  // PostgREST répondait 400 dès ~650 uuid, et l'erreur ignorée faisait passer
  // un pool plein pour un pool vide.
  const tailles: number[] = [];
  await lireParLots(ids(965), "test", (lot) => {
    tailles.push(lot.length);
    return Promise.resolve({ data: [], error: null });
  });
  assertEquals(Math.max(...tailles) <= LOT_IDS, true);
  assertEquals(tailles.reduce((a, b) => a + b, 0), 965);
});

Deno.test("lireParLots — concatène les lots dans l'ordre", async () => {
  const out = await lireParLots<{ id: string }>(ids(250), "test", (lot) =>
    Promise.resolve({ data: lot.map((id) => ({ id })), error: null }));
  assertEquals(out.length, 250);
  assertEquals(out[0].id, "id-0");
  assertEquals(out[249].id, "id-249");
});

Deno.test("lireParLots — une lecture ratée lève, elle ne rend pas une liste vide", async () => {
  // Le cœur du bug : un pool illisible ne doit jamais ressembler à un pool
  // vide, sinon minuit baisse le quota des créateurs sur une requête ratée.
  await assertRejects(
    () =>
      lireParLots(ids(300), "Slideshows prêts", (lot) =>
        Promise.resolve(
          lot[0] === "id-200"
            ? { data: null, error: { message: "Bad Request" } }
            : { data: [], error: null },
        )),
    Error,
    "Slideshows prêts",
  );
});

Deno.test("lireParLots — liste vide : aucune requête", async () => {
  let appels = 0;
  const out = await lireParLots([], "test", () => {
    appels += 1;
    return Promise.resolve({ data: [], error: null });
  });
  assertEquals(appels, 0);
  assertEquals(out, []);
});

Deno.test("verifierTailleIn — laisse passer les listes bornées", () => {
  verifierTailleIn("id", ids(IN_MAX_VALEURS));
  verifierTailleIn("statut", ["pending", "running"]);
  verifierTailleIn("id", []);
});

Deno.test("verifierTailleIn — lève avant que PostgREST ne réponde 400", () => {
  // Le garde-fou du client : n'importe quel appelant du dépôt qui oublie de
  // découper échoue bruyamment, au lieu de recevoir un silencieux « vide ».
  const e = assertThrows(
    () => verifierTailleIn("contenu_id", ids(IN_MAX_VALEURS + 1)),
    Error,
    "contenu_id",
  );
  assertEquals(e.message.includes("lireParLots"), true);
});

/* ---------------------------------------------------------------------------
 * lireTout — pagination keyset.
 * ------------------------------------------------------------------------ */

/** Table jouet : n lignes triées par `id`, servies par tranches keyset. */
function tableJouet(n: number) {
  const lignes = Array.from({ length: n }, (_, i) => ({ id: `c-${String(i).padStart(4, "0")}` }));
  const appels: Array<string | null> = [];
  return {
    appels,
    page(curseur: { id: string } | null, taille: number) {
      appels.push(curseur?.id ?? null);
      const debut = curseur ? lignes.findIndex((l) => l.id === curseur.id) + 1 : 0;
      return Promise.resolve({ data: lignes.slice(debut, debut + taille), error: null });
    },
  };
}

Deno.test("lireTout — une page courte conclut la lecture, sans aller-retour de confirmation", async () => {
  // Ce test affirmait l'inverse (sortie sur page VIDE uniquement, donc un
  // second appel pour confirmer). L'argument était : « une page courte n'est
  // une fin que si le serveur rend tout ce qu'on lui demande ». Il ne tient pas
  // ICI, et c'est tout l'intérêt de TAILLE_PAGE : on demande strictement moins
  // que max-rows, donc PostgREST n'a rien à rogner par-dessus notre limite et ne
  // peut pas rendre une page courte en ayant gardé des lignes. L'aller-retour
  // n'achetait donc aucune garantie, et il DOUBLAIT le nombre de requêtes de
  // tout appel tenant en une page — sur un drain qui tombe en timeout à 280 s.
  const t = tableJouet(12);
  const out = await lireTout<{ id: string }>("test", t.page, { ancre: (l) => l.id, taillePage: 50 });
  assertEquals(out.length, 12);
  assertEquals(t.appels, [null]);
});

Deno.test("lireTout — 2521 lignes sont toutes rendues, là où PostgREST en coupait 1000", async () => {
  // La volumétrie réelle de contenu_tier_etat le jour de la panne.
  const t = tableJouet(2521);
  const out = await lireTout<{ id: string }>("test", t.page, { ancre: (l) => l.id });
  assertEquals(out.length, 2521);
  assertEquals(out[0].id, "c-0000");
  assertEquals(out[2520].id, "c-2520");
  assertEquals(t.appels.length > 1, true);
});

Deno.test("lireTout — la taille de page reste sous le plafond max-rows", async () => {
  // Une page pleine ne doit jamais toucher le plafond, sinon PostgREST peut
  // rogner par-dessus notre propre borne sans le dire.
  assertEquals(TAILLE_PAGE < PLAFOND_LIGNES, true);
  let demandee = 0;
  await lireTout<{ id: string }>("test", (_c, taille) => {
    demandee = taille;
    return Promise.resolve({ data: [], error: null });
  }, { ancre: (l) => l.id, taillePage: 9999 });
  assertEquals(demandee, TAILLE_PAGE);
});

Deno.test("lireTout — une page pile à la taille demandée n'est pas prise pour la fin", async () => {
  const t = tableJouet(20);
  const out = await lireTout<{ id: string }>("test", t.page, { ancre: (l) => l.id, taillePage: 10 });
  assertEquals(out.length, 20);
  assertEquals(t.appels, [null, "c-0009", "c-0019"]);
});

Deno.test("lireTout — un callback qui ignore la taille reçue lève : la page courte doit rester concluante", async () => {
  // L'obligation n°1 du contrat, tenue plutôt que supposée. Sortir sur une page
  // courte n'est concluant que si la page a été demandée SOUS le plafond
  // serveur : un callback à la limite codée en dur remet la décision entre les
  // mains de `max-rows`, c'est-à-dire dans l'ambiguïté qu'on retire du dépôt.
  const e = await assertRejects(
    () =>
      lireTout<{ id: string }>("Liens de labels", () =>
        Promise.resolve({
          data: Array.from({ length: 50 }, (_, i) => ({ id: `c-${String(i).padStart(4, "0")}` })),
          error: null,
        }), { ancre: (l) => l.id, taillePage: 10 }),
    Error,
    "n'applique pas la taille reçue",
  );
  assertEquals(e.message.includes("50 lignes rendues pour une page de 10"), true);
});

Deno.test("lireTout — une erreur en cours de route lève, elle ne rend pas une liste partielle", async () => {
  // Même doctrine que lireParLots : une lecture ratée ne doit jamais ressembler
  // à un inventaire complet, sinon on décide sur une requête morte.
  const t = tableJouet(500);
  await assertRejects(
    () =>
      lireTout<{ id: string }>("Cycles à requalifier", (curseur, taille) =>
        curseur ? Promise.resolve({ data: null, error: { message: "Bad Gateway" } })
          : t.page(curseur, taille), { ancre: (l) => l.id, taillePage: 10 }),
    Error,
    "Cycles à requalifier",
  );
});

Deno.test("lireTout — un curseur qui n'avance pas lève au lieu de boucler sans fin", async () => {
  // La page servie est PLEINE (2 lignes pour taillePage 2), et c'est désormais
  // la seule forme où le cas peut se produire : depuis la sortie sur page
  // courte, une page plus petite que demandée termine la lecture et ne boucle
  // pas. Le test servait auparavant une page d'UNE ligne sans borne de page —
  // elle serait aujourd'hui prise pour la dernière, et le garde-fou d'avancement
  // ne serait jamais atteint, ce qui en aurait fait un test décoratif.
  const e = await assertRejects(
    () =>
      lireTout<{ id: string }>("test", () =>
        Promise.resolve({ data: [{ id: "a" }, { id: "b" }], error: null }), {
        ancre: (l) => l.id,
        taillePage: 2,
      }),
    Error,
    "le curseur n'avance pas",
  );
  assertEquals(e.message.includes("contenu_labels"), true);
});

Deno.test("lireTout — une page non triée sur l'ancre lève : un .order(...) oublié ne passe plus", async () => {
  // Le garde-fou d'avancement ne compare que la FIN de la page n à celle de la
  // page n-1 : il ne voit rien quand l'appelant oublie son .order(ancre). La
  // pagination rend alors un sous-ensemble arbitraire, sans erreur — la panne du
  // 20/08 déplacée de la troncature muette vers la pagination muette.
  const e = await assertRejects(
    () =>
      lireTout<{ id: string }>("Liens de labels", () =>
        Promise.resolve({ data: [{ id: "c-0007" }, { id: "c-0002" }], error: null }), {
        ancre: (l) => l.id,
        taillePage: 2,
      }),
    Error,
    "n'est pas triée sur l'ancre",
  );
  assertEquals(e.message.includes("c-0007"), true);
  assertEquals(e.message.includes(".order("), true);
});

Deno.test("lireTout — deux ancres ÉGALES dans une page ne sont pas un défaut de tri", async () => {
  // Nuance volontaire du garde-fou d'ordre : il refuse la décroissance, pas
  // l'égalité. Deux ancres égales ne disent rien du tri, elles disent que
  // l'ancre n'est pas unique — faute qui a déjà son garde-fou (l'avancement du
  // curseur) et son message, lequel nomme le bon coupable. Les confondre ferait
  // accuser un .order(...) manquant là où le tri est correct.
  const e = await assertRejects(
    () =>
      lireTout<{ label_id: string; contenu_id: string }>("Liens de labels", () =>
        Promise.resolve({
          data: [
            { label_id: "alpha_male", contenu_id: "c-2" },
            { label_id: "smart_girl", contenu_id: "c-2" },
          ],
          error: null,
        }), { ancre: (l) => l.contenu_id, taillePage: 2 }),
    Error,
    "le curseur n'avance pas",
  );
  assertEquals(e.message.includes("n'est pas triée"), false);
});

Deno.test("lireTout — le plafond de pages lève plutôt que de rendre un résultat tronqué", async () => {
  const t = tableJouet(10_000);
  await assertRejects(
    () => lireTout<{ id: string }>("test", t.page, { ancre: (l) => l.id, taillePage: 10, maxPages: 3 }),
    Error,
    "3 pages lues",
  );
});

Deno.test("lireTout — ancre composite : contenu_id seul saute des lignes, (label_id, contenu_id) non", async () => {
  // Le piège au cœur du bug : sur contenu_labels un contenu porte plusieurs
  // labels, donc contenu_id n'est pas unique. Ancré dessus, le curseur
  // n'avance pas d'une page à l'autre quand une page se termine au milieu des
  // labels d'un même contenu.
  const liens = [
    { label_id: "alpha_male", contenu_id: "c-1" },
    { label_id: "alpha_male", contenu_id: "c-2" },
    { label_id: "smart_girl", contenu_id: "c-1" },
    { label_id: "smart_girl", contenu_id: "c-2" },
  ];
  const cle = (l: { label_id: string; contenu_id: string }) => `${l.label_id}\u0000${l.contenu_id}`;
  const page = (curseur: typeof liens[number] | null, taille: number) => {
    const debut = curseur ? liens.findIndex((l) => cle(l) === cle(curseur)) + 1 : 0;
    return Promise.resolve({ data: liens.slice(debut, debut + taille), error: null });
  };

  const out = await lireTout("Liens de labels", page, { ancre: cle, taillePage: 2 });
  assertEquals(out.length, 4);

  // La même lecture ancrée sur contenu_id : deux pages de suite finissent sur
  // « c-2 », le garde-fou refuse de continuer à l'aveugle.
  await assertRejects(
    () => lireTout("Liens de labels", page, { ancre: (l) => l.contenu_id, taillePage: 2 }),
    Error,
    "le curseur n'avance pas",
  );
});
