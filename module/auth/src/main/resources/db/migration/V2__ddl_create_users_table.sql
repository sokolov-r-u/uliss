create table if not exists auth.users
(
    id            uuid primary key,
    email         varchar(254) not null,
--     use BCrypt it will include salt in hash
    password_hash varchar(60)  not null,
    status        varchar(20)  not null check (status in ('ACTIVE', 'DISABLED', 'PENDING_VERIFICATION')),
    created_at    timestamptz  not null,
    updated_at    timestamptz  not null,
    version       bigint
);

create unique index users_email_unique on auth.users (lower(email));