-- ══════════════════════════════════════════════════════════
-- 025 — Phase 0 cleanup: drop the orphaned kb_feedback table
--
-- kb_feedback was defined in 018_knowledge_base.sql:41-48 but has ZERO
-- references anywhere in the codebase — no endpoint, no controller, no
-- route, no seed script ever reads or writes it. It was scaffolding for a
-- knowledge-base feedback feature that was never wired up.
--
-- SAFETY GATE (performed before applying): SELECT COUNT(*) FROM kb_feedback
--   → returned 0 rows. Nothing is lost by dropping it.
--
-- NOTE: kb_articles is a DIFFERENT table and is actively used by the Smart
-- Knowledge feature. It is deliberately untouched here.
-- ══════════════════════════════════════════════════════════

DROP TABLE IF EXISTS kb_feedback;
