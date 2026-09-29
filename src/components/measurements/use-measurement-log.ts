import { useState } from "react";
import { Alert } from "react-native";
import { eq } from "drizzle-orm";
import { parseDecimal, useKitFormat } from "@/vector";
import { db, measurements, weightEntries } from "@/db";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/translations";
import {
  dayOf,
  heightParts,
  parseHeight,
  fromCm,
  fromKg,
  localDay,
  sites,
  toCm,
  toKg,
  validDay,
} from "@/lib/metrics";
import { useReadings } from "./readout";

type Kind = "weight" | "height" | "body";
type RecordRow = { id: number; measuredAt: string; values: Record<string, number> };
type Form = { day: string; inputs: Record<string, string> };
export function useMeasurementLog(kind: Kind) {
  const { weights, measurements: records, healthImports, units, t, refresh } = useStore();
  const format = useKitFormat();
  const readings = useReadings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [day, setDay] = useState(localDay());
  // The form as it opened: what `dirty` compares against, and what an untouched field still reads.
  const [initial, setInitial] = useState<Form>({ day: localDay(), inputs: {} });
  const [error, setError] = useState("");
  // A delete started from the history list fails there, not in the closed editor.
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(30);
  const rows: RecordRow[] =
    kind === "weight"
      ? weights.map((w) => ({ id: w.id, measuredAt: w.measuredAt, values: { weight: w.weightKg } }))
      : records.filter((m) => m.kind === kind);
  const fields: Message[] = kind === "body" ? [...sites, "bodyFat"] : [kind];
  const display = (key: string, value: number) =>
    key === "bodyFat" ? value : kind === "weight" ? fromKg(value, units) : fromCm(value, units);
  const imperialHeight = kind === "height" && units !== "metric";
  /** Field suffixes in the locale's own unit symbols. */
  const unitLabel = readings.unit(kind === "weight" ? readings.weightUnit : readings.lengthUnit);
  /** A stored value (kg, cm or %) as the screen shows it. */
  const reading = (key: string, value: number) =>
    key === "height"
      ? readings.height(value)
      : key === "bodyFat"
        ? readings.percent(value)
        : kind === "weight"
          ? readings.weight(value)
          : readings.length(value);
  /** Field text in the locale's digits and decimal mark (72,5 in de), ungrouped; parseDecimal reads it back. */
  const seed = (value: number) => format.editable(value, 1);
  const parse = (text: string) => parseDecimal(text, format.tag) ?? NaN;
  // parseHeight validates plain digits, so feet and inches are read in the locale first.
  const plain = (text: string) => (text.trim() ? String(parse(text)) : "");
  const dirty =
    day !== initial.day ||
    Object.keys({ ...initial.inputs, ...inputs }).some(
      (key) => (inputs[key] ?? "") !== (initial.inputs[key] ?? "")
    );
  /** Weight and height imported from Health are managed there: they open read-only and can only be deleted. */
  const isImported = (row: RecordRow) => healthImports.has(`${kind}:${row.id}`);
  const imported = editing ? isImported(editing) : false;
  function launch(row: RecordRow | null) {
    const form: Form = {
      day: row ? dayOf(row.measuredAt) : localDay(),
      inputs:
        imperialHeight && row
          ? Object.fromEntries(
              Object.entries(heightParts(row.values.height, 1)).map(([key, value]) => [
                key,
                seed(value),
              ])
            )
          : Object.fromEntries(
              Object.entries(row?.values ?? {}).map(([key, value]) => [
                key,
                seed(Math.round(display(key, value) * 10) / 10),
              ])
            ),
    };
    setEditing(row);
    setError("");
    setDay(form.day);
    setInputs(form.inputs);
    setInitial(form);
    setOpen(true);
  }
  function save() {
    if (busy || imported) return;
    if (!validDay(day)) {
      setError(t("invalidDate"));
      return;
    }
    const values: Record<string, number> = {};
    for (const key of fields) {
      const raw = inputs[key]?.trim();
      if (!raw && kind === "body") continue;
      // Preserve canonical precision when a field wasn't changed in the editor.
      const original = editing?.values[key];
      const unchanged =
        original !== undefined &&
        (imperialHeight
          ? inputs.feet?.trim() === initial.inputs.feet &&
            inputs.inches?.trim() === initial.inputs.inches
          : raw === initial.inputs[key]);
      const parsed = parse(raw ?? "");
      const value = unchanged
        ? original
        : imperialHeight
          ? parseHeight(plain(inputs.feet ?? ""), plain(inputs.inches ?? ""))
          : key === "bodyFat"
            ? parsed
            : kind === "weight"
              ? toKg(parsed, units)
              : toCm(parsed, units);
      const max = key === "bodyFat" ? 74.9 : kind === "weight" ? 500 : 300;
      if (!Number.isFinite(value) || value <= 0 || value > max) {
        setError(t("invalidValue", { field: t(key), max: reading(key, max).text }));
        return;
      }
      values[key] = unchanged ? original : Math.round(value * 10000) / 10000;
    }
    if (!Object.keys(values).length) {
      setError(t("invalid"));
      return;
    }
    setBusy(true);
    try {
      const measuredAt =
        editing && dayOf(editing.measuredAt) === day
          ? editing.measuredAt
          : (day === localDay() ? new Date() : new Date(`${day}T12:00:00`)).toISOString();
      if (kind === "weight") {
        if (editing)
          db.update(weightEntries)
            .set({ weightKg: values.weight, measuredAt, updatedAt: new Date() })
            .where(eq(weightEntries.id, editing.id))
            .run();
        else db.insert(weightEntries).values({ weightKg: values.weight, measuredAt }).run();
      } else {
        const data = { kind, measuredAt, values, updatedAt: new Date().getTime() };
        if (editing) db.update(measurements).set(data).where(eq(measurements.id, editing.id)).run();
        else db.insert(measurements).values(data).run();
      }
      refresh();
      setOpen(false);
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }
  /**
   * Deletes a record once confirmed (an Alert until undo lands, MIGRATION L4). `done` runs after the delete and
   * `keep` when the person cancels; a failure goes to `fail`, so it shows where the delete started.
   */
  function confirmRemove(
    row: RecordRow,
    { done, keep, fail }: { done?: () => void; keep?: () => void; fail: (message: string) => void }
  ) {
    Alert.alert(t("delete"), t("deleteConfirm"), [
      { text: t("cancel"), style: "cancel", onPress: keep },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => {
          try {
            if (kind === "weight")
              db.delete(weightEntries).where(eq(weightEntries.id, row.id)).run();
            else db.delete(measurements).where(eq(measurements.id, row.id)).run();
            refresh();
            done?.();
          } catch {
            fail(t("error"));
          }
        },
      },
    ]);
  }
  function remove() {
    if (editing) confirmRemove(editing, { done: () => setOpen(false), fail: setError });
  }
  /** Delete from the history list: its swipe, menu or screen-reader action. */
  function removeRow(row: RecordRow, keep?: () => void) {
    setListError("");
    // A failed delete keeps the row too, so a swiped row springs back to show the error.
    confirmRemove(row, {
      keep,
      fail: (message) => {
        setListError(message);
        keep?.();
      },
    });
  }
  return {
    rows,
    fields,
    unitLabel,
    percentSign: readings.percentSign,
    reading,
    imperialHeight,
    open,
    editing,
    inputs,
    day,
    dirty,
    error,
    listError,
    busy,
    imported,
    isImported,
    limit,
    setLimit,
    setOpen,
    setInputs,
    setDay,
    launch,
    save,
    remove,
    removeRow,
  };
}

export type MeasurementLogState = ReturnType<typeof useMeasurementLog>;
