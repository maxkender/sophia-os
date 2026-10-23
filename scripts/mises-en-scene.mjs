#!/usr/bin/env node
// Agent « Mises en scène » : client de la fonction `mises-en-scene` (0344).
//
//   AGENT_JETON=… node scripts/mises-en-scene.mjs importer <app> <ecran> <support> <langue> <fichier> [--remplace <id>]
//   AGENT_JETON=… node scripts/mises-en-scene.mjs integrateur <media_id> <support> [note]
//   AGENT_JETON=… node scripts/mises-en-scene.mjs manquants <app> [support]
//   AGENT_JETON=… node scripts/mises-en-scene.mjs mettre <capture_id> <integrateur_id> [--relance <id>]
//   AGENT_JETON=… node scripts/mises-en-scene.mjs captures [app] [support] [langue]
//   AGENT_JETON=… node scripts/mises-en-scene.mjs liste [app] [support] [ecran] [langue]
//   AGENT_JETON=… node scripts/mises-en-scene.mjs budget
//
// support : iphone | tablette | ordinateur. Phase test : en français seulement.
//
// Le jeton ne s'écrit jamais dans un fichier, un commit ou un message.
// L'agent ne valide jamais : c'est un humain, dans Admin → Bibliothèque.

import { readFileSync } from "node:fs";

const URL_FONCTION =
  process.env.MISES_EN_SCENE_URL ?? "https://mbikecieskoobeizixig.supabase.co/functions/v1/mises-en-scene";
const jeton = process.env.AGENT_JETON;
if (!jeton) throw new Error("AGENT_JETON manquant");

const [commande, ...args] = process.argv.slice(2);
const option = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};

async function appeler(corps) {
  const r = await fetch(URL_FONCTION, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-jeton": jeton },
    body: JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(`${r.status} ${d.error ?? JSON.stringify(d)}`);
  return d;
}

const sans = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

let res;
switch (commande) {
  case "importer": {
    const [application, ecran, support, langue, fichier] = args;
    res = await appeler({
      action: "importer_capture",
      application,
      ecran,
      support,
      langue,
      remplace_id: option("--remplace"),
      image_base64: readFileSync(fichier).toString("base64"),
    });
    break;
  }
  case "integrateur":
    res = await appeler(sans({ action: "ajouter_integrateur", media_id: args[0], support: args[1], note: args[2] }));
    break;
  case "manquants":
    res = await appeler(sans({ action: "couples_manquants", application: args[0], support: args[1] }));
    break;
  case "mettre":
    res = await appeler(sans({
      action: "mettre_en_scene",
      capture_id: args[0],
      integrateur_id: args[1],
      relance_de: option("--relance"),
    }));
    break;
  case "captures":
    res = await appeler(sans({ action: "captures", application: args[0], support: args[1], langue: args[2] }));
    break;
  case "liste":
    res = await appeler(sans({ action: "mises_en_scene", application: args[0], support: args[1], ecran: args[2], langue: args[3] }));
    break;
  case "budget":
    res = await appeler({ action: "budget" });
    break;
  default:
    throw new Error("commande : importer | integrateur | manquants | mettre | captures | liste | budget");
}
console.log(JSON.stringify(res, null, 2));
