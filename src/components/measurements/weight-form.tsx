import { Field } from "@/vector";
import { useStore } from "@/lib/store";
import { MeasurementEditor } from "./measurement-editor";
import type { MeasurementLogState } from "./use-measurement-log";

export function WeightForm({ log }: { log: MeasurementLogState }) {
  const { t } = useStore();
  return (
    <MeasurementEditor
      title={t(log.imported ? "weight" : log.editing ? "editWeight" : "addWeight")}
      log={log}
    >
      <Field
        label={t("weight")}
        unit={log.unitLabel}
        value={log.inputs.weight ?? ""}
        onChange={(value) => log.setInputs((previous) => ({ ...previous, weight: value }))}
        numeric
        disabled={log.imported}
      />
    </MeasurementEditor>
  );
}
