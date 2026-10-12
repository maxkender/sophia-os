import { describe, expect, it } from "vitest";

import {
  applicationDuPost,
  postsParApplication,
  resumeParApplication,
} from "./calendrierApplications";
import { ID_SOPHIA } from "./multiApp";

const ID_MICABO = "00000000-0000-4000-8000-000000000002";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const APPS = [
  { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe" },
  { id: ID_MICABO, slug: "micabo", nom: "micabo" },
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia" },
];

const post = (id: string, application_id: string | null, poste = false) => ({ id, application_id, poste });
const estPoste = (p: { poste: boolean }) => p.poste;

describe("calendrierApplications", () => {
  it("un post sans application (avant 0256) promeut Sophia", () => {
    expect(applicationDuPost({ application_id: null })).toBe(ID_SOPHIA);
    expect(applicationDuPost({})).toBe(ID_SOPHIA);
    expect(applicationDuPost({ application_id: ID_MICABO })).toBe(ID_MICABO);
  });

  it("compte prévus et postés par application, Sophia d'abord puis par nom", () => {
    const posts = [
      post("1", ID_UNSWIPE),
      post("2", ID_MICABO, true),
      post("3", ID_MICABO),
      post("4", null, true),
      post("5", ID_SOPHIA),
    ];
    expect(resumeParApplication(posts, estPoste, APPS)).toEqual([
      { applicationId: ID_SOPHIA, nom: "Sophia", prevus: 2, postes: 1 },
      { applicationId: ID_MICABO, nom: "micabo", prevus: 2, postes: 1 },
      { applicationId: ID_UNSWIPE, nom: "Unswipe", prevus: 1, postes: 0 },
    ]);
  });

  it("regroupe les posts par application, sans en perdre ni en dupliquer", () => {
    const posts = [post("1", ID_MICABO), post("2", null), post("3", ID_MICABO, true)];
    const groupes = postsParApplication(posts, estPoste, APPS);
    expect(groupes.map((g) => [g.nom, g.posts.map((p) => p.id)])).toEqual([
      ["Sophia", ["2"]],
      ["micabo", ["1", "3"]],
    ]);
    expect(groupes.reduce((n, g) => n + g.posts.length, 0)).toBe(posts.length);
  });

  it("aucun post : aucun groupe", () => {
    expect(resumeParApplication([], estPoste, APPS)).toEqual([]);
  });
});
