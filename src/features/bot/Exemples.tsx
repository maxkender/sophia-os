import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";

import { lireExemples } from "./api";
import { Erreur } from "./PageBot";

/** 0680 (Max, 12/11) : les exemples des bots et ce qu'ils ont appris, à consulter (le bot Help ne s'en sert pas). */
export function Exemples() {
  const r = useQuery({ queryKey: ["bot", "exemples"], queryFn: lireExemples });
  const [vue, setVue] = React.useState<"exemples" | "apprentissage">("exemples");
  const [q, setQ] = React.useState("");
  const cherche = (t: (string | null)[]) => !q.trim() || t.join(" ").toLowerCase().includes(q.trim().toLowerCase());
  const exemples = (r.data?.exemples ?? []).filter((e) => cherche([e.message, e.reponse, e.situation, e.pourquoi]));
  const appris = (r.data?.apprentissage ?? []).filter((a) => cherche([a.regle, a.exemple, a.raison, a.diagnostic]));
  return (
    <div className="space-y-3" data-testid="exemples">
      <div className="flex flex-wrap items-center gap-2">
        <Segments libelle="Exemples" actif={vue} onChange={setVue} options={[
          { cle: "exemples", contenu: `Exemples (${r.data?.exemples.length ?? 0})` },
          { cle: "apprentissage", contenu: `Apprentissage (${r.data?.apprentissage.length ?? 0})` },
        ]} />
        <Input aria-label="Chercher dans les exemples" placeholder="Chercher…" className="h-8 w-56" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">À consulter : le bot Help ne lit pas ces exemples. Ce qu'il doit appliquer va dans Consignes ou Catalogue.</p>
      <Erreur e={r.error} />
      {vue === "exemples" && exemples.map((e) => (
        <div key={e.id} className={`rounded-md border p-3 text-sm ${e.actif ? "" : "opacity-60"}`} data-testid="exemple-ligne">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {e.bot && <Badge variant="outline">{e.bot}</Badge>}{e.categorie && <Badge variant="outline">{e.categorie}</Badge>}
            {new Date(e.at).toLocaleDateString("fr-FR")}{e.source ? ` · ${e.source}` : ""}
          </p>
          {e.situation && <p className="mt-1">{e.situation}</p>}
          {e.message && <p className="mt-1 italic">« {e.message} »</p>}
          {e.decision && <p className="mt-1"><b>Bonne décision :</b> {e.decision}</p>}
          {e.reponse && <p className="mt-1"><b>Bonne réponse :</b> {e.reponse}</p>}
          {e.pourquoi && <p className="mt-1 text-muted-foreground">{e.pourquoi}</p>}
        </div>
      ))}
      {vue === "apprentissage" && appris.map((a, i) => (
        <div key={`${a.at}-${i}`} className="rounded-md border p-3 text-sm" data-testid="apprentissage-ligne">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {a.bot && <Badge variant="outline">{a.bot}</Badge>}{a.type && <Badge variant="outline">{a.type}</Badge>}{a.verdict && <Badge variant="secondary">{a.verdict}</Badge>}
            {new Date(a.at).toLocaleDateString("fr-FR")}
          </p>
          {a.regle && <p className="mt-1"><b>Règle :</b> {a.regle}</p>}
          {a.exemple && <p className="mt-1 italic">{a.exemple}</p>}
          {a.diagnostic && <p className="mt-1">Diagnostic du bot : {a.diagnostic}</p>}
          {a.raison && <p className="mt-1 text-muted-foreground">{a.raison}</p>}
        </div>
      ))}
    </div>
  );
}
