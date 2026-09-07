import { SystemButton, SystemPanel, SystemText as Text } from "@/components/system";
import { Screen } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useMeasurementLog } from "./use-measurement-log";
import { HeightForm } from "./height-form";
import { MeasurementHistory } from "./measurement-history";

export function HeightLog() {
  const { t, date, number } = useStore();
  const log = useMeasurementLog("height");
  const { rows, unit, display, launch } = log;
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
        <MeasurementHistory log={log} />
      </Screen>
      <HeightForm log={log} />
    </>
  );
}
