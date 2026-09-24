-- =====================================================================
-- Loan Portal — Supabase database setup
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- It is safe to run again (it only creates what is missing / replaces functions).
--
-- What it creates
--   profiles        one row per account (name, email, mobile)
--   applications    loan applications (each person sees only their own)
--   notifications   messages shown under the bell icon
--   storage bucket  "application-documents" (private, 5 MB, PDF/JPG/PNG)
-- Security
--   Row Level Security on every table: auth.uid() must match the owner.
--   Reference numbers, status history and notifications are written by the
--   database itself, so they can't be faked from the browser.
-- =====================================================================

create extension if not exists pgcrypto;

-- Safety check: stop if this Supabase project already holds tables from a different app
-- with the same names (for example the older loan portal). Use a new, empty project instead.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'applications')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications' and column_name = 'documents'
                     and exists (select 1 from information_schema.columns c2 where c2.table_schema = 'public' and c2.table_name = 'applications' and c2.column_name = 'step')) then
    raise exception 'This Supabase project already has an "applications" table from another app. Create a new Supabase project for this website and run this file there.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') then
    raise exception 'This Supabase project already has a "profiles" table from another app. Create a new Supabase project for this website and run this file there.';
  end if;
end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  phone       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Only name and mobile can be changed from the website.
revoke update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- A profile is created automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (new.id,
          left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
          coalesce(new.email, ''),
          left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), 10))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.profiles_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if length(new.full_name) < 2 then raise exception 'Enter your full name.' using errcode = '22023'; end if;
  if new.phone <> '' and new.phone !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a 10-digit mobile number starting with 6–9.' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.profiles_touch();

-- ---------------------------------------------------------------- applications
create sequence if not exists public.application_ref_seq start 100001;

create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status        text not null default 'draft'
                check (status in ('draft','submitted','with_bank','sanctioned','disbursed','rejected','withdrawn')),
  step          text not null default 'personal',
  data          jsonb not null default '{}'::jsonb,   -- form answers, one object per step
  documents     jsonb not null default '{}'::jsonb,   -- uploaded file details, keyed by document type
  history       jsonb not null default '[]'::jsonb,   -- status changes (written by the database)
  status_note   text,                                 -- note for the next status change
  reminded_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  submitted_at  timestamptz
);
create index if not exists applications_user_idx on public.applications (user_id, updated_at desc);
alter table public.applications enable row level security;

drop policy if exists applications_select_own on public.applications;
create policy applications_select_own on public.applications for select to authenticated using (user_id = auth.uid());
drop policy if exists applications_insert_own on public.applications;
create policy applications_insert_own on public.applications for insert to authenticated with check (user_id = auth.uid());
drop policy if exists applications_update_own on public.applications;
create policy applications_update_own on public.applications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists applications_delete_own_draft on public.applications;
create policy applications_delete_own_draft on public.applications for delete to authenticated using (user_id = auth.uid() and status = 'draft');

revoke all on public.applications from anon;
grant select, insert, update, delete on public.applications to authenticated;

-- Required answers (must match STEPS in public/js/shared.js).
create or replace function public.application_missing(p_data jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(label order by ord), '{}')
  from (values
    (1,'personal','name','Full name'), (2,'personal','dob','Date of birth'), (3,'personal','phone','Mobile number'), (4,'personal','pan','PAN number'),
    (5,'address','address','Address'), (6,'address','city','City'), (7,'address','state','State'), (8,'address','pincode','PIN code'),
    (9,'work','empType','Employment type'), (10,'work','employer','Employer / business name'), (11,'work','experience','Work experience'), (12,'work','income','Monthly income'),
    (13,'loan','loanType','Loan type'), (14,'loan','amount','Loan amount'), (15,'loan','tenure','Tenure')
  ) as req(ord, step, key, label)
  where coalesce(btrim(p_data -> step ->> key), '') = ''
$$;

-- New application: the database sets the owner, reference number and first history entry.
create or replace function public.applications_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id    := auth.uid();
  new.ref        := 'REF-' || to_char(now(), 'YYYY') || '-' || nextval('public.application_ref_seq');
  new.status     := 'draft';
  new.documents  := coalesce(new.documents, '{}'::jsonb);
  new.history    := jsonb_build_array(jsonb_build_object('status', 'draft', 'at', now(), 'note', 'Application started'));
  new.created_at := now(); new.updated_at := now(); new.submitted_at := null; new.reminded_at := null; new.status_note := null;
  return new;
end $$;
drop trigger if exists applications_before_insert on public.applications;
create trigger applications_before_insert before insert on public.applications
  for each row execute function public.applications_before_insert();

