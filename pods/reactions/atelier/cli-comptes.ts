// Usage : POD_JETON=… node atelier/cli-comptes.ts [langue]
// Comptes actifs de l'OS et le persona du pod de chacun (1 compte = 1 persona).
import { appelPod, type Compte } from "./api.ts";

const r = await appelPod<{ comptes: Compte[] }>({ action: "comptes", ...(process.argv[2] ? { langue: process.argv[2] } : {}) });
if (!r.ok) throw new Error(r.error);
for (const c of r.comptes) {
  const p = c.persona ? `${c.persona.statut}${c.persona.description ? ` · ${c.persona.description.slice(0, 70)}` : ""}` : "aucun persona";
  console.log(`${c.langue}  ${c.id}  @${c.handle_tiktok ?? "?"}  ${c.persona_nom ?? ""}  → ${p}`);
}
console.log(`${r.comptes.length} compte(s), ${r.comptes.filter((c) => c.persona?.statut === "valide").length} persona(s) validé(s)`);
