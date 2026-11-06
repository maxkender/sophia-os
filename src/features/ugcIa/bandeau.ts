// UGC IA : le bandeau style Snapchat (barre noire translucide sur toute la
// largeur, texte blanc centré), dessiné dans le navigateur à la taille exacte
// de la vidéo. La même image sert d'aperçu dans la page et part au serveur, qui
// la pose sur la vidéo (fal ffmpeg-api/compose) : ce qu'on voit est ce qu'on a.

/** Police système (San Francisco sur Mac/iPhone, comme Snapchat) puis emojis en couleur. */
export const POLICE_BANDEAU =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Hauteur par défaut du centre du bandeau, en % de la hauteur de la vidéo. */
export const POSITION_BANDEAU_DEFAUT = 40;

/** Taille de la vidéo selon la résolution demandée à Genjutsu, si le lecteur ne la donne pas. */
export function tailleSelonResolution(resolution: string): { largeur: number; hauteur: number } {
  if (resolution === "1080p") return { largeur: 1080, hauteur: 1920 };
  if (resolution === "480p") return { largeur: 480, hauteur: 854 };
  return { largeur: 720, hauteur: 1280 };
}

/** Coupe le texte en lignes qui tiennent dans la largeur (mots entiers ; les retours à la ligne sont gardés). */
export function couperLignes(texte: string, largeurMax: number, mesurer: (s: string) => number): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.split("\n")) {
    let ligne = "";
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (!ligne || mesurer(essai) <= largeurMax) ligne = essai;
      else {
        lignes.push(ligne);
        ligne = mot;
      }
    }
    if (ligne) lignes.push(ligne);
  }
  return lignes;
}

/**
 * La géométrie du bandeau, en pixels de la vidéo : taille du texte (≈ 2,25 %
 * de la hauteur, comme une légende Snapchat), interligne, marge serrée (une
 * ligne ≈ 1,7 fois la taille du texte) et position de la bande, centrée sur
 * `position` (% de la hauteur) sans sortir de l'image.
 */
export function geometrieBandeau(hauteur: number, nbLignes: number, position: number) {
  const taille = Math.max(12, Math.round(hauteur * 0.0225));
  const interligne = Math.round(taille * 1.25);
  const marge = Math.round(taille * 0.22);
  const hBande = nbLignes * interligne + 2 * marge;
  const centre = (Math.min(100, Math.max(0, position)) / 100) * hauteur;
  const y = Math.min(Math.max(0, Math.round(centre - hBande / 2)), Math.max(0, hauteur - hBande));
  return { taille, interligne, marge, hBande, y };
}

/** Dessine le bandeau sur un calque transparent de la taille de la vidéo. */
export function dessinerBandeau(ctx: CanvasRenderingContext2D, largeur: number, hauteur: number, texte: string, position: number): void {
  ctx.clearRect(0, 0, largeur, hauteur);
  const { taille } = geometrieBandeau(hauteur, 1, position);
  ctx.font = `400 ${taille}px ${POLICE_BANDEAU}`;
  const lignes = couperLignes(texte.trim(), largeur * 0.9, (s) => ctx.measureText(s).width);
  if (lignes.length === 0) return;
  const g = geometrieBandeau(hauteur, lignes.length, position);
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, g.y, largeur, g.hBande);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lignes.forEach((l, i) => ctx.fillText(l, largeur / 2, g.y + g.marge + g.interligne * (i + 0.5)));
}

/** Le bandeau en PNG transparent (data URL), prêt pour l'aperçu et pour le serveur. */
export function bandeauPng(largeur: number, hauteur: number, texte: string, position: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Ce navigateur ne sait pas dessiner le bandeau");
  dessinerBandeau(ctx, largeur, hauteur, texte, position);
  return canvas.toDataURL("image/png");
}
