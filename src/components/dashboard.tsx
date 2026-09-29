import { useState } from "react";
import { router } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Popover } from "heroui-native";
import {
  Heading,
  IconButton,
  LinkButton,
  Meta,
  Panel,
  SystemState,
  Text,
  TrendChart,
  Value,
  useKitFormat,
  type VectorTextProps,
} from "@/vector";
import { Readout, useReadings } from "@/components/measurements/readout";
import { useStore } from "@/lib/store";
import {
  metricContext,
  shoulderWaistRatio,
  type DashboardMetric,
  type MetricTone,
} from "@/lib/metric-context";
import { bodyFat, composition, fromKg, weightTrend } from "@/lib/metrics";

const contextTone = {
  neutral: "muted",
  info: "tint",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const satisfies Record<MetricTone, VectorTextProps["tone"]>;

/** Chart ticks are round values (0.5, 0.25 steps): only the digits a tick needs. */
const tickDigits = (value: number) => Math.min(2, String(value).split(".")[1]?.length ?? 0);

/** A metric panel's eyebrow and its explainer. The eyebrow wraps: metric names run long in de and fr. */
function DashboardCardHeader({ title, help }: { title: string; help: string[] }) {
  const { t } = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);

  const explainer = (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        {/* Popover.Trigger (asChild) supplies onPress and the ref it measures. */}
        <IconButton
          icon="info"
          accessibilityLabel={t("metricInfoFor", { metric: title })}
          onPress={() => {}}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content
          presentation="popover"
          placement="bottom"
          align="end"
          width={Math.min(300, width - insets.left - insets.right - 32)}
          insets={{ top: insets.top + 8, bottom: insets.bottom + 8, left: 16, right: 16 }}
          className="gap-2 rounded-control border border-border p-3"
        >
          <View className="flex-row items-center gap-2">
            <Heading level={3} className="flex-1">
              {title}
            </Heading>
            <IconButton
              icon="close"
              accessibilityLabel={t("close")}
              onPress={() => setIsOpen(false)}
            />
          </View>
          {help.map((paragraph) => (
            <Text key={paragraph} variant="small">
              {paragraph}
            </Text>
          ))}
          <LinkButton
            icon="forward"
            onPress={() => {
              setIsOpen(false);
              router.push("/health-sources");
            }}
          >
            {t("sourcesTitle")}
          </LinkButton>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
  return <Panel.Header eyebrow={title} wrap action={explainer} />;
}

export function Dashboard() {
  const { weights, measurements, units, formula, t, date } = useStore();
  const format = useKitFormat();
  const readings = useReadings();
  const trend = weightTrend(weights);
  const latest = trend.at(-1);
  const heightEntry = measurements.find((m) => m.kind === "height");
  const bodyEntry = measurements.find((m) => m.kind === "body");
  const ratioEntry = measurements.find(
    (m) => m.kind === "body" && shoulderWaistRatio(m.values) !== null
  );
  const ratio = shoulderWaistRatio(ratioEntry?.values);
  const height = heightEntry?.values.height;
  const fat = bodyFat(bodyEntry?.values, height, formula);
  const { bmi, ffmi } = composition(latest?.trend, height, fat);
  const visible = trend.filter(
    (p) => Date.parse(p.day) >= Date.parse(latest?.day ?? "2000-01-01") - 90 * 86400000
  );
  const shown = (value: number) => fromKg(value, units);
  /** The chart for screen readers: span, low, high, latest, and which way the trend went as rounded on screen. */
  const trendSummary = () => {
    const values = visible.map((p) => p.trend);
    const first = values[0];
    const last = values[values.length - 1];
    const steady = readings.weight(first).text === readings.weight(last).text;
    return t("trendChartSummary", {
      from: date(visible[0].day),
      to: date(visible[visible.length - 1].day),
      min: readings.weight(Math.min(...values)).text,
      max: readings.weight(Math.max(...values)).text,
      value: readings.weight(last).text,
      direction: t(steady ? "trendSteady" : last > first ? "trendRising" : "trendFalling"),
    });
  };
  return (
    <View className="gap-4">
      <LinkButton icon="forward" onPress={() => router.push("/health-sources")}>
        {t("sourcesTitle")}
      </LinkButton>
      <Panel>
        <DashboardCardHeader title={t("trend")} help={[t("trendHelp")]} />
        <Panel.Body>
          {latest ? (
            <>
              <Readout measure={readings.weight(latest.trend)} size="xl" />
              <Meta
                items={[
                  t("asOfDate", { date: date(latest.day) }),
                  t("latestValue", { value: readings.weight(weights[0].weightKg).text }),
                ]}
              />
              <TrendChart
                lines={[
                  {
                    role: "reference",
                    points: visible.map((p) => ({ day: p.day, value: shown(p.raw) })),
                    label: t("weight"),
                  },
                  {
                    role: "subject",
                    points: visible.map((p) => ({ day: p.day, value: shown(p.trend) })),
                    label: t("trend"),
                  },
                ]}
                minSpan={shown(2)}
                yFormat={(value) => format.number(value, tickDigits(value))}
                summary={trendSummary()}
              />
            </>
          ) : (
            <SystemState kind="empty" message={t("needWeight")} />
          )}
        </Panel.Body>
      </Panel>
      <View className="flex-row flex-wrap gap-3">
        {(
          [
            { key: "bmi", value: bmi },
            { key: "bodyFat", value: fat },
            { key: "ffmi", value: ffmi },
            { key: "shoulderWaistRatio", value: ratio },
          ] satisfies { key: DashboardMetric; value: number | null }[]
        ).map((metric) => {
          const context = metricContext(metric.key, metric.value, formula);
          const range = context.range && format.range(context.range[0], context.range[1], 1);
          return (
            <Panel key={metric.key} className="grow basis-40">
              <DashboardCardHeader
                title={t(metric.key)}
                help={[
                  t(context.help),
                  ...(metric.key === "shoulderWaistRatio"
                    ? [t("ratioGoalValue", { value: format.number(1.62, 2) })]
                    : []),
                  ...(range
                    ? [
                        metric.key === "bmi"
                          ? t("referenceValue", { range })
                          : t("referenceFormula", {
                              range:
                                metric.key === "bodyFat" ? t("percentRange", { range }) : range,
                              formula: t(formula),
                            }),
                      ]
                    : []),
                ]}
              />
              <Panel.Body className="flex-1 gap-2">
                {metric.value === null ? (
                  // A placeholder only: the context line below says what is missing.
                  <Value
                    value="—"
                    size="m"
                    tone="muted"
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                ) : metric.key === "bodyFat" ? (
                  <Readout measure={readings.percent(metric.value)} size="m" />
                ) : (
                  <Value
                    value={format.number(metric.value, metric.key === "shoulderWaistRatio" ? 2 : 1)}
                    size="m"
                  />
                )}
                <Text variant="small" tone={contextTone[context.tone]}>
                  {t(context.label)}
                </Text>
                <View className="mt-auto pt-1">
                  <Meta
                    items={
                      metric.value === null
                        ? [
                            t(
                              metric.key === "bodyFat" || metric.key === "shoulderWaistRatio"
                                ? "addMeasurements"
                                : !height
                                  ? "addHeight"
                                  : !latest
                                    ? "addWeight"
                                    : "addMeasurements"
                            ),
                          ]
                        : metric.key === "shoulderWaistRatio"
                          ? [t("shouldersOverWaist"), date(ratioEntry!.measuredAt)]
                          : metric.key === "bmi"
                            ? [t("height"), date(heightEntry!.measuredAt)]
                            : [
                                t(bodyEntry?.values.bodyFat ? "bodyFat" : "estimated"),
                                date(bodyEntry!.measuredAt),
                              ]
                    }
                  />
                </View>
              </Panel.Body>
            </Panel>
          );
        })}
      </View>
    </View>
  );
}
