-- Sync state for each Account (a Better Auth user). One synced Profile per Account.
CREATE TABLE sync_accounts (
  account_id TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  -- 'uploading' while the initial Profile upload is staged; 'ready' afterwards.
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready')),
  upload_id TEXT NOT NULL,
  -- Bumped by every staged upload chunk so completion detects concurrent writes.
  upload_revision INTEGER NOT NULL DEFAULT 0,
  -- Number of the latest accepted commit. Commits are serialized per Account by
  -- requiring this value to be unchanged when the commit batch runs.
  head_seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Current state of every synced record, including deletion markers. `seq` is the
-- commit that last changed the record, so pulling seq > position yields every
-- change since that position.
CREATE TABLE sync_records (
  account_id TEXT NOT NULL REFERENCES sync_accounts (account_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  -- Deck for Flashcards, Flashcard for Review units, Review unit for review logs,
  -- Deck for graphs and Deck settings.
  parent_id TEXT,
  version INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  -- JSON record data; NULL for deleted records.
  data TEXT,
  PRIMARY KEY (account_id, kind, id)
);

CREATE INDEX sync_records_seq_idx ON sync_records (account_id, seq, kind, id);
CREATE INDEX sync_records_parent_idx ON sync_records (account_id, kind, parent_id);

-- Records staged by the in-progress initial upload; published on completion.
CREATE TABLE sync_upload_records (
  account_id TEXT NOT NULL REFERENCES sync_accounts (account_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  parent_id TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (account_id, kind, id)
);

-- Results of accepted mutations, so a retried mutation returns its first result.
CREATE TABLE sync_mutations (
  account_id TEXT NOT NULL REFERENCES sync_accounts (account_id) ON DELETE CASCADE,
  mutation_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  result TEXT NOT NULL,
  PRIMARY KEY (account_id, mutation_id)
);

-- Flashcard media stored in R2 under accounts/<account_id>/media/<file_name>.
CREATE TABLE sync_media (
  account_id TEXT NOT NULL REFERENCES sync_accounts (account_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, file_name)
);
