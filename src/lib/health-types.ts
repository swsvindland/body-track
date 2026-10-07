export type HealthKind = "weight" | "height" | "waist" | "bodyFat";
export type HealthRecord = {
  id: string;
  kind: HealthKind;
  value: number;
  measuredAt: string;
  clientId?: string;
};
export type HealthWrite = Omit<HealthRecord, "id"> & { clientId: string; version: number };
export type HealthAdapter = {
  bodyWriteKinds?: readonly ("waist" | "bodyFat")[];
  authorize: (interactive?: boolean) => Promise<void>;
  read: () => Promise<HealthRecord[]>;
  write: (record: HealthWrite) => Promise<string>;
  /**
   * Deletes a sample this app wrote. `id` is the store's sample id; a restore from the other platform clears it
   * (`""`), and then the sample is found by the `clientId` it was written with. A sample that is already gone counts
   * as deleted.
   */
  remove: (kind: HealthKind, id: string, clientId?: string) => Promise<void>;
};
