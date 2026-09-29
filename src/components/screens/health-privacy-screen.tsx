import { router } from "expo-router";
import { Button, Screen, Text } from "@/vector";
import { useStore } from "@/lib/store";
export function HealthPrivacyScreen() {
  const { t } = useStore();
  return (
    <Screen title={t("sync")} width="form">
      <Text>{t("healthPrivacy")}</Text>
      <Text tone="muted">{t("syncHelp")}</Text>
      <Text tone="muted">{t("localPhotos")}</Text>
      <Button onPress={() => router.replace("/(tabs)/settings")}>{t("settings")}</Button>
    </Screen>
  );
}
