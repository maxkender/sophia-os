/**
 * Fonction Edge TEMPORAIRE `reprise-micabo` (Sophia) — reprise du stock micabo.
 *
 * Volontairement HORS de `supabase/functions/` : le workflow de déploiement ne
 * doit jamais la redéployer. Déployée à la main (MCP), neutralisée à la fin.
 *
 * Trois actions, toutes gardées par un jeton de `migration_micabo.jetons`
 * (aléatoire, à durée de vie courte, posé en SQL dans la base Sophia) :
 *  - `deposer` : appelée par la base micabo-os (pg_net) avec un lot JSON
 *    (contenus, decks, médias, passages d'une source) → `migration_micabo.lots` ;
 *  - `images`  : copie un paquet d'images de `migration_micabo.images` depuis le
 *    bucket PUBLIC de micabo-os vers le bucket `medias` de Sophia ;
 *  - `deplacer` : déplace, DANS le bucket `medias` de Sophia, un paquet de
 *    `migration_micabo.deplacements` (`micabo/propre/…` → `propre/…`, le seul
 *    chemin que Sophia reconnaît comme image nettoyée) et repointe la ligne
 *    `media_library` correspondante.
 * `ping` vérifie seulement le jeton.
 *
 * Aucun secret ne transite : la base est jointe par SUPABASE_DB_URL et le
 * stockage par la clé service de l'environnement de la fonction.
 */
import postgres from "npm:postgres@3.4.5";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Une seule connexion, rendue dès qu'elle dort : la base Sophia plafonne à 60.
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1, idle_timeout: 5 });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function jetonValide(jeton: unknown, usage: string): Promise<boolean> {
  if (typeof jeton !== "string" || jeton.length < 32) return false;
  const lignes = await sql`
    select 1 from migration_micabo.jetons
    where jeton = ${jeton} and usage = ${usage} and expire_le > now()`;
  return lignes.length === 1;
}

