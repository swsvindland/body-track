import { Button, Screen, Text } from "@/vector";
import { useStore } from "@/lib/store";
import { useMeasurementLog } from "./use-measurement-log";
import { BodyForm } from "./body-form";
import { MeasurementHistory } from "./measurement-history";

export function BodyLog() {
  const { t } = useStore();
  const log = useMeasurementLog("body");
  const { launch } = log;
  return (
    <>
      <Screen title={t("body")} subtitle={t("cadenceWeeklyMonthly")}>
        <Text tone="muted">{t("bodyHelp")}</Text>
        <Button onPress={() => launch(null)}>{t("addMeasurements")}</Button>
        <MeasurementHistory log={log} />
      </Screen>
      <BodyForm log={log} />
    </>
  );
}
