import { router } from "expo-router";
import { Text } from "react-native";
import { Button } from "heroui-native";
import { Screen } from "@/components/ui";
import { useStore } from "@/lib/store";
export default function HealthPrivacy() {
  const { t } = useStore();
  return (
    <Screen title={t("sync")}>
      <Text className="text-foreground">{t("healthPrivacy")}</Text>
      <Text className="text-muted">{t("syncHelp")}</Text>
      <Text className="text-muted">{t("localPhotos")}</Text>
      <Button onPress={() => router.replace("/(tabs)/settings")}>{t("settings")}</Button>
    </Screen>
  );
}
