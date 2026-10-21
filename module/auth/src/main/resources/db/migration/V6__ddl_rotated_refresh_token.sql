-- Hashes of rotated-out refresh tokens; presenting one again revokes its authorization (reuse detection).
CREATE TABLE auth.rotated_refresh_token
(
    token_hash       char(64) PRIMARY KEY,
    authorization_id varchar(100) NOT NULL REFERENCES auth.oauth2_authorization (id) ON DELETE CASCADE,
    rotated_at       timestamptz  NOT NULL DEFAULT current_timestamp
);

CREATE INDEX idx_rotated_refresh_token_authorization_id ON auth.rotated_refresh_token (authorization_id);
