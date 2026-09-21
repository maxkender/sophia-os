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

Deno.test("lireTout — une page courte se termine sur une page vide, pas sur une supposition", async () => {
  // On ne sort PAS sur `lot.length < taille` : cette sortie suppose que le
  // serveur rend tout ce qu'on lui demande, hypothèse qui casse exactement
  // quand max-rows rogne la page — le cas qu'on répare.
  const t = tableJouet(12);
  const out = await lireTout<{ id: string }>("test", t.page, { ancre: (l) => l.id, taillePage: 50 });
  assertEquals(out.length, 12);
  assertEquals(t.appels, [null, "c-0011"]);
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
  const e = await assertRejects(
    () =>
      lireTout<{ id: string }>("test", () =>
        Promise.resolve({ data: [{ id: "toujours-le-meme" }], error: null }), {
        ancre: (l) => l.id,
      }),
    Error,
    "le curseur n'avance pas",
  );
  assertEquals(e.message.includes("contenu_labels"), true);
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
