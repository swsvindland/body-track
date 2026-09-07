import { useState } from "react";
import { Alert, View } from "react-native";
import { Table } from "heroui-native-pro";
import { SystemButton, SystemPanel, SystemText as Text } from "@/components/system";
import { eq } from "drizzle-orm";
import { db, healthLinks, measurements, weightEntries } from "@/db";
import { useStore } from "@/lib/store";
import {
  dayOf,
  fromCm,
  fromKg,
  lengthUnit,
  localDay,
  parseNumber,
  sites,
  toCm,
  toKg,
  validDay,
  weightUnit,
} from "@/lib/metrics";
import { DateInput, Editor, ErrorText, Field, Screen } from "./ui";
import { Dashboard } from "./dashboard";

type Kind = "weight" | "height" | "body";
type RecordRow = { id: number; measuredAt: string; values: Record<string, number> };
export function MeasurementLog({ kind }: { kind: Kind }) {
  const { weights, measurements: records, units, t, date, number, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [day, setDay] = useState(localDay());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(30);
  const rows: RecordRow[] =
    kind === "weight"
      ? weights.map((w) => ({ id: w.id, measuredAt: w.measuredAt, values: { weight: w.weightKg } }))
      : records.filter((m) => m.kind === kind);
  const fields = kind === "body" ? [...sites, "bodyFat"] : [kind];
  const unit = kind === "weight" ? weightUnit(units) : lengthUnit(units);
  const display = (key: string, value: number) =>
    key === "bodyFat" ? value : kind === "weight" ? fromKg(value, units) : fromCm(value, units);
  const imported = editing
    ? db
        .select()
        .from(healthLinks)
        .all()
        .some(
          (link) =>
            link.origin === "health" && link.localKind === kind && link.localId === editing.id
        )
    : false;
  function launch(row: RecordRow | null) {
    setEditing(row);
    setError("");
    setDay(row ? dayOf(row.measuredAt) : localDay());
    setInputs(
      Object.fromEntries(
        Object.entries(row?.values ?? {}).map(([key, value]) => [
          key,
          String(Math.round(display(key, value) * 10000) / 10000),
        ])
      )
    );
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
      const parsed = parseNumber(raw ?? "");
      const value =
        key === "bodyFat" ? parsed : kind === "weight" ? toKg(parsed, units) : toCm(parsed, units);
      const max = key === "bodyFat" ? 74.9 : kind === "weight" ? 500 : 300;
      if (!Number.isFinite(value) || value <= 0 || value > max) {
        setError(
          `${t(key)}: ${t("invalid")} (0–${number(display(key, max))} ${key === "bodyFat" ? "%" : unit})`
        );
        return;
      }
      // Preserve canonical precision when a field wasn't changed in the editor.
      const original = editing?.values[key];
      values[key] =
        original !== undefined && raw === String(Math.round(display(key, original) * 10000) / 10000)
          ? original
          : Math.round(value * 10000) / 10000;
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
  function remove() {
    if (!editing) return;
    Alert.alert(t("delete"), t("deleteConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => {
          try {
            if (kind === "weight")
              db.delete(weightEntries).where(eq(weightEntries.id, editing.id)).run();
            else db.delete(measurements).where(eq(measurements.id, editing.id)).run();
            refresh();
            setOpen(false);
          } catch {
            setError(t("error"));
          }
        },
      },
    ]);
  }
  return (
    <>
      <Screen
        title={t(kind === "weight" ? "home" : kind)}
        subtitle={`${t("cadence")}: ${kind === "weight" ? t("daily") : kind === "height" ? `${t("monthly")} – ${t("yearly")}` : `${t("weekly")} – ${t("monthly")}`}`}
      >
        {kind === "weight" && <Dashboard />}
        {kind === "body" && <Text className="text-muted">{t("bodyHelp")}</Text>}
        {kind === "height" && rows[0] && (
          <SystemPanel>
            <SystemPanel.Body>
              <SystemPanel.Description>
                {t("latest")} · {date(rows[0].measuredAt)}
              </SystemPanel.Description>
              <Text className="mt-2 text-4xl font-mono tabular-nums text-foreground">
                {number(display("height", rows[0].values.height))} {unit}
              </Text>
            </SystemPanel.Body>
          </SystemPanel>
        )}
        <SystemButton onPress={() => launch(null)}>
          {t("add")} · {t(kind)}
        </SystemButton>
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
          {t("history")} · {number(rows.length, 0)}
        </Text>
        {!rows.length && <Text className="py-8 text-center text-muted">{t("empty")}</Text>}
        {kind === "body" &&
          rows.slice(0, limit).map((row) => (
            <Table key={row.id} variant="secondary" animation="disable-all">
              <Table.Content>
                <Table.Header>
                  <Table.Column flex={2}>
                    <Text accessibilityRole="header" className="font-mono text-sm font-semibold">
                      {date(row.measuredAt)}
                    </Text>
                  </Table.Column>
                  <Table.Column />
                </Table.Header>
                <Table.Body>
                  {fields
                    .filter((key) => row.values[key] !== undefined)
                    .map((key) => (
                      <Table.Row key={key} id={key}>
                        <Table.Cell>
                          <Text className="text-sm text-muted">{t(key)}</Text>
                        </Table.Cell>
                        <Table.Cell className="items-end">
                          <Text className="font-mono text-sm tabular-nums">
                            {number(display(key, row.values[key]))} {key === "bodyFat" ? "%" : unit}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                </Table.Body>
              </Table.Content>
              <Table.Footer className="justify-end">
                <SystemButton
                  variant="ghost"
                  accessibilityLabel={`${t("edit")} · ${date(row.measuredAt)}`}
                  onPress={() => launch(row)}
                >
                  {t("edit")}
                </SystemButton>
              </Table.Footer>
            </Table>
          ))}
        {kind !== "body" &&
          rows.slice(0, limit).map((row) => (
            <SystemPanel key={row.id}>
              <SystemPanel.Body className="gap-3">
                <Text className="font-mono text-xs text-muted">{date(row.measuredAt)}</Text>
                <View className="flex-row flex-wrap gap-x-5 gap-y-2">
                  {Object.entries(row.values).map(([key, value]) => (
                    <View key={key}>
                      <Text className="text-sm text-muted">{t(key)}</Text>
                      <Text className="text-lg font-mono tabular-nums text-foreground">
                        {number(display(key, value))} {key === "bodyFat" ? "%" : unit}
                      </Text>
                    </View>
                  ))}
                </View>
                <SystemButton variant="ghost" onPress={() => launch(row)}>
                  {t("edit")}
                </SystemButton>
              </SystemPanel.Body>
            </SystemPanel>
          ))}
        {rows.length > limit && (
          <SystemButton variant="ghost" onPress={() => setLimit(limit + 30)}>
            {t("history")} +30
          </SystemButton>
        )}
      </Screen>
      <Editor
        title={`${t(editing ? "edit" : "add")} · ${t(kind)}`}
        open={open}
        close={() => setOpen(false)}
        busy={busy}
      >
        {imported && <Text className="text-muted">{t("syncHelp")}</Text>}
        <DateInput label={t("date")} value={day} onChange={setDay} disabled={imported} />
        {fields.map((key) => (
          <Field
            key={key}
            label={`${t(key === "bodyFat" ? "manualFat" : key)}${key === "bodyFat" ? "" : ` (${unit})`}${kind === "body" ? ` · ${t("optional")}` : ""}`}
            value={inputs[key] ?? ""}
            onChange={(value) => setInputs((previous) => ({ ...previous, [key]: value }))}
            numeric
            disabled={imported}
          />
        ))}
        <ErrorText message={error} />
        {!imported && (
          <SystemButton isDisabled={busy} onPress={save}>
            {t("save")}
          </SystemButton>
        )}
        {editing && (
          <SystemButton variant="danger-soft" isDisabled={busy} onPress={remove}>
            {t("delete")}
          </SystemButton>
        )}
      </Editor>
    </>
  );
}
