-- Every code exchange, refresh and revocation looks an authorization up by a token value or state. Hash indexes:
-- JWT values exceed the btree row size limit.
CREATE INDEX idx_oauth2_authorization_state ON auth.oauth2_authorization USING hash (state);
CREATE INDEX idx_oauth2_authorization_code_value ON auth.oauth2_authorization USING hash (authorization_code_value);
CREATE INDEX idx_oauth2_authorization_access_token_value ON auth.oauth2_authorization USING hash (access_token_value);
CREATE INDEX idx_oauth2_authorization_refresh_token_value ON auth.oauth2_authorization USING hash (refresh_token_value);
CREATE INDEX idx_oauth2_authorization_id_token_value ON auth.oauth2_authorization USING hash (oidc_id_token_value);

ALTER TABLE auth.oauth2_registered_client
    ADD CONSTRAINT oauth2_registered_client_client_id_unique UNIQUE (client_id);
