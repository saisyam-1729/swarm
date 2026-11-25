> **Archived copy.** Originally written on the local branch `fix/sensor-reading-sql-spacing` (tip `fb29bae`), which was not pushed
> to this repository. Commit IDs below refer to that branch. Kept here for history; see
> [`../WORKLOG_AND_HANDOVER.md`](../WORKLOG_AND_HANDOVER.md) for how this relates to the current `main`.

# Fix: fused `WHERE` in plant-scoped sensor reading queries

- **Branch:** `fix/sensor-reading-sql-spacing` (from `main` at `d18a083`)
- **Commit:** `ec5ea4f`
- **Type:** bug fix (backend). Restores intended behaviour; no feature change.

## Problem

Java text blocks strip trailing whitespace. In
`backend/src/main/java/com/biopower/repository/SensorReadingRepositoryImpl.java`, four queries were
built as `"""...WHERE """ + PLANT_MATCH`, so the SQL sent to PostgreSQL contained
`WHERECOALESCE(...)` and failed with a syntax error.

Affected methods, and what broke:

| Method | Symptom |
|--------|---------|
| `findByPlantAndTypeAndDateRange` | Analytics history (`GET /api/analytics/{plantId}`) returned HTTP 500 |
| `findLatestByPlantId` | Dashboard current readings failed once a plant had data |
| `findByPlantAndDateRange` | Same SQL error |
| `findFirstByPlantIdAndSensorTypeOrderByRecordedAtDesc` | Same SQL error |

The ingest flow also runs these queries, so this bug also blocks storing readings
(together with `fix/sensor-reading-save`).

## Change

- The four lines now end with the `\s` escape (`WHERE\s""" + PLANT_MATCH`), which keeps the space.
- A comment above `PLANT_MATCH` explains the pitfall.
- No other query in the backend used this pattern (checked with a search for text blocks ending in
  a space before `+`).

## Test

`backend/src/test/java/com/biopower/repository/SensorReadingRepositoryImplSqlTest.java` captures
the SQL of every native query in the class (mocked `EntityManager`) and fails if `WHERE`, `AND`,
`FROM` or `JOIN` is glued to the next token. It fails on the old code with the exact
`WHERECOALESCE` text and passes with the fix.

Verified locally against TimescaleDB: Analytics returns the stored series, and the Dashboard
shows the latest value.

## Revert

```bash
git revert ec5ea4f
```

Reverting brings the HTTP 500s back. If you do revert, keep the test file to stop the same
mistake being reintroduced, or delete it together with the fix.

## Related

`fix/sensor-reading-save` (`46c64f0`): ingest needs **both** fixes. Merge this one no later than
that one.
