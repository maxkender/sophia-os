-- 0831 : la relance « proposition Upwork après 7 jours bloqué » (upwork_7j) n'était jamais notée : la contrainte de
-- ruul_email_relances refusait l'étape, et l'anti-doublon de ruul_bloques_7j s'appuie sur cette ligne. On l'autorise.
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.ruul_email_relances'::regclass and conname = 'ruul_email_relances_etape_0747')
     and not exists (select 1 from pg_constraint where conrelid = 'public.ruul_email_relances'::regclass
                      and conname = 'ruul_email_relances_etape_0747' and pg_get_constraintdef(oid) like '%upwork_7j%') then
    alter table public.ruul_email_relances drop constraint ruul_email_relances_etape_0747;
    alter table public.ruul_email_relances add constraint ruul_email_relances_etape_0747
      check (etape = any (array['j1', 'j3', 'vendredi', 'upwork_7j']) or etape ~ '^kyc_[0-9]{4}-[0-9]{2}-[0-9]{2}$');
  end if;
end $$;
