// Pendum Body's vault descriptor (docs/vault.md §2): what a backup holds, how a restore treats device state and Health
// provenance, and the app's hooks around both. It must load in Node: modules that reach native code, React or the live
// database are imported inside the functions that use them.
import type {
  DescribeContext,
  RestoreContext,
  SummaryValues,
  VaultApp,
  VaultIssue,
  VaultSql,
} from "@/vault/types";
import { csvFile } from "@/vault/engine/csv";
import { countWhere, jsonObject, notIn } from "@/vault/engine/db";
import { interpolate, translate, type Message } from "@/lib/translations";

import migrations from "../drizzle/migrations";

/** App-generated photo names (`${Date.now()}-${random}.${ext}`) and demo seeds (`day-000-front.png`). */
const MEDIA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const LB_PER_KG = 2.20462262;

const upsert = (key: string, value: string): VaultSql => ({
  sql: "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  params: [key, value],
});

function phrase(ctx: DescribeContext, key: Message, values: Record<string, string | number>) {
  return interpolate(translate(ctx.language, key), values);
}

type CountKey = "vaultWeightCount" | "vaultMeasurementCount" | "vaultPhotoCount";

/** "{n} weights" / "{n} weight"; nothing for zero. */
function count(ctx: DescribeContext, key: CountKey, value: SummaryValues[string]) {
  const n = Number(value ?? 0);
  if (!(n > 0)) return [];
  const one = `${key}One` as const;
  return [phrase(ctx, ctx.plural(n) === "one" ? one : key, { n: ctx.number(n) })];
}

/** Provenance policy on the scratch DB (spec §5.3). The merge with the live links happens in the swap (§5.4). */
function healthPolicy(ctx: RestoreContext): VaultSql[] {
  if (ctx.legacy || ctx.sameDevice) return [];
  // The client ids (link keys) are kept: re-enabling sync upserts each record under its original id. Only what
  // belongs to the other store is reset: its sample ids (cross-platform) and the fingerprints that skip a rewrite.
  if (ctx.crossPlatform)
    return [
      { sql: "UPDATE health_links SET remote_id = '', fingerprint = '' WHERE origin = 'local'" },
    ];
  return [
    {
      sql: "UPDATE health_links SET fingerprint = '' WHERE origin = 'local' AND fingerprint <> 'deleted'",
    },
  ];
}

const DATES =
  "SELECT measured_at AS m FROM weight_entries UNION ALL SELECT measured_at FROM measurements UNION ALL SELECT measured_at FROM photos";

