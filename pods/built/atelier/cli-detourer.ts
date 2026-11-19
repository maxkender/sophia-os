// Usage : npm run detourer -- <id ou 8 premiers caractères> <nom> [--couleur] [--max 1000]
//
// Détoure une photo de la dernière recherche (`npm run photos`, donnees/photos.json)
// avec BiRefNet sur fal, en noir et blanc par défaut (son style ; --couleur
// pour la garder en couleurs), et l'écrit dans images/detoures/<nom>.png
// (1 000 px au plus de côté). Note son id dans donnees/banque.json : recopie-le
// dans `banque` du post. C'est ainsi qu'on prend l'homme qui court de la slide
// Atala dans la banque de l'OS (label male_run, demande d'Adrien du 19/11).
// REGARDE le résultat (outil Read) : un bras coupé, un bout de décor resté
// collé, une marque lisible (logo sur le short, les chaussures) : une autre photo.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detourer } from "./detourage.ts";

type Photo = { id: string; url: string; caption: string };
const racine = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const [cle, nom] = args;
if (!cle || !nom || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error("usage : npm run detourer -- <id> <nom-en-minuscules> [--couleur] [--max 1000]");
const max = Number(args.includes("--max") ? args[args.indexOf("--max") + 1] : 1000);
const photos = JSON.parse(readFileSync(join(racine, "donnees", "photos.json"), "utf8")) as Photo[];
const p = photos.find((x) => x.id === cle || x.id.startsWith(cle));
if (!p) throw new Error(`${cle} : pas dans la dernière recherche (donnees/photos.json)`);
const png = await detourer(p.url, { nb: !args.includes("--couleur"), max });
mkdirSync(join(racine, "images", "detoures"), { recursive: true });
const f = join("images", "detoures", `${nom}.png`);
writeFileSync(join(racine, f), png);
const fichier = join(racine, "donnees", "banque.json");
const banque = existsSync(fichier) ? (JSON.parse(readFileSync(fichier, "utf8")) as Record<string, string>) : {};
banque[f] = p.id;
writeFileSync(fichier, JSON.stringify(banque, null, 1));
console.log(`${f} ← ${p.id} : ${p.caption.slice(0, 100)}`);
