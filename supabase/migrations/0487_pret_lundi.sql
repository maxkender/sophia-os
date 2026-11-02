-- 0487 — « Ready for Monday » : un seul bloc en haut de l'Overview.
--
-- pret_lundi() rend une ligne par point à vérifier avant le lundi qui vient
-- (ou aujourd'hui si on est lundi) : groupe, clé, ok (vrai = vert, faux =
-- rouge, nul = à titre d'information), la valeur, ce qu'elle doit être et le
-- lien vers la page qui corrige. Lecture seule : rien n'est écrit.
--   - interrupteurs : Automatic onboarding, Step reminders, Full stop (avant
--     Validate), paie par l'API (dimanche soir) et ses plafonds 30 $ / 5 000 $,
--     messages du lundi, pause générale ;
--   - contrats : Contracts to link = 0, doublons de profils = 0, welcomes en attente ;
--   - cohorte du lundi : recrues, welcome vraiment envoyé, connectées, sur
--     Slack, TikTok trouvé, Start warmup ;
--   - samedi : décisions encore à prendre, « To remove from Slack » ;
--   - lundi : paie simulée de la semaine écoulée, contrats à fermer, « Who to fund » ;
--   - Needs you restant.
--
-- Additive : 1 fonction.

create or replace function public.pret_lundi()
returns table (ordre int, groupe text, cle text, ok boolean, valeur text, attendu text, lien text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date;
  v_samedi date;
  v_regl jsonb;
  v_paie jsonb;
  n int;
  n2 int;
  v_total numeric;
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_lundi := case when extract(isodow from v_jour) = 1 then v_jour else v_jour + (8 - extract(isodow from v_jour))::int end;
  v_samedi := v_lundi - 2;
  select coalesce(jsonb_object_agg(r.cle, r.valeur), '{}'::jsonb) into v_regl
    from public.reglages r
   where r.cle in ('accueil_auto', 'relances_auto', 'arret_auto', 'paie_api', 'lundi_message_auto', 'lundi_soir_auto',
                   'automation_pause', 'paie_plafond_ligne', 'paie_plafond_jour');
  v_paie := coalesce(v_regl -> 'paie_api', '{}'::jsonb);

  -- Interrupteurs.
  return query values
    (10, 'interrupteurs', 'accueil_auto', coalesce(v_regl ->> 'accueil_auto', 'off') = 'on', coalesce(v_regl ->> 'accueil_auto', 'off'), 'on', '/admin/auto'),
    (11, 'interrupteurs', 'relances_auto', coalesce(v_regl ->> 'relances_auto', 'off') = 'on', coalesce(v_regl ->> 'relances_auto', 'off'), 'on', '/admin/auto'),
    (12, 'interrupteurs', 'arret_auto', coalesce(v_regl ->> 'arret_auto', 'off') = 'on', coalesce(v_regl ->> 'arret_auto', 'off'), 'on', '/admin/auto'),
    (13, 'interrupteurs', 'paie_api', coalesce(v_paie ->> 'mode', 'off') = 'on', coalesce(v_paie ->> 'mode', 'off'), 'on', '/admin/auto/payroll'),
    (14, 'interrupteurs', 'paie_plafond_ligne', coalesce((v_regl #>> '{paie_plafond_ligne}')::numeric, 30) = 30,
         coalesce(v_regl #>> '{paie_plafond_ligne}', '30') || ' $', '30 $', '/admin/auto/payroll'),
    (15, 'interrupteurs', 'paie_plafond_jour', coalesce((v_regl #>> '{paie_plafond_jour}')::numeric, 5000) = 5000,
         coalesce(v_regl #>> '{paie_plafond_jour}', '5000') || ' $', '5000 $', '/admin/auto/payroll'),
    (16, 'interrupteurs', 'lundi_message_auto', coalesce(v_regl ->> 'lundi_message_auto', 'off') = 'on', coalesce(v_regl ->> 'lundi_message_auto', 'off'), 'on', '/admin/auto'),
    (17, 'interrupteurs', 'lundi_soir_auto', coalesce(v_regl ->> 'lundi_soir_auto', 'off') = 'on', coalesce(v_regl ->> 'lundi_soir_auto', 'off'), 'on', '/admin/auto'),
    (18, 'interrupteurs', 'automation_pause', coalesce(v_regl ->> 'automation_pause', 'false') = 'false', coalesce(v_regl ->> 'automation_pause', 'false'), 'false', '/admin/auto');

  -- Contrats et profils.
  select count(*) into n from public.contrats_sans_posteur() c where c.proposition = 'relier';
  return query values (20, 'contrats', 'a_relier', n = 0, n::text, '0', '/admin/auto/decisions?onglet=samedi');
  select count(*) into n from (
    select p.upwork_contract_id from public.profiles p
     where p.is_active and p.upwork_contract_id is not null
       and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')
     group by 1 having count(*) > 1) d;
  return query values (21, 'contrats', 'doublons', n = 0, n::text, '0', '/admin/auto/needs-you');
  select count(*) into n from public.bienvenues_a_envoyer();
  return query values (22, 'contrats', 'welcomes_attente', n = 0, n::text, '0', '/admin/auto/recruits');

  -- La cohorte du lundi.
  return query
  with r as (
    select p.id, p.slack_user_id, p.upwork_contract_id
      from public.profiles p
     where p.is_active and p.cohorte_lundi = v_lundi
       and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = p.id)
  ),
  e as (select * from public.etapes_recrues_v2() x where x.cohorte_lundi = v_lundi),
  c as (
    select count(*)::int as total,
           count(*) filter (where exists (select 1 from public.accueils a where a.contrat_id = r.upwork_contract_id and a.message_at is not null))::int as welcome,
           count(*) filter (where exists (select 1 from auth.users u where u.id = r.id and u.last_sign_in_at is not null))::int as connecte,
           count(*) filter (where r.slack_user_id is not null)::int as slack,
           count(*) filter (where exists (select 1 from e where e.poster_id = r.id and coalesce(e.tiktok_existe, false)))::int as tiktok,
           count(*) filter (where exists (select 1 from e where e.poster_id = r.id and e.warmup_started_at is not null))::int as warmup
      from r
  )
  select v.ordre, 'cohorte', v.cle, case when v.cle = 'recrues' then null else v.n = c.total end,
         case when v.cle = 'recrues' then c.total::text else v.n || ' / ' || c.total end,
         case when v.cle = 'recrues' then to_char(v_lundi, 'DD/MM') else c.total::text end,
         '/admin/auto/recruits'
    from c, lateral (values (30, 'recrues', c.total), (31, 'welcome', c.welcome), (32, 'connecte', c.connecte),
                            (33, 'slack', c.slack), (34, 'tiktok', c.tiktok), (35, 'warmup', c.warmup)) v(ordre, cle, n);

  -- Samedi.
  select count(*) into n from public.ckd_propositions cp where cp.type = 'samedi' and cp.decision is null and cp.jour >= v_samedi - 1;
  select count(*) into n2 from public.samedi_brouillons b where b.lundi = v_samedi - 5;
  return query values (40, 'samedi', 'decisions', n = 0, n::text || ' · ' || n2 || ' choix enregistrés', '0', '/admin/auto/decisions?onglet=samedi');
  select count(*) into n from public.a_faire f where f.type = 'slack' and f.fait_at is null;
  return query values (41, 'samedi', 'retirer_slack', null::boolean, n::text, null::text, '/admin/auto/logs');

  -- Lundi.
  select count(*), coalesce(sum(coalesce(l.montant_corrige, l.montant)), 0) into n, v_total
    from public.paie_liste_v2(v_lundi - 7, true) l where not coalesce(l.exclu, false);
  return query values (50, 'lundi', 'paie', null::boolean, n::text || ' · ' || v_total::text || ' $', null::text, '/admin/auto/payroll');
  select count(*) into n from public.arrets a
   where a.statut in ('a_faire', 'en_cours') and a.annule_at is null;
  return query values (51, 'lundi', 'fermer', null::boolean, n::text, null::text, '/admin/auto/payroll');
  select count(*) into n from public.paie_a_financer f where f.finance_at is null;
  return query values (52, 'lundi', 'financer', n = 0, n::text, '0', '/admin/auto/payroll');

  -- Needs you.
  select count(*) into n from public.needs_you();
  return query values (60, 'needs_you', 'restant', n = 0, n::text, '0', '/admin/auto/needs-you');
end;
$$;
revoke all on function public.pret_lundi() from public, anon;
grant execute on function public.pret_lundi() to authenticated;

notify pgrst, 'reload schema';
