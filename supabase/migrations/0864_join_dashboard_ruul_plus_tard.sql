-- 0864 : Join, « Ruul plus tard » et la connexion au dashboard (26/11, Max après son test). Additif seulement.
--
-- 1. join_etapes : la checklist gagne « dashboard » (se connecter au dashboard de l'OS ; cochée à la première
--    connexion vue par l'OS : profiles.premiere_connexion_at, sinon auth.users.last_sign_in_at). CHECK élargi.
-- 2. join_evenements : type « dashboard » (la première connexion notée une fois pour le QG). CHECK élargi.
-- 3. join_etat_os(uuid[]) : + ruul_statut_api, ruul_kyc, ruul_banque et ruul_etapes (ruul_etapes(), la même fonction
--    que le bloc « Get paid » du dashboard de l'OS), à la FIN : aucune colonne enlevée ni déplacée. Postgres ne permet
--    pas d'ajouter des colonnes de sortie avec « create or replace » : la fonction est recréée dans la même
--    transaction (drop + create), avec les mêmes droits (service seulement). Rien d'autre n'en dépend.
-- 4. ruul_mon_setup() : + cohorte_lundi (le lundi de départ), pour dire « tu peux le faire plus tard, avant ta première
--    paie » tant que la première semaine n'est pas payable (lundi de départ + 7 jours). Rien d'autre ne change.
--
-- Retour arrière : remettre les deux CHECK de 0858, join_etat_os de 0858 (drop + create) et ruul_mon_setup de 0799.

begin;

-- 1. et 2.
do $c$
begin
  if exists (select 1 from pg_constraint where conname = 'join_etapes_etape_check') then
    alter table public.join_etapes drop constraint join_etapes_etape_check;
  end if;
  alter table public.join_etapes add constraint join_etapes_etape_check
    check (etape in ('tiktok', 'profil', 'warmup', 'slack', 'ruul', 'contrat', 'premier_post', 'dashboard'));

  if exists (select 1 from pg_constraint where conname = 'join_evenements_type_check') then
    alter table public.join_evenements drop constraint join_evenements_type_check;
  end if;
  alter table public.join_evenements add constraint join_evenements_type_check check (type in (
    'visite', 'candidature', 'verifiee', 'acceptee', 'a_traiter', 'signee', 'connectee', 'tiktok_ok', 'warmup', 'slack',
    'premier_post', 'ruul_ready', 'simule', 'expiree', 'refusee', 'compte_os', 'reglage', 'ruul_invitation', 'dashboard'));
end
$c$;

-- 3. Les colonnes de 0858, dans le même ordre, puis les 4 nouvelles.
drop function if exists public.join_etat_os(uuid[]);
create function public.join_etat_os(p_profiles uuid[])
returns table (
  profile_id uuid, is_active boolean, relances_stop_at timestamptz, cohorte_lundi date, premiere_connexion_at timestamptz,
  ruul_email text, ruul_onboarding text, ruul_ready_at timestamptz, ruul_retire_at timestamptz, ruul_jeton text,
  handle text, tiktok boolean, warmup_started_at timestamptz, slack boolean, premier_post_at timestamptz, posts_prevus boolean,
  arrete boolean, desinscrit boolean, paie_reportee boolean, email_jour boolean,
  ruul_statut_api text, ruul_kyc text, ruul_banque boolean, ruul_etapes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.is_active, pr.relances_stop_at, pr.cohorte_lundi, coalesce(pr.premiere_connexion_at, u.last_sign_in_at),
         nullif(btrim(coalesce(pr.ruul_email, '')), ''), pr.ruul_onboarding, pr.ruul_ready_at, pr.ruul_retire_at, pr.ruul_jeton::text,
         c.handle_tiktok,
         coalesce(w.existe, false)
           or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'tiktok' and d.statut <> 'refuse')
           or exists (select 1 from public.comptes x where x.poster_id = pr.id and x.warmup_started_at is not null),
         (select min(x.warmup_started_at) from public.comptes x where x.poster_id = pr.id),
         nullif(btrim(coalesce(pr.slack_user_id, '')), '') is not null
           or exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id and nullif(btrim(coalesce(h.slack_user_id, '')), '') is not null)
           or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'slack' and d.statut <> 'refuse'),
         least(
           (select min(po.publie_at) from public.posts po join public.comptes x on x.id = po.compte_id
             where x.poster_id = pr.id and po.publie_at is not null and not coalesce(po.est_test, false)),
           (select min(pa.publie_at) from public.passages pa join public.comptes x on x.id = pa.compte_id
             where x.poster_id = pr.id and pa.publie_at is not null)),
         exists (select 1 from public.passages pa join public.comptes x on x.id = pa.compte_id
                  where x.poster_id = pr.id and x.is_active and not coalesce(pa.est_rappel, false) and pa.statut::text <> 'brouillon'
                    and pa.date_publication_prevue >= coalesce(pr.cohorte_lundi, current_date)
                    and pa.date_publication_prevue <= (now() at time zone 'Europe/Paris')::date),
         exists (select 1 from public.arrets a where a.poster_id = pr.id and a.annule_at is null)
           or exists (select 1 from public.ne_plus_contacter n where n.poster_id = pr.id and n.leve_at is null),
         exists (select 1 from public.ruul_candidatures rc where rc.os_profile_id = pr.id and rc.desinscrit_at is not null),
         exists (select 1 from public.ruul_paiements rp where rp.poster_id = pr.id and rp.statut = 'reporte'),
         exists (select 1 from public.ruul_parcours_envois e where e.poster_id = pr.id and e.ok and e.type <> 'carte_ruul'
                  and (e.envoye_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date),
         pr.ruul_statut_api, pr.ruul_kyc, pr.ruul_banque, public.ruul_etapes(pr.id)
    from public.profiles pr
    left join auth.users u on u.id = pr.id
    left join lateral (select x.id, x.handle_tiktok from public.comptes x where x.poster_id = pr.id and x.is_active
                        order by (coalesce(x.type_compte, 'perso') = 'perso') desc, x.created_at limit 1) c on true
    left join lateral (select r.existe from public.ckd_warmup_releves r where r.compte_id = c.id and r.existe is not null
                        order by r.releve_at desc limit 1) w on true
   where pr.id = any(p_profiles);
$$;
revoke all on function public.join_etat_os(uuid[]) from public, anon, authenticated;
grant execute on function public.join_etat_os(uuid[]) to service_role;

-- 4. Le bloc « Get paid » : + cohorte_lundi (le reste à l'identique de 0799).
create or replace function public.ruul_mon_setup()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ruul', coalesce(pr.canal_paie = 'ruul', false),
    'etapes', case when pr.canal_paie = 'ruul' then public.ruul_etapes(pr.id) end,
    'email', case when pr.canal_paie = 'ruul' then coalesce(nullif(btrim(h.email_perso), ''), nullif(btrim(pr.ruul_email), ''), nullif(btrim(pr.email_perso), '')) end,
    'ready_at', pr.ruul_ready_at,
    'lien_auto', coalesce((select (valeur->>'connect_actif')::boolean from public.reglages where cle = 'ruul_api'), false),
    'cohorte_lundi', pr.cohorte_lundi)
    from public.profiles pr
    left join public.hub_posteurs h on h.profile_id = pr.id
   where pr.id = auth.uid();
$$;
revoke execute on function public.ruul_mon_setup() from public, anon;
grant execute on function public.ruul_mon_setup() to authenticated;

commit;

notify pgrst, 'reload schema';
