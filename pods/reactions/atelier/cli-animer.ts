// Usage : POD_JETON=… node atelier/cli-animer.ts <source_id> [--standard] [--oui]
// Pour chaque compte de livraisons/<source_id>.json : envoie son image de
// départ (sources/<source_id>/<compte>.jpg), demande à Kling 2.6 motion
// control (pod-labo, fal) d'animer le persona sur le mouvement de la réaction
// source, attend, télécharge et retire les métadonnées :
// sortie/<source_id>/<compte>.mp4. Un compte déjà animé est sauté.
// Sans --oui : n'envoie rien, affiche seulement le coût estimé.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { appelLabo, appelPod, envoyer, lireLivraison, type Compte } from "./api.ts";

/** Coût estimé d'une vidéo (fal, Kling 2.6 motion control, réaction ≤ 10 s). */
const COUT = { pro: 0.5, standard: 0.3 };

const args = process.argv.slice(2);
const sourceId = args.find((a) => !a.startsWith("--"));
if (!sourceId) throw new Error("usage : animer <source_id> [--standard] [--oui]");
const qualite = args.includes("--standard") ? "standard" : "pro";
const l = lireLivraison(sourceId);
const dossier = `sortie/${sourceId}`;
if (!existsSync(`${dossier}/reaction.mp4`)) throw new Error(`${dossier}/reaction.mp4 absent : lancer couper d'abord`);

const r = await appelPod<{ comptes: Compte[] }>({ action: "comptes" });
if (!r.ok) throw new Error(r.error);
const personas = new Map(r.comptes.map((c) => [c.id, c.persona?.statut ?? null]));
const aFaire = l.comptes.filter((c) => !existsSync(`${dossier}/${c.compte_id}.mp4`));
for (const c of aFaire) {
  if (personas.get(c.compte_id) !== "valide") throw new Error(`${c.compte_id} : persona non validé, rien n'est lancé`);
  if (!existsSync(c.depart)) throw new Error(`${c.compte_id} : image de départ ${c.depart} introuvable`);
}
const estime = aFaire.length * COUT[qualite];
console.log(`${aFaire.length} vidéo(s) à animer (${l.comptes.length - aFaire.length} déjà faite(s)) · ${qualite} · ≈ $${estime.toFixed(2)} sur fal`);
if (!args.includes("--oui")) {
  console.log("Rien n'est lancé. Annoncer le coût à l'humain, puis relancer avec --oui.");
  process.exit(0);
}

const video_url = `${(await envoyer(`sources/${sourceId}/reaction.mp4`, `${dossier}/reaction.mp4`)).url}?v=${Date.now()}`;
const journal = "donnees/depenses.json";
const depenses = existsSync(journal) ? (JSON.parse(readFileSync(journal, "utf8")) as unknown[]) : [];

const jobs = [];
for (const c of aFaire) {
  const ext = c.depart.toLowerCase().endsWith(".png") ? "png" : "jpg";
  const { url } = await envoyer(`sources/${sourceId}/${c.compte_id}.${ext}`, c.depart);
  const s = await appelLabo<{ request_id: string | null; detail?: unknown }>({
    action: "soumettre",
    qualite,
    image_url: `${url}?v=${Date.now()}`,
    video_url,
    ...(l.prompt ? { prompt: l.prompt } : {}),
  });
  if (!s.ok || !s.request_id) {
    console.error(`${c.compte_id} : refusé ${JSON.stringify(s.detail ?? s.error).slice(0, 300)}`);
    continue;
  }
  depenses.push({ le: new Date().toISOString(), source_id: sourceId, compte_id: c.compte_id, qualite, estime: COUT[qualite], request_id: s.request_id });
  writeFileSync(journal, JSON.stringify(depenses, null, 2));
  jobs.push({ compte: c.compte_id, id: s.request_id });
  console.log(`${c.compte_id} : lancé (${s.request_id})`);
}

for (const j of jobs) {
  let url: string | null = null;
  for (let i = 0; i < 120 && !url; i++) {
    await new Promise((res) => setTimeout(res, 10_000));
    const e = await appelLabo<{ status: string; video_url?: string | null }>({ action: "etat", qualite, request_id: j.id });
    if (e.status === "COMPLETED") {
      url = e.video_url ?? null;
      if (!url) throw new Error(`${j.compte} : terminé sans vidéo`);
    } else if (!e.ok || ["FAILED", "ERROR"].includes(String(e.status))) {
      console.error(`${j.compte} : échec ${JSON.stringify(e).slice(0, 300)}`);
      break;
    }
  }
  if (!url) continue;
  const brut = `${dossier}/${j.compte}.brut.mp4`;
  writeFileSync(brut, Buffer.from(await (await fetch(url)).arrayBuffer()));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", brut, "-an", "-map_metadata", "-1", "-c:v", "copy", "-movflags", "+faststart", `${dossier}/${j.compte}.mp4`]);
  console.log(`${j.compte} : ${dossier}/${j.compte}.mp4`);
}
const total = (depenses as { estime: number }[]).reduce((s, d) => s + d.estime, 0);
console.log(`Dépense fal estimée du pod (journal) : $${total.toFixed(2)}`);
