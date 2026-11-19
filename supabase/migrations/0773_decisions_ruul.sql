-- 0773 : Décisions (jeudi et samedi) pour les posteurs RUUL (Max, 19/11). Un posteur Ruul n'a pas de contrat Upwork :
-- son contrat, c'est la signature sur le Hub. Additif ; les posteurs Upwork ne changent pas.
-- 1. semaine_extras : « sans contrat » seulement pour un posteur Upwork (plus de « No contract » ni de Kill bloqué pour Ruul).
-- 2. jeudi_valider : le nudge Slack ne prend plus les posteurs Ruul (ils ont leur nudge email + bandeau).
-- 3. decisions_ruul : par posteur Ruul, le contrat Hub (signé le), les pastilles Ruul (inscrit, KYC, banque, prêt,
--    payable lundi) et le contexte : derniers emails envoyés, relances Ruul, ses réponses et ses demandes au support.
-- 4. Nudge Ruul du jeudi : jeudi_nudges_ruul (ce qu'il faut envoyer) et jeudi_nudge_ruul_noter (noté dans nudges,
--    canal « os », canaux email / dashboard), pour que la ligne affiche « déjà nudgé » comme pour Upwork.
-- 5. mes_bandeaux_compte : le bandeau du nudge (clé nudge_jeudi:…) sur le dashboard du posteur.

-- 1.
do $p$
declare
  d text := pg_get_functiondef('public.semaine_extras(date)'::regprocedure);
  a1 text := $a$select co.id, co.poster_id, co.handle_tiktok, pr.upwork_contract_id, pr.prenom,$a$;
  a2 text := $a$  select c.id, c.poster_id, c.upwork_contract_id is null, c.upwork_contract_id,$a$;
