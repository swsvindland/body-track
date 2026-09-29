import { useEffect, type JSX } from "react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { getLocales } from "expo-localization";
import { Ionicons } from "@expo/vector-icons";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View } from "react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import { StoreProvider } from "@/lib/store";
import { interpolate, resolveLanguage, translate } from "@/lib/translations";
import { NavigationTheme, SystemState, VectorProvider, vectorHeroConfig } from "@/vector";
import { VectorAdapter } from "@/vector-adapter";
import { db } from "@/db";

import "../global.css";

// The splash stays up until fonts, migrations and the first store read are ready: no loading screen.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

// The store never opened, so the preference is unknown: the device language decides.
function MigrationError({ message }: { message: string }) {
  const language = resolveLanguage("system", getLocales()[0]?.languageCode);
  return (
    <VectorProvider language={language}>
      <HeroUINativeProvider config={vectorHeroConfig}>
        <View className="flex-1 justify-center bg-background p-6">
          <View className="w-full max-w-[640px] self-center">
            <SystemState
              kind="error"
              message={interpolate(translate(language, "migrationError"), { message })}
            />
          </View>
        </View>
        <StatusBar style="auto" />
      </HeroUINativeProvider>
    </VectorProvider>
  );
}

export default function RootLayout(): JSX.Element | null {
  const [fontsLoaded, fontError] = useFonts({
    Inter: require("../../assets/fonts/Inter.ttf"),
    IBMPlexMono: require("../../assets/fonts/IBMPlexMono-Regular.ttf"),
    ...Ionicons.font,
  });
  const { success, error } = useMigrations(db, migrations);
  const ready = success && (fontsLoaded || !!fontError);

  // Effects run after the tree commits, so StoreProvider has made its first read by now.
  useEffect(() => {
    if (ready || error) SplashScreen.hide();
  }, [ready, error]);

  if (!ready && !error) return null;

  // HeroUI renders menus, selects and toasts in a portal host beside its children, so it sits inside the kit
  // provider: kit components in those overlays need its context.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {error ? (
        <MigrationError message={error.message} />
      ) : (
        <StoreProvider>
          <VectorAdapter>
            <HeroUINativeProvider config={vectorHeroConfig}>
              <NavigationTheme>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                </Stack>
              </NavigationTheme>
              <StatusBar style="auto" />
            </HeroUINativeProvider>
          </VectorAdapter>
        </StoreProvider>
      )}
    </GestureHandlerRootView>
  );
}
