import { useStore } from "@/lib/store";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { JSX } from "react";
import { tabOptions, useKit } from "@/vector";

export default function TabsLayout(): JSX.Element {
  const { t } = useStore();
  const { scheme } = useKit();

  // No bar background or per-tab content colour: iOS 26 draws Liquid Glass (design-system §6.1).
  return (
    <NativeTabs {...tabOptions(scheme)}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t("today")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "scalemass", selected: "scalemass.fill" }}
          md="monitor_weight"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="body">
        <NativeTabs.Trigger.Label>{t("body")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.stand" md="accessibility_new" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="photos">
        <NativeTabs.Trigger.Label>{t("photos")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "photo.on.rectangle", selected: "photo.fill.on.rectangle.fill" }}
          md="photo_library"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="height">
        <NativeTabs.Trigger.Label>{t("height")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="arrow.up.and.down" md="height" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t("settings")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
