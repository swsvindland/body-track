import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps, JSX } from "react";
import type { ColorValue } from "react-native";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function TabIcon({ name, color }: { name: IoniconName; color: ColorValue }): JSX.Element {
  return <Ionicons name={name} size={24} color={color} />;
}

export default function TabsLayout(): JSX.Element {
  const background = useThemeColor("background");
  const muted = useThemeColor("muted");
  const accent = useThemeColor("accent");
  const border = useThemeColor("border");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: background },
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
        tabBarStyle: {
          backgroundColor: background,
          borderTopColor: border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Weight",
          tabBarIcon: ({ color }) => <TabIcon name="scale-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="body"
        options={{
          title: "Body",
          tabBarIcon: ({ color }) => <TabIcon name="body-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="photos"
        options={{
          title: "Photos",
          tabBarIcon: ({ color }) => <TabIcon name="images-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="height"
        options={{
          title: "Height",
          tabBarIcon: ({ color }) => <TabIcon name="resize-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <TabIcon name="settings-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
