-- Journal des emails envoyés : une clé = un rappel précis, jamais renvoyé deux fois.
CREATE TABLE reminder_log (
  key     TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL
);
CREATE INDEX idx_reminder_log_sent ON reminder_log (sent_at);

-- Petites valeurs d'état (dernière exécution des rappels…).
CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
