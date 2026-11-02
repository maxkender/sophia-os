-- 0473 — Un contrat terminé, mais le même freelance a un autre contrat actif.
--
-- 31/10 : Stamen Kamburov : contrat 44725211 terminé le 29/10 et nouveau
-- contrat 44791484 ouvert le même jour (changement de contrat). L'arrêt de
-- 0472 l'a désactivé alors qu'il postait. Désormais : si le freelance (même
-- nom sur Upwork) a un autre contrat actif de VIk Studios (ou Micabo), le
-- profil est relié au nouveau contrat (le plus récent), trace « Contract
-- switched », et rien n'est désactivé.
--
-- Additive : contrat_termine_arreter remplacée. Aucune ligne supprimée.

create or replace function public.contrat_termine_arreter(p_contrat text, p_fin date default null, p_par text default 'nous')
returns table (poster_id uuid, nom text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v record;
  v_id uuid;
  v_freelance text;
  v_nouveau text;
  v_texte text := format('Contract ended by %s on %s',
                         case when p_par = 'freelance' then 'freelancer' else 'us (on Upwork)' end,
                         coalesce(to_char(p_fin, 'FMDD Mon YYYY'), to_char(now() at time zone 'Europe/Paris', 'FMDD Mon YYYY')));
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user = 'postgres' or public.is_admin()) then
    raise exception 'contrat_termine_arreter : réservé à la fonction upwork et à l''admin' using errcode = '42501';
  end if;
  -- Le freelance du contrat terminé (contrats lus, sinon offres), et son autre contrat actif.
  select coalesce((select u.freelancer_nom from public.upwork_contrats u where u.contrat_id = p_contrat and u.freelancer_nom is not null limit 1),
                  (select o.freelancer_nom from public.upwork_offres o where o.contrat_id = p_contrat and o.freelancer_nom is not null limit 1))
    into v_freelance;
  if v_freelance is not null then
    select u.contrat_id into v_nouveau
      from public.upwork_contrats u
     where u.actif and u.contrat_id is not null and u.contrat_id <> p_contrat
       and u.organisation_id in ('2074065383597823773', '1990051114607612379')
       and lower(regexp_replace(btrim(u.freelancer_nom), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_freelance), '\s+', ' ', 'g'))
     order by u.debut_at desc nulls last
     limit 1;
  end if;
  for v in
    select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom
      from public.profiles pr
     where pr.is_active
       and pr.upwork_contract_id::text = p_contrat
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
       and not exists (select 1 from public.contrats_test t where t.contrat_id = p_contrat)
  loop
    if v_nouveau is not null then
      -- Changement de contrat : le profil suit le nouveau contrat, rien n'est désactivé.
      update public.profiles
         set upwork_contract_id = v_nouveau,
             upwork_contrat_url = 'https://www.upwork.com/nx/wm/workroom/' || v_nouveau || '/overview'
       where id = v.id;
      insert into public.recrue_evenements (poster_id, type, at, detail, cle)
      values (v.id, 'contrat_change', now(),
              format('Contract switched: %s ended on %s, now on %s', p_contrat, coalesce(to_char(p_fin, 'FMDD Mon YYYY'), '?'), v_nouveau),
              p_contrat || '>' || v_nouveau)
      on conflict (poster_id, type, cle) do nothing;
      continue;
    end if;
    insert into public.arrets (poster_id, source, motif, sans_message, statut)
    values (v.id, 'manuel', v_texte, true, 'a_faire')
    returning id into v_id;
    update public.arrets
       set etapes = (select coalesce(jsonb_agg(case when e->>'action' = 'paie'
                       then jsonb_build_object('action', 'paie', 'statut', 'sans_objet',
                                               'detail', 'contrat déjà terminé sur Upwork : rien à fermer, pas de paie par l''OS', 'at', now())
                       else e end), '[]'::jsonb)
                     from jsonb_array_elements(etapes) e),
           maj_at = now()
     where id = v_id;
    update public.relances_prevues set statut = 'ecarte', raison = 'contrat_termine', maj_at = now()
     where poster_id = v.id and statut in ('prevu', 'main');
    update public.demandes_arret set decision = 'contrat_termine', decide_at = now()
     where poster_id = v.id and decision is null;
    update public.paie_semaines set exclu = true, exclu_raison = v_texte
     where poster_id = v.id and paye_at is null and not coalesce(exclu, false);
    insert into public.recrue_evenements (poster_id, type, at, detail, cle)
    values (v.id, 'contrat_termine', now(), v_texte, p_contrat)
    on conflict (poster_id, type, cle) do nothing;
    poster_id := v.id;
    nom := v.nom;
    return next;
  end loop;
end;
$$;
revoke all on function public.contrat_termine_arreter(text, date, text) from public, anon;
grant execute on function public.contrat_termine_arreter(text, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';
