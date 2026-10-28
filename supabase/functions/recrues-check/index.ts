import {
  choisirCanal,
  composerTexte,
  decider,
  type Etape,
  type EtatEtape,
  etapeMercredi,
  etapesRecrue,
  lireDelais,
  lireMode,
  lundiParis,
  type PosteurMercredi,
  type Recrue,
} from "../_shared/relances.ts";
import { lireProfilTiktok } from "../_shared/profil_tiktok.ts";
import { jetonLectureSlack, synchroniser } from "../_shared/slack_relier.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const OS_URL = "https://sophia-marketing-orga.vercel.app";

/**
 * recrues-check — prompt 17, partie A (0391) : une seule relance par étape.
 *
 *   { action: "verifier" }   cron `recrues-check`, minute 10 de chaque heure ; admin
 *       1. note les 1res connexions (relances_noter_connexions) ;
 *       2. étapes 1 à 3 des recrues (cohorte pas encore démarrée), étape 4
 *          (mercredi) des posteurs actifs ;
 *       3. avant un message : liaison Slack relancée (une fois par passage,
 *          étape 1), profil TikTok relu (étapes 2 et 3) ; fait → pas de message ;
 *       4. selon `relances_auto` : off → rien ; simulation → `relances_prevues`
 *          (« ✉ prévu »), rien ne part ; on → la ligne `nudges` d'abord (index
 *          unique : une seule relance même si deux passages se croisent), puis
 *          l'envoi (Slack, ou Upwork par la fonction `upwork`) ;
 *       5. rouges (`recrues_rouges`), relances résolues, inactifs (0385/0391).
 * Jamais de nouvel essai d'envoi : un échec est noté sur la relance.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const acces = await assertRole(request, ["admin"]);
    if (acces instanceof Response) return acces;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "verifier") return json({ ok: false, error: "action inconnue" }, 400);
    return json(await verifier(serviceClient(), new Date()));
  } catch (erreur) {
    console.error("[recrues-check]", messageErreur(erreur));
    return json({ ok: false, error: messageErreur(erreur) }, 500);
  }
});

async function reglages(supabase: Supabase) {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", [
      "relances_auto",
      "relances_delais",
      "relance_texte_acces",
      "relance_texte_tiktok",
      "relance_texte_warmup",
      "relance_texte_mercredi",
      "slack_lien_invitation",
    ]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const texte = (cle: string) => (typeof v[cle] === "string" ? (v[cle] as string) : "");
  return {
    mode: lireMode(v.relances_auto),
    delais: lireDelais(v.relances_delais),
    textes: {
      acces: texte("relance_texte_acces"),
      tiktok: texte("relance_texte_tiktok"),
      warmup: texte("relance_texte_warmup"),
      mercredi: texte("relance_texte_mercredi"),
    } as Record<Etape, string>,
    slack: texte("slack_lien_invitation"),
  };
}

/** Les relances prévues déjà notées : on ne les efface que si elles existent. */
const clePrevue = (posterId: string, type: string, periode: string) => `${posterId}|${type}|${periode}`;

interface Bilan {
  mode: string;
  recrues: number;
  mercredi: number;
  envoyes: number;
  prevus: number;
  bloques: number;
  rouges: number;
  resolus: number;
  erreurs: string[];
  /** Interne : les relances prévues existantes (pas rendu). */
  prevuesConnues?: Set<string>;
}

async function lireRecrues(supabase: Supabase): Promise<Recrue[]> {
  const { data, error } = await supabase.rpc("relances_recrues");
  if (error) throw error;
  return (data ?? []) as Recrue[];
}

