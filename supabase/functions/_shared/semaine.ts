/**
 * Système du 2 nov., partie D : la semaine de posts. Rien ici ne touche la
 * base ni le réseau.
 *
 *   lundi  10 h (heure du pays) : un message à chaque posteur, une fois.
 *          À tous : la règle du lien. Nouvelle cohorte prête : « You start
 *          posting today ». Nouvelle cohorte pas prête : ce qui manque.
 *   jeudi  12 h (heure du pays) : posts ou liens manquants de lundi à
 *          mercredi → un Nudge, une fois (remplace le mercredi). Prompt 21,
 *          C7 : un seul nudge, à tous ceux qui ont un problème, sans compte à
 *          rebours de Kill ; les recrues du lundi suivant pas encore prêtes
 *          reçoivent jeudi_texte_recrue.
 * Les deux : entre 10 h et 20 h heure du pays, seulement le jour même.
 */
import { ajouterJours, partiesLocales } from "./relances.ts";
import { dateAnglaise, type EtatAccueil, texteCeQuiManque } from "./etapes.ts";

export interface TextesLundi {
  tous: string;
  cohorte: string;
  warmup: string;
}

export interface PosteurSemaine {
  poster_id: string;
  prenom: string | null;
  fuseau: string;
  slack_user_id: string | null;
  contrat_id: string | null;
  cohorte_lundi: string | null;
  /** Posts prévus de lundi à mercredi (comptes perso actifs). */
  attendus_lun_mer: number;
  /** Ceux marqués publiés avec leur lien. */
  faits_lun_mer: number;
  /** Prévus cette semaine (lundi à dimanche) : il poste cette semaine. */
  prevus_semaine: number;
  /** Les messages de la semaine déjà partis (nudges), par type. */
  envoyes: string[];
  /** Les messages de la semaine déjà prévus en test (relances_prevues), par type. */
  prevus_test: string[];
}

/** Le jour local est-il `jour`, entre `heure` et `fin` (heure du pays) ? */
export function dansCreneau(maintenant: Date, fuseau: string, jour: string, heure: number, fin: number): boolean {
  const l = partiesLocales(maintenant, fuseau);
  return l.date === jour && l.heure >= heure && l.heure < fin;
}

/** Le message du lundi est dû : lundi, 10 h-20 h heure du pays, pas encore parti. */
export function lundiDu(p: PosteurSemaine, lundi: string, maintenant: Date, o: { debut: number; fin: number }): boolean {
  if (p.envoyes.includes("lundi")) return false;
  if (p.prevus_semaine === 0 && p.cohorte_lundi !== lundi) return false;
  return dansCreneau(maintenant, p.fuseau, lundi, o.debut, o.fin);
}

/**
 * Le Nudge du jeudi est dû : un compte du posteur sous `seuil` posts avec lien
 * de lundi à aujourd'hui inclus (compté compte par compte : `postsMin` est le
 * plus bas). À 6 ou plus, jamais le texte « below 6 ». null : rien cette semaine.
 */
export function jeudiDu(
  p: PosteurSemaine,
  lundi: string,
  maintenant: Date,
  o: { heure: number; fin: number },
  postsMin: number | null,
  seuil = 6,
): boolean {
  if (p.envoyes.includes("jeudi")) return false;
  if (postsMin === null || postsMin >= seuil) return false;
  return dansCreneau(maintenant, p.fuseau, ajouterJours(lundi, 3), o.heure, o.fin);
}

/**
 * Prompt 21, C7 : le nudge du jeudi d'une recrue du lundi suivant pas encore
 * prête (le 1er compte, pas un 2e compte de Double) : jeudi, entre `heure` et
 * `fin` (heure du pays). Une fois : la ligne `nudges` (type jeudi_recrue) est
 * unique par semaine.
 */
export function jeudiRecrueDu(
  x: { cohorte_lundi: string; fuseau: string; deuxieme?: boolean },
  lundi: string,
  maintenant: Date,
  o: { heure: number; fin: number },
): boolean {
  if (x.deuxieme || x.cohorte_lundi !== ajouterJours(lundi, 7)) return false;
  return dansCreneau(maintenant, x.fuseau, ajouterJours(lundi, 3), o.heure, o.fin);
}

/**
 * Ce qui manque encore à une recrue, en anglais : la 1re étape pas faite
 * (connexion, compte TikTok, Start warmup, puis le warm-up lui-même).
 * null : tout est fait.
 */
