> **Archived copy.** Originally written on the local branch `fix/sensor-reading-save` (tip `4506a51`), which was not pushed
> to this repository. Commit IDs below refer to that branch. Kept here for history; see
> [`../WORKLOG_AND_HANDOVER.md`](../WORKLOG_AND_HANDOVER.md) for how this relates to the current `main`.

# Fix: telemetry inserts failed (`SensorReading` composite id)

- **Branch:** `fix/sensor-reading-save` (from `main` at `d18a083`)
- **Commit:** `46c64f0`
- **Type:** bug fix (backend). Restores intended behaviour; no feature change. No database change.

## Problem

`SensorReading` was mapped with `@IdClass(SensorReadingId.class)` (`id` + `recordedAt`) **and**
`@GeneratedValue(strategy = IDENTITY)` on `id`. Hibernate does not support identity generation
inside a composite id, so every `sensorReadingRepository.save()` threw:

> Identity generation isn't supported for composite ids

Every ingest path goes through `TelemetryIngestService` → `save()`: `POST /api/iot/data`,
`POST /api/iot/batch` (used by the ESP hub) and MQTT. So **no sensor reading could be stored**.
The mapping arrived with commit `aff2c9c`. Unit tests didn't catch it because
`TelemetryIngestServiceTest` mocks `save()`.

## Change

| File | Change |
|------|--------|
| `model/entity/SensorReading.java` | Removed `@IdClass` and the `@Id` on `recordedAt`; `id` is the only JPA id (still `IDENTITY`). `recordedAt` stays `@Column(name = "recorded_at", nullable = false)`. A comment explains why. |
| `repository/SensorReadingRepository.java` | `JpaRepository<SensorReading, SensorReadingId>` → `JpaRepository<SensorReading, Long>` |
| `model/entity/SensorReadingId.java` | Deleted (no other references) |

**Why this is safe:** the table is unchanged and still has `PRIMARY KEY (id, recorded_at)`, which
TimescaleDB requires. `id` is `GENERATED ALWAYS AS IDENTITY`, so it is already unique on its own.
Hibernate inserts without supplying `id` and reads the generated value back. The `@PrePersist`
hook that writes `plant_id` / `node_id` into `metadata` is unchanged, so the read queries still
find new readings. Nothing in the code looks a reading up by its id.

## Test

- `backend/src/test/java/com/biopower/model/entity/SensorReadingMappingTest.java` fails if the
  entity goes back to `@IdClass`, has more than one `@Id`, or loses its `IDENTITY` id. It fails
  on the old mapping and passes now.
- Full backend suite: 67 tests pass.
- Hibernate schema validation passes at startup against TimescaleDB.
- End to end (verified together with `fix/sensor-reading-sql-spacing`): `POST /api/iot/data` and
  `/api/iot/batch` return 201, the rows are stored with the correct `plant_id` / `node_id`, and the
  readings appear in Analytics and on the Dashboard.

**Not tested:** MQTT ingest (disabled locally; it uses the same save path). There is also no
repository test against a real database (e.g. Testcontainers); that is the recommended follow-up.

## Revert

```bash
git revert 46c64f0
```

Reverting makes every reading save fail again.

## Related

`fix/sensor-reading-sql-spacing` (`ec5ea4f`): ingest needs **both** fixes. With only this branch,
the save succeeds but the same request then fails on the `WHERECOALESCE` SQL.
