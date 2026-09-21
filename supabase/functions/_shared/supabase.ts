import { createClient } from "jsr:@supabase/supabase-js@2";

import { IN_MAX_VALEURS, PLAFOND_LIGNES } from "./lots.ts";

/**
 * Rend bruyant un `in(...)` trop long.
 *
 * Passé ~650 ids, PostgREST répond 400 parce que l'URL déborde. Un appelant
 * qui ne relit pas `error` interprète alors « requête ratée » comme « aucun
 * résultat » : le 20/08 un pool de 785 slideshows est passé pour vide et
 * minuit a baissé 41 créateurs à 0 post/jour, sans une ligne de log.
 *
 * On lève donc AVANT PostgREST, au call site, avec le nom de la colonne. Le
 * seuil est volontairement sous la casse réelle et très au-dessus des listes
 * bornées (slides d'un post, comptes d'une langue…).
 */
export function verifierTailleIn(colonne: string, valeurs: unknown): void {
  if (!Array.isArray(valeurs) || valeurs.length <= IN_MAX_VALEURS) return;
  throw new Error(
    `in("${colonne}", …) reçoit ${valeurs.length} valeurs (max ${IN_MAX_VALEURS}) : ` +
      `l'URL PostgREST déborderait et la requête échouerait en 400. ` +
      `Passe par lireParLots() de _shared/lots.ts.`,
  );
}

/* -------------------------------------------------------------------------
 * Garde-fou n°2 : la RÉPONSE tronquée.
 *
 * `verifierTailleIn` protège de la panne du 20/08 (URL trop longue → 400 →
 * erreur ignorée → pool plein pris pour un pool vide). Il ne protège de rien
 * du côté du résultat : PostgREST plafonne toute réponse à `max-rows` et
 * répond 200. Il n'y a alors aucune erreur à relire, et une lecture amputée
 * passe pour l'inventaire complet — c'est la forme que la panne a reprise sur
 * `contenu_tier_etat` (2521 lignes réelles, 1000 lues, ~1500 contenus jamais
 * examinés). Les deux garde-fous sont complémentaires : le plafond de 400 porte
 * sur le nombre de VALEURS du `in(...)`, pas sur le nombre de LIGNES rendues,
 * et sur une relation many-to-one 100 valeurs ramènent des milliers de lignes.
 *
 * On lève donc au `then`, c'est-à-dire au seul point de passage commun à
 * `await`, `.then()` et `Promise.all`.
 * ---------------------------------------------------------------------- */

/** Ce que le Proxy retient d'une chaîne, entre le `from()` et le `await`. */
export interface EtatLecture {
  /** Nom de table, pour que le message nomme le coupable. */
  table: string;
  /**
   * L'appelant a déclaré sa borne : `.limit(n)` ou `.range(a, b)` dont
   * l'amplitude est STRICTEMENT sous le plafond. Une borne au plafond ou
   * au-dessus n'en est pas une — PostgREST coupe pareil.
   */
  borne: boolean;
}

/**
 * Un `.limit()`/`.range()` posé sur une table EMBARQUÉE ne borne pas les lignes
 * du haut : PostgREST l'écrit `tbl.limit=…`. Il ne vaut donc pas déclaration
 * d'intention sur le résultat qu'on surveille.
 */
function viseTableEmbarquee(options: unknown): boolean {
  if (!options || typeof options !== "object") return false;
  const o = options as Record<string, unknown>;
  return Boolean(o.foreignTable ?? o.referencedTable);
}

/**
 * `.limit(N)` avec N >= plafond n'est PAS une borne : PostgREST plafonne quand
 * même. Les neuf `.limit(5000)` d'oubli_source.ts sont déjà tronqués à 1000
 * aujourd'hui tout en ayant l'air délibérés — c'est la troncature la plus dure
 * à voir en relecture, parce que le code affirme le contraire. La règle est
 * donc « limit STRICTEMENT sous le plafond », jamais « limit présent ».
 */
function limiteEstUneBorne(args: unknown[]): boolean {
  if (viseTableEmbarquee(args[1])) return false;
  return amplitudeEstUneBorne(Number(args[0]));
}

