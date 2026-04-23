-- Inquiries table for user contact/support
create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  body text not null,
  image_urls text[] default '{}',
  status text not null default 'open' check (status in ('open', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);

alter table inquiries enable row level security;

create policy "Users can insert their own inquiries"
  on inquiries for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own inquiries"
  on inquiries for select
  to authenticated
  using (auth.uid() = user_id);

-- Storage bucket for inquiry images
insert into storage.buckets (id, name, public)
values ('inquiries', 'inquiries', false)
on conflict (id) do nothing;

create policy "Users can upload inquiry images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'inquiries' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own inquiry images"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'inquiries' and (storage.foldername(name))[1] = auth.uid()::text);
