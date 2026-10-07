// Pendum Body's own vault tests (app-owned; docs/vault.md §12, spec §13.3): Health provenance through restores with the
// real health.ts and the real Apple Health / Health Connect adapters over stores that behave like HealthKit and
// Health Connect, the descriptor's validators, media plan, CSV and describe(), and the Health pause the vault takes.
// The generic vault tests (tests/vault/*.cjs) run against the same descriptor through tests/vault.test.cjs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs");

const vault = require("./vault-harness.cjs");

const DAY = 86400000;
const NO_DATA = "No data available for the specified predicate";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** An ISO time `days` ago, whole seconds (inside Health Connect's 29-day read window for days < 29). */
const ago = (days) => {
  const date = new Date(Date.now() - days * DAY - 3600000);
  date.setUTCMilliseconds(0);
  return date.toISOString();
};

/**
 * Apple Health as one Apple Account sees it (every iPhone of that account shares it): samples keyed by uuid,
 * upserts by HKSyncIdentifier (a save under an existing sync id replaces that sample with a new uuid), deletes of
 * nothing reject like HealthKit, and a uuid delete with an empty id is a test failure.
 */
function appleHealth() {
  const samples = new Map();
  const log = { saves: [], deletes: [], violations: [] };
  const violation = (message) => {
    log.violations.push(message);
    throw new assert.AssertionError({ message });
  };
  const hk = {
    isHealthDataAvailable: () => true,
    requestAuthorization: async () => true,
    authorizationStatusFor: () => 2,
    AuthorizationStatus: { sharingAuthorized: 2 },
    ComparisonPredicateOperator: { equalTo: 4 },
    async queryQuantitySamples(type) {
      return [...samples.values()]
        .filter((s) => s.type === type)
        .map((s) => ({
          uuid: s.uuid,
          quantity: s.quantity,
          startDate: new Date(s.startDate),
          metadata: { ...s.metadata },
        }));
    },
    async saveQuantitySample(type, unit, quantity, start, _end, metadata = {}) {
      const syncId = metadata.HKSyncIdentifier;
      const old =
        syncId === undefined
          ? undefined
          : [...samples.values()].find(
              (s) => s.type === type && s.metadata.HKSyncIdentifier === syncId
            );
      if (old && !(metadata.HKSyncVersion >= old.metadata.HKSyncVersion))
        violation(`HKSyncVersion of ${syncId} went down`);
      if (old) samples.delete(old.uuid);
      const uuid = randomUUID().toUpperCase();
      samples.set(uuid, {
        uuid,
        type,
        unit,
        quantity,
        startDate: start.toISOString(),
        metadata: { ...metadata },
      });
      log.saves.push({ type, syncId, uuid, replaced: old?.uuid ?? null });
      return { uuid };
    },
    async deleteObjects(type, filter) {
      let match;
      if (filter.uuid !== undefined) {
        if (filter.uuid === "") violation("a uuid delete with an empty id");
        log.deletes.push({ type, uuid: filter.uuid });
        match = (s) => s.uuid === filter.uuid;
      } else {
        const { withMetadataKey, operatorType, value } = filter.metadata ?? {};
        if (withMetadataKey !== "HKSyncIdentifier" || operatorType !== 4 || !value)
          violation(`unexpected delete filter ${JSON.stringify(filter)}`);
        log.deletes.push({ type, syncId: value });
        match = (s) => s.metadata.HKSyncIdentifier === value;
      }
      const gone = [...samples.values()].filter((s) => s.type === type && match(s));
      if (!gone.length) throw new Error(NO_DATA);
      for (const s of gone) samples.delete(s.uuid);
      return gone.length;
    },
  };
  return {
    hk,
    samples,
    log,
    /** A reading another app (a scale) wrote: no sync id of this app. */
    add(type, quantity, at, metadata = {}) {
      const uuid = randomUUID().toUpperCase();
      samples.set(uuid, { uuid, type, unit: "kg", quantity, startDate: at, metadata });
      return uuid;
    },
    syncIds: () => [...samples.values()].map((s) => s.metadata.HKSyncIdentifier).sort(),
    bySyncId: (id) => [...samples.values()].find((s) => s.metadata.HKSyncIdentifier === id),
  };
}

const BODY_MASS = "HKQuantityTypeIdentifierBodyMass";

/**
 * One Health Connect store (on one Android phone): records keyed by id, inserts upsert by clientRecordId, deletes
 * by id or client record id. Deleting an id the store does not know is recorded (a foreign id must never be sent).
 */
function healthConnect() {
  const records = new Map();
  const log = { inserts: [], deletes: [], unknown: [], violations: [] };
  const hc = {
    SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
    getSdkStatus: async () => 3,
    initialize: async () => true,
    requestPermission: async (permissions) => permissions,
    getGrantedPermissions: async () => [],
    RecordingMethod: { RECORDING_METHOD_MANUAL_ENTRY: 3 },
    async readRecords(type, { timeRangeFilter }) {
      const from = Date.parse(timeRangeFilter.startTime);
      const to = Date.parse(timeRangeFilter.endTime);
      return {
        records: [...records.values()]
          .filter((r) => r.type === type && Date.parse(r.time) >= from && Date.parse(r.time) <= to)
          .map((r) => ({
            metadata: { id: r.id, clientRecordId: r.clientRecordId },
            time: r.time,
            ...(type === "Weight" ? { weight: { inKilograms: r.value } } : {}),
            ...(type === "Height" ? { height: { inMeters: r.value } } : {}),
          })),
        pageToken: undefined,
      };
    },
    async insertRecords(list) {
      return list.map((record) => {
        const value =
          record.recordType === "Weight"
            ? record.weight.value
            : record.recordType === "Height"
              ? record.height.value
              : record.percentage;
        const clientRecordId = record.metadata?.clientRecordId;
        const old = clientRecordId
          ? [...records.values()].find(
              (r) => r.type === record.recordType && r.clientRecordId === clientRecordId
            )
          : undefined;
        const id = old?.id ?? randomUUID();
        records.set(id, { id, type: record.recordType, value, time: record.time, clientRecordId });
        log.inserts.push({ type: record.recordType, clientRecordId, id, replaced: !!old });
        return id;
      });
    },
    async deleteRecordsByUuids(type, ids, clientIds) {
      for (const id of ids) {
        if (id === "") {
          log.violations.push("a uuid delete with an empty id");
          throw new assert.AssertionError({ message: "a uuid delete with an empty id" });
        }
        if (!records.has(id)) log.unknown.push(id);
      }
      log.deletes.push({ type, ids: [...ids], clientIds: [...clientIds] });
      for (const r of [...records.values()])
        if (r.type === type && (ids.includes(r.id) || clientIds.includes(r.clientRecordId)))
          records.delete(r.id);
    },
  };
  return {
    hc,
    records,
    log,
    /** A record another app wrote. */
    add(type, value, time, clientRecordId) {
      const id = randomUUID();
      records.set(id, { id, type, value, time, clientRecordId });
      return id;
    },
    clientIds: () => [...records.values()].map((r) => r.clientRecordId).sort(),
  };
}

/**
 * A phone running Pendum Body: a harness world with the app's migrated database, the real health.ts and the real
 * platform adapter over `store` (appleHealth() on iOS, healthConnect() on Android), and the vault's entry points.
 */
async function phone(t, platform, store, options = {}) {
  const w = await vault.world({ platform, ...options });
  t.after(() => w.close());
  const db = await w.live();
  const app = w.require("@/db");
  const health = w.load("src/lib/health.ts", { "@/db": app });
  const native =
    platform === "ios"
      ? w.load("src/lib/health-native.ios.ts", { "@kingstinct/react-native-healthkit": store.hk })
      : w.load("src/lib/health-native.android.ts", { "react-native-health-connect": store.hc });
  const adapter = await native.getHealthAdapter();
  const { File } = w.require("expo-file-system");
  const ops = w.require("@/vault/ops");
  const paths = w.require("@/vault/engine/paths");
  const pref = (key) =>
    db.getFirstSync("SELECT value FROM preferences WHERE key = ?", [key])?.value ?? null;
  return {
    w,
    db,
    app,
    health,
    adapter,
    pref,
    weights: () => db.getAllSync("SELECT id, weight_kg AS kg FROM weight_entries ORDER BY id"),
    count: (table) => db.getFirstSync(`SELECT count(*) AS n FROM ${table}`).n,
    links: () => db.getAllSync("SELECT * FROM health_links ORDER BY key"),
    localLinks: () =>
      db.getAllSync("SELECT * FROM health_links WHERE origin = 'local' ORDER BY key"),
    sync: () => health.syncHealth(adapter),
    /** What the Settings toggle does: an interactive sync, then sync is on. */
    async enable() {
      const result = await health.syncHealth(adapter);
      db.runSync(
        "INSERT INTO preferences (key, value) VALUES ('healthSyncEnabled', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      );
      return result;
    },
    addWeight(kg, at) {
      return app.db
        .insert(app.weightEntries)
        .values({ weightKg: kg, measuredAt: at })
        .returning()
        .get().id;
    },
    addMeasurement(kind, values, at) {
      return app.db
        .insert(app.measurements)
        .values({ kind, values, measuredAt: at, updatedAt: Date.now() })
        .returning()
        .get().id;
    },
    /** A manual export into Documents/out/<name>. */
    async exportTo(name) {
      fs.mkdirSync(w.file("out"), { recursive: true });
      return ops.runExport({
        kind: "manual",
        destination: new File(w.uri("out", name)),
        embedMedia: true,
        csv: false,
        deflateLevel: 6,
      });
    },
    /** Restores `file` (from this phone or, carried over, from `from`) as the import screen does. */
    async restore(file, from = null) {
      let source = file;
      if (from) {
        const name = file.name;
        fs.mkdirSync(w.file("in"), { recursive: true });
        fs.copyFileSync(from.paths.fsPath(file), w.file("in", name));
        source = new File(w.uri("in", name));
      }
      const archive = await ops.runOpen(source);
      try {
        const result = await ops.runRestore(archive, { reason: "file" });
        return { preview: archive.preview, result };
      } finally {
        archive.close();
      }
    },
    paths,
  };
}

/** The VaultError `fn` rejects with. */
async function vaultError(fn) {
  try {
    await fn();
  } catch (e) {
    if (e && e.name === "VaultError") return e;
    throw e;
  }
  assert.fail("expected a VaultError");
}

// ---------------------------------------------------------------------------------------------------------------
// Health provenance through restores (spec §5.2–§5.4, §5.8)

test(
  "new-device round trip iPhone → Android → new iPhone: every record keeps its client id, nothing is duplicated",
  { skip: vault.skip },
  async (t) => {
    const apple = appleHealth();
    const iphone = await phone(t, "ios", apple);
    const w1 = iphone.addWeight(80, ago(20));
    const w2 = iphone.addWeight(80.5, ago(15));
    const w3 = iphone.addWeight(81, ago(10));
    const h = iphone.addMeasurement("height", { height: 180 }, ago(20));
    const b = iphone.addMeasurement("body", { waist: 85, bodyFat: 18, neck: 38 }, ago(20));
    assert.deepEqual(await iphone.enable(), { imported: 0, exported: 6 });
    const A = iphone.pref("installation");
    const own = (kind, id, installation = A) => `body-track:${installation}:${kind}:${id}`;
    const originals = [
      own("weight", w1),
      own("weight", w2),
      own("weight", w3),
      own("height", h),
      own("waist", b),
      own("bodyFat", b),
    ];
    assert.deepEqual(apple.syncIds(), [...originals].sort());
    const firstUuids = new Set(apple.samples.keys());
    const firstVersions = Object.fromEntries(
      [...apple.samples.values()].map((s) => [
        s.metadata.HKSyncIdentifier,
        s.metadata.HKSyncVersion,
      ])
    );
    const toAndroid = await iphone.exportTo("iphone.pendumbody");

    // Android: a separate Health Connect store. The archive's keys are kept, the iOS sample ids cleared.
    const connect = healthConnect();
    const android = await phone(t, "android", connect);
    const { preview, result } = await android.restore(toAndroid.file, iphone);
    assert.equal(preview.crossPlatform, true);
    assert.equal(preview.sameDevice, false);
    assert.equal(result.healthWasOn, false, "the archive's sync state is not this device's");
    assert.deepEqual(
      android.localLinks().map((l) => [l.key, l.remote_id, l.fingerprint]),
      [...originals].sort().map((key) => [key, "", ""])
    );
    assert.equal(android.pref("healthSyncEnabled"), "false");
    const F2 = android.pref("installation");
    assert.ok(F2 && F2 !== A, "another device writes new records under a fresh installation");
    assert.ok(JSON.parse(android.pref("healthInstallations")).includes(A));

    const first = await android.enable();
    assert.deepEqual(first, { imported: 0, exported: 5 }, "Health Connect takes no waist");
    assert.deepEqual(
      connect.clientIds(),
      originals.filter((k) => !k.includes(":waist:")).sort(),
      "every record upserted under its original iPhone client id"
    );
    assert.deepEqual(connect.log.deletes, []);
    assert.equal(android.count("weight_entries"), 3);
    assert.equal(android.count("measurements"), 2);

    // A new weight (fresh installation) and a deletion on Android.
    const w4 = android.addWeight(82, ago(5));
    android.db.runSync("DELETE FROM weight_entries WHERE id = ?", [w2]);
    await android.sync();
    assert.ok(connect.clientIds().includes(own("weight", w4, F2)));
    assert.ok(!connect.clientIds().includes(own("weight", w2)));
    assert.deepEqual(connect.log.unknown, [], "no foreign or unknown record id is ever deleted");
    const toIphone = await android.exportTo("android.pendumbody");

    // The new iPhone, on the first iPhone's Apple Account: its Health still holds every original sample.
    const next = await phone(t, "ios", apple);
    const restored = await next.restore(toIphone.file, android);
    assert.equal(restored.preview.crossPlatform, true);
    const F3 = next.pref("installation");
    assert.ok(F3 && F3 !== A && F3 !== F2);
    const lineage = JSON.parse(next.pref("healthInstallations"));
    assert.ok(lineage.includes(A) && lineage.includes(F2));
    const sync = await next.enable();
    assert.equal(sync.imported, 0, "no own sample comes back as a reading");
    assert.equal(
      apple.samples.size,
      6,
      "iPhone 1's samples + the Android weight − the Android deletion"
    );
    assert.deepEqual(
      apple.syncIds(),
      [...originals.filter((k) => k !== own("weight", w2)), own("weight", w4, F2)].sort()
    );
    for (const key of originals.filter((k) => k !== own("weight", w2))) {
      const sample = apple.bySyncId(key);
      assert.ok(!firstUuids.has(sample.uuid), `${key} replaced, not duplicated`);
      assert.ok(sample.metadata.HKSyncVersion >= firstVersions[key]);
    }
    assert.ok(
      apple.log.deletes.some((d) => d.syncId === own("weight", w2)),
      "the Android deletion removed by client id"
    );
    assert.deepEqual(apple.log.violations, []);
    assert.deepEqual(connect.log.violations, []);
    assert.deepEqual(
      next.weights().map((r) => r.id),
      [w1, w3, w4]
    );
    assert.equal(next.count("measurements"), 2);
    // A second sync changes nothing.
    assert.deepEqual(await next.sync(), { imported: 0, exported: 0 });
    assert.equal(apple.samples.size, 6);
  }
);

test(
  "other device, same platform: fingerprints cleared, the next sync upserts the same client ids, new records use the fresh installation",
  { skip: vault.skip },
  async (t) => {
    const apple = appleHealth();
    const first = await phone(t, "ios", apple);
    first.addWeight(80, ago(9));
    first.addWeight(79.5, ago(8));
    first.addMeasurement("height", { height: 181 }, ago(9));
    // A tombstone: a weight deleted here and in Health stays deleted.
    const gone = first.addWeight(79, ago(7));
    await first.enable();
    first.db.runSync("DELETE FROM weight_entries WHERE id = ?", [gone]);
    await first.sync();
    const A = first.pref("installation");
    const ids = apple.syncIds();
    assert.equal(ids.length, 3);
    const exported = await first.exportTo("first.pendumbody");

    const second = await phone(t, "ios", apple);
    const { preview } = await second.restore(exported.file, first);
    assert.equal(preview.crossPlatform, false);
    assert.equal(preview.sameDevice, false);
    for (const link of second.localLinks()) {
      const live = first.localLinks().find((l) => l.key === link.key);
      assert.equal(link.remote_id, live.remote_id, "remote ids are kept on the same platform");
      assert.equal(link.fingerprint, live.fingerprint === "deleted" ? "deleted" : "");
    }
    const sync = await second.enable();
    assert.deepEqual(sync, { imported: 0, exported: 3 });
    assert.deepEqual(apple.syncIds(), ids, "the same client ids, no second sample");
    assert.equal(second.count("weight_entries"), 2, "no new local rows");
    const F = second.pref("installation");
    assert.notEqual(F, A);
    const added = second.addWeight(78.8, ago(1));
    await second.sync();
    assert.ok(apple.bySyncId(`body-track:${F}:weight:${added}`));
    assert.equal(apple.samples.size, 4);
    assert.deepEqual(apple.log.violations, []);
  }
);

test(
  "cross-platform restore: archive keys kept with empty remote ids, a link whose row is gone is removed by client id, a scale reading is adopted",
  { skip: vault.skip },
  async (t) => {
    const apple = appleHealth();
    const iphone = await phone(t, "ios", apple);
    const w1 = iphone.addWeight(80, ago(9));
    const w2 = iphone.addWeight(80.2, ago(8));
    const w3 = iphone.addWeight(80.4, ago(7));
    const scaleAt = ago(3);
    const scale = apple.add(BODY_MASS, 79.4, scaleAt);
    assert.deepEqual(await iphone.enable(), { imported: 1, exported: 3 });
    const imported = iphone.links().find((l) => l.key === `health:weight:${scale}`);
    assert.ok(imported);
    // Deleted after the last sync: the archive still links it.
    iphone.db.runSync("DELETE FROM weight_entries WHERE id = ?", [w3]);
    const archiveKeys = iphone.localLinks().map((l) => l.key);
    const exported = await iphone.exportTo("cross.pendumbody");

    const connect = healthConnect();
    // The scale app syncs the same reading into Health Connect under its own id.
    connect.add("Weight", 79.4, scaleAt, "scale-app:88812");
    const android = await phone(t, "android", connect);
    await android.restore(exported.file, iphone);
    assert.deepEqual(
      android.localLinks().map((l) => [l.key, l.remote_id, l.fingerprint]),
      archiveKeys.map((key) => [key, "", ""])
    );
    assert.equal(android.count("weight_entries"), 3);

    const sync = await android.enable();
    assert.deepEqual(sync, { imported: 0, exported: 2 });
    const A = iphone.pref("installation");
    const removal = connect.log.deletes.find((d) =>
      d.clientIds.includes(`body-track:${A}:weight:${w3}`)
    );
    assert.deepEqual(removal, {
      type: "Weight",
      ids: [],
      clientIds: [`body-track:${A}:weight:${w3}`],
    });
    assert.ok(
      connect.log.deletes.every((d) => d.ids.length === 0),
      "no uuid delete with a foreign or empty id"
    );
    assert.equal(
      android.links().find((l) => l.key === `body-track:${A}:weight:${w3}`).fingerprint,
      "deleted"
    );
    // The scale's reading arrived with a new platform id: linked to the row it created, not imported again.
    assert.equal(android.count("weight_entries"), 3);
    const adopted = android.links().filter((l) => l.origin === "health");
    assert.equal(adopted.length, 2);
    assert.ok(adopted.every((l) => l.local_id === imported.local_id));
    assert.deepEqual(
      android.weights().map((r) => r.id),
      [w1, w2, imported.local_id]
    );
    assert.deepEqual(await android.sync(), { imported: 0, exported: 0 });
    assert.deepEqual(connect.log.violations, []);
  }
);

test(
  "an older archive on the same device: the merge takes this device's links, edits are rewritten, deleted rows re-created, later records removed",
  { skip: vault.skip },
  async (t) => {
    const apple = appleHealth();
    const p = await phone(t, "ios", apple);
    const w1 = p.addWeight(80, ago(6));
    const w2 = p.addWeight(81, ago(5));
    const w3 = p.addWeight(82, ago(4));
    await p.enable();
    const A = p.pref("installation");
    const key = (id) => `body-track:${A}:weight:${id}`;
    const older = await p.exportTo("older.pendumbody");

    p.db.runSync("UPDATE weight_entries SET weight_kg = 79, updated_at = ? WHERE id = ?", [
      Math.floor(Date.now() / 1000),
      w1,
    ]);
    p.db.runSync("DELETE FROM weight_entries WHERE id = ?", [w2]);
    const w4 = p.addWeight(83, ago(1));
    await p.sync();
    const live = Object.fromEntries(p.localLinks().map((l) => [l.key, l]));
    assert.equal(apple.bySyncId(key(w1)).quantity, 79);
    assert.equal(apple.bySyncId(key(w2)), undefined);

    const { preview, result } = await p.restore(older.file);
    assert.equal(preview.sameDevice, true);
    assert.equal(result.healthWasOn, true);
    assert.ok(result.recoveryId);
    assert.equal(p.pref("installation"), A);
    assert.equal(p.pref("healthSyncEnabled"), "false");
    const merged = Object.fromEntries(p.localLinks().map((l) => [l.key, l]));
    // Rule B: keys both sides know carry this device's state; rule A: the later record's link is carried.
    for (const id of [w1, w2, w3, w4]) {
      assert.equal(merged[key(id)].remote_id, live[key(id)].remote_id, `${id} remote id`);
      assert.equal(merged[key(id)].fingerprint, live[key(id)].fingerprint, `${id} fingerprint`);
    }
    assert.equal(merged[key(w4)].local_id, w4);

    const saves = apple.log.saves.length;
    await p.enable();
    assert.deepEqual(
      apple.log.saves
        .slice(saves)
        .map((s) => s.syncId)
        .sort(),
      [key(w1), key(w2)].sort(),
      "the edited row rewritten, the deleted row re-created, the unchanged one left alone"
    );
    assert.equal(apple.bySyncId(key(w1)).quantity, 80);
    assert.equal(apple.bySyncId(key(w2)).quantity, 81);
    assert.equal(apple.bySyncId(key(w4)), undefined, "the record made after the backup is removed");
    assert.equal(apple.samples.size, 3);
    assert.deepEqual(
      p.weights().map((r) => [r.id, r.kg]),
      [
        [w1, 80],
        [w2, 81],
        [w3, 82],
      ]
    );
    assert.deepEqual(apple.log.violations, []);
  }
);

test(
  "import collision: an archive whose rows at this phone's typed ids are Health imports leaves none of this phone's old samples in its store",
  { skip: vault.skip },
  async (t) => {
    const typed = [70, 71, 72];
    const scale = [90, 89.5, 89];
    // [case, the source phone's platform, whether its rows are typed (the control) or imported scale readings]
    const cases = [
      ["other device, same platform", "ios", false],
      ["cross-platform", "android", false],
      ["control: typed archive rows", "ios", true],
    ];
    for (const [name, platform, control] of cases)
      await t.test(name, async (t) => {
        // The old phone: its rows 1–3 are a smart scale's readings, imported from its own Health store (typed there,
        // in the control).
        const source = platform === "ios" ? appleHealth() : healthConnect();
        const old = await phone(t, platform, source);
        for (const [i, kg] of scale.entries()) {
          if (control) old.addWeight(kg, ago(12 - i));
          else if (platform === "ios") source.add(BODY_MASS, kg, ago(12 - i));
          else source.add("Weight", kg, ago(12 - i), `scale-app:${i}`);
        }
        assert.deepEqual(
          await old.enable(),
          control ? { imported: 0, exported: 3 } : { imported: 3, exported: 0 }
        );
        const archive = await old.exportTo("old.pendumbody");

        // The new phone, on another Health store: three typed weights with Health on, under the same local ids.
        const apple = appleHealth();
        const fresh = await phone(t, "ios", apple);
        const ids = typed.map((kg, i) => fresh.addWeight(kg, ago(3 - i)));
        assert.deepEqual(
          ids,
          old.weights().map((r) => r.id)
        );
        assert.deepEqual(await fresh.enable(), { imported: 0, exported: 3 });
        const B = fresh.pref("installation");
        const own = ids.map((id) => `body-track:${B}:weight:${id}`);
        const uuids = own.map((key) => apple.bySyncId(key).uuid);

        const { preview } = await fresh.restore(archive.file, old);
        assert.equal(preview.sameDevice, false);
        assert.equal(preview.crossPlatform, platform !== "ios");
        assert.deepEqual(
          fresh.weights().map((r) => r.kg),
          scale
        );
        const sync = await fresh.enable();
        assert.deepEqual(sync, { imported: 0, exported: control ? 3 : 0 });
        for (const key of own) {
          assert.equal(
            apple.bySyncId(key),
            undefined,
            `${key}: this phone's old sample is removed`
          );
          assert.equal(fresh.links().find((l) => l.key === key)?.fingerprint, "deleted");
        }
        assert.deepEqual(
          apple.log.deletes.map((d) => d.uuid).sort(),
          [...uuids].sort(),
          "removed by their sample ids, which are valid in this store"
        );
        const A = old.pref("installation");
        assert.deepEqual(
          apple.syncIds(),
          control ? ids.map((id) => `body-track:${A}:weight:${id}`).sort() : [],
          control
            ? "the archive's records upserted under their own keys"
            : "imports are never exported"
        );
        assert.deepEqual(
          fresh.weights().map((r) => r.kg),
          scale
        );
        assert.deepEqual(await fresh.sync(), { imported: 0, exported: 0 });
        assert.equal(apple.samples.size, control ? 3 : 0);
        assert.deepEqual(apple.log.violations, []);
      });
  }
);

test(
  "sync removes this phone's sample when a Health import now holds its record's id, and keeps the import",
  { skip: vault.skip },
  async (t) => {
    const apple = appleHealth();
    const p = await phone(t, "ios", apple);
    const id = p.addWeight(70, ago(3));
    const other = p.addWeight(71, ago(2));
    await p.enable();
    const A = p.pref("installation");
    const own = `body-track:${A}:weight:${id}`;
    const uuid = apple.bySyncId(own).uuid;
    // The pair a restore with vault 1.0.0 left (it carried this phone's link with its id) and an archive from such a
    // phone still carries: row `id` is now a scale reading another phone imported, and this phone's link holds it.
    const at = ago(9);
    p.db.runSync("UPDATE weight_entries SET weight_kg = 90, measured_at = ? WHERE id = ?", [
      at,
      id,
    ]);
    p.db.runSync(
      "INSERT INTO health_links (key, local_kind, local_id, remote_id, fingerprint, origin) VALUES ('health:weight:SCALE-1', 'weight', ?, 'SCALE-1', ?, 'health')",
      [id, `90:${at}`]
    );
    assert.deepEqual(await p.sync(), { imported: 0, exported: 0 });
    assert.equal(apple.bySyncId(own), undefined, "this phone's old sample is removed");
    assert.deepEqual(apple.log.deletes.at(-1), { type: BODY_MASS, uuid });
    assert.equal(p.links().find((l) => l.key === own).fingerprint, "deleted");
    assert.ok(
      apple.bySyncId(`body-track:${A}:weight:${other}`),
      "the other record keeps its sample"
    );
    assert.deepEqual(
      p.weights().map((r) => [r.id, r.kg]),
      [
        [id, 90],
        [other, 71],
      ]
    );
    assert.equal(p.links().find((l) => l.key === "health:weight:SCALE-1").fingerprint, `90:${at}`);
    assert.deepEqual(await p.sync(), { imported: 0, exported: 0 });
    assert.equal(apple.samples.size, 1);
    assert.deepEqual(apple.log.violations, []);
  }
);

test(
  "a pre-Health archive restored after Health was on writes no new client ids",
  { skip: vault.skip },
  async (t) => {
    const apple = appleHealth();
    const p = await phone(t, "ios", apple);
    p.addWeight(80, ago(3));
    p.addWeight(80.6, ago(2));
    p.addMeasurement("height", { height: 179 }, ago(3));
    const before = await p.exportTo("before-health.pendumbody");
    assert.equal(p.pref("installation"), null);

    await p.enable();
    const A = p.pref("installation");
    const ids = apple.syncIds();
    const saves = apple.log.saves.length;
    await p.restore(before.file);
    assert.equal(
      p.pref("installation"),
      A,
      "the live installation is kept when the archive has none"
    );
    assert.equal(p.localLinks().length, 3, "this device's links are carried");

    assert.deepEqual(await p.enable(), { imported: 0, exported: 0 });
    assert.equal(apple.log.saves.length, saves);
    assert.deepEqual(apple.syncIds(), ids);
  }
);

test(
  "imports: a fresh install imports earlier installations' samples; after a restore the restored lineage is skipped",
  { skip: vault.skip },
  async (t) => {
    const apple = appleHealth();
    const earlier = "1780000000000-earlier";
    apple.add(BODY_MASS, 84, ago(12), { HKSyncIdentifier: `body-track:${earlier}:weight:1` });
    apple.add(BODY_MASS, 83.5, ago(11), { HKSyncIdentifier: `body-track:${earlier}:weight:2` });
    apple.add(BODY_MASS, 83, ago(10));
    const fresh = await phone(t, "ios", apple);
    assert.deepEqual(await fresh.enable(), { imported: 3, exported: 0 });
    assert.equal(fresh.count("weight_entries"), 3);
    assert.deepEqual(JSON.parse(fresh.pref("healthInstallations")), [fresh.pref("installation")]);

    // Restored onto another iPhone of the same account: the lineage now covers the first installation.
    const own = fresh.addWeight(82.5, ago(2));
    await fresh.sync();
    const exported = await fresh.exportTo("lineage.pendumbody");
    const other = await phone(t, "ios", apple);
    await other.restore(exported.file, fresh);
    assert.ok(JSON.parse(other.pref("healthInstallations")).includes(fresh.pref("installation")));
    const sync = await other.enable();
    assert.equal(sync.imported, 0);
    assert.equal(other.count("weight_entries"), 4);
    assert.ok(apple.bySyncId(`body-track:${fresh.pref("installation")}:weight:${own}`));
  }
);

test(
  "a restore runs inside the descriptor's Health pause and leaves sync off with the daily task unregistered",
  { skip: vault.skip },
  async (t) => {
    const p = await phone(t, "ios", appleHealth());
    p.addWeight(80, ago(2));
    await p.enable();
    const exported = await p.exportTo("pause.pendumbody");
    await p.restore(exported.file);
    const pauses = p.w.called("@/lib/health", "pauseWhenIdle");
    assert.equal(pauses.length, 1);
    assert.equal(typeof pauses[0].args[0], "function");
    assert.equal(pauses[0].args[1], 120000);
    assert.equal(p.w.called("@/lib/health-schedule", "configureHealthSchedule").length, 1);
    assert.equal(p.pref("healthSyncEnabled"), "false");
    assert.equal(p.pref("healthSyncError"), "");
    assert.equal(p.pref("lastSync"), "");
  }
);

// ---------------------------------------------------------------------------------------------------------------
// health.ts pause and the adapters' deletes

test(
  "pauseWhenIdle: waits for an in-flight sync, then holds sync off while the work runs; times out when sync stays busy",
  { skip: vault.skip },
  async (t) => {
    const p = await phone(t, "ios", appleHealth());
    p.addWeight(80, ago(1));
    let release;
    const adapter = {
      ...p.adapter,
      authorize: () => new Promise((resolve) => (release = resolve)),
    };
    const order = [];
    const syncing = p.health.syncHealth(adapter).then(() => order.push("sync"));
    const paused = p.health.pauseWhenIdle(async () => {
      order.push("work");
      await assert.rejects(p.health.syncHealth(p.adapter), /syncing/);
      return "done";
    }, 5000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(order, [], "the work waits for the running sync");
    release();
    assert.equal(await paused, "done");
    await syncing;
    assert.deepEqual(order, ["sync", "work"]);
    // Released afterwards.
    assert.deepEqual(await p.health.syncHealth(p.adapter), { imported: 0, exported: 0 });

    let never = false;
    const stuck = p.health.syncHealth({ ...p.adapter, authorize: () => new Promise(() => {}) });
    void stuck.catch(() => {});
    await assert.rejects(
      p.health.pauseWhenIdle(async () => {
        never = true;
      }, 300),
      /healthBusy/
    );
    assert.equal(never, false);
  }
);

test(
  "Apple Health adapter: deletes by client id when the sample id was cleared; a missing sample counts as deleted",
  { skip: vault.skip },
  async (t) => {
    const w = await vault.world({ platform: "ios" });
    t.after(() => w.close());
    const apple = appleHealth();
    const { getHealthAdapter } = w.load("src/lib/health-native.ios.ts", {
      "@kingstinct/react-native-healthkit": apple.hk,
    });
    const adapter = await getHealthAdapter();
    const at = ago(1);
    const uuid = await adapter.write({
      kind: "weight",
      value: 80,
      measuredAt: at,
      clientId: "body-track:A:weight:1",
      version: 1,
    });
    await adapter.write({
      kind: "weight",
      value: 81,
      measuredAt: at,
      clientId: "body-track:A:weight:2",
      version: 1,
    });
    await adapter.remove("weight", uuid, "body-track:A:weight:1");
    assert.deepEqual(apple.log.deletes.at(-1), { type: BODY_MASS, uuid });
    await adapter.remove("weight", "", "body-track:A:weight:2");
    assert.deepEqual(apple.log.deletes.at(-1), {
      type: BODY_MASS,
      syncId: "body-track:A:weight:2",
    });
    assert.equal(apple.samples.size, 0);
    // Already gone (removed in the Health app, or never in this store): done, not an error.
    await adapter.remove("weight", uuid, "body-track:A:weight:1");
    await adapter.remove("weight", "", "body-track:A:weight:2");
    // Nothing to address: no call at all, never a delete with an empty id.
    const deletes = apple.log.deletes.length;
    await adapter.remove("weight", "");
    assert.equal(apple.log.deletes.length, deletes);
    // Any other failure still fails the sync.
    apple.hk.deleteObjects = async () => {
      throw new Error("Authorization not determined");
    };
    await assert.rejects(adapter.remove("weight", "X"), /Authorization not determined/);
    apple.hk.deleteObjects = async () => {
      throw Object.assign(new Error("HealthKit error"), { code: 11 });
    };
    await adapter.remove("weight", "X");
    assert.deepEqual(apple.log.violations, []);
  }
);

test(
  "Health Connect adapter: deletes by client record id when the record id was cleared; a missing record counts as deleted",
  { skip: vault.skip },
  async (t) => {
    const w = await vault.world({ platform: "android" });
    t.after(() => w.close());
    const connect = healthConnect();
    const { getHealthAdapter } = w.load("src/lib/health-native.android.ts", {
      "react-native-health-connect": connect.hc,
    });
    const adapter = await getHealthAdapter();
    const id = await adapter.write({
      kind: "weight",
      value: 80,
      measuredAt: ago(1),
      clientId: "body-track:A:weight:1",
      version: 1,
    });
    await adapter.remove("weight", "", "body-track:A:weight:1");
    assert.deepEqual(connect.log.deletes.at(-1), {
      type: "Weight",
      ids: [],
      clientIds: ["body-track:A:weight:1"],
    });
    assert.equal(connect.records.has(id), false);
    await adapter.remove("bodyFat", "R-1", "body-track:A:bodyFat:1");
    assert.deepEqual(connect.log.deletes.at(-1), { type: "BodyFat", ids: ["R-1"], clientIds: [] });
    const deletes = connect.log.deletes.length;
    await adapter.remove("height", "");
    assert.equal(connect.log.deletes.length, deletes);
    connect.hc.deleteRecordsByUuids = async () => {
      throw new Error("Record not found");
    };
    await adapter.remove("weight", "R-2");
    connect.hc.deleteRecordsByUuids = async () => {
      throw new Error("Remote exception");
    };
    await assert.rejects(adapter.remove("weight", "R-3"), /Remote exception/);
  }
);

// ---------------------------------------------------------------------------------------------------------------
// Descriptor: validators, media plan, CSV, describe

test(
  "validators reject bad measurement values and kinds, unknown poses and unsafe photo names",
  { skip: vault.skip },
  async (t) => {
    const w = await vault.world();
    t.after(() => w.close());
    const db = await w.live();
    w.seed(db);
    const { vaultApp } = w;
    assert.deepEqual(vaultApp.validate(db), []);
    const cases = [
      [
        `UPDATE measurements SET "values" = '{"waist":"86"}' WHERE id = 2`,
        "measurements",
        "json:values",
      ],
      [`UPDATE measurements SET "values" = '[86]' WHERE id = 2`, "measurements", "json:values"],
      [`UPDATE measurements SET "values" = 'waist 86' WHERE id = 2`, "measurements", "json:values"],
      ["UPDATE measurements SET kind = 'arm' WHERE id = 3", "measurements", "value:kind"],
      ["UPDATE photos SET pose = 'top' WHERE id = 1", "photos", "value:pose"],
      ["UPDATE photos SET uri = '../escape.png' WHERE id = 1", "photos", "value:uri"],
      ["UPDATE photos SET uri = '.hidden.png' WHERE id = 1", "photos", "value:uri"],
      ["UPDATE photos SET uri = 'a/b.png' WHERE id = 1", "photos", "value:uri"],
    ];
    for (const [sql, table, message] of cases) {
      db.execSync("SAVEPOINT bad");
      db.execSync(sql);
      assert.deepEqual(vaultApp.validate(db), [{ table, fatal: true, message }], sql);
      db.execSync("ROLLBACK TO bad");
      db.execSync("RELEASE bad");
    }
    assert.deepEqual(vaultApp.validate(db), []);
  }
);

test(
  "an export with a fatal validator issue warns, and its restore fails invalidData without changing anything",
  { skip: vault.skip },
  async (t) => {
    t.mock.method(console, "warn", () => {});
    const source = await phone(t, "ios", appleHealth());
    source.w.seed(source.db);
    source.db.execSync(`UPDATE measurements SET "values" = '{"waist":"86"}' WHERE id = 2`);
    const exported = await source.exportTo("invalid.pendumbody");
    assert.deepEqual(exported.warnings, [
      { table: "measurements", fatal: true, message: "json:values" },
    ]);
    const target = await phone(t, "ios", appleHealth());
    target.addWeight(70, ago(1));
    const error = await vaultError(() => target.restore(exported.file, source));
    assert.equal(error.code, "invalidData");
    assert.deepEqual(
      target.weights().map((r) => r.kg),
      [70]
    );
  }
);

test(
  "media plan with real files: KEEP identical photos, ADD new ones, REMOVE unreferenced live photos into the recovery set, KEEP-LIVE photos the archive lacks",
  { skip: vault.skip },
  async (t) => {
    const source = await phone(t, "ios", appleHealth());
    const target = await phone(t, "ios", appleHealth());
    const KEEP = "1786085280000-keep01.png";
    const ADD = "1786085290000-add002.png";
    const GONE = "1786085300000-gone03.png";
    const LIVE = "1786085310000-live04.png";
    const bytes = (label) => Buffer.from(`\x89PNG\r\n\x1a\nbody vault ${label}`, "latin1");
    const put = (p, rows, files) => {
      fs.mkdirSync(p.w.file("progress-photos"), { recursive: true });
      for (const [name, pose, day] of rows)
        p.db.runSync("INSERT INTO photos (uri, pose, measured_at) VALUES (?, ?, ?)", [
          name,
          pose,
          day,
        ]);
      for (const [name, label] of files)
        fs.writeFileSync(p.w.file("progress-photos", name), bytes(label));
    };
    // The source lacks LIVE's file (a phone restored from Android cloud backup): the archive lists it as missing.
    put(
      source,
      [
        [KEEP, "front", "2026-09-01"],
        [ADD, "side", "2026-09-08"],
        [LIVE, "back", "2026-09-15"],
      ],
      [
        [KEEP, "keep"],
        [ADD, "add"],
      ]
    );
    put(
      target,
      [
        [KEEP, "front", "2026-09-01"],
        [GONE, "front", "2026-09-20"],
        [LIVE, "back", "2026-09-15"],
      ],
      [
        [KEEP, "keep"],
        [GONE, "gone"],
        [LIVE, "live"],
      ]
    );
    const exported = await source.exportTo("photos.pendumbody");
    assert.deepEqual(exported.manifest.missingMedia, [{ set: "progress-photos", name: LIVE }]);
    const { result } = await target.restore(exported.file, source);
    assert.equal(result.mediaRestored, 1, "ADD");
    assert.equal(result.mediaKeptLive, 1, "KEEP-LIVE");
    assert.equal(result.mediaSkipped, 0);
    const folder = (p) =>
      Object.fromEntries(
        fs
          .readdirSync(p.w.file("progress-photos"))
          .sort()
          .map((n) => [n, sha256(fs.readFileSync(p.w.file("progress-photos", n)))])
      );
    assert.deepEqual(folder(target), {
      [KEEP]: sha256(bytes("keep")),
      [ADD]: sha256(bytes("add")),
      [LIVE]: sha256(bytes("live")),
    });
    const set = target.w.file(
      "PendumVault",
      "recovery",
      result.recoveryId,
      "media",
      "progress-photos"
    );
    assert.deepEqual(fs.readdirSync(set), [GONE], "REMOVE: kept in the recovery set");
    assert.equal(sha256(fs.readFileSync(`${set}/${GONE}`)), sha256(bytes("gone")));
    assert.deepEqual(
      target.db.getAllSync("SELECT uri FROM photos ORDER BY id").map((r) => r.uri),
      [KEEP, ADD, LIVE]
    );
  }
);

test(
  "CSV copies: weights with their source and both units, one line per measurement site, photos",
  {
    skip: vault.skip,
  },
  async (t) => {
    const w = await vault.world();
    t.after(() => w.close());
    const db = await w.live();
    w.seed(db);
    const files = await w.vaultApp.csv(db, { language: "en" });
    assert.deepEqual(
      files.map((f) => f.name),
      ["weights.csv", "measurements.csv", "photos.csv"]
    );
    const [weights, measurements, photos] = files.map((f) => f.text.split("\r\n"));
    assert.equal(weights[0], '"measured_at","weight_kg","weight_lb","source"');
    assert.ok(weights.includes('"2026-08-03T06:45:00.000Z","82.4","181.7","app"'));
    assert.ok(weights.includes('"2026-08-31T06:30:00.000Z","81.2","179.0","health"'));
    assert.equal(weights.length, 1 + 6 + 1, "header, six weights, the final CRLF");
    assert.ok(measurements.includes('"2026-08-03T06:48:00.000Z","body","bodyFat","18.6","%"'));
    assert.ok(measurements.includes('"2026-08-03T06:46:00.000Z","height","height","180.3","cm"'));
    assert.ok(photos.includes('"2026-09-07","front","day-000-front.png"'));
    assert.ok(
      files.every((f) => !f.text.startsWith("﻿")),
      "the exporter adds the BOM"
    );
  }
);

test(
  "describe: localized counts in every language, the One form for one, zero omitted",
  {
    skip: vault.skip,
  },
  async (t) => {
    const w = await vault.world();
    t.after(() => w.close());
    const { dictionaries } = w.require("@/lib/translations");
    const ctx = (language) => ({
      language,
      plural: (n) => new Intl.PluralRules(language).select(n),
      number: (n) => new Intl.NumberFormat(language).format(n),
      date: (value) => `[${value}]`,
    });
    assert.deepEqual(
      w.vaultApp.describe(
        { weights: 1, measurements: 2, photos: 0, first: "2026-08-03", latest: "2026-09-28" },
        ctx("en")
      ),
      ["1 weight", "2 measurements", "Since [2026-08-03]"]
    );
    assert.deepEqual(
      w.vaultApp.describe({ weights: 0, measurements: 0, photos: 0, first: null }, ctx("en")),
      []
    );
    for (const language of Object.keys(dictionaries)) {
      const phrases = w.vaultApp.describe(
        { weights: 1200, measurements: 1, photos: 3, first: "2026-08-03" },
        ctx(language)
      );
      assert.equal(phrases.length, 4, language);
      for (const phrase of phrases)
        assert.ok(phrase && !/[{}]/.test(phrase), `${language}: ${phrase}`);
      assert.ok(phrases[0].includes(new Intl.NumberFormat(language).format(1200)), language);
    }
  }
);
