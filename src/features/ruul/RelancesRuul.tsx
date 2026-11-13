import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

/**
 * Réparer Ruul (13/11), point 1 : toutes les relances et emails Ruul visibles dans Réglages, avec leur
 * texte, rendus pour un vrai posteur (le mot de passe et les jetons sont masqués). Rien n'est envoyé.
 */
interface EmailApercu {
  type: string;
  objet: string;
  texte: string;
}

const QUAND: Record<string, string> = {
  bienvenue: "Dès que le compte est créé (quand l'interrupteur du site est allumé)",
  invite_a: "Invité dans Ruul (import « Invited »), une fois",
  invite_b: "Déjà « Active » dans Ruul à l'import, une fois",
  jamais_connecte: "Jamais connecté, à J+1, une fois (nouveau mot de passe unique)",
  tiktok: "Connecté mais pas de TikTok, une fois",
  warmup: "Warm-up pas lancé ou moins de 5 abonnements, une fois",
  slack: "Pas sur Slack, une fois",
  ruul: "Ruul pas fini : tous les 2 jours, 6 au plus, puis carte « Ruul jamais fini » pour Adrien",
  demain: "Dimanche 20 h (ou dès qu'il devient prêt avant minuit)",
  report: "Pas prêt dimanche minuit : passe au lundi suivant",
  desactivation: "14 jours sans aucune activité : désactivé",
  arret: "Après « I do not wish to continue » confirmé",
};

async function lireEmails(): Promise<EmailApercu[]> {
  const { data, error } = await supabase.functions.invoke("ruul", { body: { action: "parcours_apercu", v2: true } });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(String(data?.error ?? "aperçu impossible"));
  return (data.emails ?? []) as EmailApercu[];
}

export function RelancesRuul() {
  const q = useQuery({ queryKey: ["ruul-relances-textes"], queryFn: lireEmails, staleTime: 300_000 });
  return (
    <Card data-testid="relances-ruul">
      <CardHeader>
        <CardTitle>Relances Ruul (emails)</CardTitle>
        <CardDescription>
          Un seul système, par email (en plus du dashboard et de Slack), entre 9 h et 20 h (Paris), jamais 2 le même jour,
          « I do not wish to continue » et STOP toujours respectés. Exemple rendu pour un vrai posteur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
        {!q.data && !q.error && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {q.data?.map((e) => (
          <details key={e.type} className="rounded-lg border p-3" data-testid="relance-ruul">
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">{e.objet}</span>
              <span className="ml-2 text-xs text-muted-foreground">{QUAND[e.type] ?? e.type}</span>
            </summary>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">{e.texte}</pre>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
