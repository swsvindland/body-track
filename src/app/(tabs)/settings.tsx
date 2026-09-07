import { useState } from "react";
import { Platform, Text } from "react-native";
import { Button, Card } from "heroui-native";
import { Choices, ErrorText, Screen } from "@/components/ui";
import { useStore } from "@/lib/store";
import { languages, type Language } from "@/lib/translations";
import { syncHealth } from "@/lib/health";

export default function Settings() {
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
      <Card>
        <Card.Body className="gap-3">
          <Card.Title>{t("units")}</Card.Title>
          <Choices
            values={["metric", "imperial", "stone"] as const}
            value={units}
            onChange={(value) => preference("units", value)}
            label={(value) =>
              `${t(value)} · ${value === "metric" ? "kg / cm" : value === "imperial" ? "lb / in" : "st / in"}`
            }
          />
        </Card.Body>
      </Card>
      <Card>
        <Card.Body className="gap-3">
          <Card.Title>{t("language")}</Card.Title>
          <Choices
            values={Object.keys(languages) as Language[]}
            value={language}
            onChange={(value) => preference("language", value)}
            label={(value) => languages[value]}
          />
        </Card.Body>
      </Card>
      <Card>
        <Card.Body className="gap-3">
          <Card.Title>{t("formula")}</Card.Title>
          <Choices
            values={["none", "male", "female"] as const}
            value={formula}
            onChange={(value) => preference("formula", value)}
          />
          <Text className="text-sm text-muted">{t("bodyHelp")}</Text>
        </Card.Body>
      </Card>
      <Card>
        <Card.Body className="gap-3">
          <Card.Title>{Platform.OS === "ios" ? "Apple Health" : "Health Connect"}</Card.Title>
          <Text className="text-muted">{t("healthPrivacy")}</Text>
          <Text className="text-sm text-muted">{t("syncHelp")}</Text>
          {lastSync && (
            <Text className="text-sm text-muted">
              {t("lastSync")}: {date(lastSync)}
            </Text>
          )}
          <Button isDisabled={busy} onPress={sync}>
            {t(busy ? "syncing" : "sync")}
          </Button>
          {message && (
            <Text accessibilityLiveRegion="polite" className="text-accent">
              {t(message)}
            </Text>
          )}
        </Card.Body>
      </Card>
      <ErrorText message={error ? t(error) : ""} />
    </Screen>
  );
}
