-- iSPEAK · estrutura do banco. Rode uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Antes: Authentication > Sign In / Providers > Email > desligue "Confirm email".
--
-- Login sem e-mail (mesmo padrão do Engefit): o Supabase exige um e-mail por conta, então o app usa um
-- endereço técnico derivado do @usuário (ana.silva -> ana-silva@ispeak.vercel.app). Ele não existe e não recebe nada.
--
-- Regra geral: o aluno só LÊ os próprios dados. Nota, XP, nível e competências são gravados pelo
-- servidor (funções da Vercel com a chave service_role), para ninguém inventar progresso.

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- Tabelas
-- =====================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  name          text not null default 'Aluno',
  level         text not null default 'PRE_A1'
                check (level in ('PRE_A1','A1','A2','B1','B2','C1','C2')),
  xp            integer not null default 0,
  streak        integer not null default 0,
  last_day      date,
  placed        boolean not null default false,   -- já fez a conversa de nivelamento
  eval_cooldown integer not null default 0,       -- sessões que faltam para liberar a prova de novo
  created_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('placement','normal','evaluation')),
  level          text not null,
  theme          text,
  mission        text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  score          integer,          -- nota da conversa 0–100
  idx_gramatica    integer,
  idx_vocabulario  integer,
  idx_compreensao  integer,
  idx_interacao    integer,
  xp             integer not null default 0,
  student_words  integer not null default 0,
  minutes        numeric(6,1) not null default 0,
  summary        text,             -- o resumo é a única memória da conversa (sem áudio, sem transcrição)
  acertos        jsonb,
  melhorias      jsonb,
  palavras       jsonb,
  foco_proximo   text,
  passed         boolean           -- só em provas de nível
);
create index if not exists sessions_user_idx on public.sessions(user_id, started_at desc);

create table if not exists public.competencies (
  user_id    uuid not null references auth.users(id) on delete cascade,
  code       text not null,        -- ex.: A1.4
  level      text not null,
  mastery    integer not null default 0,
  evidences  integer[] not null default '{}',   -- últimas 5 notas da competência
  updated_at timestamptz not null default now(),
  primary key (user_id, code)
);

create table if not exists public.error_tags (
  user_id   uuid not null references auth.users(id) on delete cascade,
  tag       text not null,
  count     integer not null default 1,
  last_seen timestamptz not null default now(),
  primary key (user_id, tag)
);

-- =====================================================================
-- Segurança: cada aluno lê só o que é dele; escrita só pelo servidor
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.sessions     enable row level security;
alter table public.competencies enable row level security;
alter table public.error_tags   enable row level security;

drop policy if exists profiles_own_read on public.profiles;
create policy profiles_own_read on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists sessions_own_read on public.sessions;
create policy sessions_own_read on public.sessions for select using (auth.uid() = user_id);
drop policy if exists competencies_own_read on public.competencies;
create policy competencies_own_read on public.competencies for select using (auth.uid() = user_id);
drop policy if exists error_tags_own_read on public.error_tags;
create policy error_tags_own_read on public.error_tags for select using (auth.uid() = user_id);

revoke insert, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.sessions, public.competencies, public.error_tags from anon, authenticated;