/**
 * `.range(a, b)` demande `b - a + 1` lignes : PostgREST le traduit en
 * `offset=a&limit=b-a+1`. L'amplitude EST une limite, et il faut la juger comme
 * telle.
 *
 * Sans ça le garde-fou avait deux poids deux mesures sur une seule et même
 * troncature : `.limit(5000)` levait, tandis que `.range(0, 4999)` — qui demande
 * exactement les mêmes 5000 lignes et revient lui aussi rogné à 1000 — passait
 * sans un bruit, au seul motif qu'il portait un `offset`. C'était le dernier
 * chemin par lequel une réponse amputée pouvait encore se faire passer pour
 * l'inventaire complet, c'est-à-dire la panne elle-même.
 *
 * Une page franchement SOUS le plafond (`.range(0, 799)`) reste une borne : le
 * serveur n'a alors rien à rogner par-dessus, et un paginateur légitime n'est
 * pas inquiété.
 */
function rangeEstUneBorne(args: unknown[]): boolean {
  if (viseTableEmbarquee(args[2])) return false;
  const de = Number(args[0]);
  const a = Number(args[1]);
  if (!Number.isFinite(de) || !Number.isFinite(a)) return false;
  return amplitudeEstUneBorne(a - de + 1);
}

/** Règle commune à `.limit()` et à l'amplitude d'un `.range()`. */
function amplitudeEstUneBorne(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n < PLAFOND_LIGNES;
}