export function ceQuiManqueRecrue(
  etats: EtatAccueil[],
  o: { url: string; handle: string | null; warmupClique?: boolean },
): string | null {
  const e = etats.find((x) => !x.fait);
  if (!e) return null;
  if (e.etape === "connexion") return `log in to your dashboard (${o.url})`;
  const handle = o.handle ? o.handle.replace(/^@/, "") : null;
  // Start warmup cliqué mais @ introuvable : jamais « create your account », on demande le bon @.
  if (e.etape === "tiktok" && o.warmupClique) {
    return handle
      ? `check that your TikTok account is exactly @${handle} (we can't find it); if not, reply with your exact @`
      : "reply with the exact @ of your TikTok account";
  }
  if (e.etape === "tiktok") return `create your TikTok account${handle ? ` @${handle}` : ""}`;
  if (e.etape === "warmup_lance") return 'click "Start warmup" on your dashboard, then follow 5 accounts';
  return texteCeQuiManque(e.manque, e.followsManquants);
}

const remplir = (modele: string, vars: Record<string, string>) =>
  modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout)).trim();

/**
 * Le message du lundi : la règle à tous ; en plus, pour la nouvelle cohorte,
 * « You start posting today » si elle est prête, sinon ce qui manque (jamais
 * les deux : ils se contredisent).
 */
export function texteLundi(
  t: TextesLundi,
  o: { prenom: string | null; nouvelleCohorte: boolean; ceQuiManque: string | null },
): string {
  const vars = { prenom: (o.prenom ?? "").trim() || "there", ce_qui_manque: o.ceQuiManque ?? "" };
  const morceaux = [remplir(t.tous, vars)];
  if (o.nouvelleCohorte) morceaux.push(remplir(o.ceQuiManque ? t.warmup : t.cohorte, vars));
  return morceaux.filter(Boolean).join("\n\n");
}

export function texteJeudi(modele: string, o: { prenom: string | null; faits: number; attendus: number }): string {
  return remplir(modele, {
    prenom: (o.prenom ?? "").trim() || "there",
    faits: String(o.faits),
    attendus: String(o.attendus),
  });
}

/** C7 : « Hi {prenom}, you start on Monday {date} only if … Still missing: {ce_qui_manque}. » */
export function texteJeudiRecrue(
  modele: string,
  o: { prenom: string | null; cohorte_lundi: string; ceQuiManque: string },
): string {
  return remplir(modele, {
    prenom: (o.prenom ?? "").trim() || "there",
    date: dateAnglaise(o.cohorte_lundi),
    ce_qui_manque: o.ceQuiManque,
  });
}

// ---------------------------------------------------------------------------
// Le check du lundi soir (pipeline, partie 2) : 1er jour de posts, 20 h heure
// du pays, aucun post publié avec son lien → un message sur Upwork, une fois.
// 48 h après, ni post ni réponse → Kill (comme pendant l'accueil).
// ---------------------------------------------------------------------------

export interface PosteurLundiSoir {
  poster_id: string;
  compte_id: string | null;
  deuxieme: boolean;
  prenom: string | null;
  fuseau: string;
  contrat_id: string | null;
  /** Posts publiés avec leur lien ce lundi (le compte de la carte). */
  publies_lundi: number;
  /** Le dernier post publié (avec lien), pour savoir s'il a posté depuis le message. */
  dernier_post_at: string | null;
  message_at: string | null;
  message_id: string | null;
  message_erreur: string | null;
  /** En test : le 1er passage où le message était prévu. */
  prevu_at: string | null;
  repondu_at: string | null;
  kill_id: string | null;
  kill_statut: string | null;
}

/** Le check du lundi soir part à minuit, heure de Paris (prompt 25 MAJ, 15) : le mardi de 0 h à 6 h à Paris. */
export const FIN_LUNDI_SOIR_PARIS = 6;

/** Le message du lundi soir est dû : lundi fini à Paris (mardi 0 h-6 h, Paris), aucun post, pas encore parti. */
export function lundiSoirDu(p: PosteurLundiSoir, lundi: string, maintenant: Date, test: boolean): boolean {
  if (p.publies_lundi > 0 || p.message_at || (test && p.prevu_at)) return false;
  return dansCreneau(maintenant, "Europe/Paris", ajouterJours(lundi, 1), 0, FIN_LUNDI_SOIR_PARIS);
}

/** Une réaction depuis le message : un post publié, ou une réponse. */
export function reactionLundiSoir(p: PosteurLundiSoir, envoyeAt: Date): boolean {
  const apres = (iso: string | null) => iso !== null && Date.parse(iso) >= envoyeAt.getTime();
  return apres(p.dernier_post_at) || apres(p.repondu_at);
}

/** Le Kill du lundi soir : `kill_h` heures après le message, sans post ni réponse. */
export function killLundiSoir(p: PosteurLundiSoir, envoyeAt: Date | null, maintenant: Date, killH: number): boolean {
  if (!envoyeAt || reactionLundiSoir(p, envoyeAt)) return false;
  return maintenant.getTime() >= envoyeAt.getTime() + killH * 3_600_000;
}

export function texteLundiSoir(modele: string, prenom: string | null): string {
  return remplir(modele, { prenom: (prenom ?? "").trim() || "there" });
}
