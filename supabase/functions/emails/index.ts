/**
 * 13/11 (Max) : le suivi des emails de l'OS (journal emails_envois, voir _shared/emails.ts).
 *
 * Actions (secret cron) :
 *   - passage (toutes les 10 min) : relève les crédits Brevo ; réessaie les emails en file (sauf si Brevo est
 *     sans crédit) ; vérifie auprès de Brevo que les emails acceptés ont bien été délivrés.
 *   - etat : clé Brevo présente, crédits, compteurs du journal.
 *   - verifier_rattrapage { cle, jour } : pour chaque destinataire de l'email de rattrapage, délivré ou non
 *     (événements Brevo). Écrit le résultat dans le journal. N'envoie rien.
 *   - renvoyer_rattrapage { cle, jour, confirmer } : renvoie le MÊME email (contenu gardé par Brevo, donc les
 *     mêmes mots de passe et les mêmes liens) à ceux qui ne l'ont pas reçu. Sans confirmer : la liste seulement.
 */

import {
  appelerSite,
  brevoGet,
  contenuBrevo,
  creditsEmail,
  delaiEssai,
  type EvenementBrevo,
  evenementsBrevo,
  envoyerSuivi,
  lienStopDansHtml,
  refusDefinitif,
  statutLivraison,
  TENTATIVES_MAX,
  texteDepuisHtml,
} from "../_shared/emails.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** Un email accepté mais toujours pas délivré après ce délai est remis en file (si Brevo a du crédit). */
const ATTENTE_MAX_MS = 6 * 3600_000;

