import { useState } from "react";
import { Platform } from "react-native";
import { SystemButton, SystemPanel, SystemText as Text } from "@/components/system";
import { Choices, ErrorText, Screen } from "@/components/ui";
import { useStore } from "@/lib/store";
import { languages, type Language } from "@/lib/translations";
import { syncHealth } from "@/lib/health";

export function SettingsScreen() {
  const { units, formula, language, lastSync, setPreference, refresh, t, date } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function preference(key: string, value: string) {
    try {
      setPreference(key, value);
      setError("");
    } catch {
      setError("error");
    }
  }
  async function sync() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await syncHealth();
      setMessage("syncDone");
    } catch (error) {
      setError(
        error instanceof Error && ["healthUnavailable", "syncing"].includes(error.message)
          ? error.message
          : "syncFailed"
      );
    } finally {
      refresh();
      setBusy(false);
    }
  }
  return (
    <Screen title={t("settings")}>
      <SystemPanel>
        <SystemPanel.Body className="gap-3">
          <SystemPanel.Title>{t("units")}</SystemPanel.Title>
          <Choices
            values={["metric", "imperial", "stone"] as const}
            value={units}
            onChange={(value) => preference("units", value)}
            label={(value) =>
              `${t(value)} · ${value === "metric" ? "kg / cm" : value === "imperial" ? "lb / in" : "st / in"}`
            }
          />
        </SystemPanel.Body>
      </SystemPanel>
      <SystemPanel>
        <SystemPanel.Body className="gap-3">
          <SystemPanel.Title>{t("language")}</SystemPanel.Title>
          <Choices
            values={Object.keys(languages) as Language[]}
            value={language}
            onChange={(value) => preference("language", value)}
            label={(value) => languages[value]}
          />
        </SystemPanel.Body>
      </SystemPanel>
      <SystemPanel>
        <SystemPanel.Body className="gap-3">
          <SystemPanel.Title>{t("formula")}</SystemPanel.Title>
          <Choices
            values={["none", "male", "female"] as const}
            value={formula}
            onChange={(value) => preference("formula", value)}
          />
          <Text className="text-sm text-muted">{t("bodyHelp")}</Text>
        </SystemPanel.Body>
      </SystemPanel>
      <SystemPanel>
        <SystemPanel.Body className="gap-3">
          <SystemPanel.Title>
            {Platform.OS === "ios" ? "Apple Health" : "Health Connect"}
          </SystemPanel.Title>
          <Text className="text-muted">{t("healthPrivacy")}</Text>
          <Text className="text-sm text-muted">{t("syncHelp")}</Text>
          {lastSync && (
            <Text className="text-sm text-muted">
              {t("lastSync")}: {date(lastSync)}
            </Text>
          )}
          <SystemButton isDisabled={busy} onPress={sync}>
            {t(busy ? "syncing" : "sync")}
          </SystemButton>
          {message && (
            <Text
              accessibilityLiveRegion="polite"
              className="border-l-2 border-success pl-3 text-success"
            >
              {t(message)}
            </Text>
          )}
        </SystemPanel.Body>
      </SystemPanel>
      <ErrorText message={error ? t(error) : ""} />
    </Screen>
  );
}
