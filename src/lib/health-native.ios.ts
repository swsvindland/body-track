import type { MetadataForQuantityIdentifier } from "@kingstinct/react-native-healthkit";
import type { HealthAdapter, HealthKind } from "./health-types";
export async function getHealthAdapter(): Promise<HealthAdapter> {
  // Lazy import: opening the app in Expo Go must not load an unavailable Nitro module.
  const hk = await import("@kingstinct/react-native-healthkit");
  const identifier = (kind: HealthKind) =>
    kind === "weight"
      ? ("HKQuantityTypeIdentifierBodyMass" as const)
      : ("HKQuantityTypeIdentifierHeight" as const);
  const types = [identifier("weight"), identifier("height")];
  if (!hk.isHealthDataAvailable()) throw new Error("healthUnavailable");
  return {
    async authorize(interactive = true) {
      if (interactive) await hk.requestAuthorization({ toRead: types, toShare: types });
      if (
        types.some(
          (type) => hk.authorizationStatusFor(type) !== hk.AuthorizationStatus.sharingAuthorized
        )
      )
        throw new Error("syncFailed");
    },
    async read() {
      const records = [];
      for (const kind of ["weight", "height"] as const) {
        const samples = await hk.queryQuantitySamples(identifier(kind), {
          unit: kind === "weight" ? "kg" : "cm",
          limit: 0,
          ascending: true,
        });
        records.push(
          ...samples.map((sample) => ({
            id: sample.uuid,
            kind,
            value: sample.quantity,
            measuredAt: sample.startDate.toISOString(),
            clientId:
              typeof sample.metadata.HKSyncIdentifier === "string"
                ? sample.metadata.HKSyncIdentifier
                : undefined,
          }))
        );
      }
      return records;
    },
    async write(record) {
      const date = new Date(record.measuredAt);
      // HealthKit 14.1 incorrectly intersects common metadata with Record<string, never>
      // for these identifiers. These are documented HK metadata keys; keep the workaround local.
      const metadata = {
        HKSyncIdentifier: record.clientId,
        HKSyncVersion: record.version,
        HKWasUserEntered: true,
      } as unknown as MetadataForQuantityIdentifier<"HKQuantityTypeIdentifierBodyMass">;
      const result =
        record.kind === "weight"
          ? await hk.saveQuantitySample(
              "HKQuantityTypeIdentifierBodyMass",
              "kg",
              record.value,
              date,
              date,
              metadata
            )
          : await hk.saveQuantitySample(
              "HKQuantityTypeIdentifierHeight",
              "cm",
              record.value,
              date,
              date,
              metadata
            );
      if (!result) throw new Error("syncFailed");
      return result.uuid;
    },
    async remove(kind, id) {
      await hk.deleteObjects(identifier(kind), { uuid: id });
    },
  };
}
