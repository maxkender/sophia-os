import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

/**
 * 20/11 (Max) : le recrutement des Comment Masters dans toutes les langues : chaque offre (titulaire ou suppléant),
 * son statut (pop-up en attente, vu, accepté et installé, refusé → candidat suivant, erreur).
 */
interface Offre {
  id: string;
  langue: string;
  role: "titulaire" | "suppleant";
  nom: string;
  rang: number | null;
  zone: string | null;
  tarif: number | null;
  statut: string;
  erreur: string | null;
  envoye_at: string | null;
  vu_at: string | null;
  repondu_at: string | null;
  installe_at: string | null;
}

const STATUT: Record<string, string> = {
  a_preparer: "en préparation",
  envoye: "pop-up envoyé",
  accepte: "accepté, installation…",
  installe: "accepté, installé",
  refuse: "refusé",
  annule: "annulé",
  erreur: "erreur",
};

export function OffresCommentMasters() {
  const q = useQuery({
    queryKey: ["comment-masters", "offres"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comment_master_offres_lire");
      if (error) throw new Error(error.message);
      return (data ?? []) as Offre[];
    },
    refetchInterval: 60_000,
  });
  const offres = q.data ?? [];
  if (!offres.length) return null;
  const n = (s: string) => offres.filter((o) => o.statut === s).length;
  return (
    <Card data-testid="offres-comment-masters">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recrutement des Comment Masters</CardTitle>
        <CardDescription>
          Pop-up envoyé {n("envoye")} · installés {n("installe")} · refusés {n("refuse")} (le candidat suivant reçoit le pop-up) · erreurs {n("erreur")}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 pr-2">Langue</th>
              <th className="py-1.5 pr-2">Rôle</th>
              <th className="py-1.5 pr-2">Posteur</th>
              <th className="py-1.5 pr-2">Tarif</th>
              <th className="py-1.5 pr-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {offres.map((o) => (
              <tr key={o.id} className="border-b last:border-0" data-testid="offre-cm">
                <td className="py-1.5 pr-2 font-medium">{o.langue}</td>
                <td className="py-1.5 pr-2">{o.role === "titulaire" ? "titulaire" : "suppléant"}</td>
                <td className="py-1.5 pr-2">{o.nom}</td>
                <td className="py-1.5 pr-2 tabular-nums">{o.tarif !== null ? `${o.tarif} $ (${o.zone})` : "—"}</td>
                <td className="py-1.5 pr-2">
                  <Badge variant={o.statut === "erreur" ? "destructive" : "outline"}>{STATUT[o.statut] ?? o.statut}</Badge>
                  {o.statut === "envoye" && o.vu_at ? <span className="text-muted-foreground"> · vu</span> : null}
                  {o.erreur ? <span className="block text-destructive">{o.erreur}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
