/**
 * 18/11 (Max) : l'ajout en masse de la Bible. Une ligne par compte, au format que Max utilise déjà :
 *   « pour sophia clean_girl : https://www.tiktok.com/@crushedethereal »
 *   « alpha_male, mettre running dessus : https://www.tiktok.com/@trusttheprocces1 »
 *   « nouveau label anxiety_run : https://www.tiktok.com/@sydneysynced »
 * Le lien donne le handle ; l'app et le label sont reconnus s'ils existent (sinon proposition de nouveau
 * label) ; le reste du texte va dans la note pour l'import. Rien n'est enregistré : c'est un aperçu.
 */
import type { AppBible, LabelBible, RegleSujet } from "./types";

export interface LigneLue {
  ligne: string;
  handle: string | null;
  profilUrl: string | null;
  posts: string[];
  appIds: string[];
  appsAttente: string[];
  labelId: string | null;
  /** Un nom de label qui n'existe pas encore : proposé. */
  labelPropose: string | null;
  /** Les autres labels de la ligne (compte polyvalent). */
  autres: RegleSujet[];
  note: string;
  /** Liens courts (vm.tiktok.com…) à résoudre avant d'enregistrer. */
  courts: string[];
  /** Ligne sans lien TikTok (texte libre, Instagram…) : ignorée, montrée à part. */
  ignoree: boolean;
  erreur: string | null;
}

const URL_TIKTOK = /https?:\/\/(?:www\.|m\.|vm\.|vt\.)?tiktok\.com\/[^\s,;]+/gi;
const COURT = /^https?:\/\/(?:(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+|(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9]+)\/?$/i;
const PROFIL = /tiktok\.com\/@([A-Za-z0-9._]{1,40})/i;
const POST = /\/(?:video|photo)\/\d{8,25}/;
const SNAKE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;
const NOUVEAU = /\b(?:nouveau|new)\s+label\s+([a-z0-9]+(?:_[a-z0-9]+)*)/i;
const MOTS_VIDES = new Set(["pour", "for", "label", "app", "+", "et", "and", "-", "–"]);
/** Anciens noms d'une application : « runvik » était le nom de travail d'Atala (running) jusqu'au 19/11. */
const ALIAS_APPS: Record<string, string> = { runvik: "atala" };

/**
 * 20/11 (Max) : un lien de TikTok (vidéo, photo, ou profil avec ?lang=…) devient le lien du compte : on coupe au
 * handle (« https://www.tiktok.com/@x/video/123?… » → « https://www.tiktok.com/@x »). Les liens courts (vm.tiktok.com)
 * n'ont pas de handle : ils restent tels quels (résolus à l'ajout).
 */
export function lienCompte(texte: string): string {
  return texte.replace(/https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,40})[^\s,;]*/gi, (_m, h: string) => `https://www.tiktok.com/@${h.toLowerCase()}`);
}

export function handleDe(texte: string): string | null {
  const m = texte.match(PROFIL) ?? texte.trim().match(/^@([A-Za-z0-9._]{1,40})$/);
  return m ? m[1]!.toLowerCase() : null;
}

