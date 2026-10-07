import Constants from "expo-constants";
import { eq } from "drizzle-orm";
import { db, healthLinks, measurements, preferences, weightEntries } from "@/db";
import { getHealthAdapter } from "./health-native";
import type { HealthAdapter, HealthKind, HealthRecord } from "./health-types";
import { validDay, dayOf } from "./metrics";

let running = false;
/** Set while a restore holds sync off (pauseWhenIdle): a sync started meanwhile fails with "syncing". */
let maintenance = false;
export async function syncHealth(adapter?: HealthAdapter, interactive = true) {
  if (running || maintenance) throw new Error("syncing");
  if (!adapter && Constants.appOwnership === "expo") throw new Error("healthUnavailable");
  running = true;
  try {
    let provider: HealthAdapter;
    try {
      provider = adapter ?? (await getHealthAdapter());
    } catch {
      throw new Error("healthUnavailable");
    }
    await provider.authorize(interactive);
    let installation = db
      .select()
      .from(preferences)
      .where(eq(preferences.key, "installation"))
      .get()?.value;
    if (!installation) {
      installation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      db.insert(preferences).values({ key: "installation", value: installation }).run();
    }
    const prefix = `body-track:${installation}:`;
    // Every installation whose exports a restore brought here ("*": any). Their samples are this app's own and are
    // never imported back as readings.
    const known = new Set(
      installationList(
        db.select().from(preferences).where(eq(preferences.key, "healthInstallations")).get()?.value
      )
    );
    if (!known.has(installation)) {
      known.add(installation);
      const value = JSON.stringify([...known]);
      db.insert(preferences)
        .values({ key: "healthInstallations", value })
        .onConflictDoUpdate({ target: preferences.key, set: { value } })
        .run();
    }
    const ownClient = (clientId?: string) =>
      !!clientId &&
      (known.has("*")
        ? clientId.startsWith("body-track:")
        : [...known].some((i) => clientId.startsWith(`body-track:${i}:`)));
    let imported = 0;
    let exported = 0;
    const localRecords = () => [
      ...db
        .select()
        .from(weightEntries)
        .all()
        .map((w) => ({
          id: w.id,
          kind: "weight" as const,
          value: w.weightKg,
          measuredAt: w.measuredAt,
          version: w.updatedAt?.getTime() ?? w.createdAt?.getTime() ?? 1,
        })),
      ...db
        .select()
        .from(measurements)
        .all()
        .filter((m) => m.kind === "height")
        .map((m) => ({
          id: m.id,
          kind: "height" as const,
          value: m.values.height,
          measuredAt: m.measuredAt,
          version: m.updatedAt,
        })),
      ...db
        .select()
        .from(measurements)
        .all()
        .filter((m) => m.kind === "body")
        .flatMap((m) =>
          (provider.bodyWriteKinds ?? []).flatMap((kind) => {
            const value = m.values[kind];
            return Number.isFinite(value) && value > 0 && value <= (kind === "bodyFat" ? 74.9 : 300)
              ? [{ id: m.id, kind, value, measuredAt: m.measuredAt, version: m.updatedAt }]
              : [];
          })
        ),
    ];
    const fingerprint = (record: { value: number; measuredAt: string }) =>
      `${record.value}:${record.measuredAt}`;
    const links = db.select().from(healthLinks).all();
    // Export before import. Persist each mapping immediately, so partial failures are safely retried.
    for (const record of localRecords()) {
      if (
        links.some(
          (l) => l.localKind === record.kind && l.localId === record.id && l.origin === "health"
        )
      )
        continue;
      // A record keeps the key it was first exported under (an earlier installation's, or one a restore brought),
      // so its sample is replaced instead of written twice. Links a restore parked at local id -1 are not records.
      const link = links.find(
        (l) =>
          l.origin === "local" &&
          l.localKind === record.kind &&
          l.localId === record.id &&
          l.localId >= 0
      );
      const key = link?.key ?? `${prefix}${record.kind}:${record.id}`;
      const hash = fingerprint(record);
      if (link?.fingerprint === hash) continue;
      const remoteId = await provider.write({
        ...record,
        clientId: key,
        version: Math.max(record.version, Date.now()),
      });
      db.insert(healthLinks)
        .values({
          key,
          localKind: record.kind,
          localId: record.id,
          remoteId,
          fingerprint: hash,
          origin: "local",
        })
        .onConflictDoUpdate({ target: healthLinks.key, set: { remoteId, fingerprint: hash } })
        .run();
      exported++;
    }
    const current = localRecords();
    // A record whose id a restore gave to a Health import (another phone's scale reading) is never exported, so the
    // sample this device wrote for the old record has no row behind it any more: remove it too.
    const imports = links.filter((l) => l.origin === "health");
    for (const link of links.filter((l) => l.origin === "local" && l.fingerprint !== "deleted")) {
      if (
        link.localKind !== "weight" &&
        link.localKind !== "height" &&
        !provider.bodyWriteKinds?.includes(link.localKind as "waist" | "bodyFat")
      )
        continue;
      if (
        !current.some((r) => r.kind === link.localKind && r.id === link.localId) ||
        imports.some((h) => h.localKind === link.localKind && h.localId === link.localId)
      ) {
        await provider.remove(link.localKind as HealthKind, link.remoteId, link.key);
        db.update(healthLinks)
          .set({ fingerprint: "deleted" })
          .where(eq(healthLinks.key, link.key))
          .run();
      }
    }
    const external = await provider.read();
    // Imports by reading (kind, value to 0.01, time to the second): the same reading under a new sample id (a
    // restore from the other platform, ids the store re-issued) joins the row it already created, or stays deleted.
    const reading = (kind: string, value: number, measuredAt: string) =>
      `${kind}:${Math.round(value * 100)}:${Math.floor(Date.parse(measuredAt) / 1000)}`;
    const readings = new Map<string, number>();
    for (const l of db.select().from(healthLinks).all()) {
      // Import fingerprints are "<value>:<ISO time>"; only imports are candidates, never a user's own record.
      const split = l.fingerprint.indexOf(":");
      if (l.origin !== "health" || split <= 0) continue;
      const at = reading(
        l.localKind,
        Number(l.fingerprint.slice(0, split)),
        l.fingerprint.slice(split + 1)
      );
      if (!readings.has(at)) readings.set(at, l.localId);
    }
    for (const record of external) {
      // Body measurements are export-only; never turn them into height imports.
      if (record.kind !== "weight" && record.kind !== "height") continue;
      if (ownClient(record.clientId) || !validHealthRecord(record)) continue;
      const key = `health:${record.kind}:${record.id}`;
      const link = db.select().from(healthLinks).where(eq(healthLinks.key, key)).get();
      const hash = fingerprint(record);
      if (link?.fingerprint === hash) continue;
      const at = reading(record.kind, record.value, record.measuredAt);
      const twin = link ? undefined : readings.get(at);
      if (twin !== undefined) {
        db.insert(healthLinks)
          .values({
            key,
            localKind: record.kind,
            localId: twin,
            remoteId: record.id,
            fingerprint: hash,
            origin: "health",
          })
          .onConflictDoNothing()
          .run();
        continue;
      }
      const localId = db.transaction((tx) => {
        let localId = link?.localId;
        if (record.kind === "weight") {
          if (link)
            tx.update(weightEntries)
              .set({ weightKg: record.value, measuredAt: record.measuredAt, updatedAt: new Date() })
              .where(eq(weightEntries.id, link.localId))
              .run();
          else
            localId = tx
              .insert(weightEntries)
              .values({ weightKg: record.value, measuredAt: record.measuredAt })
              .returning()
              .get().id;
        } else {
          const data = {
            kind: "height" as const,
            measuredAt: record.measuredAt,
            values: { height: record.value },
            updatedAt: Date.now(),
          };
          if (link)
            tx.update(measurements).set(data).where(eq(measurements.id, link.localId)).run();
          else localId = tx.insert(measurements).values(data).returning().get().id;
        }
        tx.insert(healthLinks)
          .values({
            key,
            localKind: record.kind,
            localId: localId!,
            remoteId: record.id,
            fingerprint: hash,
            origin: "health",
          })
          .onConflictDoUpdate({ target: healthLinks.key, set: { fingerprint: hash } })
          .run();
        return localId!;
      });
      if (!readings.has(at)) readings.set(at, localId);
      imported++;
    }
    const value = new Date().toISOString();
    db.insert(preferences)
      .values({ key: "lastSync", value })
      .onConflictDoUpdate({ target: preferences.key, set: { value } })
      .run();
    return { imported, exported };
  } finally {
    running = false;
  }
}
/**
 * Waits up to `timeoutMs` for a running sync to finish and, in the tick it sees none, holds every later sync off
 * until `work` settles (a vault restore, docs/vault.md §2.2). Throws when sync does not go idle in time.
 */
export async function pauseWhenIdle<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
  const until = Date.now() + timeoutMs;
  while (running || maintenance) {
    if (Date.now() >= until) throw new Error("healthBusy");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  maintenance = true;
  try {
    return await work();
  } finally {
    maintenance = false;
  }
}
/** The installation ids of the `healthInstallations` preference (a JSON array); [] when absent or unreadable. */
function installationList(value: string | undefined): string[] {
  try {
    const list: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(list) ? list.filter((i): i is string => typeof i === "string") : [];
  } catch {
    return [];
  }
}
export function validHealthRecord(record: HealthRecord) {
  return (
    Number.isFinite(record.value) &&
    record.value > 0 &&
    record.value <= (record.kind === "weight" ? 500 : 300) &&
    Number.isFinite(Date.parse(record.measuredAt)) &&
    validDay(dayOf(record.measuredAt))
  );
}
