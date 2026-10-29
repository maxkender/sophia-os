-- 0447 — Prompt 25, mises à jour, points 4 et 5.
--
-- - Le texte du welcome (accueil_message_texte) remplacé par celui demandé.
-- - Le nudge du jeudi : Slack seulement (plus Upwork) ; il se choisit compte
--   par compte sur la page du jeudi, par Lucia (Head of Ops) ou Max.
-- - Le lundi 20 h : seulement les nouveaux qui ont fini leur warm-up (compte
--   trouvé sur TikTok, Start warmup cliqué, 5 abonnements ou plus) mais n'ont
--   rien posté.
--
-- Le réglage accueil_message_texte est réécrit (demandé) ; deux fonctions
-- complétées. Aucune autre donnée modifiée.

update public.reglages
   set valeur = to_jsonb($t$Hi {prenom}, welcome to Vik Studios! Here is everything you need:
• Your dashboard: {url}
• Login: {email} · Password: {mot_de_passe}
• Join our Slack now, with your full name (first and last name): {slack}. All our updates and answers are there.
• Our guide: {guide}

Before Sunday midnight:
1. Log in to your dashboard.
2. Create the TikTok account shown on your dashboard, with the exact @.
3. Click Start warmup, then warm the account up like a real person: scroll a few minutes a day, like and follow accounts in the general knowledge niche. This is the most important step: without it, your posts get 0 views.

Your first posts are on Monday {date}. For any question about the work, ask on Slack.$t$::text),
       updated_at = now()
 where cle = 'accueil_message_texte';

do $j$
declare
  v_def text := pg_get_functiondef('public.jeudi_valider(date,uuid[])'::regprocedure);
  v_droit_avant text := $q$  if not public.is_admin_strict() then
    raise exception 'jeudi_valider : réservé à l''admin';$q$;
  v_droit_apres text := $q$  if not public.is_admin() then
    raise exception 'jeudi_valider : réservé à l''admin et au Head of Ops';$q$;
  v_canal_avant text := $q$    select nullif(concat_ws('+', case when pr.slack_user_id is not null then 'slack' end,
                                 case when pr.upwork_contract_id is not null then 'upwork' end), '')$q$;
  v_canal_apres text := $q$    select case when pr.slack_user_id is not null then 'slack' end$q$;
begin
  if position(v_droit_avant in v_def) = 0 or position(v_canal_avant in v_def) = 0 then
    raise exception '0447 : jeudi_valider ne correspond pas';
  end if;
  execute replace(replace(v_def, v_droit_avant, v_droit_apres), v_canal_avant, v_canal_apres);
end;
$j$;

do $l$
declare
  v_def text := pg_get_functiondef('public.lundi_soir_posteurs(date)'::regprocedure);
  v_avant text := $q$     -- A3 (0413) : une recrue pas prête dimanche minuit ne commence pas ce lundi.$q$;
  v_apres text := $q$     -- Prompt 25 MAJ : seulement ceux qui ont fini leur warm-up (trouvé, Start warmup, 5 abonnements).
     and exists (select 1 from public.comptes w where w.id = ca.compte_id and w.warmup_started_at is not null)
     and exists (select 1 from public.ckd_warmup_releves x
                  where x.compte_id = ca.compte_id and x.existe and coalesce(x.abonnements, 0) >= 5)
     -- A3 (0413) : une recrue pas prête dimanche minuit ne commence pas ce lundi.$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0447 : lundi_soir_posteurs ne correspond pas'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$l$;

notify pgrst, 'reload schema';
