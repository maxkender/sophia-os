-- 0405 — Système du 2 nov., partie D (2) : le Kill du samedi passe par
-- l'arrêt complet.
--
-- Le compte s'arrête toujours le dimanche 23 h 30 (ckd_arrets, 0328). En
-- plus : quand ce Kill arrête le DERNIER compte actif du posteur, une ligne
-- « kill_samedi » entre dans la file `arrets` (0402, partie C) : la liste
-- « À retirer de Slack », et lundi la paie qui paie la dernière semaine, ne
-- finance rien et ferme le contrat. Un seul arrêt ouvert par posteur.
--
-- ckd_arreter_comptes réécrite à signature identique (corps de 0328 + la
-- file). Additive : aucune donnée existante modifiée.
-- Retour arrière : réappliquer ckd_arreter_comptes de 0328.

create or replace function public.ckd_arreter_comptes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select a.compte_id, c.poster_id, a.raison
      from public.ckd_arrets a
      join public.comptes c on c.id = a.compte_id
     where a.fait_at is null and a.annule_at is null and a.prevu_at <= now()
     for update of a skip locked
  loop
    update public.comptes set is_active = false where id = r.compte_id;
    update public.ckd_arrets set fait_at = now() where compte_id = r.compte_id;
    if not exists (select 1 from public.comptes c where c.poster_id = r.poster_id and c.is_active) then
      update public.profiles set is_active = false where id = r.poster_id and is_active;
      -- Partie D : le Kill du samedi entre dans la file des arrêts complets.
      if r.raison = 'ne_pas_renouveler'
         and not exists (select 1 from public.arrets x where x.poster_id = r.poster_id and x.statut in ('a_faire', 'en_cours')) then
        insert into public.arrets (poster_id, source) values (r.poster_id, 'kill_samedi');
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

notify pgrst, 'reload schema';