-- =====================================================================
-- Cadastro só com @usuário (cria o perfil junto; recusa repetido e e-mail real)
-- =====================================================================
create or replace function public.ispeak_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  un text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if un !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'ISPEAK: nome de usuário inválido';
  end if;
  if new.email is distinct from replace(un, '.', '-') || '@ispeak.vercel.app' then
    raise exception 'ISPEAK: cadastro só com nome de usuário';
  end if;
  insert into public.profiles (id, username, name)
  values (new.id, un, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Aluno'), 60));
  return new;
end $$;

drop trigger if exists ispeak_on_auth_user_created on auth.users;
create trigger ispeak_on_auth_user_created
  after insert on auth.users
  for each row execute function public.ispeak_new_user();

create or replace function public.username_available(u text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(trim(u)));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- O aluno pode mudar só o próprio nome. @usuário nunca muda; progresso só o servidor altera.
create or replace function public.ispeak_lock_profile()
returns trigger language plpgsql as $$
begin
  if new.username is distinct from old.username then
    raise exception 'ISPEAK: o nome de usuário não pode ser alterado';
  end if;
  if current_user in ('anon', 'authenticated') then
    new.level := old.level; new.xp := old.xp; new.streak := old.streak; new.last_day := old.last_day;
    new.placed := old.placed; new.eval_cooldown := old.eval_cooldown; new.created_at := old.created_at;
    new.name := left(coalesce(nullif(trim(new.name), ''), old.name), 60);
  end if;
  return new;
end $$;
drop trigger if exists ispeak_lock_profile on public.profiles;
create trigger ispeak_lock_profile before update on public.profiles
  for each row execute function public.ispeak_lock_profile();

-- Conta os erros recorrentes (só o servidor chama)
create or replace function public.ispeak_bump_errors(p_user uuid, p_tags text[])
returns void language sql security definer set search_path = public as $$
  insert into public.error_tags (user_id, tag, count, last_seen)
  select p_user, t, 1, now()
    from (select distinct lower(trim(x)) t from unnest(p_tags) x where length(trim(x)) between 2 and 60) s
  on conflict (user_id, tag) do update set count = error_tags.count + 1, last_seen = now();
$$;
revoke all on function public.ispeak_bump_errors(uuid, text[]) from public, anon, authenticated;
grant execute on function public.ispeak_bump_errors(uuid, text[]) to service_role;

-- =====================================================================
-- Código de recuperação (sem e-mail). Mostrado uma vez; aqui fica só o hash (bcrypt).
-- =====================================================================
create table if not exists public.recovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.recovery_attempts (
  username text not null,
  at timestamptz not null default now()
);
create index if not exists recovery_attempts_idx on public.recovery_attempts(username, at);
alter table public.recovery enable row level security;
alter table public.recovery_attempts enable row level security;
revoke all on public.recovery, public.recovery_attempts from anon, authenticated;

create or replace function public.ispeak_codigo_aleatorio()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- sem 0/O e 1/I
  b bytea := gen_random_bytes(12);
  c text := '';
begin
  for i in 0..11 loop c := c || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
  return substr(c, 1, 4) || '-' || substr(c, 5, 4) || '-' || substr(c, 9, 4);
end $$;

create or replace function public.ispeak_novo_codigo()
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'ISPEAK: entre na conta primeiro'; end if;
  c := public.ispeak_codigo_aleatorio();
  insert into public.recovery (user_id, code_hash, created_at)
  values (auth.uid(), crypt(replace(c, '-', ''), gen_salt('bf', 10)), now())
  on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = now();
  return c;
end $$;

create or replace function public.ispeak_tem_codigo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.recovery where user_id = auth.uid());
$$;

-- Troca a senha com @usuário + código; devolve um código NOVO. Limite de 5 tentativas por hora.
create or replace function public.ispeak_recuperar(p_usuario text, p_codigo text, p_senha text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  un text := lower(trim(both from replace(coalesce(p_usuario, ''), '@', '')));
  cod text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  uid uuid; h text; novo text;
begin
  if length(coalesce(p_senha, '')) < 6 then return jsonb_build_object('ok', false, 'erro', 'senha'); end if;
  delete from public.recovery_attempts where at < now() - interval '1 day';
  if (select count(*) from public.recovery_attempts where username = un and at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'erro', 'tentativas');
  end if;
  insert into public.recovery_attempts (username) values (un);

  select p.id into uid from public.profiles p where p.username = un;
  if uid is not null then select r.code_hash into h from public.recovery r where r.user_id = uid; end if;
  if h is null then
    perform crypt(cod, gen_salt('bf', 10));  -- mesmo tempo de resposta, exista o usuário ou não
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end if;
  if length(cod) <> 12 or crypt(cod, h) <> h then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end if;

  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf', 10)), updated_at = now() where id = uid;
  delete from auth.sessions where user_id = uid;
  delete from public.recovery_attempts where username = un;
  novo := public.ispeak_codigo_aleatorio();
  update public.recovery set code_hash = crypt(replace(novo, '-', ''), gen_salt('bf', 10)), created_at = now() where user_id = uid;
  return jsonb_build_object('ok', true, 'codigo', novo);
end $$;

-- Só para o administrador (no SQL Editor): select public.ispeak_admin_senha('usuario', 'senhaNova');
create or replace function public.ispeak_admin_senha(p_usuario text, p_senha text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  if length(coalesce(p_senha, '')) < 6 then raise exception 'ISPEAK: senha curta'; end if;
  select id into uid from public.profiles where username = lower(trim(p_usuario));
  if uid is null then raise exception 'ISPEAK: usuário não encontrado'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf', 10)), updated_at = now() where id = uid;
  delete from auth.sessions where user_id = uid;
  return 'Senha trocada para @' || lower(trim(p_usuario));
end $$;

revoke all on function public.ispeak_codigo_aleatorio(), public.ispeak_admin_senha(text, text) from public, anon, authenticated;
revoke all on function public.ispeak_novo_codigo(), public.ispeak_tem_codigo() from public, anon;
grant execute on function public.ispeak_novo_codigo(), public.ispeak_tem_codigo() to authenticated;
revoke all on function public.ispeak_recuperar(text, text, text) from public;
grant execute on function public.ispeak_recuperar(text, text, text) to anon, authenticated;
