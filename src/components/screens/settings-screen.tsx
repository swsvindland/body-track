import { useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import {
  Callout,
  Choices,
  ErrorText,
  Label,
  ListRow,
  Note,
  Panel,
  Screen,
  Select,
  Text,
} from "@/vector";
import { useStore } from "@/lib/store";
import { languages, type LanguagePreference, type Message } from "@/lib/translations";
import { enableHealthSync, disableHealthSync } from "@/lib/health-schedule";
import { lengthUnits, useReadings, weightUnits } from "@/components/measurements/readout";

/**
 * The SettingsSection anatomy (eyebrow, content, footnote) for groups the row panel does not fit: a control that
 * draws its own edge (Choices, Select), or notes that must be read before a row.
 */
function Section({
  eyebrow,
  footnote,
  children,
}: {
  eyebrow: string;
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-2">
      <Label accessibilityRole="header">{eyebrow}</Label>
      {children}
      {footnote ? (
        <Text variant="caption" tone="muted">
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

export function SettingsScreen() {
  const {
    units,
    formula,
    languagePreference,
    theme,
    healthSyncEnabled,
    healthSyncError,
    lastSync,
    setPreference,
    refresh,
    t,
    date,
  } = useStore();
  const readings = useReadings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message | "">("");
  const [message, setMessage] = useState<Message | "">("");
  function preference(key: string, value: string) {
    try {
      setPreference(key, value);
      setError("");
    } catch {
      setError("error");
    }
  }
  async function toggleSync(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (enabled) {
        await enableHealthSync();
        setMessage("syncDone");
      } else {
        await disableHealthSync();
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setError(reason === "healthUnavailable" || reason === "syncing" ? reason : "syncFailed");
    } finally {
      refresh();
      setBusy(false);
    }
  }
  const failure = error || healthSyncError;
  return (
    <Screen title={t("settings")} width="form">
      <Section eyebrow={t("appearance")}>
        <Choices
          values={["system", "light", "dark"] as const}
          value={theme}
          onChange={(value) => preference("theme", value)}
          label={t}
          accessibilityLabel={t("appearance")}
        />
      </Section>
      <Section eyebrow={t("units")}>
        <Select
          title={t("units")}
          values={["metric", "imperial", "stone"] as const}
          value={units}
          onChange={(value) => preference("units", value)}
          // The same unit symbols the fields and readouts use (厘米 in zh, tum in sv).
          label={(value) =>
            t("unitsOption", {
              name: t(value),
              weight: readings.unit(weightUnits[value]),
              length: readings.unit(lengthUnits[value]),
            })
          }
        />
      </Section>
      <Section eyebrow={t("language")}>
        <Select
          title={t("language")}
          values={["system", ...Object.keys(languages)] as LanguagePreference[]}
          value={languagePreference}
          onChange={(value) => preference("language", value)}
          label={(value) => (value === "system" ? t("system") : languages[value])}
        />
      </Section>
      <Section eyebrow={t("formula")} footnote={t("bodyHelp")}>
        <Choices
          values={["male", "female"] as const}
          value={formula}
          onChange={(value) => preference("formula", value)}
          label={t}
          accessibilityLabel={t("formula")}
        />
      </Section>
      <View className="gap-3">
        {/* What syncs is read before the switch that starts it. */}
        <Section
          eyebrow={t(Platform.OS === "ios" ? "appleHealth" : "healthConnect")}
          footnote={t("syncSchedule")}
        >
          <Text tone="muted">{t("healthPrivacy")}</Text>
          <Note>{t("syncHelp")}</Note>
          <Panel inset="none">
            {/* Held while a sync or permission request runs. */}
            <ListRow
              title={t(busy ? "syncing" : "sync")}
              description={lastSync ? t("lastSyncAt", { date: date(lastSync) }) : undefined}
              trailing="toggle"
              toggleValue={healthSyncEnabled}
              onToggle={(enabled) => void toggleSync(enabled)}
              disabled={busy}
            />
          </Panel>
        </Section>
        {message ? <Callout tone="success">{t(message)}</Callout> : null}
        <ErrorText message={failure ? t(failure) : ""} />
      </View>
    </Screen>
  );
}
