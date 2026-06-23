create table if not exists auth.signing_keys
(
    id          uuid primary key,
    private_key text        not null,
    public_key  text        not null,
    created_at  timestamptz not null,
    updated_at  timestamptz not null,
    version     bigint
)