PRAGMA foreign_keys = ON;

CREATE TABLE auth_user (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE auth_session (
  id TEXT NOT NULL PRIMARY KEY,
  expiresAt DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES auth_user(id) ON DELETE CASCADE
);

CREATE TABLE auth_account (
  id TEXT NOT NULL PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt DATE,
  refreshTokenExpiresAt DATE,
  scope TEXT,
  password TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  FOREIGN KEY (userId) REFERENCES auth_user(id) ON DELETE CASCADE
);

CREATE TABLE auth_verification (
  id TEXT NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt DATE NOT NULL,
  createdAt DATE,
  updatedAt DATE
);

CREATE INDEX idx_auth_session_user ON auth_session(userId);
CREATE INDEX idx_auth_session_token ON auth_session(token);
CREATE INDEX idx_auth_account_user ON auth_account(userId);
CREATE UNIQUE INDEX idx_auth_account_provider_identity
  ON auth_account(providerId, accountId);
CREATE INDEX idx_auth_verification_identifier
  ON auth_verification(identifier);
