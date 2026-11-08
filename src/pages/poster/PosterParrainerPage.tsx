import { useQuery } from "@tanstack/react-query";

import { lireMonParrainage } from "@/features/parrainageEmail/api";
import { ParrainerDashboard } from "@/features/parrainageEmail/Branches";

/**
 * 8/11 : « Refer a friend » dans le menu du posteur. Le même bloc que sur le
 * dashboard (Schedule) : l'ami reçoit l'email tout de suite, la liste des amis
 * invités et leur statut. Remplace l'ancien formulaire de déclaration.
 */
export function PosterParrainerPage() {
  const q = useQuery({ queryKey: ["mon-parrainage"], queryFn: lireMonParrainage, staleTime: 60_000 });
  return (
    <div className="space-y-4" data-testid="page-parrainer">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Refer a friend</h1>
        <p className="text-sm text-muted-foreground">
          $10 per friend once they start posting and reach 14 posts, up to $100 if their account becomes one of our top performers. Any country works.
        </p>
      </div>
      {q.data && !q.data.actif ? <p className="text-sm text-muted-foreground">Referrals are not open right now.</p> : <ParrainerDashboard />}
    </div>
  );
}
