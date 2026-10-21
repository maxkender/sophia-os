/**
 * Copie du guide Notion :
 *  - une question du guide (toggle) garde son intitulé et sa réponse dessous ;
 *  - un lien d'appli reste lisible ;
 *  - une page inchangée depuis moins de 24 h n'est pas relue, ses sous-pages si ;
 *  - un guide pas partagé avec l'intégration donne un message qui dit quoi faire.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  blocsVersTexte,
  type BlocNotion,
  type ClientNotion,
  copierGuide,
  type CopieExistante,
  ErreurNotion,
  idNotion,
  sousPages,
  texteRiche,
  titrePage,
} from "./notion_guides.ts";

const rt = (texte: string, href: string | null = null) => [{ plain_text: texte, href }];

Deno.test("texte riche : les liens restent lisibles, une ancre interne non", () => {
  assertEquals(texteRiche([{ plain_text: "Reply with ", href: null }, { plain_text: "the link", href: "https://taap.it/sophia" }]),
    "Reply with the link (https://taap.it/sophia)");
  assertEquals(texteRiche(rt("https://taap.it/sophia", "https://taap.it/sophia")), "https://taap.it/sophia");
  assertEquals(texteRiche(rt("Quick answers", "/3f4241308d66814099ffc5b789a26e76")), "Quick answers");
  assertEquals(texteRiche(null), "");
});

Deno.test("blocs → texte : titres, listes numérotées, toggles avec réponse indentée", () => {
  const blocs: BlocNotion[] = [
    { id: "1", type: "heading_2", heading_2: { rich_text: rt("Posting") } },
    {
      id: "2",
      type: "toggle",
      has_children: true,
      toggle: { rich_text: rt("Can I use a different sound?") },
      enfants: [{ id: "3", type: "paragraph", paragraph: { rich_text: rt("Only if you cannot find the one provided.") } }],
    },
    { id: "4", type: "numbered_list_item", numbered_list_item: { rich_text: rt("Join Slack") } },
    { id: "5", type: "numbered_list_item", numbered_list_item: { rich_text: rt("Log in") } },
    { id: "6", type: "paragraph", paragraph: { rich_text: [] } },
    { id: "7", type: "callout", callout: { rich_text: rt("Read everything."), icon: { emoji: "⚠️" } } },
    { id: "8", type: "divider", divider: {} },
    { id: "9", type: "child_page", child_page: { title: "Quick answers" } },
  ];
  assertEquals(
    blocsVersTexte(blocs),
    [
      "## Posting",
      "▸ Can I use a different sound?",
      "  Only if you cannot find the one provided.",
      "1. Join Slack",
      "2. Log in",
      "⚠️ Read everything.",
      "---",
      "→ Page : Quick answers",
    ].join("\n"),
  );
});

Deno.test("blocs → texte : colonnes et tableaux sans niveau de plus", () => {
  const blocs: BlocNotion[] = [{
    id: "c",
    type: "column_list",
    has_children: true,
    column_list: {},
    enfants: [{
      id: "c1",
      type: "column",
      has_children: true,
      column: {},
      enfants: [{ id: "p", type: "paragraph", paragraph: { rich_text: rt("Zone A: $15") } }],
    }],
  }, {
    id: "t",
    type: "table",
    has_children: true,
    table: {},
    enfants: [{ id: "r", type: "table_row", table_row: { cells: [rt("Zone"), rt("Pay")] } }],
  }];
  assertEquals(blocsVersTexte(blocs), "Zone A: $15\n| Zone | Pay |");
});

Deno.test("sous-pages et titre de page", () => {
  const blocs: BlocNotion[] = [
    { id: "3f424130-8d66-8140-99ff-c5b789a26e76", type: "child_page", child_page: { title: "Quick answers" } },
    {
      id: "x",
      type: "column_list",
      has_children: true,
      column_list: {},
      enfants: [{ id: "AB-CD", type: "child_page", child_page: { title: "Checklist" } }],
    },
  ];
  assertEquals(sousPages(blocs), [
    { id: "3f4241308d66814099ffc5b789a26e76", titre: "Quick answers" },
    { id: "abcd", titre: "Checklist" },
  ]);
  assertEquals(titrePage({ properties: { title: { type: "title", title: rt("📱 Vik Studios - TikTok Poster Guide") } } }),
    "Vik Studios - TikTok Poster Guide");
  assertEquals(idNotion("3F424130-8D66"), "3f4241308d66");
});

/** Un faux Notion : deux pages, la racine pointe vers « quick ». */
function fauxNotion(opts: { modifies?: Record<string, string>; refuser?: boolean } = {}) {
  const appels: string[] = [];
  const pages: Record<string, { titre: string; blocs: BlocNotion[] }> = {
    racine: {
      titre: "📱 Vik Studios - TikTok Poster Guide",
      blocs: [
        { id: "a", type: "paragraph", paragraph: { rich_text: rt("Welcome") } },
        { id: "quick", type: "child_page", child_page: { title: "Quick answers" } },
      ],
    },
    quick: {
      titre: "❓ Quick answers",
      blocs: [{
        id: "t",
        type: "toggle",
        has_children: true,
        toggle: { rich_text: rt("What time should I post?") },
      }],
    },
  };
  const enfants: Record<string, BlocNotion[]> = {
    t: [{ id: "p", type: "paragraph", paragraph: { rich_text: rt("Around midday and in the evening.") } }],
  };
  const client: ClientNotion = {
    get(chemin) {
      appels.push(chemin);
      if (opts.refuser) return Promise.reject(new ErreurNotion(404, "object_not_found", "Could not find page"));
      const page = chemin.match(/^\/pages\/(\w+)$/);
      if (page) {
        const p = pages[page[1]];
        return Promise.resolve({
          last_edited_time: opts.modifies?.[page[1]] ?? "2026-10-17T16:55:45.000Z",
          properties: { title: { type: "title", title: rt(p.titre) } },
        });
      }
      const blocs = chemin.match(/^\/blocks\/(\w+)\/children/);
      const id = blocs![1];
      return Promise.resolve({ results: pages[id]?.blocs ?? enfants[id] ?? [], has_more: false });
    },
  };
  return { client, appels };
}

