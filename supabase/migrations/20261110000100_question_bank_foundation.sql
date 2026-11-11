-- Resgatista Web 3.0
-- Migration preparada para ambiente de desenvolvimento. NÃO aplicar na base compartilhada
-- até existir ambiente isolado e os fluxos de CRUD/importação terem sido testados.

create table if not exists public.resgatista_v2_question_bank (
  id uuid primary key default gen_random_uuid(),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  options jsonb not null check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  ),
  correct_option smallint not null check (
    correct_option >= 0 and correct_option < jsonb_array_length(options)
  ),
  explanation text,
  course text not null default '',
  subject text not null default '',
  difficulty text not null default 'intermediate'
    check (difficulty in ('basic', 'intermediate', 'advanced')),
  question_type text not null default 'multiple_choice'
    check (question_type in ('multiple_choice', 'true_false', 'case_based')),
  tags text[] not null default '{}',
  image_url text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resgatista_v2_question_bank_course_subject_idx
  on public.resgatista_v2_question_bank (course, subject);
create index if not exists resgatista_v2_question_bank_filters_idx
  on public.resgatista_v2_question_bank (difficulty, question_type, is_active);
create index if not exists resgatista_v2_question_bank_tags_idx
  on public.resgatista_v2_question_bank using gin (tags);

-- A avaliação guarda um snapshot próprio da questão. A referência ao banco é apenas
-- para rastreabilidade; editar a questão-mãe não altera a prova já montada.
alter table public.resgatista_v2_questions
  add column if not exists question_bank_id uuid
  references public.resgatista_v2_question_bank(id) on delete set null;

create index if not exists resgatista_v2_questions_question_bank_id_idx
  on public.resgatista_v2_questions (question_bank_id);

alter table public.resgatista_v2_question_bank enable row level security;
revoke all on public.resgatista_v2_question_bank from anon, authenticated;
grant all on public.resgatista_v2_question_bank to service_role;

comment on table public.resgatista_v2_question_bank is
  'Banco central de questões reutilizáveis do Resgatista Web 3.0. Alterações não modificam snapshots já aplicados.';
comment on column public.resgatista_v2_questions.question_bank_id is
  'Questão de origem no banco central; o conteúdo desta avaliação permanece como snapshot independente.';
