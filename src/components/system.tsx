import {
  Children,
  type ComponentProps,
  type ComponentPropsWithRef,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  View,
  type GestureResponderEvent,
  type StyleProp,
  type Text as NativeText,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button as HeroButton, useThemeColor } from "heroui-native";
import { isSharedValue, type SharedValue } from "react-native-reanimated";
import { twMerge } from "tailwind-merge";
import {
  Button,
  buttonLook,
  Heading,
  Icon,
  Label,
  Note,
  Panel,
  Text,
  Value,
  resolveIcon,
  type IconName,
  type IconTone,
  type IoniconsName,
  type PanelProps,
} from "@/vector";

/**
 * Migration shims (KIT §7): the old SystemX names and prop shapes, rendered by the kit. Call sites move to
 * "@/vector" screen by screen; size and weight classes they still pass are dropped by kit Text.
 */
type NativeTextProps = ComponentProps<typeof NativeText>;

export function SystemText(props: NativeTextProps) {
  return <Text {...props} />;
}

// Old SystemLabel text wrapped; the kit Label is one line unless told otherwise, so the shim lifts the limit.
export function SystemLabel(props: NativeTextProps) {
  return <Label numberOfLines={0} {...props} />;
}

/** A string child is a kit Value; composed children (a number with a nested unit) render as a readout. */
export function SystemValue({ children, ...props }: NativeTextProps) {
  return typeof children === "string" ? (
    <Value {...props} value={children} />
  ) : (
    <Text {...props} variant="readoutS">
      {children}
    </Text>
  );
}

type ShimIconName = IconName | IoniconsName;
type HeroButtonProps = ComponentPropsWithRef<typeof HeroButton>;
type HeroVariant = NonNullable<HeroButtonProps["variant"]>;
type KitVariant = NonNullable<ComponentProps<typeof Button>["variant"]>;
type PressHandler = ((event: GestureResponderEvent) => void) | null | undefined;

const kitVariant = {
  primary: "primary",
  secondary: "secondary",
  outline: "secondary",
  tertiary: "secondary",
  ghost: "ghost",
  danger: "destructive",
  "danger-soft": "destructive",
} as const satisfies Record<HeroVariant, KitVariant>;

// Only for an Ionicons name the registry lacks (the counted fallback).
const glyphColor = {
  foreground: "foreground",
  muted: "muted",
  tint: "link",
  onSignal: "accent-foreground",
  onDanger: "danger-foreground",
  danger: "danger",
  warning: "warning",
  success: "success",
} as const;

function ShimGlyph({ icon, tone }: { icon: ShimIconName; tone: IconTone }) {
  const color = String(useThemeColor(glyphColor[tone]));
  const name = resolveIcon(icon);
  return name ? (
    <Icon name={name} size={17} tone={tone} />
  ) : (
    <Ionicons name={icon as IoniconsName} size={17} color={color} />
  );
}

/** Plain text children ("Add · Body" arrives as three strings) as one label, else null. */
function textOf(children: ReactNode): string | null {
  const parts = Children.toArray(children);
  return parts.length && parts.every((p) => typeof p === "string" || typeof p === "number")
    ? parts.join("")
    : null;
}

// HeroUI also accepts Reanimated shared values for these props; the kit takes plain ones (no call site animates them).
const plain = <T,>(value: T | SharedValue<T | undefined>): T | undefined =>
  isSharedValue<T | undefined>(value) ? undefined : value;
// The kit forwards press handlers to HeroUI unchanged, so old (event) => void handlers still get the event.
const handler = (fn: PressHandler | SharedValue<PressHandler>) =>
  (plain(fn) ?? undefined) as (() => void) | undefined;
const noop = () => {};

/** Text → kit Button. Elements, icon-only buttons and accessibility actions → HeroUI with the kit look. */
export function SystemButton({
  variant = "primary",
  icon,
  labelClassName,
  fit,
  isDisabled,
  className,
  children,
  onPress,
  ref,
  // Dropped: the kit look presses by colour only (feedbackVariant "none").
  animation,
  feedbackVariant,
  ...props
}: HeroButtonProps & {
  icon?: ShimIconName | ReactElement;
  /** Ignored: the kit owns the label style. */
  labelClassName?: string;
  fit?: boolean;
}) {
  const kit = kitVariant[variant];
  const label = textOf(children);
  const glyph = typeof icon === "string" ? resolveIcon(icon) : undefined;
  if (
    label !== null &&
    (icon === undefined || glyph) &&
    !props.isIconOnly &&
    !props.accessibilityActions &&
    !props.onAccessibilityAction
  ) {
    return (
      <Button
        ref={ref}
        accessibilityLabel={plain(props.accessibilityLabel)}
        accessibilityHint={plain(props.accessibilityHint)}
        accessibilityRole={plain(props.accessibilityRole)}
        accessibilityState={plain(props.accessibilityState)}
        accessibilityValue={plain(props.accessibilityValue)}
        hitSlop={plain(props.hitSlop) ?? undefined}
        onLongPress={handler(props.onLongPress)}
        variant={kit}
        icon={glyph}
        fit={fit}
        disabled={!!isDisabled}
        className={className}
        onPress={handler(onPress) ?? noop}
      >
        {label}
      </Button>
    );
  }
  // The kit Button's look as data (buttonLook), so the shim never copies its classes.
  const look = buttonLook(kit);
  return (
    <HeroButton
      {...props}
      ref={ref}
      variant={look.variant}
      feedbackVariant={look.feedbackVariant}
      isDisabled={isDisabled}
      onPress={onPress}
      className={twMerge(look.className, className)}
    >
      {icon === undefined ? null : typeof icon === "string" ? (
        <ShimGlyph icon={icon} tone={look.iconTone} />
      ) : (
        icon
      )}
      {label !== null ? (
        <HeroButton.Label className={look.labelClassName}>{label}</HeroButton.Label>
      ) : (
        children
      )}
    </HeroButton>
  );
}

type Slot = { children: ReactNode; className?: string };

/** Grid cells still size themselves through `style` (dashboard metric tiles); the kit Panel takes classes only. */
function ShimPanel({ style, className, ...props }: PanelProps & { style?: StyleProp<ViewStyle> }) {
  if (!style) return <Panel {...props} className={className} />;
  return (
    <View style={style}>
      <Panel {...props} className={twMerge("flex-1", className)} />
    </View>
  );
}

function ShimHeader({
  children,
  eyebrow,
  meta,
  title,
}: {
  eyebrow?: string;
  meta?: ReactNode;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <>
      <Panel.Header eyebrow={eyebrow} meta={meta} title={title} />
      {children}
    </>
  );
}
// Not a row in a row panel, like the kit's own Panel.Header.
ShimHeader.panelHeader = true as const;

export const SystemPanel = Object.assign(ShimPanel, {
  Header: ShimHeader,
  Title: ({ children, className }: Slot) => (
    <Heading level={3} className={className}>
      {children}
    </Heading>
  ),
  Description: ({ children, className }: Slot) => <Note className={className}>{children}</Note>,
  Body: ({ children, className }: Slot) => (
    <Panel.Body className={className}>{children}</Panel.Body>
  ),
  Footer: ({ children }: Slot) => <Panel.Footer>{children}</Panel.Footer>,
});
