-- Compatibility entry point for psql. The historical destructive seed is
-- replaced by the idempotent, rule-compliant local fixture set.
\ir seed.sql