-- Changes: lock the owner/reference, validate submission, keep the status history.
create or replace function public.applications_before_update()
returns trigger language plpgsql as $$
declare missing text[];
begin
  new.id := old.id; new.user_id := old.user_id; new.ref := old.ref; new.created_at := old.created_at;
  new.history := old.history; new.reminded_at := case when new.reminded_at is distinct from old.reminded_at and current_setting('app.reminder', true) = 'on' then new.reminded_at else old.reminded_at end;
  new.submitted_at := old.submitted_at;

  if old.status <> 'draft' and new.data is distinct from old.data then
    raise exception 'This application has been submitted and can''t be edited.' using errcode = '42501';
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'A submitted application can''t go back to incomplete.' using errcode = '42501';
  end if;
  if old.status = 'draft' and new.status not in ('draft', 'submitted') then
    raise exception 'Submit the application first.' using errcode = '42501';
  end if;
  if old.status = 'draft' and new.status = 'submitted' then
    missing := public.application_missing(new.data);
    if array_length(missing, 1) > 0 then
      raise exception 'Complete these first: %', array_to_string(missing, ', ') using errcode = '23514';
    end if;
    new.submitted_at := now();
  end if;
  if new.status <> old.status then
    new.history := old.history || jsonb_build_array(jsonb_build_object('status', new.status, 'at', now(),
      'note', coalesce(nullif(btrim(left(new.status_note, 300)), ''), case new.status when 'submitted' then 'Application submitted' else '' end)));
  end if;
  new.status_note := null;
  if octet_length(new.data::text) > 100000 or octet_length(new.documents::text) > 20000 then
    raise exception 'Too much data in this application.' using errcode = '22023';
  end if;
  new.updated_at := case when current_setting('app.reminder', true) = 'on' then old.updated_at else now() end;
  return new;
end $$;
drop trigger if exists applications_before_update on public.applications;
create trigger applications_before_update before update on public.applications
  for each row execute function public.applications_before_update();

-- Save one step of the form. Merges into that step only, so two quick saves can never overwrite each other.
create or replace function public.save_application_step(p_id uuid, p_step text, p_data jsonb)
returns setof public.applications language plpgsql security invoker set search_path = public as $$
begin
  if p_step not in ('personal', 'address', 'work', 'loan') then
    raise exception 'Unknown form step.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'Invalid form data.' using errcode = '22023';
  end if;
  return query
    update public.applications
       set data = jsonb_set(data, array[p_step], coalesce(data -> p_step, '{}'::jsonb) || p_data, true),
           step = p_step
     where id = p_id
    returning *;
end $$;
revoke execute on function public.save_application_step(uuid, text, jsonb) from public, anon;
grant execute on function public.save_application_step(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- notifications
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  app_id      uuid references public.applications (id) on delete cascade,
  text        text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());

revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;   -- only "mark as read"; nobody can insert from the browser

create or replace function public.notify(p_user uuid, p_text text, p_app uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, text, app_id) values (p_user, p_text, p_app);
$$;
revoke execute on function public.notify(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.profiles_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.id, 'Welcome! Start your first loan application from the dashboard.', null);
  return new;
end $$;
drop trigger if exists profiles_after_insert on public.profiles;
create trigger profiles_after_insert after insert on public.profiles for each row execute function public.profiles_after_insert();

create or replace function public.applications_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare labels jsonb := '{"submitted":"Submitted","with_bank":"With bank","sanctioned":"Sanctioned","disbursed":"Disbursed","rejected":"Rejected","withdrawn":"Withdrawn"}';
        note text;
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.user_id, 'Application ' || new.ref || ' started. It saves automatically as you type.', new.id);
  elsif new.status <> old.status then
    note := new.history -> -1 ->> 'note';
    if new.status = 'submitted' and old.status = 'draft' then
      perform public.notify(new.user_id, 'Application ' || new.ref || ' submitted. Keep this reference number for any follow-up.', new.id);
    else
      perform public.notify(new.user_id, new.ref || ' marked as ' || coalesce(labels ->> new.status, new.status) || '.' ||
        case when coalesce(note, '') <> '' then ' ' || note else '' end, new.id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists applications_after_change on public.applications;
create trigger applications_after_change after insert or update on public.applications
  for each row execute function public.applications_after_change();

-- Reminder for applications left incomplete for 2+ days (called by the website after sign-in).
create or replace function public.remind_incomplete()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  perform set_config('app.reminder', 'on', true);
  for r in select * from public.applications
           where user_id = auth.uid() and status = 'draft' and updated_at < now() - interval '2 days'
             and (reminded_at is null or reminded_at < now() - interval '2 days') loop
    update public.applications set reminded_at = now() where id = r.id;
    perform public.notify(r.user_id, 'Application ' || r.ref || ' is still incomplete. Finish it to submit.', r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.remind_incomplete() from public, anon;
grant execute on function public.remind_incomplete() to authenticated;

-- ---------------------------------------------------------------- document storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-documents', 'application-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Files live at  <user id>/<application id>/<file>  and only their owner can touch them.
drop policy if exists app_docs_select on storage.objects;
create policy app_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'application-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists app_docs_insert on storage.objects;
create policy app_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'application-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.applications a where a.id::text = (storage.foldername(name))[2] and a.user_id = auth.uid()
                          and a.status not in ('disbursed', 'rejected', 'withdrawn')));
drop policy if exists app_docs_delete on storage.objects;
create policy app_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'application-documents' and (storage.foldername(name))[1] = auth.uid()::text);
