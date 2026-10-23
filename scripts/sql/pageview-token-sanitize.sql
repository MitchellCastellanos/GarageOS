-- SEC-01/02/03: strip bearer tokens out of historical garageos."PageView".path WITHOUT deleting the visit.
-- Keeps the row (date, locale, device, country, daily visitorHash, counts); only the secret segment is removed:
--   /book/<slug>/manage/<token>            -> /book/<slug>/manage
--   /sales/<token>, /sales-invite/<token>, /portal/..., /quote/..., /inspection/..., /sales-recover/...,
--   /sales-recovery-email/..., /account-recovery/..., /activate-demo/...  -> /<family>
-- Runs in ONE transaction and aborts (nothing is written) unless the number of rows changed equals :expected
-- and no private-looking path with a token segment remains. Production procedure and approval gate:
-- docs/pageview-token-purge-runbook.md. NEVER run without a fresh Neon branch.
--
-- psql -v expected=6 -f scripts/sql/pageview-token-sanitize.sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE _pv_expected ON COMMIT DROP AS SELECT :expected::bigint AS n;
CREATE TEMP TABLE _pv_before ON COMMIT DROP AS SELECT count(*) AS total FROM garageos."PageView";

WITH fixed AS (
  UPDATE garageos."PageView"
  SET path = CASE
    WHEN path ~* '^/book/[^/]+/manage/' THEN regexp_replace(path, '^(/book/[^/]+/manage)/.*$', '\1', 'i')
    ELSE '/' || lower(split_part(path, '/', 2))
  END
  WHERE path ~* '^/(portal|quote|inspection|sales|sales-invite|sales-recover|sales-recovery-email|account-recovery|activate-demo)/.+'
     OR path ~* '^/book/[^/]+/manage/.+'
  RETURNING 1
)
SELECT count(*) AS changed INTO TEMP TABLE _pv_changed FROM fixed;

DO $$
DECLARE changed bigint; expected bigint; remaining bigint; before_n bigint; after_n bigint;
BEGIN
  SELECT n INTO expected FROM _pv_expected;
  SELECT c.changed INTO changed FROM _pv_changed c;
  SELECT total INTO before_n FROM _pv_before;
  SELECT count(*) INTO after_n FROM garageos."PageView";
  SELECT count(*) INTO remaining FROM garageos."PageView"
   WHERE path ~* '^/(portal|quote|inspection|sales|sales-invite|sales-recover|sales-recovery-email|account-recovery|activate-demo)/.+'
      OR path ~* '^/book/[^/]+/manage/.+';
  IF changed <> expected THEN RAISE EXCEPTION 'aborted: changed % rows, expected %', changed, expected; END IF;
  IF remaining <> 0 THEN RAISE EXCEPTION 'aborted: % token-bearing rows remain', remaining; END IF;
  IF before_n <> after_n THEN RAISE EXCEPTION 'aborted: row count changed % -> %', before_n, after_n; END IF;
  RAISE NOTICE 'ok: % rows sanitised, total unchanged (%)', changed, after_n;
END $$;
COMMIT;
