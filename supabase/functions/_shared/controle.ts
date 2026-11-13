/**
 * 13/11 (Max) : page « Contrôle » (réglage `controle`, migration 0711). Tout ce que font le support et
 * les bots passe par ici : STOP général, mode de chaque agent et de chaque action (eteint | proposer | agir),
 * réponse du bot par canal. Le STOP ne touche pas l'onboarding (automation_pause garde ce rôle).
 * Une action inconnue (nouvelle) démarre en « proposer ».
 */
import type { serviceClient } from "./supabase.ts";

type Db = ReturnType<typeof serviceClient>;

export type Mode = "eteint" | "proposer" | "agir";
export type Agent = "cerveau_support" | "new_cohort_bot" | "control_bot" | "pay_bot" | "ruul_bot";
export type CanalControle = "help" | "slack" | "email" | "upwork";

export interface Controle {
  stop: boolean;
  agents: Partial<Record<Agent, Mode>>;
  canaux: Partial<Record<CanalControle, boolean>>;
  actions: Record<string, Mode>;
  pay: { plafond_milestone: number; plafond_jour: number };
}

const MODES: readonly Mode[] = ["eteint", "proposer", "agir"];

/** Réglage illisible ou absent : rien ne change par rapport à avant (support en « agir »), le reste en « proposer ». */
export const CONTROLE_DEFAUT: Controle = {
  stop: false,
  agents: { cerveau_support: "agir" },
  canaux: { help: true, slack: true, email: true, upwork: true },
  actions: {},
  pay: { plafond_milestone: 30, plafond_jour: 300 },
};

export function lireValeurControle(v: unknown): Controle {
  if (!v || typeof v !== "object") return CONTROLE_DEFAUT;
  const o = v as Record<string, unknown>;
  const modes = (x: unknown): Record<string, Mode> => {
    const r: Record<string, Mode> = {};
    if (x && typeof x === "object") {
      for (const [k, m] of Object.entries(x as Record<string, unknown>)) if (MODES.includes(m as Mode)) r[k] = m as Mode;
    }
    return r;
  };
  const canaux: Partial<Record<CanalControle, boolean>> = {};
  if (o.canaux && typeof o.canaux === "object") {
    for (const [k, b] of Object.entries(o.canaux as Record<string, unknown>)) if (typeof b === "boolean") canaux[k as CanalControle] = b;
  }
  const pay = (o.pay && typeof o.pay === "object" ? o.pay : {}) as Record<string, unknown>;
  const nombre = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : d);
  return {
    stop: o.stop === true,
    agents: modes(o.agents),
    canaux,
    actions: modes(o.actions),
    pay: { plafond_milestone: nombre(pay.plafond_milestone, 30), plafond_jour: nombre(pay.plafond_jour, 300) },
  };
}

export async function lireControle(db: Db): Promise<Controle> {
  try {
    const { data, error } = await db.from("reglages").select("valeur").eq("cle", "controle").maybeSingle();
    if (error) throw new Error(error.message);
    return lireValeurControle(data?.valeur);
  } catch (e) {
    // Réglage illisible : prudence pour ce qui est nouveau (« proposer »), le support garde son comportement.
    console.warn(`[controle] réglage illisible : ${e instanceof Error ? e.message : String(e)}`);
    return CONTROLE_DEFAUT;
  }
}

/** Le mode d'un agent (le STOP général éteint tout). Agent inconnu : « proposer ». */
export function modeAgent(c: Controle, agent: string): Mode {
  if (c.stop) return "eteint";
  return c.agents[agent as Agent] ?? (agent === "cerveau_support" ? "agir" : "proposer");
}

/** Le mode d'une action. Une action nouvelle (absente du réglage) démarre en « proposer ». */
export function modeAction(c: Controle, action: string | null | undefined): Mode {
  if (!action) return "agir";
  if (c.stop) return "eteint";
  return c.actions[action] ?? "proposer";
}

/** Le bot répond-il sur ce canal ? (STOP : non.) Canal inconnu : oui. */
export function canalActif(c: Controle, canal: string | null | undefined): boolean {
  if (c.stop) return false;
  return c.canaux[(canal ?? "help") as CanalControle] !== false;
}

/** Les canaux de Support ramenés aux 4 canaux de la page. */
export function canalDeSource(source: string | null | undefined): CanalControle {
  if (source === "email") return "email";
  if (source === "upwork") return "upwork";
  if (source === "slack" || source === "slack_salon" || source === "slack_aide") return "slack";
  return "help";
}

export interface DecisionControlable {
  niveau: string;
  reponse: string;
  action: string | null;
  action_valeur: string | null;
  raison: string;
}

export interface ResultatControle {
  /** La réponse du bot gardée en brouillon pour Max (elle ne part pas). */
  brouillon: string | null;
  /** L'action que le bot voulait faire : proposée à Max (un clic dans la Boîte). */
  action_proposee: { action: string; valeur: string | null } | null;
  /** Le canal est coupé (ou STOP) : aucun message automatique sur ce canal, même « We're checking ». */
  muet: boolean;
}

/**
 * Applique la page Contrôle à une décision du bot (modifie `d`). Ce qui n'est pas en « agir » ne part
 * pas : la demande va à Max avec le brouillon et, s'il y a lieu, l'action proposée.
 */
export function appliquerControle(c: Controle, d: DecisionControlable, canal: CanalControle, texteAttente: string): ResultatControle {
  const res: ResultatControle = { brouillon: null, action_proposee: null, muet: !canalActif(c, canal) };
  if (d.niveau !== "bot") return res;
  const agent = modeAgent(c, "cerveau_support");
  const action = d.action;
  const mAction = modeAction(c, action);
  const bloque = agent !== "agir" ? `bot en « ${agent} »` : res.muet ? `canal ${canal} coupé` : action && mAction !== "agir" ? `action ${action} en « ${mAction} »` : null;
  if (!bloque) return res;
  res.brouillon = d.reponse;
  if (action && mAction !== "eteint" && agent !== "eteint") res.action_proposee = { action, valeur: d.action_valeur };
  d.niveau = "max";
  d.reponse = texteAttente;
  d.action = null;
  d.action_valeur = null;
  d.raison = `${d.raison} (Contrôle : ${bloque} → brouillon pour Max)`.trim();
  return res;
}

export interface LigneJournal {
  qui: string;
  quoi: string;
  mode?: "agir" | "proposer" | "bloque";
  poster_id?: string | null;
  canal?: string | null;
  montant?: number | null;
  resultat?: string | null;
  details?: Record<string, unknown>;
  annulable?: boolean;
  demande_id?: string | null;
}

/** Une ligne du journal de la page Contrôle. Ne lève jamais (le journal ne doit rien bloquer). */
export async function journaliser(db: Db, l: LigneJournal): Promise<string | null> {
  try {
    const { data, error } = await db.from("journal_auto").insert({
      qui: l.qui, quoi: l.quoi, mode: l.mode ?? "agir", poster_id: l.poster_id ?? null, canal: l.canal ?? null,
      montant: l.montant ?? null, resultat: l.resultat?.slice(0, 500) ?? null, details: l.details ?? {}, annulable: l.annulable ?? false,
      demande_id: l.demande_id ?? null,
    }).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.id as string | undefined) ?? null;
  } catch (e) {
    console.warn(`[controle] journal : ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
