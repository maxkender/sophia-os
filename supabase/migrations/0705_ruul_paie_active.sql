-- 0705 : règle Ruul (Max, 13/11, confirmée par le support Ruul).
-- 1. Lot du lundi (ruul_lot_preparer, cron « ruul-lot ») : seuls les posteurs « Active » dans Ruul
--    (profiles.ruul_compte = 'active') sont payables. Un « Invited » qui a posté reste « reporte »
--    (« en attente : pas encore Active dans Ruul ») et entre dans le lot du lundi suivant, en
--    rattrapage, dès qu'il est Active (mécanisme existant des reportés).
-- 2. ruul_lot : les 2 totaux « payable maintenant (Active) » et « en attente (pas encore Active) »,
--    et le statut Ruul (invited / active) de chaque reporté.
-- 3. support_fiche : ce qui manque à un « Invited » = s'inscrire sur app.ruul.io avec l'email exact
--    (plus « attendre / ouvrir l'email de Ruul »).
-- Additif : fonctions patchées en place, aucune donnée modifiée, rien n'est payé ici.

do $p$
declare
  d text := pg_get_functiondef('public.ruul_lot_preparer(date)'::regprocedure);
  c text := $a$nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null and pr.ruul_ajoute_at is not null$a$;
  raison_avant text := $a$when pr.ruul_ajoute_at is null then 'pas encore ajouté dans Ruul (reporté)'$a$;
  raison_apres text := $a$when pr.ruul_ajoute_at is null then 'pas encore ajouté dans Ruul (reporté)'
                    when pr.ruul_compte is distinct from 'active' then 'en attente : pas encore Active dans Ruul'$a$;
begin
  if position('0705' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, c, ''))) / length(c) <> 3 or position(raison_avant in d) = 0 then
    raise exception '0705 : ruul_lot_preparer ne correspond pas';
  end if;
  d := replace(d, c, c || $a$ and pr.ruul_compte = 'active' /* 0705 : Active seulement */$a$);
  d := replace(d, raison_avant, raison_apres);
  execute d;
end
$p$;

do $p$
declare
  d text := pg_get_functiondef('public.ruul_lot(date)'::regprocedure);
  avant_rep text := $a$'ruul_statut', pr.ruul_statut, 'semaine', rp.semaine$a$;
  avant_tot text := $a$'rapprochement', v_lot.rapprochement,$a$;
begin
  if position('0705' in d) > 0 then return; end if;
  if position(avant_rep in d) = 0 or position(avant_tot in d) = 0 then
    raise exception '0705 : ruul_lot ne correspond pas';
  end if;
  d := replace(d, avant_rep, $a$'ruul_statut', pr.ruul_statut, 'ruul_compte', pr.ruul_compte, 'semaine', rp.semaine$a$);
  d := replace(d, avant_tot, avant_tot || $a$
    /* 0705 : payable maintenant (Active, dans le lot) et en attente (pas encore Active) */
    'totaux', jsonb_build_object(
      'payable', coalesce((select sum(x.montant + x.bonus) from public.ruul_paiements x
                            where v_lot.id is not null and x.lot_id = v_lot.id and x.statut in ('a_payer', 'paye')), 0),
      'nb_payable', (select count(distinct x.poster_id) from public.ruul_paiements x
                      where v_lot.id is not null and x.lot_id = v_lot.id and x.statut in ('a_payer', 'paye')),
      'en_attente', coalesce((select sum(x.montant + x.bonus) from public.ruul_paiements x
                               where x.statut = 'reporte' and x.montant + x.bonus > 0), 0),
      'nb_en_attente', (select count(distinct x.poster_id) from public.ruul_paiements x
                         where x.statut = 'reporte' and x.montant + x.bonus > 0)),$a$);
  execute d;
end
$p$;

do $p$
declare
  d text := pg_get_functiondef('public.support_fiche(uuid)'::regprocedure);
  avant text := $a$'create your Ruul account from the Ruul invitation email (same email address), verify your identity, add a withdrawal method, then click « It''s done »'$a$;
  apres text := $a$'go to app.ruul.io and sign up with this exact email: ' || coalesce(pr.ruul_email, 'your Ruul email') || '. Then add your ID and bank details (5 minutes). You don''t need to wait for an email from Ruul' /* 0705 */$a$;
begin
  if position('0705' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0705 : support_fiche ne correspond pas'; end if;
  execute replace(d, avant, apres);
end
$p$;
