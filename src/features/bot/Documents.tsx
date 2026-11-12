import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { type DocumentSupport, enregistrerDocument, lireDocuments, type SourceDocument } from "./api";
import { Erreur } from "./PageBot";

const SEL = "h-8 rounded-md border bg-background px-2 text-sm";
const ORIGINE: Record<SourceDocument, string> = {
  support: "Support",
  notion: "Guide recopié de Notion",
  documents: "Document du dashboard",
};
const AUDIENCE: Record<string, string> = { poster: "Posteurs", hm: "HM", tous: "Tous" };

/**
 * 0680 (Max, 12/11) : les documents que le bot lit. Les guides recopiés de Notion se
 * modifient ici ; une page Notion modifiée ensuite remplace la copie.
 */
export function Documents() {
  const docs = useQuery({ queryKey: ["bot", "documents"], queryFn: lireDocuments });
  const [nouveau, setNouveau] = React.useState(false);
  const [voirHm, setVoirHm] = React.useState(false);
  const liste = (docs.data ?? []).filter((d) => voirHm || d.audience !== "hm");
  const groupes: [SourceDocument, DocumentSupport[]][] = (["support", "notion", "documents"] as SourceDocument[])
    .map((s) => [s, liste.filter((d) => d.source === s)] as [SourceDocument, DocumentSupport[]])
    .filter(([, l]) => l.length);
  return (
    <div className="space-y-4" data-testid="documents">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" onClick={() => setNouveau(true)} data-testid="document-ajouter">+ Ajouter un document</Button>
        <label className="flex items-center gap-1"><input type="checkbox" checked={voirHm} onChange={(e) => setVoirHm(e.target.checked)} />Documents des HM aussi</label>
        <span className="text-xs text-muted-foreground">Le bot Help lit les documents actifs pour les posteurs.</span>
      </div>
      <Erreur e={docs.error} />
      {nouveau && <EditionDocument d={null} onFini={() => setNouveau(false)} />}
      {groupes.map(([source, l]) => (
        <section key={source} className="space-y-2">
          <h3 className="text-sm font-semibold">{ORIGINE[source]} <span className="font-normal text-muted-foreground">({l.length})</span></h3>
          {l.map((d) => <LigneDocument key={`${d.source}-${d.id}`} d={d} />)}
        </section>
      ))}
    </div>
  );
}

function LigneDocument({ d }: { d: DocumentSupport }) {
  const [ouvert, setOuvert] = React.useState(false);
  const [edition, setEdition] = React.useState(false);
  if (edition) return <EditionDocument d={d} onFini={() => setEdition(false)} />;
  return (
    <div className={`rounded-md border p-3 text-sm ${d.actif ? "" : "opacity-60"}`} data-testid="document-ligne">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="font-medium hover:underline" onClick={() => setOuvert(!ouvert)}>{d.titre}</button>
        <Badge variant="outline">{AUDIENCE[d.audience] ?? d.audience}</Badge>
        {!d.actif && <Badge variant="secondary">pas lu par le bot</Badge>}
        <span className="text-xs text-muted-foreground">{d.contenu.length.toLocaleString("fr-FR")} signes</span>
        <Button size="sm" variant="ghost" onClick={() => setEdition(true)}>Modifier</Button>
      </div>
      {ouvert && <p className="mt-2 max-h-96 overflow-y-auto whitespace-pre-line rounded bg-muted/40 p-2 text-xs">{d.contenu || "(vide)"}</p>}
    </div>
  );
}

function EditionDocument({ d, onFini }: { d: DocumentSupport | null; onFini: () => void }) {
  const qc = useQueryClient();
  const [c, setC] = React.useState({ titre: d?.titre ?? "", contenu: d?.contenu ?? "", audience: d?.audience ?? "poster", actif: d?.actif ?? true });
  const sauver = useMutation({
    mutationFn: () => enregistrerDocument({ source: d?.source ?? "support", id: d?.id ?? null, ...c }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bot", "documents"] }); onFini(); },
  });
  const titreModifiable = !d || d.source !== "notion";
  return (
    <Card className="border-primary">
      <CardContent className="space-y-2 p-4 text-sm" data-testid="document-edition">
        <label className="block space-y-1">Titre
          <Input value={c.titre} disabled={!titreModifiable} onChange={(x) => setC({ ...c, titre: x.target.value })} />
        </label>
        <label className="block space-y-1">Texte
          <Textarea rows={14} value={c.contenu} onChange={(x) => setC({ ...c, contenu: x.target.value })} />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          {(!d || d.source === "support") && (
            <label className="space-y-1">Pour
              <select className={`${SEL} block`} value={c.audience} onChange={(x) => setC({ ...c, audience: x.target.value as DocumentSupport["audience"] })}>
                <option value="poster">Posteurs</option><option value="hm">HM</option><option value="tous">Tous</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-1 pb-1"><input type="checkbox" checked={c.actif} onChange={(x) => setC({ ...c, actif: x.target.checked })} />Lu par le bot</label>
        </div>
        {d?.source === "notion" && <p className="text-xs text-muted-foreground">Copie d'une page Notion : si la page change dans Notion, elle remplace ce texte.</p>}
        {d?.source === "documents" && <p className="text-xs text-muted-foreground">Ce texte est aussi celui du document sur le dashboard.</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={c.titre.trim().length < 2 || sauver.isPending} onClick={() => sauver.mutate()}>Enregistrer</Button>
          <Button size="sm" variant="ghost" onClick={onFini}>Annuler</Button>
        </div>
        <Erreur e={sauver.error} />
      </CardContent>
    </Card>
  );
}
