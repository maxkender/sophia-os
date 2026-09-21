import { generateTextFast } from "../_shared/gemini.ts";
import { LOT_IDS, type ReponseLot, decouperEnLots, lireParLots, lireTout } from "../_shared/lots.ts";
import { garderDocumentsPoster, posterGuideCle } from "../_shared/poster_guide.ts";
import { estRoleManager } from "../_shared/roles.ts";
import {
  assertRole,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

/**
 * Lecture COMPLÈTE, ancrée sur la clé primaire.
 *
 * Toutes les lectures de ce fichier étaient non bornées. Elles alimentent le
 * « SNAPSHOT LIVE », c'est-à-dire les SEULS chiffres que le prompt autorise
 * l'assistant à citer — le prompt lui interdit même d'en inventer d'autres. Une
 * réponse tronquée à `max-rows` ne se voit donc pas : l'assistant annonce avec
 * aplomb « 1000 posts prévus hier » et personne ne sait que c'était le plafond
 * de PostgREST et non la réalité. C'est la forme exacte de l'incident qu'on
 * répare ailleurs, transposée à un chiffre qu'un humain va répéter en réunion.
 *
 * Toutes les tables lues ici (`posts`, `passages`, `user_roles`, `comptes`,
 * `profiles`, `documents`, `chatbot_contexte`) ont un `id` uuid en clé
 * primaire : c'est une ancre unique sur l'ensemble du résultat et jamais
 * réécrite, donc la pagination keyset ne peut ni sauter ni répéter une ligne,
 * même si le pipeline écrit dans `posts` pendant qu'on lit.
 */
function lireParId<T extends { id: string }>(
  quoi: string,
  page: (apres: string | null, taille: number) => PromiseLike<ReponseLot<T>>,
): Promise<T[]> {
  return lireTout<T>(quoi, (curseur, taille) => page(curseur?.id ?? null, taille), {
    ancre: (ligne) => ligne.id,
  });
}

interface LignePost {
  id: string;
  publie_at?: string | null;
}

const QUESTION_MAX = 1_500;
const CONTEXTE_MAX = 24_000;

type Role = "admin" | "poster" | "hiring_manager" | "directing_manager";

const LANGUES_CHAT = [
  "fr",
  "en",
  "de",
  "it",
  "es",
  "pt",
  "cs",
  "nl",
  "el",
  "hu",
  "pl",
  "ro",
  "sv",
  "tr",
] as const;

const NOM_LANGUE: Record<string, string> = {
  fr: "français",
  en: "English",
  de: "Deutsch",
  it: "italiano",
  es: "español",
  pt: "português",
  cs: "čeština",
  nl: "Nederlands",
  el: "ελληνικά",
  hu: "magyar",
  pl: "polski",
  ro: "română",
  sv: "svenska",
  tr: "Türkçe",
};

interface DocumentLigne {
  cle?: string;
  titre: string;
  titre_en: string | null;
  contenu: string;
  contenu_en: string | null;
  audience: "manager" | "poster" | "all";
}

interface Snippet {
  titre: string;
  contenu: string;
  audience: "admin" | "hiring_manager" | "poster" | "all";
}

interface Tour {
  role: "user" | "assistant";
  content: string;
}

interface CompteJour {
  date: string;
  prevus: number;
  publies: number;
}

function htmlVersTexte(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/(div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function langueDepuisProfil(langues: string[] | null | undefined, repli = "fr"): string {
  const codes = (langues ?? []).map((l) => l.toLowerCase().slice(0, 2));
  const trouve = codes.find((l) => (LANGUES_CHAT as readonly string[]).includes(l));
  if (trouve) return trouve;
  const r = repli.toLowerCase().slice(0, 2);
  return (LANGUES_CHAT as readonly string[]).includes(r) ? r : "fr";
}

function jourParis(offset = 0): string {
  const base = aujourdhuiParis();
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function audiencesDocs(role: Role): Array<DocumentLigne["audience"]> {
  if (role === "poster") return ["poster", "all"];
  if (estRoleManager(role)) return ["manager", "all"];
  return ["manager", "poster", "all"];
}

function audiencesSnippets(role: Role): Array<Snippet["audience"]> {
  if (role === "poster") return ["poster", "all"];
  if (estRoleManager(role)) return ["hiring_manager", "all"];
  return ["admin", "all"];
}

function assemblerDocs(
  snippets: Snippet[],
  docs: DocumentLigne[],
  role: Role,
  locale: string,
  plafond: number,
): string {
  const blocs: string[] = [];
  const snOk = new Set(audiencesSnippets(role));
  const docOk = new Set(audiencesDocs(role));

  for (const s of snippets) {
    if (!snOk.has(s.audience ?? "all")) continue;
    const texte = htmlVersTexte(s.contenu);
    if (!texte) continue;
    blocs.push(`### ${s.titre.trim() || "Sans titre"}\n${texte}`);
  }

  for (const doc of docs) {
    if (!docOk.has(doc.audience)) continue;
    const nonFr = locale !== "fr";
    const titre = nonFr && doc.titre_en?.trim() ? doc.titre_en : doc.titre;
    const brut = nonFr && doc.contenu_en?.trim() ? doc.contenu_en : doc.contenu;
    const texte = htmlVersTexte(brut);
    if (!texte) continue;
    blocs.push(`### ${titre}\n${texte}`);
  }

  const joint = blocs.join("\n\n");
  if (joint.length <= plafond) return joint;
  return `${joint.slice(0, Math.max(0, plafond))}\n\n[…contexte tronqué]`;
}

function cadreRole(role: Role): string {
  if (role === "poster") {
    return `Périmètre CRÉATEUR: calendrier, posts assignés, identité TikTok, guides créateur.
Interdit: totaux plateforme, autres créateurs, comptes sources, outils admin, données HM.`;
  }
  if (estRoleManager(role)) {
    return `Périmètre MANAGER${role === "directing_manager" ? " (DM)" : ""}: tes créateurs (ceux que tu as recrutés), leur calendrier, guides manager.
Interdit: autres équipes, comptes sources, pilotage moteur, chiffres globaux plateforme.`;
  }
  return `Périmètre ADMIN: toute la plateforme (posts, créateurs, HM, comptes, docs).
Tu peux donner des chiffres (ex. posts d'hier) s'ils sont dans le snapshot live.`;
}

function compterJour(
  lignes: Array<{ publie_at?: string | null }>,
  date: string,
): CompteJour {
  return {
    date,
    prevus: lignes.length,
    publies: lignes.filter((l) => Boolean(l.publie_at)).length,
  };
}

async function snapshotAdmin(
  db: ReturnType<typeof serviceClient>,
  auj: string,
  hier: string,
): Promise<string> {
  type PostAvecLangue = LignePost & {
    comptes?: { langue?: string } | { langue?: string }[] | null;
  };

  const [postsHier, postsAuj, roles, comptes] = await Promise.all([
    lireParId<PostAvecLangue>("Snapshot admin — posts d'hier", (apres, taille) => {
      let q = db
        .from("posts")
        .select("id, publie_at, comptes(langue)")
        .eq("date_publication_prevue", hier)
        .eq("est_test", false);
      if (apres) q = q.gt("id", apres);
      return q.order("id", { ascending: true }).limit(taille);
    }),
    lireParId<LignePost>("Snapshot admin — posts du jour", (apres, taille) => {
      let q = db
        .from("posts")
        .select("id, publie_at")
        .eq("date_publication_prevue", auj)
        .eq("est_test", false);
      if (apres) q = q.gt("id", apres);
      return q.order("id", { ascending: true }).limit(taille);
    }),
    lireParId<{ id: string; user_id: string; role: string }>(
      "Snapshot admin — rôles",
      (apres, taille) => {
        let q = db.from("user_roles").select("id, user_id, role");
        if (apres) q = q.gt("id", apres);
        return q.order("id", { ascending: true }).limit(taille);
      },
    ),
    lireParId<{ id: string; is_active: boolean }>(
      "Snapshot admin — comptes de publication",
      (apres, taille) => {
        let q = db.from("comptes").select("id, is_active");
        if (apres) q = q.gt("id", apres);
        return q.order("id", { ascending: true }).limit(taille);
      },
    ),
  ]);

  // Les passages v-next restent TOLÉRÉS en échec, contrairement aux posts :
  // c'est le comportement d'origine (`!passagesHier.error ? … : null`) et il a
  // une raison — ces deux lignes du snapshot sont un bonus d'observabilité, et
  // la table peut ne pas exister dans un environnement donné. On absorbe donc
  // l'échec ICI, précisément, plutôt que de laisser `lireTout` le propager :
  // l'assistant se tait alors sur les passages au lieu de refuser de répondre.
  // La tolérance est BORNÉE à ces deux lectures, elle ne couvre rien d'autre.
  const passagesDuJour = async (jour: string): Promise<CompteJour | null> => {
    try {
      const lignes = await lireParId<LignePost>(
        `Snapshot admin — passages du ${jour}`,
        (apres, taille) => {
          let q = db.from("passages").select("id, publie_at").eq("date_publication_prevue", jour);
          if (apres) q = q.gt("id", apres);
          return q.order("id", { ascending: true }).limit(taille);
        },
      );
      return compterJour(lignes, jour);
    } catch (erreur) {
      console.warn(`[chatbot] passages ${jour} indisponibles : ${messageErreur(erreur)}`);
      return null;
    }
  };
  const [ph, pa] = await Promise.all([passagesDuJour(hier), passagesDuJour(auj)]);

  const parLangue: Record<string, number> = {};
  for (const p of postsHier) {
    const langue = p.comptes;
    const code = Array.isArray(langue) ? langue[0]?.langue : langue?.langue;
    if (!code) continue;
    parLangue[code] = (parLangue[code] ?? 0) + 1;
  }

  const posterIds = new Set(roles.filter((r) => r.role === "poster").map((r) => r.user_id));
  const hm = roles.filter((r) => estRoleManager(r.role)).length;
  // Un `in(...)` nu casserait en 400 dès 650 créateurs (incident du 20/08) et
  // le garde-fou lève dès 400 : la liste grandit d'un recrutement à l'autre,
  // donc elle se découpe. Le filtre porte sur la clé primaire, la réponse ne
  // peut donc pas être plus longue que le lot qui l'a demandée.
  const profils = posterIds.size
    ? await lireParLots<{ id: string; is_active: boolean }>(
      [...posterIds],
      "Snapshot admin — créateurs actifs",
      (lot) => db.from("profiles").select("id, is_active").in("id", lot),
    )
    : [];

  const postersTotal = posterIds.size;
  const postersActifs = profils.filter((p) => p.is_active).length;
  const comptesActifs = comptes.filter((c) => c.is_active).length;

  const langues = Object.entries(parLangue)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `${l} ${n}`)
    .join(", ");

  const h = compterJour(postsHier, hier);
  const a = compterJour(postsAuj, auj);

  return [
    `Fuseau métier: Europe/Paris. Aujourd'hui ${auj}, hier ${hier}.`,
    `Posts (hors tests) hier: ${h.date}: ${h.prevus} prévus, ${h.publies} publiés.`,
    `Posts (hors tests) aujourd'hui: ${a.date}: ${a.prevus} prévus, ${a.publies} publiés.`,
    ph ? `Passages v-next hier: ${ph.date}: ${ph.prevus} prévus, ${ph.publies} publiés.` : "",
    pa ? `Passages v-next aujourd'hui: ${pa.date}: ${pa.prevus} prévus, ${pa.publies} publiés.` : "",
    `Créateurs (rôle poster): ${postersActifs} actifs / ${postersTotal}.`,
    `Hiring managers: ${hm}. Comptes publication actifs: ${comptesActifs}.`,
    langues ? `Posts hier par langue du compte: ${langues}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function snapshotHm(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  auj: string,
  hier: string,
): Promise<string> {
  const gens = await lireParId<{
    id: string;
    prenom: string | null;
    nom: string | null;
    email: string | null;
    langues: string[] | null;
    is_active: boolean;
  }>("Snapshot manager — tes créateurs", (apres, taille) => {
    let q = db
      .from("profiles")
      .select("id, prenom, nom, email, langues, is_active")
      .eq("manager_id", userId);
    if (apres) q = q.gt("id", apres);
    return q.order("id", { ascending: true }).limit(taille);
  });

  if (gens.length === 0) {
    return [
      `Fuseau métier: Europe/Paris. Aujourd'hui ${auj}, hier ${hier}.`,
      `TES créateurs seulement: aucun pour l'instant.`,
      `Tu ne vois pas les autres équipes, ni les comptes sources.`,
    ].join("\n");
  }

  // `in(...)` découpé des deux côtés : un DM peut porter plus de 400 créateurs,
  // et un créateur plusieurs comptes. Le filtre ne porte pas sur la clé primaire
  // de `comptes`, mais un poster n'a qu'une poignée de comptes : un lot de 100
  // posters ne peut pas approcher le plafond de 1000 lignes.
  const ids = gens.map((c) => c.id);
  const comptes = await lireParLots<{
    id: string;
    poster_id: string;
    handle_tiktok: string | null;
    langue: string | null;
    is_active: boolean;
  }>(ids, "Snapshot manager — comptes de tes créateurs", (lot) =>
    db
      .from("comptes")
      .select("id, poster_id, handle_tiktok, langue, is_active")
      .in("poster_id", lot));

  const parPoster = new Map(comptes.map((c) => [c.poster_id, c]));
  const compteIds = comptes.map((c) => c.id);

  // Les deux bornes à la fois, comme partout ailleurs dans le dépôt : le lot
  // borne l'URL (`compte_id` peut dépasser 400 chez un DM), la pagination borne
  // la RÉPONSE (un compte porte plusieurs posts par jour). Ni l'une ni l'autre
  // ne remplace la seconde — c'est exactement ce que le découpage seul laissait
  // passer.
  const postsDuJour = async (jour: string): Promise<LignePost[]> => {
    const out: LignePost[] = [];
    for (const lot of decouperEnLots(compteIds, LOT_IDS)) {
      const lignes = await lireParId<LignePost>(
        `Snapshot manager — posts du ${jour}`,
        (apres, taille) => {
          let q = db
            .from("posts")
            .select("id, publie_at")
            .eq("date_publication_prevue", jour)
            .eq("est_test", false)
            .in("compte_id", lot);
          if (apres) q = q.gt("id", apres);
          return q.order("id", { ascending: true }).limit(taille);
        },
      );
      out.push(...lignes);
    }
    return out;
  };

  const [postsHier, postsAuj] = compteIds.length
    ? await Promise.all([postsDuJour(hier), postsDuJour(auj)])
    : [[] as LignePost[], [] as LignePost[]];

  const liste = gens
    .map((c) => {
      const nom = [c.prenom, c.nom].filter(Boolean).join(" ") || c.email || "—";
      const compte = parPoster.get(c.id);
      const langue = compte?.langue || (c.langues ?? [])[0] || "?";
      const handle = compte?.handle_tiktok ? `@${String(compte.handle_tiktok).replace(/^@/, "")}` : "";
      return `- ${nom} (${langue}${handle ? `, ${handle}` : ""}${c.is_active ? "" : ", inactif"})`;
    })
    .join("\n");

  const h = compterJour(postsHier, hier);
  const a = compterJour(postsAuj, auj);

  return [
    `Fuseau métier: Europe/Paris. Aujourd'hui ${auj}, hier ${hier}.`,
    `TES créateurs seulement (${gens.length}):`,
    liste,
    `Leurs posts hier: ${h.date}: ${h.prevus} prévus, ${h.publies} publiés.`,
    `Leurs posts aujourd'hui: ${a.date}: ${a.prevus} prévus, ${a.publies} publiés.`,
    `Tu ne vois pas les autres équipes, ni les comptes sources.`,
  ].join("\n");
}

async function snapshotPoster(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  auj: string,
  demain: string,
): Promise<{ texte: string; langues: string[]; compteLangue: string | null }> {
    const { data: profil } = await db
    .from("profiles")
    .select("prenom, nom, email, langues, nationalite, created_at")
    .eq("id", userId)
    .maybeSingle();

  const { data: compte } = await db
    .from("comptes")
    .select("id, handle_tiktok, persona_nom, langue, posts_par_jour, warmup_started_at, warmup_ends_at")
    .eq("poster_id", userId)
    .maybeSingle();

  const nom = [profil?.prenom, profil?.nom].filter(Boolean).join(" ") || profil?.email || "créateur";
  const languesProfil = (profil?.langues ?? []) as string[];
  const langue = compte?.langue || languesProfil[0] || "fr";

  let warmup: string = "pas_de_compte";
  if (compte) {
    if (!compte.warmup_started_at || !compte.warmup_ends_at) warmup = "attente";
    else if (new Date(compte.warmup_ends_at).getTime() > Date.now()) warmup = "en_cours";
    else warmup = "termine";
  }

  // UN compte, UN jour : quelques lignes, le plafond est hors d'atteinte. On
  // pagine quand même, parce que la seule chose qui distingue cette lecture des
  // autres est une hypothèse sur les données, et que c'est exactement ce genre
  // d'hypothèse qui a fini par coûter ~1500 contenus à la requalification. Deux
  // allers-retours de plus devant un appel Gemini de plusieurs secondes.
  const postsDuJour = (jour: string) =>
    lireParId<LignePost>(`Snapshot créateur — posts du ${jour}`, (apres, taille) => {
      let q = db
        .from("posts")
        .select("id, publie_at")
        .eq("compte_id", compte!.id)
        .eq("date_publication_prevue", jour)
        .eq("est_test", false);
      if (apres) q = q.gt("id", apres);
      return q.order("id", { ascending: true }).limit(taille);
    });

  const [postsAuj, postsDemain] = compte
    ? await Promise.all([postsDuJour(auj), postsDuJour(demain)])
    : [[] as LignePost[], [] as LignePost[]];

  const a = compterJour(postsAuj, auj);
  const d = compterJour(postsDemain, demain);
  const handle = compte?.handle_tiktok ? `@${String(compte.handle_tiktok).replace(/^@/, "")}` : "pas encore renseigné";

  const texte = [
    `Fuseau métier: Europe/Paris. Aujourd'hui ${auj}, demain ${demain}.`,
    `Toi: ${nom}. Langue de publication: ${langue}.`,
    `Compte TikTok: ${handle}.`,
    compte?.persona_nom ? `Persona: ${compte.persona_nom}.` : "",
    compte?.posts_par_jour != null ? `Quota: ${compte.posts_par_jour} post(s)/jour.` : "",
    `Warmup: ${warmup}.`,
    `Tes posts aujourd'hui: ${a.date}: ${a.prevus} prévus, ${a.publies} publiés.`,
    `Tes posts demain: ${d.date}: ${d.prevus} prévus, ${d.publies} publiés.`,
    `Tu ne vois que TON calendrier. Pas les autres créateurs, pas les sources, pas les totaux plateforme.`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    texte,
    langues: compte?.langue ? [compte.langue, ...languesProfil] : languesProfil,
    compteLangue: compte?.langue ? String(compte.langue) : null,
  };
}

function construirePrompt(input: {
  question: string;
  live: string;
  docs: string;
  role: Role;
  locale: string;
  historique: Tour[];
}): string {
  const roleLabel =
    input.role === "poster"
      ? "créateur (poster)"
      : input.role === "directing_manager"
        ? "directing manager"
        : input.role === "hiring_manager"
          ? "hiring manager"
          : "admin";
  const langue = NOM_LANGUE[input.locale] ?? input.locale;

  const historique = input.historique
    .slice(-6)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

  return `Tu es l'assistant interne de Sophia (atelier de contenu TikTok).
Tu réponds UNIQUEMENT à partir du snapshot LIVE et des DOCS ci-dessous.
Si l'info n'y est pas, dis-le. N'invente aucun chiffre, process, délai, mot de passe.

${cadreRole(input.role)}

Règles :
- Réponds en ${langue} (langue de cet utilisateur), tutoiement, phrases courtes.
- Interlocuteur : ${roleLabel}.
- Les chiffres viennent UNIQUEMENT du snapshot live. Un jour = date Paris.
- Pas d'em dash. Pas d'emoji sauf si le contexte en a.
- 1 à 10 phrases. Va droit au but.

SNAPSHOT LIVE (périmètre ${roleLabel}) :
${input.live.trim() || "(vide)"}

DOCS (périmètre ${roleLabel}) :
${input.docs.trim() || "(aucun document)"}

${historique ? `ÉCHANGES RÉCENTS :\n${historique}\n` : ""}
QUESTION :
${input.question}`;
}

Deno.serve(async (request) => {
  const acces = await assertRole(request, [
    "admin",
    "poster",
    "hiring_manager",
    "directing_manager",
  ]);
  if (acces instanceof Response) return acces;

  try {
    const body = await request.json();
    const question = (body?.question ?? "").toString().trim();
    if (!question) return json({ error: "Question vide" }, 400);
    if (question.length > QUESTION_MAX) {
      return json({ error: `Question trop longue (${QUESTION_MAX} caractères max)` }, 400);
    }

    const role = acces.role as Role;
    const repliUi = (body?.locale ?? "fr").toString();
    const historiqueBrut = Array.isArray(body?.historique) ? body.historique : [];
    const historique: Tour[] = historiqueBrut
      .filter((t: unknown) => t && typeof t === "object")
      .map((t: { role?: string; content?: string }) => ({
        role: t.role === "assistant" ? "assistant" : "user",
        content: (t.content ?? "").toString().slice(0, QUESTION_MAX),
      }))
      .filter((t: Tour) => t.content.trim())
      .slice(-6);

    const db = serviceClient();
    const auj = jourParis(0);
    const hier = jourParis(-1);
    const demain = jourParis(1);

    const { data: profil } = acces.userId !== "cron"
      ? await db.from("profiles").select("langues, nationalite, created_at").eq("id", acces.userId).maybeSingle()
      : { data: null };

    let live = "";
    let langues = (profil?.langues ?? []) as string[];
    let compteLangue: string | null = null;

    if (role === "admin") {
      live = await snapshotAdmin(db, auj, hier);
    } else if (estRoleManager(role)) {
      live = await snapshotHm(db, acces.userId, auj, hier);
    } else {
      const snap = await snapshotPoster(db, acces.userId, auj, demain);
      live = snap.texte;
      langues = snap.langues.length ? snap.langues : langues;
      compteLangue = snap.compteLangue;
    }

    const locale = langueDepuisProfil(langues, repliUi);

    // Tables éditées à la main par l'admin : petites aujourd'hui, non bornées
    // dans le code. Elles constituent la section DOCS du prompt, et le prompt
    // ordonne de répondre UNIQUEMENT à partir d'elles — un document manquant
    // devient donc un « ce n'est pas documenté » affirmé à un créateur.
    //
    // La pagination se fait sur `id` (clé primaire, ancre unique et immuable),
    // pas sur `updated_at` qui n'est ni unique ni stable : c'est justement la
    // colonne que l'admin réécrit en éditant un snippet, et une ligne réécrite
    // pendant la lecture changerait de place. Le tri métier « le plus récent
    // d'abord » — qui décide qui survit au plafond de `CONTEXTE_MAX` — est donc
    // rétabli en mémoire, une fois TOUT lu.
    const [snippetsBruts, docs] = await Promise.all([
      lireParId<Snippet & { id: string; updated_at: string | null }>(
        "Chatbot — snippets de contexte",
        (apres, taille) => {
          let q = db
            .from("chatbot_contexte")
            .select("id, titre, contenu, audience, updated_at");
          if (apres) q = q.gt("id", apres);
          return q.order("id", { ascending: true }).limit(taille);
        },
      ),
      lireParId<DocumentLigne & { id: string }>("Chatbot — documents", (apres, taille) => {
        let q = db
          .from("documents")
          .select("id, cle, titre, titre_en, contenu, contenu_en, audience");
        if (apres) q = q.gt("id", apres);
        return q.order("id", { ascending: true }).limit(taille);
      }),
    ]);
    const snippets = [...snippetsBruts].sort((x, y) =>
      String(y.updated_at ?? "").localeCompare(String(x.updated_at ?? ""))
    );

    const docsRole = role === "poster"
      ? garderDocumentsPoster(
        docs as DocumentLigne[],
        posterGuideCle({
          profileCreatedAt: (profil as { created_at?: string | null } | null)?.created_at ?? null,
          nationalite: (profil as { nationalite?: string | null } | null)?.nationalite ?? null,
          langues: (profil?.langues ?? []) as string[],
          compteLangues: compteLangue ? [compteLangue] : [],
        }),
      )
      : docs as DocumentLigne[];

    const docsTexte = assemblerDocs(
      snippets as Snippet[],
      docsRole,
      role,
      locale,
      Math.max(4_000, CONTEXTE_MAX - live.length - 800),
    );
    const prompt = construirePrompt({ question, live, docs: docsTexte, role, locale, historique });
    const reponse = (await generateTextFast(prompt)).trim();
    if (!reponse) return json({ error: "Réponse vide" }, 502);

    const { error: insertError } = await db.from("chatbot_questions").insert({
      user_id: acces.userId === "cron" ? null : acces.userId,
      role,
      question,
      reponse,
    });
    if (insertError) console.error("chatbot_questions insert", insertError);

    return json({ ok: true, reponse, locale });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
