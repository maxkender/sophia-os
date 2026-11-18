import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

/**
 * 17/11 (Max) : « À ajouter sur Upwork – nouvelle cohorte ». Les posteurs (souvent Ruul) qui ont demandé à être payés
 * par Upwork : le bot leur a demandé le lien de leur profil Upwork et l'a vérifié. Les statuts se changent à la main ici.
 */

export type StatutUpwork = "lien_attendu" | "a_inviter" | "invite" | "contrat_signe" | "refuse";

export interface LigneUpwork {
  id: string;
  poster_id: string | null;
  nom: string | null;
  email: string | null;
  pays: string | null;
  cohorte: string | null;
  profil_url: string | null;
  demande_at: string;
  source: "help" | "slack" | "email" | "upwork";
  statut: StatutUpwork;
}

export const LIBELLE_STATUT: Record<StatutUpwork, string> = {
  lien_attendu: "lien attendu",
  a_inviter: "à inviter",
  invite: "invité",
  contrat_signe: "contrat signé",
  refuse: "refusé",
};

export async function lireUpworkAAjouter(): Promise<LigneUpwork[]> {
  const { data, error } = await supabase.from("upwork_a_ajouter")
    .select("id, poster_id, nom, email, pays, cohorte, profil_url, demande_at, source, statut")
    .order("demande_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as LigneUpwork[];
}

const jour = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }) : "—");

export function PageUpworkAAjouter() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["upwork-a-ajouter"], queryFn: lireUpworkAAjouter });
  const [erreur, setErreur] = React.useState<string | null>(null);
  const changer = useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: StatutUpwork }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("upwork_a_ajouter").update({ statut, maj_at: new Date().toISOString(), maj_par: u.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onError: (e) => setErreur((e as Error).message),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["upwork-a-ajouter"] }),
  });
  const lignes = q.data ?? [];
  const avecLien = lignes.filter((l) => l.statut !== "lien_attendu");
  const attente = lignes.filter((l) => l.statut === "lien_attendu");

  return (
    <Card data-testid="upwork-a-ajouter">
      <CardHeader>
        <CardTitle>À ajouter sur Upwork – nouvelle cohorte ({avecLien.filter((l) => l.statut === "a_inviter").length} à inviter)</CardTitle>
        <CardDescription>
          Les posteurs qui ont demandé à être payés par Upwork plutôt que par Ruul. Le lien de profil est vérifié par le support ;
          envoie l'offre sur Upwork puis change le statut ici.
          {attente.length > 0 ? ` En attente de leur lien : ${attente.map((l) => l.nom ?? "?").join(", ")}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : null}
        {q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : null}
        {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
        {!q.isLoading && avecLien.length === 0 ? <p className="text-sm text-muted-foreground">Personne pour l'instant.</p> : null}
        {avecLien.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {["Nom", "Email", "Pays", "Cohorte", "Profil Upwork", "Demande", "Source", "Statut"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {avecLien.map((l) => (
                  <tr key={l.id} className="border-b border-border/40" data-ligne={l.id}>
                    <td className="py-1.5 pr-3 font-medium">
                      {l.poster_id ? <a href={`/admin/posters?fiche=${l.poster_id}`} target="_blank" rel="noreferrer" className="hover:underline">{l.nom ?? "?"}</a> : l.nom ?? "?"}
                    </td>
                    <td className="py-1.5 pr-3">{l.email ?? "—"}</td>
                    <td className="py-1.5 pr-3">{l.pays ?? "—"}</td>
                    <td className="py-1.5 pr-3">{jour(l.cohorte)}</td>
                    <td className="py-1.5 pr-3">
                      {l.profil_url ? (
                        <a href={l.profil_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          Profil <ExternalLink className="size-3" />
                        </a>
                      ) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">{jour(l.demande_at)}</td>
                    <td className="py-1.5 pr-3">{l.source}</td>
                    <td className="py-1.5 pr-3">
                      <select aria-label={`Statut de ${l.nom ?? "?"}`} className="h-8 rounded-md border bg-background px-2 text-xs" value={l.statut}
                        onChange={(e) => changer.mutate({ id: l.id, statut: e.target.value as StatutUpwork })}>
                        {(["a_inviter", "invite", "contrat_signe", "refuse"] as const).map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
