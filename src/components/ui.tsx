import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Input, Label, TextField } from "heroui-native";
import { useStore } from "@/lib/store";

export function Screen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          paddingTop: 28,
          paddingBottom: 40,
          gap: 20,
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
      >
        <View>
          <Text accessibilityRole="header" className="text-3xl font-bold text-foreground">
            {title}
          </Text>
          {subtitle && <Text className="mt-2 text-muted">{subtitle}</Text>}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Field({
  label,
  value,
  onChange,
  numeric = false,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <TextField isDisabled={disabled}>
      <Label>{label}</Label>
      <Input
        accessibilityLabel={label}
        variant="secondary"
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "decimal-pad" : "default"}
        autoCapitalize="none"
        placeholder={placeholder}
      />
    </TextField>
  );
}
export function Choices<T extends string>({
  values,
  value,
  onChange,
  label,
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label?: (value: T) => string;
}) {
  const { t } = useStore();
  return (
    <View className="flex-row flex-wrap gap-2">
      {values.map((option) => (
        <Button
          key={option}
          variant={value === option ? "secondary" : "ghost"}
          accessibilityState={{ selected: value === option }}
          onPress={() => onChange(option)}
        >
          {label ? label(option) : t(option)}
        </Button>
      ))}
    </View>
  );
}
export function Editor({
  title,
  open,
  close,
  children,
  busy = false,
}: {
  title: string;
  open: boolean;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const { t } = useStore();
  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => !busy && close()}
    >
      <SafeAreaView className="flex-1 bg-background">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: 24,
              gap: 20,
              paddingBottom: 40,
              maxWidth: 640,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">
              {title}
            </Text>
            {children}
            <Button variant="ghost" isDisabled={busy} onPress={close}>
              {t("cancel")}
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <Text accessibilityRole="alert" className="text-danger">
      {message}
    </Text>
  ) : null;
}
