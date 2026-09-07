import { Field } from "@/components/ui";
import { useStore } from "@/lib/store";
import { MeasurementEditor } from "./measurement-editor";
import type { MeasurementLogState } from "./use-measurement-log";

export function HeightForm({ log }: { log: MeasurementLogState }) {
  const { t } = useStore();
  return (
    <MeasurementEditor title={t("height")} log={log}>
      <Field
        label={`${t("height")} (${log.unit})`}
        value={log.inputs.height ?? ""}
        onChange={(value) => log.setInputs((previous) => ({ ...previous, height: value }))}
        numeric
        disabled={log.imported}
      />
    </MeasurementEditor>
  );
}
