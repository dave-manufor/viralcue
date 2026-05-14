-- RenameEnum: Rename IntegrationProvider to Platforms
-- This is a safe rename operation that preserves existing data

ALTER TYPE "IntegrationProvider" RENAME TO "Platforms";
