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
  erreur: string | null;
}

const URL_TIKTOK = /https?:\/\/(?:www\.|m\.|vm\.)?tiktok\.com\/[^\s,;]+/gi;
const PROFIL = /tiktok\.com\/@([A-Za-z0-9._]{1,40})/i;
const POST = /\/(?:video|photo)\/\d{8,25}/;
const SNAKE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;
const NOUVEAU = /\b(?:nouveau|new)\s+label\s+([a-z0-9]+(?:_[a-z0-9]+)*)/i;
const MOTS_VIDES = new Set(["pour", "for", "label", "app", "+", "et", "and", "-", "–"]);

export function handleDe(texte: string): string | null {
  const m = texte.match(PROFIL) ?? texte.trim().match(/^@([A-Za-z0-9._]{1,40})$/);
  return m ? m[1]!.toLowerCase() : null;
}

export function lireLigne(ligne: string, apps: AppBible[], labels: LabelBible[], appsAttenteConnues: string[] = []): LigneLue {
  const urls = [...ligne.matchAll(URL_TIKTOK)].map((m) => m[0]!.replace(/[).,;:]+$/, ""));
  let reste = ligne.replace(URL_TIKTOK, " ");
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
    const app = apps.find((a) => a.slug.toLowerCase() === bas || a.nom.toLowerCase() === bas);
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
    ligne, handle, profilUrl: handle ? profil ?? `https://www.tiktok.com/@${handle}` : null, posts, appIds, appsAttente,
    labelId, labelPropose, autres, note,
    erreur: handle ? null : "aucun lien de profil TikTok sur cette ligne",
  };
}

export function lireLignes(texte: string, apps: AppBible[], labels: LabelBible[], appsAttenteConnues: string[] = []): LigneLue[] {
  return texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => lireLigne(l, apps, labels, appsAttenteConnues));
}

/** Un nom de label proposé au bon format (snake_case). */
export function nomLabelValide(nom: string): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(nom) && nom.length <= 60;
}
