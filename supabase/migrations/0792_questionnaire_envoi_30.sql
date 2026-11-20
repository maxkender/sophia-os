-- 0792 : questionnaire « top posters », envoi aux 30 posteurs choisis par Max (20/11). Additif ; ne touche qu'au
-- questionnaire, à son pop-up et au bonus.
-- 1. Pop-up : un jeton par posteur, mis dans le lien du questionnaire (la réponse est reliée à sa fiche sans
--    deviner par l'email) ; le nombre de comptes actifs (2 comptes : « Do you do the same thing on both accounts? ») ;
--    « vu » noté dès que le pop-up s'affiche.
-- 2. Bonus : validé d'avance par Max (5 $ par questionnaire terminé, un par posteur), plafond total 150 $.
-- 3. questionnaire_suivi : le statut de chaque posteur ciblé (pas vu / vu / plus tard / en cours / répondu / bonus
--    ajouté / bonus payé) pour l'onglet « Top posters ».

-- 1.
alter table public.questionnaire_popups add column if not exists jeton uuid not null default gen_random_uuid();
create unique index if not exists questionnaire_popups_jeton on public.questionnaire_popups (jeton);

create or replace function public.questionnaire_popup_mien()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('slug', q.slug, 'titre', q.titre, 'bonus', q.bonus, 'jeton', pp.jeton,
           'langue', coalesce((select c.langue from public.comptes c where c.poster_id = auth.uid() and c.is_active
                                  and coalesce(c.type_compte, 'perso') = 'perso' order by c.created_at limit 1), 'en'),
           'nb_comptes', (select count(*) from public.comptes c where c.poster_id = auth.uid() and c.is_active
                            and coalesce(c.type_compte, 'perso') = 'perso'),
           'plus_tard_restants', greatest(0, 3 - pp.plus_tard_n))
    from public.questionnaire_popups pp
    join public.questionnaires q on q.slug = pp.slug and q.actif
   where pp.poster_id = auth.uid() and pp.repondu_at is null and pp.plus_tard_n < 3
     and (pp.plus_tard_at is null or pp.plus_tard_at < now() - interval '20 hours')
     and not exists (select 1 from public.questionnaire_reponses r where r.slug = pp.slug and r.poster_id = auth.uid() and r.termine_at is not null)
   order by pp.cree_at desc limit 1;
$$;
revoke execute on function public.questionnaire_popup_mien() from public, anon;
grant execute on function public.questionnaire_popup_mien() to authenticated;

create or replace function public.questionnaire_popup_vu(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.questionnaire_popups set vu_at = coalesce(vu_at, now()) where slug = p_slug and poster_id = auth.uid();
$$;
revoke execute on function public.questionnaire_popup_vu(text) from public, anon;
grant execute on function public.questionnaire_popup_vu(text) to authenticated;

-- 2.
create or replace function public.questionnaire_bonus_creer(p_reponse uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.questionnaire_reponses;
  v_montant numeric;
  v_canal text;
  v_id uuid;
  v_lundi date;
  v_total numeric;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then raise exception 'réservé à la fonction questionnaire'; end if;
  select * into r from public.questionnaire_reponses where id = p_reponse;
  if r.id is null or r.termine_at is null or r.poster_id is null then return jsonb_build_object('ok', false, 'raison', 'non terminé ou non relié'); end if;
  select bonus into v_montant from public.questionnaires where slug = r.slug;
  if coalesce(v_montant, 0) <= 0 then return jsonb_build_object('ok', false, 'raison', 'pas de bonus'); end if;
  if not exists (select 1 from public.questionnaire_popups pp where pp.slug = r.slug and pp.poster_id = r.poster_id) then
    return jsonb_build_object('ok', false, 'raison', 'pas ciblé');
  end if;
  -- Un seul bonus par posteur : celui qui existe déjà est rendu.
  select id, lundi_bonus into v_id, v_lundi from public.bonus where poster_id = r.poster_id and type = 'questionnaire' and statut <> 'retire' limit 1;
  if v_id is null then
    -- Plafond total : 150 $ (Max, 20/11).
    perform pg_advisory_xact_lock(hashtext('questionnaire_bonus'));
    select coalesce(sum(montant), 0) into v_total from public.bonus where type = 'questionnaire' and statut <> 'retire';
    if v_total + v_montant > 150 then return jsonb_build_object('ok', false, 'raison', 'plafond de 150 $ atteint'); end if;
    v_lundi := public.questionnaire_lundi_suivant((now() at time zone 'Europe/Paris')::date);
    select case when p.canal_paie = 'ruul' then 'ruul' else 'upwork' end into v_canal from public.profiles p where p.id = r.poster_id;
    -- Validé d'avance par Max (20/11) : il part avec la paie du lundi (Upwork : bonus du lundi ; Ruul : lot Ruul).
    insert into public.bonus (poster_id, type, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut, raison, canal_paie,
                              valide_at, valide_par)
    values (r.poster_id, 'questionnaire', v_lundi, v_lundi, v_lundi, 'Bonus questionnaire', 1, v_montant, 'a_valider',
            'Questionnaire: thank you for your answers', coalesce(v_canal, 'upwork'), now(), 'dde5916a-89b8-4fc3-897b-dc7f0d88e20e')
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id, lundi_bonus into v_id, v_lundi from public.bonus where poster_id = r.poster_id and type = 'questionnaire' and statut <> 'retire' limit 1;
    end if;
  end if;
  update public.questionnaire_reponses set bonus_id = v_id where id = r.id and bonus_id is distinct from v_id;
  return jsonb_build_object('ok', v_id is not null, 'lundi', v_lundi, 'bonus_id', v_id);
end;
$$;
revoke all on function public.questionnaire_bonus_creer(uuid) from public, anon, authenticated;
grant execute on function public.questionnaire_bonus_creer(uuid) to service_role;

-- 3.
create or replace function public.questionnaire_suivi(p_slug text)
returns table (poster_id uuid, nom text, comptes text, canal_paie text, langue text, envoye_at timestamptz, vu_at timestamptz,
               plus_tard_n integer, reponse_id uuid, en_cours boolean, termine_at timestamptz, bonus_statut text, bonus_lundi date,
               bonus_montant numeric, statut text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return query
  select pp.poster_id, coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email),
         (select string_agg('@' || regexp_replace(c.handle_tiktok, '^@+', ''), ', ' order by c.created_at) from public.comptes c
           where c.poster_id = pp.poster_id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'),
         coalesce(p.canal_paie, 'upwork'),
         coalesce((select c.langue from public.comptes c where c.poster_id = pp.poster_id and c.is_active
                     and coalesce(c.type_compte, 'perso') = 'perso' order by c.created_at limit 1), 'en'),
         pp.cree_at, pp.vu_at, pp.plus_tard_n, r.id, (r.id is not null and r.termine_at is null), r.termine_at,
         b.statut, b.lundi_bonus, b.montant,
         case when b.statut = 'paye' then 'bonus_paye'
              when b.id is not null then 'bonus_ajoute'
              when r.termine_at is not null then 'repondu'
              when r.id is not null then 'en_cours'
              when pp.plus_tard_n > 0 then 'plus_tard'
              when pp.vu_at is not null then 'vu'
              else 'pas_vu' end
    from public.questionnaire_popups pp
    join public.profiles p on p.id = pp.poster_id
    left join lateral (select x.* from public.questionnaire_reponses x where x.slug = pp.slug and x.poster_id = pp.poster_id
                        order by x.termine_at desc nulls last, x.maj_at desc limit 1) r on true
    left join lateral (select y.* from public.bonus y where y.poster_id = pp.poster_id and y.type = 'questionnaire' and y.statut <> 'retire'
                        limit 1) b on true
   where pp.slug = p_slug
   order by 15, 2;
end;
$$;
revoke all on function public.questionnaire_suivi(text) from public, anon;
grant execute on function public.questionnaire_suivi(text) to authenticated;

notify pgrst, 'reload schema';
