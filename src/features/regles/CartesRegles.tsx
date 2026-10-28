import { Link2, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { useRegles } from "./api";
import { phrasesPaie, type Regle } from "./textes";

/**
 * Une règle aux posteurs (le lien, le warm-up), depuis son réglage. En
 * anglais, comme tout ce que voit un posteur.
 */
export function RegleTexte({ regle, className }: { regle: Regle; className?: string }) {
  const { textes } = useRegles();
  return (
    <p
      className={cn("flex gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm leading-relaxed", className)}
      data-regle={regle}
    >
      {regle === "lien" && <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{textes[regle]}</span>
    </p>
  );
}

/** « How you're paid » : l'accueil du posteur (chantier du 28 oct., partie A). */
export function CarteCommentPaye() {
  const { paie } = useRegles();
  return (
    <Card data-testid="carte-comment-paye">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4" aria-hidden />
          How you're paid
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm leading-relaxed">
          {phrasesPaie(paie).map((p) => (
            <li key={p} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <RegleTexte regle="lien" />
        <p className="text-xs text-muted-foreground">Questions? Ask in #questions on Slack, or reply to our message on Upwork.</p>
      </CardContent>
    </Card>
  );
}
