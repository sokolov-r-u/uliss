create table if not exists profile.users
(
    id           uuid primary key,
    auth_id      uuid        not null unique,
    display_name varchar(32),
    created_at   timestamptz not null,
    updated_at   timestamptz not null
)