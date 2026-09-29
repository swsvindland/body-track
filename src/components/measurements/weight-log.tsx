import { Button, Screen } from "@/vector";
import { useStore } from "@/lib/store";
import { Dashboard } from "@/components/dashboard";
import { useMeasurementLog } from "./use-measurement-log";
import { WeightForm } from "./weight-form";
import { MeasurementHistory } from "./measurement-history";

export function WeightLog() {
  const { t } = useStore();
  const log = useMeasurementLog("weight");
  const { launch } = log;
  return (
    <>
      <Screen title={t("today")} subtitle={t("cadenceDaily")}>
        <Dashboard />

        <Button onPress={() => launch(null)}>{t("addWeight")}</Button>
        <MeasurementHistory log={log} />
      </Screen>
      <WeightForm log={log} />
    </>
  );
}
