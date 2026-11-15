-- 0543 : test d'un bonus Upwork classique (« Give bonus ») par l'API.
--
-- Mutation trouvée dans le schéma lu le 3/11 : sendCustomPayment(input:
-- CustomPaymentInput!) → CustomPaymentResponse { invoiceId }. Champs :
-- contractId (ID!), amount (Float!), comment (String!, vu par le freelancer),
-- notes (String!, interne), type (CustomPaymentType : BONUS), allowSubsequent.
-- Pas de milestone.
--
-- Garde-fous : UN test, 1 $, sur un contrat VIk Studios, depuis le compte de
-- Max ; préparé par bonus_test_preparer (admin) qui ouvre une carte décision
-- [Envoyer le test 1 $] [Annuler] ; rien ne part avant le clic : le trigger
-- appelle la fonction upwork (action bonus_test) seulement quand Max choisit
-- l'option 0. Un seul test tant que le résultat n'est pas validé
-- (bonus_test_valider) : aucun autre bonus ne peut être préparé.

create table if not exists public.upwork_bonus_tests (
  id uuid primary key default gen_random_uuid(),
  probleme_id uuid,
  contrat_id text not null,
  montant numeric not null check (montant = 1),
  note text not null default 'Test bonus',
  statut text not null default 'a_confirmer' check (statut in ('a_confirmer', 'en_cours', 'envoye', 'erreur', 'annule')),
  cree_at timestamptz not null default now(),
  cree_par uuid,
  envoye_at timestamptz,
  reponse jsonb,
  erreur text,
  valide_at timestamptz,
  valide_par uuid
);
alter table public.upwork_bonus_tests enable row level security;
revoke all on public.upwork_bonus_tests from anon, authenticated;

create or replace function public.bonus_test_preparer(p_contrat text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_nom text;
  v_id uuid;
  v_carte uuid;
begin
  if not public.is_admin() then
    raise exception 'bonus_test_preparer : réservé à l''admin' using errcode = '42501';
  end if;
  if exists (select 1 from public.upwork_bonus_tests b where b.valide_at is null and b.statut <> 'annule') then
    raise exception 'un test de bonus est déjà en cours ou attend la validation de son résultat : aucun autre bonus';
  end if;
  select uc.organisation_id into v_org from public.upwork_contrats uc where uc.contrat_id = p_contrat;
  if v_org is distinct from '2074065383597823773' then
    raise exception 'contrat % : pas un contrat VIk Studios (org %), refusé', p_contrat, coalesce(v_org, 'inconnue');
  end if;
  select nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') into v_nom from public.profiles pr where pr.upwork_contract_id = p_contrat limit 1;
  insert into public.upwork_bonus_tests (contrat_id, montant, cree_par) values (p_contrat, 1, auth.uid()) returning id into v_id;
  insert into public.problemes (cle_groupe, categorie, niveau, niveau_force, resume, proprietaire, sujet, destinataire, hm_nom, contrat_id,
                                question, options, diagnostic, diagnostic_par, journal)
  values ('bonus_test:' || v_id, 'paie', 'urgent', true,
          'Test bonus Upwork 1 $ (contrat ' || p_contrat || ')', 'pay_bot', 'hm', 'hm',
          'Test bonus 1 $ · ' || coalesce(v_nom, 'contrat ' || p_contrat),
          p_contrat,
          'Envoyer un bonus Upwork de 1 $ (note « Test bonus ») sur le contrat ' || p_contrat || coalesce(' (' || v_nom || ')', '')
            || ', depuis le compte Maximilien Kender, organisation VIk Studios ?',
          jsonb_build_array(
            jsonb_build_object('libelle', 'Envoyer le test 1 $', 'action', 'bonus_test', 'recommande', true),
            jsonb_build_object('libelle', 'Annuler', 'action', 'close')),
          'Test de la mutation sendCustomPayment (bonus classique, sans milestone) : rien ne part avant le clic.', 'os',
          jsonb_build_array(jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'bonus_test_prepare', 'test', v_id)))
  returning id into v_carte;
  update public.upwork_bonus_tests set probleme_id = v_carte where id = v_id;
  return v_id;
end;
$$;

-- Le clic dans la carte : option 0 → la fonction upwork envoie le test ; option 1 → annulé.
create or replace function public.bonus_test_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.upwork_bonus_tests;
begin
  if new.decision_choisie is null or old.decision_choisie is not distinct from new.decision_choisie then return new; end if;
  select * into b from public.upwork_bonus_tests where probleme_id = new.id and statut = 'a_confirmer';
  if not found then return new; end if;
  if new.decision_choisie = 0 then
    update public.upwork_bonus_tests set statut = 'en_cours' where id = b.id;
    perform net.http_post(
      url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := jsonb_build_object('action', 'bonus_test', 'id', b.id),
      timeout_milliseconds := 60000);
  else
    update public.upwork_bonus_tests set statut = 'annule' where id = b.id;
  end if;
  return new;
end;
$$;

create or replace trigger problemes_bonus_test
  after update of decision_choisie on public.problemes
  for each row execute function public.bonus_test_decision();

-- Le résultat lu et validé par Max : un nouveau test (ou les vrais bonus) redevient possible.
create or replace function public.bonus_test_valider(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'bonus_test_valider : réservé à l''admin' using errcode = '42501';
  end if;
  update public.upwork_bonus_tests set valide_at = now(), valide_par = auth.uid() where id = p_id and statut in ('envoye', 'erreur');
end;
$$;

revoke execute on function public.bonus_test_preparer(text) from public, anon;
revoke execute on function public.bonus_test_valider(uuid) from public, anon;
revoke execute on function public.bonus_test_decision() from public, anon, authenticated;
grant execute on function public.bonus_test_preparer(text) to authenticated;
grant execute on function public.bonus_test_valider(uuid) to authenticated;
