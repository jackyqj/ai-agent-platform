-- D20：加密凭据表。明文不入库；nonce + ciphertext 由控制面用 SECRETS_MASTER_KEY 加解密。
CREATE TABLE IF NOT EXISTS credential_secrets (
  ref text PRIMARY KEY,
  nonce bytea NOT NULL,
  ciphertext bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