async function verifier(supabase: Supabase, maintenant: Date): Promise<Bilan & { ok: boolean }> {
  const r = await reglages(supabase);
  const bilan: Bilan = { mode: r.mode, recrues: 0, mercredi: 0, envoyes: 0, prevus: 0, bloques: 0, rouges: 0, resolus: 0, erreurs: [] };
  if (r.mode === "off") return { ok: true, ...bilan };

  const { error: errCnx } = await supabase.rpc("relances_noter_connexions");
  if (errCnx) bilan.erreurs.push(`connexions : ${errCnx.message}`);

  const { data: prevues } = await supabase.from("relances_prevues").select("poster_id, type, periode");
  bilan.prevuesConnues = new Set((prevues ?? []).map((x) => clePrevue(x.poster_id, x.type, x.periode)));

  let recrues = await lireRecrues(supabase);

  // Avant un message « Accès » : la liaison Slack relancée, une fois pour tout le passage.
  const accesDu = recrues.some((x) =>
    etapesRecrue(x, r.delais).some((e) => e.etape === "acces" && decider(e, maintenant, x.fuseau, r.delais).envoyer)
  );
  if (accesDu) {
    const jeton = jetonLectureSlack();
    if (jeton) {
      await synchroniser(supabase, jeton, { simuler: false, source: "recrues-check" }).catch((e) =>
        bilan.erreurs.push(`slack : ${messageErreur(e)}`)
      );
      recrues = await lireRecrues(supabase);
    }
  }
  bilan.recrues = recrues.length;

  for (const x of recrues) {
    for (let e of etapesRecrue(x, r.delais)) {
      let d = decider(e, maintenant, x.fuseau, r.delais);
      // Étapes 2 et 3 : un relevé TikTok à jour avant d'écrire.
      if (d.envoyer && (e.etape === "tiktok" || e.etape === "warmup") && x.handle && x.compte_id) {
        const frais = await releverTiktok(supabase, x).catch(() => null);
        if (frais) {
          e = etapesRecrue(frais, r.delais).find((y) => y.etape === e.etape) ?? e;
          d = decider(e, maintenant, x.fuseau, r.delais);
        }
      }
      await appliquer(supabase, r, x.poster_id, x.compte_id, e, d, {
        prenom: x.prenom,
        handle: x.handle,
        slack_user_id: x.slack_user_id,
        contrat_id: x.contrat_id,
        fuseau: x.fuseau,
      }, bilan);
    }
  }

  // Étape 4 : le mercredi des posteurs actifs (semaine en cours, heure de Paris).
  const lundi = lundiParis(maintenant);
  const { data: semaine, error: errSem } = await supabase.rpc("relances_mercredi", { p_lundi: lundi });
  if (errSem) bilan.erreurs.push(`mercredi : ${errSem.message}`);
  for (const p of (semaine ?? []) as PosteurMercredi[]) {
    bilan.mercredi++;
    const e = etapeMercredi(p, lundi, r.delais);
    const d = decider(e, maintenant, p.fuseau, r.delais, p.publies_semaine > 0);
    await appliquer(supabase, r, p.poster_id, null, e, d, {
      prenom: p.prenom,
      handle: null,
      slack_user_id: p.slack_user_id,
      contrat_id: p.contrat_id,
      fuseau: p.fuseau,
    }, bilan);
  }

  // Les inactifs suivent la nouvelle règle (mercredi envoyé, rien vendredi 20 h).
  const { error: errInactifs } = await supabase.rpc("inactifs_marquer");
  if (errInactifs) bilan.erreurs.push(`inactifs : ${errInactifs.message}`);
  delete bilan.prevuesConnues;
  return { ok: bilan.erreurs.length === 0, ...bilan };
}

async function releverTiktok(supabase: Supabase, x: Recrue): Promise<Recrue | null> {
  const p = await lireProfilTiktok(x.handle!);
  await supabase.from("ckd_warmup_releves").insert({
    compte_id: x.compte_id,
    handle: x.handle,
    existe: p.existe,
    cree_tiktok_at: p.creeLe,
    abonnements: p.abonnements,
    likes: p.likes,
    abonnes: p.abonnes,
    videos: p.videos,
    erreur: p.erreur,
  });
  if (p.existe === null) return null;
  return { ...x, tiktok_existe: p.existe, abonnements: p.abonnements ?? x.abonnements };
}