export function lireLigne(ligne: string, apps: AppBible[], labels: LabelBible[], appsAttenteConnues: string[] = []): LigneLue {
  const urls = [...ligne.matchAll(URL_TIKTOK)].map((m) => m[0]!.replace(/[).,;:]+$/, ""));
  let reste = ligne.replace(URL_TIKTOK, " ");
  const courts = urls.filter((u) => COURT.test(u));
  const profil = urls.find((u) => PROFIL.test(u) && !POST.test(u)) ?? null;
  const posts = urls.filter((u) => POST.test(u)).slice(0, 3);
  let handle = handleDe(profil ?? posts[0] ?? "");
  if (!handle) {
    const at = reste.match(/(?:^|\s)@([A-Za-z0-9._]{1,40})/);
    if (at) {
      handle = at[1]!.toLowerCase();
      reste = reste.replace(at[0], " ");
    }
  }

  const appIds: string[] = [];
  const appsAttente: string[] = [];
  let labelId: string | null = null;
  let labelPropose: string | null = null;
  const autres: RegleSujet[] = [];
  let appCourante: string | null = null;

  const nouveau = reste.match(NOUVEAU);
  if (nouveau) {
    labelPropose = nouveau[1]!.toLowerCase();
    reste = reste.replace(nouveau[0], " ");
  }

  const gardes: string[] = [];
  for (const brut of reste.split(/\s+/)) {
    const mot = brut.replace(/^[,;:()]+|[,;:()]+$/g, "");
    const bas = mot.toLowerCase();
    if (!bas) continue;
    const cleApp = ALIAS_APPS[bas] ?? bas;
    const app = apps.find((a) => a.slug.toLowerCase() === cleApp || a.nom.toLowerCase() === cleApp);
    if (app) {
      if (!appIds.includes(app.id)) appIds.push(app.id);
      appCourante = app.nom;
      continue;
    }
    const attente = appsAttenteConnues.find((a) => a.toLowerCase().split(/[\s–-]+/)[0] === bas);
    if (attente) {
      if (!appsAttente.includes(attente)) appsAttente.push(attente);
      appCourante = attente;
      continue;
    }
    const label = labels.find((l) => l.nom.toLowerCase() === bas);
    if (label || SNAKE.test(bas)) {
      const nom = label?.nom ?? bas;
      if (!labelId && !labelPropose) {
        if (label) labelId = label.id;
        else labelPropose = bas;
      } else {
        autres.push({ sujet: appCourante ?? "", app: appCourante ?? "", label: nom });
      }
      if (label && !appIds.length) {
        for (const a of label.apps) if (!appIds.includes(a)) appIds.push(a);
      }
      continue;
    }
    if (MOTS_VIDES.has(bas)) continue;
    gardes.push(mot);
  }
  const note = gardes.join(" ").replace(/\s+([,.;:!?])/g, "$1").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "").trim();
  return {
    ligne, handle, profilUrl: handle ? `https://www.tiktok.com/@${handle}` : null, posts, appIds, appsAttente,
    labelId, labelPropose, autres, note, courts,
    ignoree: !handle && !courts.length,
    erreur: handle || courts.length ? null : "pas un lien TikTok : ligne ignorée",
  };
}

export function lireLignes(texte: string, apps: AppBible[], labels: LabelBible[], appsAttenteConnues: string[] = []): LigneLue[] {
  return texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => lireLigne(l, apps, labels, appsAttenteConnues));
}

/** Un nom de label proposé au bon format (snake_case). */
export function nomLabelValide(nom: string): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(nom) && nom.length <= 60;
}

/** Le compte et le post d'un lien court résolu (https://www.tiktok.com/@x/video/123). */
export function appliquerResolution(l: LigneLue, resolus: Record<string, string | null>): LigneLue {
  if (!l.courts.length) return l;
  const vrais = l.courts.map((c) => resolus[c]).filter((u): u is string => Boolean(u));
  if (!vrais.length) return l.handle ? l : { ...l, erreur: "lien court illisible", ignoree: false };
  const handle = l.handle ?? handleDe(vrais[0]!);
  const posts = [...l.posts, ...vrais.filter((u) => POST.test(u))].slice(0, 3);
  return { ...l, handle, profilUrl: handle ? `https://www.tiktok.com/@${handle}` : null, posts, erreur: handle ? null : "lien court illisible" };
}

/** Plusieurs lignes du même compte (ex. un lien par post) : une seule fiche, posts et notes réunis. */
export function fusionner(lignes: LigneLue[]): LigneLue[] {
  const out: LigneLue[] = [];
  for (const l of lignes) {
    const deja = l.handle ? out.find((x) => x.handle === l.handle) : null;
    if (!deja) {
      out.push(l);
      continue;
    }
    deja.posts = [...new Set([...deja.posts, ...l.posts])].slice(0, 3);
    deja.appIds = [...new Set([...deja.appIds, ...l.appIds])];
    deja.appsAttente = [...new Set([...deja.appsAttente, ...l.appsAttente])];
    deja.labelId ??= l.labelId;
    if (!deja.labelId) deja.labelPropose ??= l.labelPropose;
    deja.note = [deja.note, l.note].filter(Boolean).join(" ; ");
    deja.ligne = `${deja.ligne}\n${l.ligne}`;
  }
  return out;
}
