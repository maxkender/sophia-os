// Usage : POD_JETON=… node atelier/cli-couper.ts <source_id> <id_tiktok|fichier.mp4> <début_s> <fin_s>
// Télécharge la vidéo (depuis donnees/recherche.json) ou prend un MP4 local,
// coupe la RÉACTION seule (sans la démo), sans son ni métadonnées, extrait une
// image de la première seconde (sortie/<source_id>/frame.jpg, à donner à Nano
// Banana pour l'image de départ), puis envoie la coupe vers
// sources/<source_id>/reaction.mp4 : c'est la vidéo de mouvement de Kling.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { envoyer } from "./api.ts";

const [sourceId, origine, debut, fin] = process.argv.slice(2);
if (!sourceId || !origine || debut === undefined || fin === undefined) throw new Error("usage : couper <source_id> <id_tiktok|fichier.mp4> <début_s> <fin_s>");
if (!/^[a-z0-9_-]{3,60}$/i.test(sourceId)) throw new Error("source_id : a-z0-9_- (3 à 60)");
const duree = Number(fin) - Number(debut);
if (!(duree >= 3 && duree <= 10)) throw new Error("la réaction doit durer entre 3 et 10 s (Kling motion control)");

const dossier = `sortie/${sourceId}`;
mkdirSync(dossier, { recursive: true });
let brut = origine;
if (!origine.endsWith(".mp4")) {
  const liste = JSON.parse(readFileSync("donnees/recherche.json", "utf8")) as { id: string; video: string | null }[];
  const v = liste.find((x) => x.id === origine);
  if (!v?.video) throw new Error(`${origine} : pas de vidéo téléchargeable dans donnees/recherche.json`);
  brut = `${dossier}/brut.mp4`;
  const r = await fetch(v.video);
  if (!r.ok) throw new Error(`téléchargement : HTTP ${r.status}`);
  writeFileSync(brut, Buffer.from(await r.arrayBuffer()));
}
if (!existsSync(brut)) throw new Error(`${brut} introuvable`);
const coupe = `${dossier}/reaction.mp4`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(debut), "-to", String(fin), "-i", brut, "-an", "-map_metadata", "-1", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", coupe]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.3", "-i", coupe, "-frames:v", "1", "-q:v", "2", `${dossier}/frame.jpg`]);
const { url } = await envoyer(`sources/${sourceId}/reaction.mp4`, coupe);
console.log(`coupe : ${coupe} (${duree}s) · image : ${dossier}/frame.jpg`);
console.log(`vidéo de mouvement : ${url}`);