function parametresUrl(cible: object): URLSearchParams | null {
  const url = (cible as { url?: unknown }).url;
  if (url instanceof URL) return url.searchParams;
  if (typeof url === "string") {
    try {
      return new URL(url).searchParams;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Deuxième lecture de la borne, sur l'URL FINALE du builder.
 *
 * Le drapeau porté par la chaîne suffit en théorie ; l'URL est la source de
 * vérité en pratique, parce qu'elle survit à tout ce qui pourrait faire sortir
 * un maillon du Proxy (un builder reconstruit ailleurs, un helper qui rend la
 * cible brute).
 *
 * `limit` prime sur `offset`, et c'est le correctif du trou du `.range()` :
 * postgrest-js écrit `.range(a, b)` en `offset=a&limit=b-a+1`, donc se contenter
 * de « un offset est présent, c'est une pagination voulue » revenait à bénir
 * n'importe quelle amplitude — `.range(0, 4999)` compris, qui est une troncature
 * pure. Quand l'URL porte une `limit`, c'est elle qui décide, au même seuil
 * strict que `.limit()`. Un `offset` SANS `limit` reste tenu pour une pagination
 * assumée : la forme n'existe pas dans postgrest-js, mais si elle arrivait d'un
 * builder reconstruit, l'appelant a manifestement une idée de l'endroit où il
 * lit.
 */
function borneDansUrl(cible: object): boolean {
  const params = parametresUrl(cible);
  if (!params) return false;
  const limite = params.get("limit");
  if (limite !== null) return amplitudeEstUneBorne(Number(limite));
  return params.has("offset");
}

function nomTable(cible: object, etat: EtatLecture): string {
  if (etat.table) return etat.table;
  const url = (cible as { url?: unknown }).url;
  const chemin = url instanceof URL
    ? url.pathname
    : typeof url === "string"
    ? url.split("?")[0]
    : "";
  return chemin.split("/").filter(Boolean).pop() || "table inconnue";
}

function urlLisible(cible: object): string {
  const url = (cible as { url?: unknown }).url;
  const texte = url instanceof URL ? `${url.pathname}${url.search}` : String(url ?? "?");
  return texte.length > 300 ? `${texte.slice(0, 300)}…` : texte;
}

/**
 * Le message EST le produit : il sera lu à 2 h du matin dans un log de cron,
 * par quelqu'un qui n'a pas le fichier sous les yeux. Le jet part d'ici et non
 * du call site, donc c'est au message de rattacher l'incident au code fautif —
 * d'où la table, la longueur reçue, le plafond, l'URL, et la sortie.
 */
function messageTroncature(table: string, recues: number, url: string): string {
  return (
    `Lecture tronquée sur "${table}" : ${recues} lignes rendues, soit le plafond ` +
    `PostgREST (max-rows = ${PLAFOND_LIGNES}), sans que l'appelant ait borné sa requête. ` +
    `PostgREST coupe à ce plafond et répond 200 : il n'y a aucune erreur à relire, et ` +
    `le résultat amputé passe pour l'inventaire complet — c'est ainsi que ~1500 contenus ` +
    `ont cessé d'être examinés par la requalification pendant que le rapport affichait ` +
    `« 1000 examinés ». Sortie : lireTout() de _shared/lots.ts (pagination keyset, ancre ` +
    `stable et unique) ; ou .limit(n) avec n < ${PLAFOND_LIGNES} si la coupe est voulue ` +
    `(un .limit(5000) n'en est pas une, PostgREST plafonne quand même) ; ou .range(a, b) ` +
    `si tu pagines déjà, à condition que b - a + 1 soit lui aussi sous ${PLAFOND_LIGNES} ` +
    `(.range(0, 4999) est la même troncature que .limit(5000), écrite autrement) ; ou ` +
    `select(…, { count: "exact", head: true }) si seul le nombre ` +
    `compte. Requête : ${url}`
  );
}

/**
 * Lève si la réponse a l'air complète sans l'être.
 *
 * Muet partout où la question ne se pose pas : erreur déjà remontée (la doubler
 * brouillerait le diagnostic), `data` non tabulaire — donc `.single()`,
 * `.maybeSingle()`, les comptages `head: true` et les écritures sans `.select()`
 * —, longueur sous le plafond, ou borne déclarée.
 *
 * Un faux positif est ASSUMÉ : une lecture qui rend légitimement pile le
 * plafond doit déclarer son intention. Mieux vaut une fonction qui refuse de
 * démarrer qu'une fonction qui décide sur un inventaire amputé.
 */
export function verifierCompletude(cible: object, etat: EtatLecture, reponse: unknown): void {
  if (!reponse || typeof reponse !== "object") return;
  const res = reponse as { data?: unknown; error?: unknown };
  if (res.error) return;
  if (!Array.isArray(res.data)) return;
  if (res.data.length < PLAFOND_LIGNES) return;
  if (etat.borne || borneDansUrl(cible)) return;
  throw new Error(messageTroncature(nomTable(cible, etat), res.data.length, urlLisible(cible)));
}

/**
 * Un maillon de chaîne PostgREST se reconnaît à ceci : c'est un objet thenable
 * qui n'est pas une Promise. On ne réenveloppe rien d'autre — surtout pas la
 * Promise rendue par `then`, dont la traversée du trap relirait `fetch` et
 * `processResponse` à travers le Proxy.
 */
function estMaillon(valeur: unknown): valeur is object {
  return (
    !!valeur &&
    typeof valeur === "object" &&
    !(valeur instanceof Promise) &&
    typeof (valeur as { then?: unknown }).then === "function"
  );
}

/**
 * Enveloppe un builder PostgREST : taille des `in(...)` à l'aller, complétude
 * de la réponse au retour.
 *
 * LE point délicat est le chaînage. Dans postgrest-js, TOUTES les méthodes de
 * filtre et de modificateur (eq/gt/in/is/not/or/order/limit/range/single…) font
 * `return this` : elles rendent la CIBLE. L'ancienne garde `suite !== cible`
 * laissait donc échapper le Proxy dès le premier maillon, et 94 % des chaînes
 * du dépôt étaient déjà dé-proxifiées au moment du `await` — y compris les deux
 * requêtes de la panne. `verifierTailleIn` était inerte pour la même raison sur
 * tout `in()` précédé d'un filtre. Quand la méthode rend la cible, on rend donc
 * le Proxy lui-même : c'est ce qui rend les deux garde-fous atteignables.
 *
 * `then` reste lié à la CIBLE, et ce n'est pas un détail de style : exécuté avec
 * `this = recepteur`, l'intérieur de `PostgrestBuilder.then` relit `this.fetch`
 * et `this.processResponse` à travers le trap, ces fonctions ressortent en
 * wrappers, leurs retours sont réenveloppés, et l'on mesure 4 requêtes HTTP au
 * lieu d'1 avec `data = null`. On ne fait qu'envelopper `onfulfilled`, et on
 * n'appelle le `then` d'origine qu'une seule fois : il n'est pas mémoïsé, chaque
 * appel relance la requête. `onrejected` reçoit les rejets d'origine intacts :
 * par défaut postgrest RÉSOUT avec `{ data: null, error }`, même sur 400 et même
 * sur échec réseau, et tout le dépôt compte sur cette forme. La troncature, elle,
 * est détectée dans `onfulfilled` et transformée en REJET de la promesse, jamais
 * en `{ error }` : remonter au call site, c'est toute la doctrine.
 */
export function surveillerBuilder<T extends object>(
  builder: T,
  depart?: Partial<EtatLecture>,
): T {
  // Un état par chaîne, partagé par tous les maillons qui rendent la cible, et
  // reparti à neuf dès qu'un nouveau builder est créé (select/insert/update…) :
  // une borne ne doit jamais fuiter d'une requête à la suivante.
  const etat: EtatLecture = { table: depart?.table ?? "", borne: depart?.borne ?? false };

  const proxy = new Proxy(builder, {
    get(cible, prop, recepteur) {
      const valeur = Reflect.get(cible, prop, recepteur);
      if (typeof valeur !== "function") return valeur;

      if (prop === "then") {
        const declencher = valeur.bind(cible) as (
          onfulfilled?: (v: unknown) => unknown,
          onrejected?: (r: unknown) => unknown,
        ) => unknown;
        return (
          onfulfilled?: (v: unknown) => unknown,
          onrejected?: (r: unknown) => unknown,
        ) =>
          declencher((res: unknown) => {
            try {
              verifierCompletude(cible, etat, res);
            } catch (troncature) {
              // On route vers `onrejected` au lieu de jeter dans la promesse
              // rendue par `then`. Le call site voit la même chose (son `await`
              // rejette), mais `await` IGNORE la valeur de retour de `then` sur
              // un thenable : un jet direct laisserait une promesse rejetée que
              // personne ne tient, et Deno tuerait le processus sur un
              // « dangling promise » au lieu de remonter l'incident.
              if (onrejected) return onrejected(troncature);
              throw troncature;
            }
            return onfulfilled ? onfulfilled(res) : res;
          }, onrejected);
      }

      // `catch`/`finally` n'existent pas sur PostgrestBuilder (branche morte,
      // conservée parce qu'un jour ils pourraient exister) : même raison que
      // `then`, ils déclenchent la requête et doivent voir la cible.
      if (prop === "catch" || prop === "finally") return valeur.bind(cible);

      return (...args: unknown[]) => {
        if (prop === "in") verifierTailleIn(String(args[0]), args[1]);
        if (prop === "limit" && limiteEstUneBorne(args)) etat.borne = true;
        if (prop === "range" && rangeEstUneBorne(args)) etat.borne = true;

        const suite = valeur.apply(cible, args);
        // `return this` : on rend le Proxy, pas la cible — sans quoi tout le
        // reste de la chaîne échappe aux deux garde-fous.
        if (suite === cible) return proxy;
        // Nouveau builder (select/insert/update/delete) : nouvelle chaîne,
        // nouvelle borne, mais on lui transmet le nom de table.
        return estMaillon(suite) ? surveillerBuilder(suite, { table: etat.table }) : suite;
      };
    },
  }) as T;

  return proxy;
}

/**
 * Client service_role : contourne la RLS. Réservé aux Edge Functions, qui sont
 * le seul endroit où le pipeline a le droit d'écrire dans les tables métier.
 */
export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant");
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Angles morts assumés : le trap n'intercepte que `from`. `rpc()` renvoie
  // pourtant un builder soumis au même plafond quand la fonction est
  // set-returning (classement_comptes.ts:441, media_caption.ts:397) ; idem
  // `auth.admin` et `storage.from(...)`, qui ne sont pas des getters. Les
  // couvrir demanderait d'élargir le trap — à faire quand un de ces appels
  // s'approchera du plafond, pas avant.
  return new Proxy(client, {
    get(cible, prop, recepteur) {
      const valeur = Reflect.get(cible, prop, recepteur);
      if (prop !== "from" || typeof valeur !== "function") return valeur;
      return (...args: unknown[]) =>
        surveillerBuilder(valeur.apply(cible, args) as object, { table: String(args[0] ?? "") });
    },
  });
}

/**
 * Deux appelants légitimes, deux preuves différentes :
 *
 * - pg_cron n'a pas de session utilisateur, il présente un secret partagé
 *   (plus sûr que la clé anon, qui est publique par nature) ;
 * - un admin qui déclenche un run depuis l'interface présente son JWT, dont
 *   le rôle est vérifié côté base — le secret ne descend jamais au navigateur.
 */
export async function assertAuthorised(request: Request): Promise<Response | null> {
  // Requête préliminaire CORS du navigateur : on répond tout de suite, sans
  // authentifier. assertAuthorised étant le premier appel de chaque fonction,
  // ce seul point couvre le preflight de toutes.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    return json({ error: "CRON_SECRET non configuré" }, 500);
  }

  if (request.headers.get("x-cron-secret") === expected) return null;

  // Secret de TEST séparé (facultatif) : même pouvoir que CRON_SECRET, mais
  // distinct, pour déclencher les fonctions à la main pendant les tests sans
  // exposer/toucher le secret des crons. Les crons continuent d'utiliser
  // CRON_SECRET. Pour le désactiver : supprimer le secret TEST_SECRET côté
  // Supabase (aucun redéploiement nécessaire).
  const testSecret = Deno.env.get("TEST_SECRET");
  if (testSecret && request.headers.get("x-cron-secret") === testSecret) return null;

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const acces = await rolesDuJeton(token);
  if (!acces) return json({ error: "unauthorized" }, 401);
  if (!acces.roles.includes("admin")) return json({ error: "forbidden" }, 403);
  return null;
}

/** `sub` (id utilisateur) du JWT, décodé SANS vérifier la signature — juste pour
 *  savoir de qui on parle ; la VÉRIFICATION vient de la requête PostgREST ci-après. */
function jetonSub(token: string): string | null {
  try {
    const charge = token.split(".")[1];
    return (JSON.parse(atob(charge.replace(/-/g, "+").replace(/_/g, "/"))).sub as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Rôles du porteur du jeton, vérifiés via PostgREST — et NON via `getUser`/GoTrue,
 * qui rejette les jetons de l'ancien format depuis la migration des clés JWT
 * asymétriques (erreurs « bad_jwt ES256 » à la création de poster). PostgREST,
 * lui, valide la signature (c'est pourquoi les requêtes de données du front
 * marchent). La RLS `user_roles (user_id = auth.uid())` renvoie les rôles de
 * l'appelant ; on filtre sur le `sub` du jeton pour ne pas capter d'autres lignes
 * si l'appelant est admin. Renvoie null si le jeton est invalide (PostgREST refuse).
 */
async function rolesDuJeton(token: string): Promise<{ userId: string; roles: string[] } | null> {
  const sub = jetonSub(token);
  if (!sub) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.from("user_roles").select("role").eq("user_id", sub);
  if (error) return null; // signature invalide → PostgREST refuse
  return { userId: sub, roles: (data ?? []).map((r) => r.role as string) };
}

/**
 * Comme assertAuthorised, mais accepte une LISTE de rôles et renvoie celui de
 * l'appelant (utile quand une même fonction sert admin ET hiring manager, avec
 * des actions réservées à l'un). Renvoie une Response en cas de refus, sinon
 * `{ userId, role }`.
 */
export async function assertRole(
  request: Request,
  roles: string[],
): Promise<Response | { userId: string; role: string }> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const expected = Deno.env.get("CRON_SECRET");
  if (expected && request.headers.get("x-cron-secret") === expected) {
    return { userId: "cron", role: "admin" };
  }
  const testSecret = Deno.env.get("TEST_SECRET");
  if (testSecret && request.headers.get("x-cron-secret") === testSecret) {
    return { userId: "cron", role: "admin" };
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const acces = await rolesDuJeton(token);
  if (!acces) return json({ error: "unauthorized" }, 401);
  const trouve = acces.roles.find((r) => roles.includes(r));
  if (!trouve) return json({ error: "forbidden" }, 403);
  return { userId: acces.userId, role: trouve };
}

/**
 * Charge un prompt éditable depuis l'admin. Renvoie undefined si absent, pour
 * que l'appelant retombe sur le défaut codé plutôt que d'envoyer un prompt vide.
 */
export async function chargerPrompt(
  supabase: ReturnType<typeof serviceClient>,
  cle: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from("prompts")
    .select("contenu")
    .eq("cle", cle)
    .maybeSingle();

  return data?.contenu?.trim() || undefined;
}

/**
 * Message lisible pour n'importe quoi qui a été jeté.
 *
 * `String(erreur)` sur une erreur Supabase donne « [object Object] » : le
 * pipeline enregistrait ça en base, et on ne pouvait plus savoir ce qui avait
 * échoué. On va donc chercher les champs que Postgrest et Storage remplissent.
 */
export function messageErreur(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message;

  if (erreur && typeof erreur === "object") {
    const e = erreur as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
    try {
      return JSON.stringify(erreur).slice(0, 400);
    } catch {
      // Objet non sérialisable (cycle) : on retombe sur String().
    }
  }

  return String(erreur);
}

// Sans ces en-têtes, un appel depuis le navigateur (origine Vercel, différente
// de supabase.co) est bloqué par CORS : la requête échoue en « Failed to fetch »
// avant même d'atteindre la fonction. En curl ça passait, d'où le piège.
export const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, accept, x-cron-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

/** Date du jour en YYYY-MM-DD (UTC — les crons raisonnent en UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Date du jour à PARIS (YYYY-MM-DD) — le « jour » métier de la plateforme.
 * À minuit Paris (22h UTC l'été), la date UTC est encore la VEILLE : utiliser
 * l'UTC faisait viser le mauvais jour au cron de minuit, et les posts du jour
 * n'étaient réellement créés qu'au rattrapage de 6h, avec 2h de fenêtre de
 * fabrication au lieu de 8 — d'où des posters sans post au réveil.
 */
export function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
