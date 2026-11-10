-- Table générique : un enregistrement = une ligne, quel que soit son type (client, véhicule, puis intervention…).
CREATE TABLE records (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  seq        INTEGER NOT NULL
);
CREATE INDEX idx_records_seq ON records (seq);

-- Compteur monotone : chaque écriture reçoit un numéro, les appareils demandent « tout ce qui a un numéro > X ».
CREATE TABLE meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT INTO meta (k, v) VALUES ('seq', 0);

-- Anti force brute sur la connexion.
CREATE TABLE login_attempts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts ON login_attempts (ip, at);
