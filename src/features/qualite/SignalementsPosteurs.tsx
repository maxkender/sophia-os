import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

interface Signalement {
  id: string;
  poster_id: string | null;
  texte: string | null;
  cree_at: string;
  nom: string;
}

/** 22/11 (Max) : les problèmes de contenu signalés par les posteurs au support (le bot les envoie à Quality Control). */
async function lireSignalements(): Promise<Signalement[]> {
  const { data, error } = await supabase.from("contenu_signalements").select("id, poster_id, texte, cree_at")
    .is("traite_at", null).order("cree_at", { ascending: false }).limit(100);
  if (error) throw error;
  const lignes = (data ?? []) as Omit<Signalement, "nom">[];
  const ids = [...new Set(lignes.map((l) => l.poster_id).filter((x): x is string => !!x))];
  const noms = new Map<string, string>();
  if (ids.length) {
    const { data: p } = await supabase.from("profiles").select("id, prenom, nom").in("id", ids);
    for (const x of (p ?? []) as { id: string; prenom: string | null; nom: string | null }[]) {
      noms.set(x.id, [x.prenom, x.nom].filter(Boolean).join(" "));
    }
  }
  return lignes.map((l) => ({ ...l, nom: (l.poster_id && noms.get(l.poster_id)) || "?" }));
}

const quand = (at: string) => new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export function SignalementsPosteurs() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["qc", "signalements_posteurs"], queryFn: lireSignalements });
  const traiter = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contenu_signalements").update({ traite_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["qc", "signalements_posteurs"] }),
  });
  const liste = q.data ?? [];
  return (
    <Card data-testid="signalements-posteurs">
      <CardHeader>
        <CardTitle className="text-base">Signalés par les posteurs ({liste.length})</CardTitle>
        <p className="text-muted-foreground text-xs">
          Textes sans sens, trop longs, images sans rapport ou cassées, texte déjà sur les images, police changée : le bot a répondu
          au posteur ; ici, ce qu'il faut corriger dans le contenu si ça revient.
        </p>
      </CardHeader>
      <CardContent className="text-sm">
        {q.error && <p className="text-destructive">{(q.error as Error).message}</p>}
        {q.isSuccess && liste.length === 0 && <p className="text-muted-foreground">Rien à voir.</p>}
        <ul className="space-y-1.5">
          {liste.map((s) => (
            <li key={s.id} className="flex items-start gap-2 border-b pb-1.5 last:border-0">
              <span className="w-24 shrink-0 text-muted-foreground text-xs">{quand(s.cree_at)}</span>
              <span className="w-36 shrink-0 font-medium">{s.nom}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{s.texte}</span>
              <Button size="xs" variant="outline" onClick={() => traiter.mutate(s.id)}>Traité</Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
