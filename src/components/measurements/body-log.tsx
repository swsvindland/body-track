import { Table } from "heroui-native-pro";
import { SystemButton, SystemText as Text } from "@/components/system";
import { Screen } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useMeasurementLog } from "./use-measurement-log";
import { BodyForm } from "./body-form";

export function BodyLog() {
  const { t, date, number } = useStore();
  const log = useMeasurementLog("body");
  const { rows, fields, unit, display, limit, setLimit, launch } = log;
  return (
    <>
      <Screen title={t("body")} subtitle={`${t("cadence")}: ${t("weekly")} – ${t("monthly")}`}>
        <Text className="text-muted">{t("bodyHelp")}</Text>
        <SystemButton onPress={() => launch(null)}>
          {t("add")} · {t("body")}
        </SystemButton>
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
          {t("history")} · {number(rows.length, 0)}
        </Text>
        {!rows.length && <Text className="py-8 text-center text-muted">{t("empty")}</Text>}
        {rows.slice(0, limit).map((row) => (
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
        {rows.length > limit && (
          <SystemButton variant="ghost" onPress={() => setLimit(limit + 30)}>
            {t("history")} +30
          </SystemButton>
        )}
      </Screen>
      <BodyForm log={log} />
    </>
  );
}
