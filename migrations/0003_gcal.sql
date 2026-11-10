-- Ce qui a déjà été envoyé à Google Agenda : un enregistrement ↔ un événement, avec l'empreinte de son contenu.
CREATE TABLE gcal_sync (
  record_id TEXT PRIMARY KEY,
  event_id  TEXT NOT NULL,
  hash      TEXT NOT NULL,
  synced_at INTEGER NOT NULL
);
