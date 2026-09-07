import { View } from "react-native";
import { SystemButton, SystemPanel, SystemText as Text } from "@/components/system";
import { Screen } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useMeasurementLog } from "./use-measurement-log";
import { HeightForm } from "./height-form";

export function HeightLog() {
  const { t, date, number } = useStore();
  const log = useMeasurementLog("height");
  const { rows, unit, display, limit, setLimit, launch } = log;
  return (
    <>
      <Screen title={t("height")} subtitle={`${t("cadence")}: ${t("monthly")} – ${t("yearly")}`}>
        {rows[0] && (
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
          {t("add")} · {t("height")}
        </SystemButton>
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
          {t("history")} · {number(rows.length, 0)}
        </Text>
        {!rows.length && <Text className="py-8 text-center text-muted">{t("empty")}</Text>}
        {rows.slice(0, limit).map((row) => (
          <SystemPanel key={row.id}>
            <SystemPanel.Body className="gap-3">
              <Text className="font-mono text-xs text-muted">{date(row.measuredAt)}</Text>
              <View className="flex-row flex-wrap gap-x-5 gap-y-2">
                <View>
                  <Text className="text-sm text-muted">{t("height")}</Text>
                  <Text className="text-lg font-mono tabular-nums text-foreground">
                    {number(display("height", row.values.height))} {unit}
                  </Text>
                </View>
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
      <HeightForm log={log} />
    </>
  );
}