export const vaultApp: VaultApp = {
  id: "body",
  database: {
    name: "body_track.db",
    acquire: async () => (await import("@/db")).expoDb,
    release: async () => {},
  },
  migrations,
  tables: [
    { name: "weight_entries", mode: "replace", role: "data" },
    { name: "measurements", mode: "replace", role: "data" },
    { name: "photos", mode: "replace", role: "data" },
    {
      name: "preferences",
      mode: "keys",
      role: "settings",
      keys: {
        keyColumn: "key",
        valueColumn: "value",
        include: ["theme", "units", "language", "formula", "installation", "healthInstallations"],
        provenance: ["installation", "healthInstallations"],
      },
    },
    { name: "health_links", mode: "replace", role: "provenance" },
  ],
  media: [{ set: "progress-photos", directory: "progress-photos", table: "photos", column: "uri" }],
  summary: {
    weights: "SELECT count(*) AS v FROM weight_entries",
    measurements: "SELECT count(*) AS v FROM measurements",
    photos: "SELECT count(*) AS v FROM photos",
    first: `SELECT min(substr(m, 1, 10)) AS v FROM (${DATES})`,
    latest: `SELECT max(m) AS v FROM (${DATES})`,
  },
  describe: (values, ctx) => [
    ...count(ctx, "vaultWeightCount", values.weights),
    ...count(ctx, "vaultMeasurementCount", values.measurements),
    ...count(ctx, "vaultPhotoCount", values.photos),
    ...(values.first == null ? [] : [phrase(ctx, "vaultSince", { date: ctx.date(values.first) })]),
  ],
  csv: async (snapshot) => {
    const weights = snapshot.getAllSync<{ measured_at: string; weight_kg: number; health: number }>(
      `SELECT measured_at, weight_kg, EXISTS (SELECT 1 FROM health_links l WHERE l.origin = 'health'
         AND l.local_kind = 'weight' AND l.local_id = w.id) AS health
       FROM weight_entries w ORDER BY measured_at, id`
    );
    const sites = snapshot.getAllSync<{
      measured_at: string;
      kind: string;
      site: string;
      value: number;
    }>(
      `SELECT m.measured_at, m.kind, j.key AS site, j.value AS value
       FROM measurements m, json_each(m."values") j ORDER BY m.measured_at, m.id, j.id`
    );
    const photos = snapshot.getAllSync<{ measured_at: string; pose: string; uri: string }>(
      "SELECT measured_at, pose, uri FROM photos ORDER BY measured_at, id"
    );
    return [
      {
        name: "weights.csv",
        text: csvFile([
          ["measured_at", "weight_kg", "weight_lb", "source"],
          ...weights.map((w) => [
            w.measured_at,
            w.weight_kg,
            (w.weight_kg * LB_PER_KG).toFixed(1),
            w.health ? "health" : "app",
          ]),
        ]),
      },
      {
        name: "measurements.csv",
        text: csvFile([
          ["measured_at", "kind", "site", "value", "unit"],
          ...sites.map((s) => [
            s.measured_at,
            s.kind,
            s.site,
            s.value,
            s.site === "bodyFat" ? "%" : "cm",
          ]),
        ]),
      },
      {
        name: "photos.csv",
        text: csvFile([
          ["day", "pose", "file"],
          ...photos.map((p) => [p.measured_at, p.pose, p.uri]),
        ]),
      },
    ];
  },
  validate(db) {
    const issues: VaultIssue[] = [];
    const fatal = (table: string, message: string, found: boolean) => {
      if (found) issues.push({ table, fatal: true, message });
    };
    // The app switches on these values and parses `values` without guards (spec §4.2).
    fatal(
      "measurements",
      "value:kind",
      countWhere(db, "measurements", notIn("kind", ["height", "body"])) > 0
    );
    fatal(
      "measurements",
      "json:values",
      countWhere(
        db,
        "measurements",
        `${jsonObject('"values"')} OR EXISTS (SELECT 1 FROM json_each(measurements."values") WHERE type NOT IN ('integer','real'))`
      ) > 0
    );
    fatal(
      "photos",
      "value:pose",
      countWhere(db, "photos", notIn("pose", ["front", "side", "back"])) > 0
    );
    fatal(
      "photos",
      "value:uri",
      db.getAllSync<{ uri: string }>("SELECT uri FROM photos").some((p) => !MEDIA_NAME.test(p.uri))
    );
    return issues;
  },
  prepareScratch: healthPolicy,
  deviceOverrides: () => [
    upsert("healthSyncEnabled", "false"),
    upsert("healthSyncError", ""),
    upsert("lastSync", ""),
  ],
  healthEnabledSql: "SELECT value = 'true' AS v FROM preferences WHERE key = 'healthSyncEnabled'",
  health: {
    clientPrefix: "body-track",
    rowTables: {
      weight: "weight_entries",
      height: "measurements",
      waist: "measurements",
      bodyFat: "measurements",
    },
  },
  hooks: {
    pauseWhenIdle: async (work, ms) => (await import("@/lib/health")).pauseWhenIdle(work, ms),
    afterRestore: async () => {
      // Health sync is off after every restore: this unregisters the daily background sync.
      await (await import("@/lib/health-schedule")).configureHealthSchedule();
    },
  },
  backgroundIntervalMinutes: 1440,
  syncIdTables: ["weight_entries", "measurements", "photos"],
  excludedTables: ["counter_logs"],
};