Deno.serve(async (request) => {
  const refus = await assertAuthorised(request);
  if (refus) return refus;
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "corps JSON requis" }, 400);
  }
  const supabase = serviceClient();
  try {
    if (body?.action === "passage") return json(await passage(supabase));
    if (body?.action === "etat") return json(await etat(supabase));
    if (body?.action === "verifier_rattrapage") return json(await verifierRattrapage(supabase, body));
    if (body?.action === "renvoyer_rattrapage") return json(await renvoyerRattrapage(supabase, body));
    return json({ ok: false, error: "action inconnue" }, 400);
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Brevo : crédits
// ---------------------------------------------------------------------------

interface EtatBrevo {
  cle_absente?: boolean;
  credits?: number | null;
  sans_credit?: boolean;
  plan?: unknown;
  erreur?: string | null;
  verifie_at?: string;
}

async function releverBrevo(supabase: Supabase): Promise<EtatBrevo> {
  const r = await brevoGet("/account");
  let e: EtatBrevo;
  if (!r.ok && r.erreur === "BREVO_API_KEY manquant") e = { cle_absente: true, sans_credit: false };
  else if (!r.ok) e = { cle_absente: false, sans_credit: false, erreur: r.erreur };
  else {
    const plan = (r.data as { plan?: unknown } | null)?.plan ?? null;
    const credits = creditsEmail(plan);
    e = { cle_absente: false, credits, sans_credit: credits !== null && credits <= 0, plan, erreur: null };
  }
  e.verifie_at = new Date().toISOString();
  await supabase.from("reglages").update({ valeur: e, updated_at: e.verifie_at }).eq("cle", "emails_brevo");
  return e;
}

// ---------------------------------------------------------------------------
// Le passage : réessais + vérification des livraisons
// ---------------------------------------------------------------------------

interface Ligne {
  id: string;
  destinataire: string;
  objet: string;
  html: string | null;
  texte: string | null;
  desabonnement: string | null;
  tags: string[];
  statut: string;
  message_id: string | null;
  tentatives: number;
  accepte_at: string | null;
}

async function passage(supabase: Supabase) {
  const brevo = await releverBrevo(supabase);
  const bilan = { brevo: { credits: brevo.credits ?? null, sans_credit: !!brevo.sans_credit, cle_absente: !!brevo.cle_absente, erreur: brevo.erreur ?? null },
    reessayes: 0, acceptes: 0, encore_en_file: 0, abandonnes: 0, refuses: 0, delivres: 0, remis_en_file: 0, en_attente: 0 };

  // 1. Les emails en file, dont l'heure est venue (pas tant que Brevo est sans crédit).
  if (!brevo.sans_credit) {
    const { data } = await supabase.from("emails_envois")
      .select("id, destinataire, objet, html, texte, desabonnement, tags, statut, message_id, tentatives, accepte_at")
      .eq("statut", "en_file").lte("prochain_essai_at", new Date().toISOString()).not("html", "is", null)
      .order("cree_at").limit(40);
    for (const l of (data ?? []) as Ligne[]) {
      bilan.reessayes++;
      const r = await appelerSite({ to: l.destinataire, objet: l.objet, html: l.html!, texte: l.texte ?? texteDepuisHtml(l.html!), stop: l.desabonnement ?? "", tags: l.tags });
      const tentatives = l.tentatives + 1;
      const maintenant = new Date();
      if (r.ok) {
        bilan.acceptes++;
        await supabase.from("emails_envois").update({ statut: "accepte", message_id: r.message_id, tentatives, accepte_at: maintenant.toISOString(), erreur: null, prochain_essai_at: null }).eq("id", l.id);
      } else if (refusDefinitif(r)) {
        bilan.refuses++;
        await supabase.from("emails_envois").update({ statut: "refuse", tentatives, erreur: r.erreur }).eq("id", l.id);
      } else if (tentatives >= TENTATIVES_MAX) {
        bilan.abandonnes++;
        await supabase.from("emails_envois").update({ statut: "abandonne", tentatives, erreur: r.erreur }).eq("id", l.id);
      } else {
        bilan.encore_en_file++;
        await supabase.from("emails_envois").update({ tentatives, erreur: r.erreur, prochain_essai_at: new Date(maintenant.getTime() + delaiEssai(tentatives)).toISOString() }).eq("id", l.id);
      }
    }
  }

  // 2. Les emails acceptés par Brevo : délivrés ou non ? (seulement avec la clé Brevo)
  if (!brevo.cle_absente) {
    const avant = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data } = await supabase.from("emails_envois")
      .select("id, destinataire, objet, html, texte, desabonnement, tags, statut, message_id, tentatives, accepte_at")
      .eq("statut", "accepte").not("message_id", "is", null).lte("accepte_at", avant)
      .gte("accepte_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .or(`verifie_at.is.null,verifie_at.lte.${new Date(Date.now() - 20 * 60_000).toISOString()}`)
      .order("accepte_at").limit(60);
    for (const l of (data ?? []) as Ligne[]) {
      const ev = await evenementsBrevo({ messageId: l.message_id! });
      if (!ev.ok) break; // Brevo indisponible : au prochain passage.
      const s = statutLivraison(ev.evenements);
      const maintenant = new Date();
      const maj: Record<string, unknown> = { verifie_at: maintenant.toISOString(), dernier_evenement: s.evenement };
      if (s.statut === "delivre") {
        bilan.delivres++;
        Object.assign(maj, { statut: "delivre", livre_at: maintenant.toISOString(), html: null, texte: null, erreur: null });
      } else if (s.statut === "refuse") {
        bilan.refuses++;
        Object.assign(maj, { statut: "refuse", erreur: `${s.evenement}${s.raison ? ` : ${s.raison}` : ""}` });
      } else if (l.html && (s.statut === "a_reessayer" || (!brevo.sans_credit && Date.parse(l.accepte_at ?? "") < Date.now() - ATTENTE_MAX_MS))) {
        bilan.remis_en_file++;
        Object.assign(maj, {
          statut: "en_file", prochain_essai_at: new Date(maintenant.getTime() + delaiEssai(l.tentatives)).toISOString(),
          erreur: s.statut === "a_reessayer" ? `${s.evenement}${s.raison ? ` : ${s.raison}` : ""}` : `pas délivré après 6 h (${s.evenement ?? "aucun événement"})`,
        });
      } else bilan.en_attente++;
      await supabase.from("emails_envois").update(maj).eq("id", l.id);
    }
  }
  return { ok: true, ...bilan };
}

async function etat(supabase: Supabase) {
  const brevo = await releverBrevo(supabase);
  const compter = async (statut: string) => {
    const { count } = await supabase.from("emails_envois").select("id", { count: "exact", head: true }).eq("statut", statut);
    return count ?? 0;
  };
  return {
    ok: true, brevo: { cle_absente: !!brevo.cle_absente, credits: brevo.credits ?? null, sans_credit: !!brevo.sans_credit, erreur: brevo.erreur ?? null, plan: brevo.plan ?? null },
    journal: { en_file: await compter("en_file"), accepte: await compter("accepte"), delivre: await compter("delivre"), refuse: await compter("refuse"), abandonne: await compter("abandonne") },
  };
}

// ---------------------------------------------------------------------------
// L'email de rattrapage du 13/11 : délivré ou non, et le renvoi
// ---------------------------------------------------------------------------

interface Destinataire {
  poster_id: string;
  prenom: string | null;
  email: string;
}

/** Les destinataires de l'email de rattrapage (ruul_parcours_envois, cle rattrapage:<lundi>, ok). */
async function destinatairesRattrapage(supabase: Supabase, cle: string): Promise<Destinataire[]> {
  const { data: envois, error } = await supabase.from("ruul_parcours_envois").select("poster_id").eq("cle", cle).eq("ok", true).limit(500);
  if (error) throw error;
  const ids = new Set(((envois ?? []) as { poster_id: string }[]).map((e) => e.poster_id));
  const { data: etats, error: errE } = await supabase.rpc("ruul_parcours_etat");
  if (errE) throw errE;
  const parId = new Map(((etats ?? []) as { poster_id: string; prenom: string | null; email: string | null }[]).map((e) => [e.poster_id, e]));
  const manquants = [...ids].filter((id) => !parId.get(id)?.email);
  const emails = new Map<string, string>();
  if (manquants.length) {
    const { data: profils } = await supabase.from("profiles").select("id, email_perso, ruul_email").in("id", manquants);
    for (const p of (profils ?? []) as { id: string; email_perso: string | null; ruul_email: string | null }[]) {
      const e = p.email_perso ?? p.ruul_email;
      if (e) emails.set(p.id, e);
    }
  }
  return [...ids].map((id) => ({ poster_id: id, prenom: parId.get(id)?.prenom ?? null, email: (parId.get(id)?.email ?? emails.get(id) ?? "").trim() }))
    .filter((d) => d.email);
}

const minuscule = (s: string | undefined | null) => (s ?? "").trim().toLowerCase();

/** Pour chaque destinataire : ses emails de rattrapage du jour chez Brevo, et leur livraison. */
async function etatRattrapage(supabase: Supabase, cle: string, jour: string) {
  const dest = await destinatairesRattrapage(supabase, cle);
  // Tous les événements du jour taggés « rattrapage » (une page de 2500 suffit pour ~100 emails).
  const tous: EvenementBrevo[] = [];
  for (let offset = 0; offset < 10_000; offset += 2500) {
    const p = new URLSearchParams({ limit: "2500", offset: String(offset), startDate: jour, endDate: jour, tags: "rattrapage", sort: "desc" });
    const r = await brevoGet(`/smtp/statistics/events?${p}`);
    if (!r.ok) throw new Error(`Brevo (événements) : ${r.erreur}`);
    const ev = ((r.data as { events?: EvenementBrevo[] } | null)?.events ?? []) as EvenementBrevo[];
    tous.push(...ev);
    if (ev.length < 2500) break;
  }
  const parEmail = new Map<string, EvenementBrevo[]>();
  for (const e of tous) {
    const k = minuscule(e.email);
    parEmail.set(k, [...(parEmail.get(k) ?? []), e]);
  }
  // Ceux que le filtre par tag n'a pas trouvés : par adresse, les emails du jour dont l'objet est celui du rattrapage.
  for (const d of dest.filter((x) => !parEmail.has(minuscule(x.email)))) {
    const r = await evenementsBrevo({ email: d.email, startDate: jour, endDate: jour });
    if (!r.ok) continue;
    const ev = r.evenements.filter((e) => /what's left before you start/i.test(e.subject ?? "") || /rattrapage/i.test(e.tag ?? ""));
    if (ev.length) parEmail.set(minuscule(d.email), ev);
  }
  return dest.map((d) => {
    let ev = parEmail.get(minuscule(d.email)) ?? [];
    // Plusieurs envois (renvoi) : on regarde le dernier message.
    const messages = [...new Set(ev.map((e) => e.messageId).filter(Boolean))] as string[];
    const statutParMessage = messages.map((m) => ({ m, s: statutLivraison(ev.filter((e) => e.messageId === m)) }));
    const livre = statutParMessage.find((x) => x.s.statut === "delivre");
    const dernier = livre ?? statutParMessage[0];
    if (!livre && dernier) ev = ev.filter((e) => e.messageId === dernier.m);
    return {
      ...d,
      message_id: dernier?.m ?? null,
      envois_brevo: messages.length,
      statut: dernier ? dernier.s.statut : "inconnu_chez_brevo" as const,
      evenement: dernier?.s.evenement ?? null,
      raison: dernier?.s.raison ?? null,
      evenements: [...new Set(ev.map((e) => String(e.event)))],
    };
  });
}

async function verifierRattrapage(supabase: Supabase, body: { cle?: string; jour?: string }) {
  const cle = String(body?.cle ?? "rattrapage:2026-11-16");
  const jour = String(body?.jour ?? "2026-11-13");
  const liste = await etatRattrapage(supabase, cle, jour);
  // Le journal : une ligne par email de rattrapage (si elle n'existe pas déjà).
  const ids = liste.map((l) => l.message_id).filter(Boolean) as string[];
  const { data: deja } = ids.length ? await supabase.from("emails_envois").select("message_id").in("message_id", ids) : { data: [] };
  const connus = new Set(((deja ?? []) as { message_id: string }[]).map((x) => x.message_id));
  const statutJournal = (s: string) => (s === "delivre" ? "delivre" : s === "refuse" ? "refuse" : "accepte");
  const nouvelles = liste.filter((l) => l.message_id && !connus.has(l.message_id)).map((l) => ({
    destinataire: l.email, objet: "Rattrapage cohorte (13/11)", tags: ["ruul", "rattrapage"], statut: statutJournal(l.statut),
    message_id: l.message_id, dernier_evenement: l.evenement, erreur: l.statut === "delivre" ? null : `${l.evenement ?? "?"}${l.raison ? ` : ${l.raison}` : ""}`,
    tentatives: 1, cree_at: `${jour}T10:26:00Z`, accepte_at: `${jour}T10:26:00Z`, verifie_at: new Date().toISOString(),
    livre_at: l.statut === "delivre" ? new Date().toISOString() : null,
  }));
  if (nouvelles.length) {
    const { error } = await supabase.from("emails_envois").insert(nouvelles);
    if (error) throw error;
  }
  const compte = (s: string) => liste.filter((l) => l.statut === s).length;
  return {
    ok: true, cle, jour, total: liste.length,
    delivres: compte("delivre"), non_delivres: liste.length - compte("delivre"),
    detail: { en_attente: compte("en_attente"), a_reessayer: compte("a_reessayer"), refuses: compte("refuse"), inconnus_chez_brevo: compte("inconnu_chez_brevo") },
    evenements_vus: [...new Set(liste.flatMap((l) => l.evenements))],
    non_delivres_liste: liste.filter((l) => l.statut !== "delivre").map((l) => ({ poster_id: l.poster_id, prenom: l.prenom, email: l.email, statut: l.statut, evenement: l.evenement, raison: l.raison })),
  };
}

async function renvoyerRattrapage(supabase: Supabase, body: { cle?: string; jour?: string; confirmer?: boolean; max?: number }) {
  const cle = String(body?.cle ?? "rattrapage:2026-11-16");
  const jour = String(body?.jour ?? "2026-11-13");
  // Brevo doit avoir du crédit (sinon le renvoi se perdrait comme le premier).
  const brevo = await releverBrevo(supabase);
  if (brevo.cle_absente) return { ok: false, error: "BREVO_API_KEY manquant" };
  if (brevo.sans_credit) return { ok: false, error: `Brevo toujours sans crédit (${brevo.credits})` };
  const liste = (await etatRattrapage(supabase, cle, jour)).filter((l) => l.statut !== "delivre" && l.statut !== "refuse");
  if (body?.confirmer !== true) {
    return { ok: true, a_renvoyer: liste.length, credits: brevo.credits ?? null, liste: liste.map((l) => ({ prenom: l.prenom, email: l.email, statut: l.statut, evenement: l.evenement })) };
  }
  const max = Math.min(150, Math.max(1, Number(body?.max ?? 150)));
  let renvoyes = 0;
  const erreurs: { email: string; erreur: string }[] = [];
  for (const l of liste.slice(0, max)) {
    if (!l.message_id) { erreurs.push({ email: l.email, erreur: "aucun email de rattrapage connu chez Brevo" }); continue; }
    // Jamais deux fois : un renvoi déjà parti (journal) pour ce destinataire ?
    const { data: deja } = await supabase.from("emails_envois").select("id").eq("destinataire", l.email).contains("tags", ["rattrapage", "renvoi"]).in("statut", ["en_file", "accepte", "delivre"]).limit(1);
    if ((deja ?? []).length) continue;
    const c = await contenuBrevo(l.message_id);
    if ("erreur" in c) { erreurs.push({ email: l.email, erreur: c.erreur }); continue; }
    const r = await envoyerSuivi({ to: l.email, objet: c.objet, html: c.html, texte: texteDepuisHtml(c.html), stop: lienStopDansHtml(c.html) ?? "https://sophia-marketing-orga.vercel.app", tags: ["ruul", "rattrapage", "renvoi"] });
    if (r.ok) {
      renvoyes++;
      await supabase.from("emails_envois").update({ statut: "renvoye" }).eq("message_id", l.message_id).neq("statut", "delivre");
    } else erreurs.push({ email: l.email, erreur: r.erreur ?? "erreur" });
  }
  return { ok: true, renvoyes, erreurs, restants: Math.max(0, liste.length - max) };
}
