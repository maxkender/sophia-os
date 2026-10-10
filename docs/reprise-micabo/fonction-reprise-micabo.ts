/**
 * Fonction Edge TEMPORAIRE `reprise-micabo` (Sophia) — reprise du stock micabo.
 *
 * Volontairement HORS de `supabase/functions/` : le workflow de déploiement ne
 * doit jamais la redéployer. Déployée à la main (MCP), neutralisée à la fin.
 *
 * Deux actions, toutes deux gardées par un jeton de `migration_micabo.jetons`
 * (aléatoire, à durée de vie courte, posé en SQL dans la base Sophia) :
 *  - `deposer` : appelée par la base micabo-os (pg_net) avec un lot JSON
 *    (contenus, decks, médias, passages d'une source) → `migration_micabo.lots` ;
 *  - `images`  : copie un paquet d'images de `migration_micabo.images` depuis le
 *    bucket PUBLIC de micabo-os vers le bucket `medias` de Sophia.
 * `ping` vérifie seulement le jeton.
 *
 * Aucun secret ne transite : la base est jointe par SUPABASE_DB_URL et le
 * stockage par la clé service de l'environnement de la fonction.
 */
import postgres from "npm:postgres@3.4.5";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
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

async function copierImages(n: number) {
  const lot = await sql.begin(async (tx) => {
    const lignes = await tx`
      select media_id, url_source, storage_path
      from migration_micabo.images
      where statut = 'a_copier'
      order by media_id
      limit ${n}
      for update skip locked`;
    if (lignes.length) {
      await tx`
        update migration_micabo.images set statut = 'en_cours'
        where media_id = any(${lignes.map((l) => l.media_id)})`;
    }
    return lignes;
  });

  let copiees = 0;
  let echecs = 0;
  for (const l of lot) {
    try {
      const rep = await fetch(l.url_source);
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
      copiees++;
    } catch (e) {
      await sql`
        update migration_micabo.images
        set statut = 'echec', erreur = ${String(e).slice(0, 300)}
        where media_id = ${l.media_id}`;
      echecs++;
    }
  }
  const [reste] = await sql`
    select count(*)::int as n from migration_micabo.images where statut = 'a_copier'`;
  return { copiees, echecs, restantes: reste.n };
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
      const n = Math.max(1, Math.min(40, Number(corps.n) || 10));
      return json({ ok: true, ...(await copierImages(n)) });
    }

    return json({ error: "action inconnue" }, 400);
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