// Réserve un paquet en UNE instruction (pas de transaction explicite : elle
// restait bloquée derrière le pooler). `copie_le` date la réservation ; une
// réservation de plus de 5 min (copie interrompue) repasse « a_copier ».
async function reserver(n: number) {
  await sql`
    update migration_micabo.images set statut = 'a_copier'
    where statut = 'en_cours' and copie_le < now() - interval '5 minutes'`;
  return await sql`
    update migration_micabo.images i
    set statut = 'en_cours', copie_le = now()
    where i.media_id in (
      select media_id from migration_micabo.images
      where statut = 'a_copier'
      order by media_id
      limit ${n}
      for update skip locked)
    returning i.media_id, i.url_source, i.storage_path`;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Le stockage micabo limite le débit (429) : on réessaie en ralentissant.
async function lire(url: string): Promise<Response> {
  for (let essai = 0; ; essai++) {
    const rep = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (rep.status !== 429 || essai >= 4) return rep;
    await rep.body?.cancel();
    await pause(2_000 * 2 ** essai);
  }
}

async function copierUne(l: { media_id: string; url_source: string; storage_path: string }) {
  try {
    const rep = await lire(l.url_source);
    if (!rep.ok) throw new Error(`lecture ${rep.status}`);
    const octets = new Uint8Array(await rep.arrayBuffer());
    const type = rep.headers.get("content-type") ?? "image/jpeg";
    const { error } = await supabase.storage
      .from("medias")
      .upload(l.storage_path, octets, { contentType: type, upsert: true });
    if (error) throw new Error(`écriture ${error.message}`);
    await sql`
      update migration_micabo.images
      set statut = 'copie', copie_le = now(), erreur = null, octets = ${octets.length}
      where media_id = ${l.media_id}`;
    return true;
  } catch (e) {
    await sql`
      update migration_micabo.images
      set statut = 'echec', erreur = ${String(e).slice(0, 300)}
      where media_id = ${l.media_id}`;
    return false;
  }
}

// Copie en arrière-plan, `parallele` à la fois : l'appel HTTP répond tout de
// suite et ne retient jamais la file pg_net de Sophia.
async function copierImages(n: number, parallele: number) {
  const lot = await reserver(n);
  console.log(`reprise-micabo images : ${lot.length} réservée(s)`);
  let copiees = 0;
  let echecs = 0;
  for (let i = 0; i < lot.length; i += parallele) {
    const res = await Promise.all(lot.slice(i, i + parallele).map((l) => copierUne(l as never)));
    copiees += res.filter(Boolean).length;
    echecs += res.filter((ok) => !ok).length;
  }
  console.log(`reprise-micabo images : ${copiees} copiée(s), ${echecs} échec(s)`);
}

// Déplacement dans le bucket : même principe de réservation que la copie.
async function reserverDeplacements(n: number) {
  await sql`
    update migration_micabo.deplacements set statut = 'a_deplacer'
    where statut = 'en_cours' and maj_le < now() - interval '5 minutes'`;
  return await sql`
    update migration_micabo.deplacements d
    set statut = 'en_cours', maj_le = now()
    where d.ancien in (
      select ancien from migration_micabo.deplacements
      where statut = 'a_deplacer'
      order by ancien
      limit ${n}
      for update skip locked)
    returning d.ancien, d.nouveau`;
}

async function deplacerUn(l: { ancien: string; nouveau: string }) {
  try {
    const { error } = await supabase.storage.from("medias").move(l.ancien, l.nouveau);
    if (error) {
      // Rejoué après un déplacement déjà fait : la source n'existe plus, la
      // cible oui — c'est un succès, pas une erreur.
      const [etat] = await sql`
        select
          exists (select 1 from storage.objects where bucket_id = 'medias' and name = ${l.nouveau}) as arrive,
          exists (select 1 from storage.objects where bucket_id = 'medias' and name = ${l.ancien}) as reste`;
      if (!(etat.arrive && !etat.reste)) throw new Error(`déplacement ${error.message}`);
    }
    await sql`
      update public.media_library
      set storage_path = ${l.nouveau},
          url = replace(url, '/object/public/medias/micabo/', '/object/public/medias/')
      where storage_path = ${l.ancien}`;
    await sql`
      update migration_micabo.deplacements
      set statut = 'deplace', erreur = null, maj_le = now()
      where ancien = ${l.ancien}`;
    return true;
  } catch (e) {
    await sql`
      update migration_micabo.deplacements
      set statut = 'echec', erreur = ${String(e).slice(0, 300)}, maj_le = now()
      where ancien = ${l.ancien}`;
    return false;
  }
}

async function deplacerFichiers(n: number, parallele: number) {
  const lot = await reserverDeplacements(n);
  let faits = 0;
  let echecs = 0;
  for (let i = 0; i < lot.length; i += parallele) {
    const res = await Promise.all(lot.slice(i, i + parallele).map((l) => deplacerUn(l as never)));
    faits += res.filter(Boolean).length;
    echecs += res.filter((ok) => !ok).length;
  }
  console.log(`reprise-micabo deplacer : ${faits} déplacé(s), ${echecs} échec(s) sur ${lot.length}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST seulement" }, 405);
  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ error: "JSON illisible" }, 400);
  }
  const action = corps.action;

  try {
    if (action === "ping") {
      const ok = await jetonValide(corps.jeton, String(corps.usage ?? "deposer"));
      return json({ ok }, ok ? 200 : 401);
    }

    if (action === "deposer") {
      if (!(await jetonValide(corps.jeton, "deposer"))) return json({ error: "jeton" }, 401);
      const lot = String(corps.lot ?? "");
      if (!/^[a-z0-9_.-]{1,80}$/.test(lot)) return json({ error: "lot" }, 400);
      const donnees = corps.donnees;
      if (!donnees || typeof donnees !== "object") return json({ error: "donnees" }, 400);
      await sql`
        insert into migration_micabo.lots (lot, donnees)
        values (${lot}, ${sql.json(donnees as Record<string, unknown>)})
        on conflict (lot) do update set donnees = excluded.donnees, recu_le = now()`;
      return json({ ok: true, lot });
    }

    if (action === "images") {
      if (!(await jetonValide(corps.jeton, "images"))) return json({ error: "jeton" }, 401);
      const n = Math.max(1, Math.min(60, Number(corps.n) || 10));
      const parallele = Math.max(1, Math.min(3, Number(corps.parallele) || 2));
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime.waitUntil(
        copierImages(n, parallele).catch((e) => console.error("reprise-micabo images", e)),
      );
      return json({ ok: true, lance: n }, 202);
    }

    if (action === "deplacer") {
      if (!(await jetonValide(corps.jeton, "deplacer"))) return json({ error: "jeton" }, 401);
      const n = Math.max(1, Math.min(200, Number(corps.n) || 10));
      const parallele = Math.max(1, Math.min(4, Number(corps.parallele) || 2));
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime.waitUntil(
        deplacerFichiers(n, parallele).catch((e) => console.error("reprise-micabo deplacer", e)),
      );
      return json({ ok: true, lance: n }, 202);
    }

    return json({ error: "action inconnue" }, 400);
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
