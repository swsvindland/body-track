import { useState } from "react";
import { Text, View } from "react-native";
import { Card, useThemeColor } from "heroui-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useStore } from "@/lib/store";
import { bodyFat, composition, fromKg, weightTrend, weightUnit } from "@/lib/metrics";

export function Dashboard() {
  const { weights, measurements, units, formula, t, number, date } = useStore();
  const trend = weightTrend(weights);
  const latest = trend.at(-1);
  const heightEntry = measurements.find((m) => m.kind === "height");
  const bodyEntry = measurements.find((m) => m.kind === "body");
  const height = heightEntry?.values.height;
  const fat = bodyFat(bodyEntry?.values, height, formula);
  const { bmi, ffmi } = composition(latest?.trend, height, fat);
  const [width, setWidth] = useState(0);
  const accent = String(useThemeColor("accent"));
  const muted = String(useThemeColor("muted"));
  const visible = trend.filter(
    (p) => Date.parse(p.day) >= Date.parse(latest?.day ?? "2000-01-01") - 90 * 86400000
  );
  const values = visible.flatMap((p) => [p.raw, p.trend]);
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const start = Date.parse(visible[0]?.day ?? "2000-01-01");
  const end = Date.parse(latest?.day ?? "2000-01-01");
  const x = (day: string) =>
    10 +
    (end === start ? 0.5 : (Date.parse(day) - start) / (end - start)) * Math.max(width - 20, 1);
  const y = (value: number) => 12 + ((max - value) / (max - min)) * 140;
  return (
    <View className="gap-4">
      <Card>
        <Card.Body className="gap-3">
          <Card.Description>{t("trend")}</Card.Description>
          <Text className="text-4xl font-bold tabular-nums text-foreground">
            {latest ? number(fromKg(latest.trend, units)) : "—"}{" "}
            <Text className="text-xl text-muted">{weightUnit(units)}</Text>
          </Text>
          <Text className="text-sm text-muted">
            {latest
              ? `${t("asOf")} ${date(latest.day)} · ${t("latest")}: ${number(fromKg(weights[0].weightKg, units))} ${weightUnit(units)}`
              : t("needWeight")}
          </Text>
          {latest && (
            <View
              onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
              style={{ height: 170 }}
            >
              {width > 0 && latest && (
                <Svg width={width} height={170} accessibilityLabel={t("trend")}>
                  {visible.map((point) => (
                    <Circle
                      key={point.day}
                      cx={x(point.day)}
                      cy={y(point.raw)}
                      r={3}
                      fill={muted}
                      opacity={0.65}
                    />
                  ))}
                  <Path
                    d={visible
                      .map((p, i) => `${i ? "L" : "M"} ${x(p.day)} ${y(p.trend)}`)
                      .join(" ")}
                    stroke={accent}
                    strokeWidth={3}
                    fill="none"
                  />
                  <Circle cx={x(latest.day)} cy={y(latest.trend)} r={4} fill={accent} />
                </Svg>
              )}
            </View>
          )}
          {latest && (
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted">{date(visible[0].day)}</Text>
              <Text className="text-xs text-muted">{date(latest.day)}</Text>
            </View>
          )}
          <Text className="text-sm text-muted">{t("trendHelp")}</Text>
        </Card.Body>
      </Card>
      <View className="flex-row flex-wrap gap-3">
        {[
          { key: "bmi", value: bmi },
          { key: "bodyFat", value: fat },
          { key: "ffmi", value: ffmi },
        ].map((metric) => (
          <Card key={metric.key} style={{ flexGrow: 1, flexBasis: 100 }}>
            <Card.Body className="gap-2">
              <Card.Description>{t(metric.key)}</Card.Description>
              <Text className="text-2xl font-semibold tabular-nums text-foreground">
                {metric.value === null ? "—" : number(metric.value)}
                {metric.key === "bodyFat" && metric.value !== null ? "%" : ""}
              </Text>
              <Text className="text-xs text-muted">
                {metric.value === null
                  ? `${t("add")} · ${t(metric.key === "bodyFat" ? "measurements" : !height ? "height" : !latest ? "weight" : "measurements")}`
                  : metric.key === "bmi"
                    ? `${t("height")} · ${date(heightEntry!.measuredAt)}`
                    : `${t(bodyEntry?.values.bodyFat ? "bodyFat" : "estimated")} · ${date(bodyEntry!.measuredAt)}`}
              </Text>
            </Card.Body>
          </Card>
        ))}
      </View>
    </View>
  );
}
