import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { marquerReviewVue, mesReviewsNonVues } from "@/features/moteur/api";
import { RetourParcours } from "./RetourParcours";

/**
 * Retour de l'admin, à la connexion du créateur : s'il a une (ou plusieurs)
 * review non vue, elle s'ouvre par-dessus tout, en deux temps (son post à côté
 * de l'original, puis le message et les vidéos). « Compris » la marque vue et
 * enchaîne sur la suivante. Rien à afficher → rien ne se monte. Il peut la
 * relire ensuite dans « Mes retours ».
 */
export function ReviewPopup() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["mes-reviews"], queryFn: mesReviewsNonVues });

  const marquer = useMutation({
    mutationFn: marquerReviewVue,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mes-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["mes-reviews-toutes"] });
    },
  });

  const courante = (data ?? [])[0];
  if (!courante) return null;

  return (
    <RetourParcours
      key={courante.id}
      retour={courante}
      mode="reel"
      occupe={marquer.isPending}
      ensuite={(data ?? []).length - 1}
      onCompris={() => marquer.mutate(courante.id)}
    />
  );
}
