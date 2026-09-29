import { Choices as KitChoices } from "@/vector";
import { useStore } from "@/lib/store";
import { isMessage } from "@/lib/translations";

// Migration shims (KIT §7): the old ui names, now the kit. Call sites move to "@/vector" screen by screen.
export {
  DateInput,
  Editor,
  ErrorText,
  Field,
  Screen,
  Select as SettingsSelect,
  useEditorPortalHost,
} from "@/vector";

/** Labels default to the translated value; `accessibilityLabel` stays optional until each call site passes one. */
export function Choices<T extends string>({
  label,
  accessibilityLabel = "",
  ...props
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label?: (value: T) => string;
  accessibilityLabel?: string;
  size?: "md" | "sm";
  mono?: boolean;
}) {
  const { t } = useStore();
  return (
    <KitChoices
      {...props}
      label={label ?? ((value) => (isMessage(value) ? t(value) : value))}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
