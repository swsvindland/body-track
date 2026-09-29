import { useEffect, useRef, type ReactNode } from "react";
import type { ScrollView } from "react-native";
import { DateInput, Editor, ErrorText, Text, useReducedMotionSafe } from "@/vector";
import { useStore } from "@/lib/store";
import type { MeasurementLogState } from "./use-measurement-log";

export function MeasurementEditor({
  title,
  log,
  children,
}: {
  title: string;
  log: MeasurementLogState;
  children: ReactNode;
}) {
  const { t } = useStore();
  const { editing, open, setOpen, busy, dirty, imported, day, setDay, error, save, remove } = log;
  const reduceMotion = useReducedMotionSafe();
  const scroll = useRef<ScrollView>(null);
  // Save is pinned in the footer and the error ends the form (18 fields for body), so bring it into view.
  useEffect(() => {
    if (error) scroll.current?.scrollToEnd({ animated: !reduceMotion });
  }, [error, reduceMotion]);
  return (
    <Editor
      title={title}
      open={open}
      close={() => setOpen(false)}
      busy={busy}
      dirty={dirty}
      scrollRef={scroll}
      // Imported records are managed by their source: nothing to save, but they can still be deleted.
      primary={imported ? undefined : { label: t("save"), onPress: save }}
      destructive={editing ? { label: t("delete"), onPress: remove } : undefined}
    >
      {imported && <Text tone="muted">{t("syncHelp")}</Text>}
      <DateInput label={t("date")} value={day} onChange={setDay} disabled={imported} />
      {children}
      <ErrorText message={error} />
    </Editor>
  );
}