async function appliquer(
  supabase: Supabase,
  r: Awaited<ReturnType<typeof reglages>>,
  posterId: string,
  compteId: string | null,
  e: EtatEtape,
  d: ReturnType<typeof decider>,
  p: { prenom: string | null; handle: string | null; slack_user_id: string | null; contrat_id: string | null; fuseau: string },
  bilan: Bilan,
): Promise<void> {
  const cle = { poster_id: posterId, type: e.etape, periode: e.periode };
  const effacerPrevue = async () => {
    if (!bilan.prevuesConnues?.has(clePrevue(posterId, e.etape, e.periode))) return;
    await supabase.from("relances_prevues").delete().match(cle);
  };
  if (d.fait) {
    if (d.resoudre) {
      const { data } = await supabase
        .from("nudges")
        .update({ resolu_at: new Date().toISOString() })
        .eq("poster_id", posterId)
        .eq("type", e.etape)
        .is("resolu_at", null)
        .select("id");
      bilan.resolus += (data ?? []).length;
    }
    await effacerPrevue();
    return;
  }
  if (d.rouge) {
    const { error } = await supabase
      .from("recrues_rouges")
      .upsert({ poster_id: posterId, etape: e.etape, periode: e.periode }, { onConflict: "poster_id,etape,periode", ignoreDuplicates: true });
    if (error) bilan.erreurs.push(`rouge ${posterId} : ${error.message}`);
    else bilan.rouges++;
    await effacerPrevue();
    return;
  }
  if (!d.envoyer && !d.horsFenetre) return;

  const choix = choisirCanal(e.etape, p);
  if (choix.canal === null) {
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "bloque", canal: null, texte: null, raison: choix.raison, maj_at: new Date().toISOString() });
    bilan.bloques++;
    return;
  }
  const texte = composerTexte(r.textes[e.etape], e, { prenom: p.prenom, handle: p.handle, url: OS_URL, slack: r.slack, canal: choix.canal });
  if (r.mode === "simulation" || d.horsFenetre) {
    await supabase.from("relances_prevues").upsert({
      ...cle,
      statut: "prevu",
      canal: choix.canal,
      texte,
      raison: d.horsFenetre ? "hors_fenetre" : "simulation",
      maj_at: new Date().toISOString(),
    });
    if (r.mode === "simulation") bilan.prevus++;
    return;
  }

  // Mode « on » : la ligne d'abord. L'index unique (poster, étape, période) refuse un doublon.
  const { data: ligne, error: errIns } = await supabase
    .from("nudges")
    .insert({ ...cle, compte_id: compteId, cible: "recrues-check", canal: choix.canal, texte })
    .select("id")
    .single();
  if (errIns) {
    if (errIns.code !== "23505") bilan.erreurs.push(`relance ${posterId} : ${errIns.message}`);
    return;
  }
  const erreur = choix.canal === "slack"
    ? await envoyerSlack(supabase, posterId, texte)
    : await envoyerUpwork(p.contrat_id!, texte);
  if (erreur) {
    await supabase.from("nudges").update({ slack_erreur: erreur }).eq("id", ligne.id);
    bilan.erreurs.push(`${e.etape} ${posterId} : ${erreur}`);
  } else {
    bilan.envoyes++;
  }
  await effacerPrevue();
}

async function envoyerSlack(supabase: Supabase, posterId: string, texte: string): Promise<string | null> {
  const issue = await ecrireAuPosteur(supabase, posterId, texte);
  if (issue.statut === "envoye") return null;
  return issue.statut === "erreur" ? issue.erreur : "introuvable sur Slack";
}

/** Par la fonction `upwork` (le seul endroit qui parle à Upwork), sans nouvel essai. */
async function envoyerUpwork(contratId: string, texte: string): Promise<string | null> {
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  if (!base || !secret) return "SUPABASE_URL ou CRON_SECRET absent";
  try {
    const r = await fetch(`${base}/functions/v1/upwork`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ action: "message", contrat_id: contratId, texte }),
    });
    const corps = await r.json().catch(() => null);
    if (!r.ok || !corps?.ok) return `upwork : ${corps?.error ?? `HTTP ${r.status}`}`;
    return null;
  } catch (e) {
    return `upwork : ${messageErreur(e)}`;
  }
}