begin
  if position('0773' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception '0773 : semaine_extras ne correspond pas'; end if;
  d := replace(d, a1, $a$select co.id, co.poster_id, co.handle_tiktok, pr.upwork_contract_id, pr.canal_paie, pr.prenom,$a$);
  d := replace(d, a2, $a$  select c.id, c.poster_id, (c.upwork_contract_id is null and coalesce(c.canal_paie, '') <> 'ruul') /* 0773 */, c.upwork_contract_id,$a$);
  execute d;
end
$p$;

-- 2.
do $p$
declare
  d text := pg_get_functiondef('public.jeudi_valider(date,uuid[])'::regprocedure);
  avant text := $a$    if r.nudge_envoye_at is not null then
      v_deja := v_deja + 1;
      continue;
    end if;$a$;
begin
  if position('0773' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0773 : jeudi_valider ne correspond pas'; end if;
  execute replace(d, avant, avant || $a$
    -- 0773 : un posteur Ruul a son nudge par email + bandeau (jamais en DM Slack ici).
    if exists (select 1 from public.profiles x where x.id = r.poster_id and x.canal_paie = 'ruul') then
      continue;
    end if;$a$);
end
$p$;

-- 3.
create or replace function public.decisions_ruul(p_posteurs uuid[])
returns table (poster_id uuid, signe_at timestamptz, inscrit boolean, kyc boolean, banque boolean, pret boolean,
               statut_api text, tarif numeric, emails jsonb, relances jsonb, reponses jsonb, demandes jsonb, dernier_nudge jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pr.*, h.email_perso as hub_email,
           array_remove(array[lower(h.email_perso), lower(pr.email_perso), lower(pr.ruul_email), lower(pr.email)], null) as adresses
      from public.profiles pr
      left join public.hub_posteurs h on h.profile_id = pr.id
     where pr.id = any(p_posteurs) and pr.canal_paie = 'ruul'
  )
  select p.id,
         coalesce((select max(rc.signe_at) from public.ruul_candidatures rc where rc.os_profile_id = p.id),
                  (select max(rc.signe_at) from public.ruul_candidatures rc where lower(rc.email) = any(p.adresses))),
         coalesce(p.ruul_statut_api, '') not in ('', 'NOT_REGISTERED') or coalesce(p.ruul_compte, '') = 'active',
         coalesce(p.ruul_kyc, '') = 'APPROVED' or coalesce(p.ruul_identite, '') = 'approved',
         coalesce(p.ruul_banque, false),
         coalesce(p.ruul_onboarding, '') = 'READY',
         p.ruul_statut_api,
         p.ruul_tarif_semaine,
         (select coalesce(jsonb_agg(jsonb_build_object('objet', e.objet, 'at', e.cree_at, 'statut', coalesce(e.dernier_evenement, e.statut))
                                    order by e.cree_at desc), '[]'::jsonb)
            from (select * from public.emails_envois e where lower(e.destinataire) = any(p.adresses)
                   order by e.cree_at desc limit 5) e),
         (select coalesce(jsonb_agg(jsonb_build_object('etape', r.etape, 'at', r.envoye_at, 'canaux', r.canaux, 'erreur', r.erreur)
                                    order by r.envoye_at desc), '[]'::jsonb)
            from (select * from public.ruul_email_relances r where r.poster_id = p.id order by r.envoye_at desc limit 3) r),
         (select coalesce(jsonb_agg(jsonb_build_object('canal', r.canal, 'at', r.recu_at, 'texte', left(r.texte, 160))
                                    order by r.recu_at desc), '[]'::jsonb)
            from (select * from public.posteur_reponses r where r.poster_id = p.id order by r.recu_at desc limit 2) r),
         (select coalesce(jsonb_agg(jsonb_build_object('categorie', d.categorie, 'statut', d.statut, 'at', d.cree_at, 'source', d.source,
                                                       'texte', left(coalesce(d.resume, d.texte), 140)) order by d.cree_at desc), '[]'::jsonb)
            from (select * from public.support_demandes d where d.poster_id = p.id order by d.cree_at desc limit 3) d),
         (select jsonb_build_object('at', n.envoye_at, 'canaux', n.canaux, 'erreur', n.erreur_canal)
            from public.nudges n where n.poster_id = p.id and n.type = 'jeudi' order by n.envoye_at desc nulls last limit 1)
    from p
   where public.is_admin();
$$;

-- 4.
create or replace function public.jeudi_nudges_ruul(p_lundi date, p_comptes uuid[])
returns table (poster_id uuid, compte_id uuid, prenom text, faits integer, attendus integer, texte_en text, deja boolean)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_jusqu date := least((now() at time zone 'Europe/Paris')::date, p_lundi + 6);
  v_modele text := coalesce((select r.valeur #>> '{}' from public.reglages r where r.cle = 'jeudi_nudge_texte'), '');
begin
  if not public.is_admin() and coalesce(auth.jwt()->>'role', '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if btrim(v_modele) = '' then raise exception 'jeudi_nudges_ruul : le texte du nudge (jeudi_nudge_texte) est vide'; end if;
  return query
  with sc as (select * from public.semaine_comptes(p_lundi, v_jusqu)),
  tot as (
    select s.poster_id, coalesce(sum(s.lien_total), 0)::int as t_faits,
           coalesce(sum(s.prevus_passes + s.lien_aujourdhui), 0)::int as t_attendus
      from sc s group by s.poster_id
  ),
  une as (
    select distinct on (s.poster_id) s.* from sc s
      join public.profiles pr on pr.id = s.poster_id and pr.canal_paie = 'ruul'
     where s.compte_id = any(p_comptes)
     order by s.poster_id, (s.prevus_passes - s.lien_passes) desc, s.lien_total
  )
  select u.poster_id, u.compte_id, u.prenom, t.t_faits, t.t_attendus,
         replace(replace(replace(v_modele, '{prenom}', coalesce(nullif(btrim(u.prenom), ''), 'there')),
                 '{faits}', t.t_faits::text), '{attendus}', t.t_attendus::text),
         u.nudge_envoye_at is not null
    from une u join tot t on t.poster_id = u.poster_id;
end;
$function$;

create or replace function public.jeudi_nudge_ruul_noter(p_poster uuid, p_compte uuid, p_lundi date, p_texte text, p_canaux text[], p_erreur text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.nudges (poster_id, compte_id, type, cible, canal, texte, envoye_at, periode, canaux, erreur_canal, slack_erreur, raison)
  values (p_poster, p_compte, 'jeudi', 'posteur', 'os', p_texte, now(), p_lundi, coalesce(p_canaux, '{}'), p_erreur,
          case when coalesce(array_length(p_canaux, 1), 0) = 0 then coalesce(p_erreur, 'aucun canal') end, 'jeudi_ruul')
  on conflict (poster_id, type, periode) where periode is not null do nothing;
$$;

revoke all on function public.decisions_ruul(uuid[]) from public, anon;
grant execute on function public.decisions_ruul(uuid[]) to authenticated, service_role;
revoke all on function public.jeudi_nudges_ruul(date, uuid[]) from public, anon, authenticated;
grant execute on function public.jeudi_nudges_ruul(date, uuid[]) to service_role;
revoke all on function public.jeudi_nudge_ruul_noter(uuid, uuid, date, text, text[], text) from public, anon, authenticated;
grant execute on function public.jeudi_nudge_ruul_noter(uuid, uuid, date, text, text[], text) to service_role;

-- 5.
create or replace function public.mes_bandeaux_compte()
returns table (cle text, texte text, maj_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.cle, t.texte, t.maj_at from public.posteur_textes t
   where t.poster_id = auth.uid() and t.vu_at is null
     and (t.cle like 'compte_arrete:%' or t.cle like 'compte_double:%' or t.cle like 'nudge_jeudi:%')
   order by t.maj_at desc;
$$;
