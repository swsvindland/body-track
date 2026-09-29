import { View } from "react-native";
import {
  Value,
  useKitFormat,
  type IntlUnit,
  type NumberParts,
  type VectorTextProps,
} from "@/vector";
import { useStore } from "@/lib/store";
import { fromCm, fromKg, heightParts, type Units } from "@/lib/metrics";

/** One Value's props: the formatted number plus the locale's unit, order and spacing (format.unitParts). */
export type Reading = NumberParts;
/** A measurement as Value parts (feet and inches are two) and as text for sentences and screen readers. */
export type Measure = { parts: Reading[]; text: string };

export const weightUnits = {
  metric: "kilogram",
  imperial: "pound",
  stone: "stone",
} as const satisfies Record<Units, IntlUnit>;
export const lengthUnits = {
  metric: "centimeter",
  imperial: "inch",
  stone: "inch",
} as const satisfies Record<Units, IntlUnit>;
/**
 * Measurements in the chosen units. Digits stay fixed (72.0 kg), so a column of weights lines up; the unit, its
 * order and its spacing come from Intl, so ko and zh write it their own way (the kit falls back to the number and
 * the unit's symbol where the engine rejects or converts a unit).
 */
export function useReadings() {
  const format = useKitFormat();
  const { units, t } = useStore();
  const reading = (n: number, unit: IntlUnit, digits: number): Reading =>
    format.unitParts(n, unit, digits, { fixed: true });
  const textOf = ({ value, unit, unitFirst, space }: Reading) =>
    unitFirst ? `${unit}${space}${value}` : `${value}${space}${unit}`;
  const one = (part: Reading): Measure => ({ parts: [part], text: textOf(part) });
  return {
    weightUnit: weightUnits[units],
    lengthUnit: lengthUnits[units],
    /** kg, shown in the chosen weight unit. */
    weight: (kg: number) => one(reading(fromKg(kg, units), weightUnits[units], 1)),
    /** cm, shown in the chosen length unit. */
    length: (cm: number) => one(reading(fromCm(cm, units), lengthUnits[units], 1)),
    /** cm; imperial heights read as feet and inches. */
    height: (cm: number): Measure => {
      if (units === "metric") return one(reading(cm, "centimeter", 1));
      const { feet, inches } = heightParts(cm, 1);
      const parts = [
        reading(feet, "foot", 0),
        reading(inches, "inch", Number.isInteger(inches) ? 0 : 1),
      ];
      return { parts, text: t("feetInches", { feet: textOf(parts[0]), inches: textOf(parts[1]) }) };
    },
    /** A percentage such as body fat (18.5 means 18.5 %), with the sign in the locale's order and spacing. */
    percent: (value: number) => one(format.percentParts(value / 100, 1)),
    /** The unit alone, for a field suffix. */
    unit: (unit: IntlUnit) => reading(2, unit, 0).unit,
    /** The locale's percent sign, for a field suffix. */
    percentSign: format.percentParts(0).unit,
  };
}

/** A measurement as Values: one, or feet and inches side by side on one baseline (read as one phrase). */
export function Readout({
  measure,
  size = "s",
  tone,
}: {
  measure: Measure;
  size?: "xl" | "l" | "m" | "s" | "xs";
  tone?: VectorTextProps["tone"];
}) {
  const [first, ...rest] = measure.parts;
  if (!rest.length) return <Value {...first} size={size} tone={tone} />;
  return (
    <View
      accessible
      accessibilityLabel={measure.text}
      className="flex-row flex-wrap items-baseline gap-x-2"
    >
      {measure.parts.map((part, i) => (
        <Value key={i} {...part} size={size} tone={tone} />
      ))}
    </View>
  );
}