Deno.test("copie : première fois, tout est lu, chemins et ordre du guide", async () => {
  const { client } = fauxNotion();
  const res = await copierGuide({
    client,
    guide: "poster",
    racine: "racine",
    nomGuide: "Poster Guide",
    existants: new Map(),
    maintenant: Date.parse("2026-10-21T10:00:00Z"),
  });
  assertEquals(res.erreurs, []);
  assertEquals(res.inchangees, []);
  assertEquals(res.recopiees.map((p) => [p.page_id, p.chemin, p.ordre]), [
    ["racine", "Poster Guide", 0],
    ["quick", "Poster Guide › Quick answers", 1],
  ]);
  assertEquals(res.recopiees[1].texte, "▸ What time should I post?\n  Around midday and in the evening.");
  assertEquals(res.recopiees[0].enfants, ["quick"]);
  assertEquals(res.recopiees[1].titre, "Quick answers");
});

Deno.test("copie : une page inchangée n'est pas relue, une page modifiée si", async () => {
  const maintenant = Date.parse("2026-10-21T10:00:00Z");
  const existants = new Map<string, CopieExistante>([
    ["racine", { page_id: "racine", notion_modifie_at: "2026-10-17T16:55:45+00:00", enfants: ["quick"], copie_at: "2026-10-21T09:17:00Z" }],
    ["quick", { page_id: "quick", notion_modifie_at: "2026-10-17T16:55:45+00:00", enfants: [], copie_at: "2026-10-21T09:17:00Z" }],
  ]);
  const { client, appels } = fauxNotion({ modifies: { quick: "2026-10-21T09:40:00.000Z" } });
  const res = await copierGuide({ client, guide: "poster", racine: "racine", nomGuide: "Poster Guide", existants, maintenant });
  assertEquals(res.inchangees.map((p) => p.page_id), ["racine"]);
  assertEquals(res.recopiees.map((p) => p.page_id), ["quick"]);
  assert(!appels.includes("/blocks/racine/children?page_size=100"), "la racine inchangée n'est pas relue");
});

Deno.test("copie : au-delà de 24 h, on relit quand même (filet de sécurité)", async () => {
  const existants = new Map<string, CopieExistante>([
    ["racine", { page_id: "racine", notion_modifie_at: "2026-10-17T16:55:45Z", enfants: ["quick"], copie_at: "2026-10-19T09:17:00Z" }],
  ]);
  const { client } = fauxNotion();
  const res = await copierGuide({
    client,
    guide: "poster",
    racine: "racine",
    nomGuide: "Poster Guide",
    existants,
    maintenant: Date.parse("2026-10-21T10:00:00Z"),
  });
  assertEquals(res.inchangees, []);
  assertEquals(res.recopiees.length, 2);
});

Deno.test("copie : guide pas partagé avec l'intégration → message qui dit quoi faire", async () => {
  const { client } = fauxNotion({ refuser: true });
  const res = await copierGuide({ client, guide: "poster", racine: "racine", nomGuide: "Poster Guide", existants: new Map() });
  assertEquals(res.recopiees, []);
  assertEquals(res.erreurs.length, 1);
  assert(res.erreurs[0].includes("Connexions"));
});

Deno.test("copie : chaque page est enregistrée dès qu'elle est lue", async () => {
  const { client } = fauxNotion();
  const enregistrees: Array<[string, boolean]> = [];
  await copierGuide({
    client,
    guide: "poster",
    racine: "racine",
    nomGuide: "Poster Guide",
    existants: new Map(),
    surPage: (page, recopiee) => {
      enregistrees.push([page.page_id, recopiee]);
      return Promise.resolve();
    },
  });
  assertEquals(enregistrees, [["racine", true], ["quick", true]]);
});

Deno.test("copie : à l'échéance, on s'arrête proprement et on le dit", async () => {
  const { client, appels } = fauxNotion();
  const res = await copierGuide({
    client,
    guide: "poster",
    racine: "racine",
    nomGuide: "Poster Guide",
    existants: new Map(),
    echeance: Date.now() - 1,
  });
  assertEquals(appels, []);
  assertEquals(res.recopiees, []);
  assert(res.erreurs[0].includes("copie partielle"));
});
