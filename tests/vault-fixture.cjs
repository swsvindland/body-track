// Pendum Body's vault test fixture (tests/vault-fixture.cjs; app-owned, docs/vault.md §12). `seed` writes what a
// long-time user has at a schema level: weights (one imported from Health, two deleted), height and body
// measurements, three progress photos with real files, preferences including Health provenance and device state,
// and Health links with local and imported tombstones. Values are raw SQL values: weight timestamps in seconds,
// measurement `updated_at` in milliseconds, `measured_at` ISO strings (photos: days).
const { Buffer } = require("node:buffer");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { crc32, deflateSync } = require("node:zlib");

/** The vault ships at this schema level (journal length); `seed` writes the same rows at every later level. */
const FIRST_LEVEL = 3;

const INSTALLATION = "1786084800000-k2j4h6g8f0";
const EARLIER_INSTALLATION = "1782345600000-q1w2e3r4t5";

/** A small valid PNG whose text chunk holds `note` (bytes a ZIP reader must not mistake for structure). */
function png(rgb, note) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.from([0, ...Array(4).fill(rgb).flat()]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("tEXt", Buffer.from(`Comment\0${note}`, "latin1")),
    chunk("IDAT", deflateSync(Buffer.concat(Array(4).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const seconds = (iso) => Math.floor(Date.parse(iso) / 1000);
const ms = (iso) => Date.parse(iso);

function seed(db, { level, documentDirectory }) {
  if (level < FIRST_LEVEL)
    throw new Error(`body fixture: no seed below schema level ${FIRST_LEVEL}`);
  if (!documentDirectory)
    throw new Error("body fixture: seed needs the document folder for photo files");
  const run = (sql, ...params) => db.runSync(sql, params);
  db.withTransactionSync(() => {
    const weights = [
      [1, 82.4, "2026-08-03T06:45:00.000Z"],
      [2, 82, "2026-08-10T06:50:12.000Z"],
      [3, 81.65, "2026-08-17T07:02:00.000Z"],
      [4, 81.9, "2026-08-24T06:40:00.000Z"],
      [5, 81.2, "2026-08-31T06:30:00.000Z"],
      [6, 80.85, "2026-09-07T06:55:00.000Z"],
      [7, 80.6, "2026-09-21T06:41:30.250Z"],
      [8, 79.9, "2026-09-28T06:30:00.000Z"],
    ];
    for (const [id, kg, at] of weights)
      run(
        "INSERT INTO weight_entries (id, weight_kg, measured_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        id,
        kg,
        at,
        seconds(at),
        seconds(at) + (id === 3 ? 86400 : 0)
      );
    // Deleted by the user (4) and an imported reading deleted here (8): the sequence stays at 8.
    run("DELETE FROM weight_entries WHERE id IN (4, 8)");

    const measurements = [
      [1, "height", "2026-08-03T06:46:00.000Z", { height: 180.3 }],
      [
        2,
        "body",
        "2026-08-03T06:48:00.000Z",
        {
          neck: 38.5,
          chest: 101,
          waist: 86.4,
          hips: 99.2,
          bodyFat: 18.6,
          leftArm: 34.1,
          rightArm: 34.4,
        },
      ],
      [
        3,
        "body",
        "2026-09-07T07:00:00.000Z",
        { neck: 38.2, waist: 84.9, abdomen: 88.1, hips: 98.7 },
      ],
      [4, "height", "2026-06-01T09:00:00.000Z", { height: 180 }],
    ];
    for (const [id, kind, at, values] of measurements)
      run(
        'INSERT INTO measurements (id, kind, measured_at, "values", updated_at) VALUES (?, ?, ?, ?, ?)',
        id,
        kind,
        at,
        JSON.stringify(values),
        ms(at) + 5000
      );

    const photos = [
      [1, "1786085280000-k3j2h1.png", "front", "2026-08-03", [200, 180, 160], "front"],
      [2, "1786085290000-a1b2c3.png", "side", "2026-08-03", [190, 170, 150], "PK\x07\x08 side"],
      [3, "day-000-front.png", "front", "2026-09-07", [180, 160, 140], "demo"],
    ];
    const folder = path.join(documentDirectory, "progress-photos");
    mkdirSync(folder, { recursive: true });
    for (const [id, name, pose, day, rgb, note] of photos) {
      run(
        "INSERT INTO photos (id, uri, pose, measured_at) VALUES (?, ?, ?, ?)",
        id,
        name,
        pose,
        day
      );
      writeFileSync(path.join(folder, name), png(rgb, note));
    }

    const preferences = {
      theme: "dark",
      units: "metric",
      language: "de",
      formula: "female",
      installation: INSTALLATION,
      healthInstallations: JSON.stringify([EARLIER_INSTALLATION, INSTALLATION]),
      // Device state: never exported.
      healthSyncEnabled: "true",
      healthSyncError: "",
      lastSync: "2026-09-28T07:00:00.000Z",
    };
    for (const [key, value] of Object.entries(preferences))
      run(
        "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        value
      );

    const local = (kind, id, installation = INSTALLATION) =>
      `body-track:${installation}:${kind}:${id}`;
    const links = [
      [
        local("weight", 1),
        "weight",
        1,
        "6F1C2A9E-3B4D-4E5F-8A7B-1C2D3E4F5A61",
        "82.4:2026-08-03T06:45:00.000Z",
        "local",
      ],
      [
        local("weight", 2),
        "weight",
        2,
        "6F1C2A9E-3B4D-4E5F-8A7B-1C2D3E4F5A62",
        "82:2026-08-10T06:50:12.000Z",
        "local",
      ],
      // Edited after its last sync: the next sync rewrites it.
      [
        local("weight", 3),
        "weight",
        3,
        "6F1C2A9E-3B4D-4E5F-8A7B-1C2D3E4F5A63",
        "81.7:2026-08-17T07:02:00.000Z",
        "local",
      ],
      // Deleted here and removed from Health.
      [local("weight", 4), "weight", 4, "6F1C2A9E-3B4D-4E5F-8A7B-1C2D3E4F5A64", "deleted", "local"],
      // Written under the installation before a reinstall.
      [
        local("weight", 6, EARLIER_INSTALLATION),
        "weight",
        6,
        "6F1C2A9E-3B4D-4E5F-8A7B-1C2D3E4F5A66",
        "80.85:2026-09-07T06:55:00.000Z",
        "local",
      ],
      [
        local("height", 1),
        "height",
        1,
        "9A0B1C2D-3E4F-4A5B-9C6D-7E8F9A0B1C21",
        "180.3:2026-08-03T06:46:00.000Z",
        "local",
      ],
      [
        local("waist", 2),
        "waist",
        2,
        "9A0B1C2D-3E4F-4A5B-9C6D-7E8F9A0B1C22",
        "86.4:2026-08-03T06:48:00.000Z",
        "local",
      ],
      [
        local("bodyFat", 2),
        "bodyFat",
        2,
        "9A0B1C2D-3E4F-4A5B-9C6D-7E8F9A0B1C23",
        "18.6:2026-08-03T06:48:00.000Z",
        "local",
      ],
      // Imported from Health; the second one's row was deleted here (it must stay deleted).
      [
        "health:weight:3C5D7E9F-1A2B-4C3D-8E4F-5A6B7C8D9E05",
        "weight",
        5,
        "3C5D7E9F-1A2B-4C3D-8E4F-5A6B7C8D9E05",
        "81.2:2026-08-31T06:30:00.000Z",
        "health",
      ],
      [
        "health:weight:3C5D7E9F-1A2B-4C3D-8E4F-5A6B7C8D9E08",
        "weight",
        8,
        "3C5D7E9F-1A2B-4C3D-8E4F-5A6B7C8D9E08",
        "79.9:2026-09-28T06:30:00.000Z",
        "health",
      ],
      [
        "health:height:3C5D7E9F-1A2B-4C3D-8E4F-5A6B7C8D9E14",
        "height",
        4,
        "3C5D7E9F-1A2B-4C3D-8E4F-5A6B7C8D9E14",
        "180:2026-06-01T09:00:00.000Z",
        "health",
      ],
    ];
    for (const link of links)
      run(
        "INSERT INTO health_links (key, local_kind, local_id, remote_id, fingerprint, origin) VALUES (?, ?, ?, ?, ?, ?)",
        ...link
      );
  });
}

module.exports = {
  levels: [FIRST_LEVEL],
  seed,
  // Modules the descriptor imports lazily; each world records the calls (`w.called(module)`).
  stubs: {
    "@/lib/health": (w) =>
      w.record("@/lib/health", {
        pauseWhenIdle: (work) => work(),
        withHealthPaused: (work) => work(),
      }),
    "@/lib/health-schedule": (w) =>
      w.record("@/lib/health-schedule", { configureHealthSchedule: async () => {} }),
  },
};
