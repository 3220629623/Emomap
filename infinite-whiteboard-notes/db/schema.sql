create table if not exists users (
  id text primary key,
  device_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists wallets (
  user_id text primary key references users(id) on delete cascade,
  write_credits bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint wallets_non_negative check (write_credits >= 0)
);

create table if not exists wallet_transactions (
  id bigserial primary key,
  user_id text not null references users(id) on delete cascade,
  payment_id bigint,
  note_id text,
  delta bigint not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id bigserial primary key,
  user_id text not null references users(id) on delete cascade,
  out_trade_no text not null unique,
  transaction_id text unique,
  amount_cents integer not null,
  status text not null default 'pending',
  code_url text,
  raw_notify jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists notes (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  x double precision not null,
  y double precision not null,
  cell_x integer not null,
  cell_y integer not null,
  text text not null,
  color text not null,
  status text not null default 'published',
  visibility text not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists note_images (
  id bigserial primary key,
  note_id text not null references notes(id) on delete cascade,
  url text not null,
  width integer,
  height integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists notes_cell_idx on notes (cell_x, cell_y) where status = 'published' and visibility = 'visible';
create index if not exists notes_user_idx on notes (user_id);
create index if not exists wallet_transactions_user_idx on wallet_transactions (user_id, created_at desc);
create index if not exists payments_user_idx on payments (user_id, created_at desc);
