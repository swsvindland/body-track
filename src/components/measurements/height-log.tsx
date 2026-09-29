import { Button, Panel, Screen } from "@/vector";
import { useStore } from "@/lib/store";
import { useMeasurementLog } from "./use-measurement-log";
import { HeightForm } from "./height-form";
import { MeasurementHistory } from "./measurement-history";
import { Readout } from "./readout";

export function HeightLog() {
  const { t, date } = useStore();
  const log = useMeasurementLog("height");
  const { rows, reading, launch } = log;
  return (
    <>
      <Screen title={t("height")} subtitle={t("cadenceMonthlyYearly")}>
        {rows[0] && (
          <Panel>
            <Panel.Header eyebrow={t("latest")} meta={date(rows[0].measuredAt)} />
            <Panel.Body>
              <Readout measure={reading("height", rows[0].values.height)} size="xl" />
            </Panel.Body>
          </Panel>
        )}
        <Button onPress={() => launch(null)}>{t("addHeight")}</Button>
        <MeasurementHistory log={log} />
      </Screen>
      <HeightForm log={log} />
    </>
  );
}
