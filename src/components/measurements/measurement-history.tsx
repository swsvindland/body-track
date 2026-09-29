import { View, type AccessibilityActionEvent } from "react-native";
import {
  ActionMenu,
  Button,
  ErrorText,
  Heading,
  ListRow,
  Panel,
  RecordRow,
  SwipeRow,
  SystemState,
  Value,
  useKitFormat,
  type MenuAction,
} from "@/vector";
import { useStore } from "@/lib/store";
import { Readout } from "./readout";
import type { MeasurementLogState } from "./use-measurement-log";

type Row = MeasurementLogState["rows"][number];

export function MeasurementHistory({ log }: { log: MeasurementLogState }) {
  const { t, date } = useStore();
  const format = useKitFormat();
  const { rows, fields, reading, limit, setLimit, launch, removeRow, listError, isImported } = log;
  const shown = rows.slice(0, limit);
  /** Edit and delete, for a row's or a panel's menu; a record imported from Health can only be deleted. */
  const actions = (row: Row): { actions: MenuAction[] }[] => {
    const edit: MenuAction = {
      key: "edit",
      label: t("edit"),
      icon: "edit",
      onPress: () => launch(row),
    };
    const remove: MenuAction = {
      key: "delete",
      label: t("delete"),
      icon: "delete",
      destructive: true,
      onPress: () => removeRow(row),
    };
    return [{ actions: isImported(row) ? [remove] : [edit, remove] }];
  };
  const onAction = (row: Row) => (event: AccessibilityActionEvent) =>
    event.nativeEvent.actionName === "delete" ? removeRow(row) : launch(row);

  return (
    <>
      <View className="flex-row items-baseline justify-between gap-3">
        <Heading level={3}>{t("history")}</Heading>
        <Value value={format.number(rows.length)} size="xs" tone="muted" />
      </View>
      <ErrorText message={listError} />
      {!rows.length ? (
        <SystemState kind="empty" message={t("empty")} />
      ) : fields.length === 1 ? (
        // One value per record (weight, height): the row opens the editor (read-only for a record imported
        // from Health, which has no edit action), a swipe toward start deletes, and its menu holds both.
        <Panel inset="none">
          {shown.map((row) => (
            <SwipeRow
              key={row.id}
              trailingAction={{
                label: t("delete"),
                icon: "delete",
                destructive: true,
                // The row stays open while the confirm is up; keeping the record, or a failed delete,
                // springs it back.
                onAction: (close) => removeRow(row, close),
              }}
            >
              <RecordRow
                time={date(row.measuredAt)}
                title={t(fields[0])}
                value={<Readout measure={reading(fields[0], row.values[fields[0]])} />}
                onPress={() => launch(row)}
                accessibilityHint={t(isImported(row) ? "importedEntryHint" : "editEntryHint")}
                control={
                  <ActionMenu
                    accessibilityLabel={t("entryActions", { date: date(row.measuredAt) })}
                    sections={actions(row)}
                  />
                }
                accessibilityActions={[
                  ...(isImported(row) ? [] : [{ name: "edit", label: t("edit") }]),
                  { name: "delete", label: t("delete") },
                ]}
                onAccessibilityAction={onAction(row)}
              />
            </SwipeRow>
          ))}
        </Panel>
      ) : (
        // Several sites per record: one panel each, headed by its date, with edit and delete in its menu.
        shown.map((row) => (
          <Panel key={row.id} inset="none">
            <Panel.Header
              eyebrow={date(row.measuredAt)}
              action={
                <ActionMenu
                  accessibilityLabel={t("entryActions", { date: date(row.measuredAt) })}
                  sections={actions(row)}
                />
              }
            />
            {fields
              .filter((key) => row.values[key] !== undefined)
              .map((key) => (
                <ListRow
                  key={key}
                  title={t(key)}
                  value={<Readout measure={reading(key, row.values[key])} tone="muted" />}
                />
              ))}
          </Panel>
        ))
      )}
      {rows.length > limit && (
        <Button variant="ghost" onPress={() => setLimit(limit + 30)}>
          {t("showMore")}
        </Button>
      )}
    </>
  );
}
