import { nomsApplicationsDuLabel } from "./logique";
import { useApplicationsMulti, useLiensLabels } from "./useMultiApp";

/**
 * Applications servies par un label, en petit à côté de sa pastille (page
 * Posters). Rien tant que les lectures ne sont pas là — ou si elles échouent
 * (avant 0256) : la pastille reste utilisable, seule l'info manque.
 */
export function ApplicationsDuLabel({ labelId }: { labelId: string }) {
  const applications = useApplicationsMulti();
  const liens = useLiensLabels();
  if (!applications.data || !liens.data) return null;
  const noms = nomsApplicationsDuLabel(labelId, liens.data, applications.data);
  return <span className="text-[10px] text-muted-foreground">{noms.join(", ")}</span>;
}
