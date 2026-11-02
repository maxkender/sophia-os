import { supabase } from "@/lib/supabase/client";

/**
 * Reactivate (0366) : UN compte redevient actif, et son posteur s'il était
 * désactivé. Les autres comptes du posteur ne bougent pas. Admin, Head of Ops,
 * la HM du posteur ou sa DM.
 */
export async function reactiverCompteArchive(compteId: string): Promise<void> {
  const { error } = await supabase.rpc("archive_reactiver_compte", { p_compte: compteId });
  if (error) throw error;
}
