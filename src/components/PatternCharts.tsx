import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { PatternStats } from "@/shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type { PatternStats };

const darkBarColors = ["#4889c9", "#5da85d", "#e07c3c"];

// Explicit light colors for dark theme (ECharts canvas does not resolve CSS variables)
const LIGHT = {
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textBright: "#f1f5f9",
  label: "#cbd5e1",
  border: "#334155",
  tooltipBg: "#1e293b",
};

function barOption(
  data: [string, number][],
  title: string,
  colorIndex: number
): EChartsOption {
  const color = darkBarColors[colorIndex % darkBarColors.length];
  return {
    backgroundColor: "transparent",
    textStyle: { color: LIGHT.textMuted, fontSize: 12 },
    title: {
      text: title,
      left: 0,
      top: 0,
      textStyle: { fontSize: 12, color: LIGHT.textBright, fontWeight: 500 },
    },
    grid: {
      left: 120,
      right: 24,
      top: 28,
      bottom: 24,
      containLabel: false,
    },
    xAxis: {
      type: "value",
      axisLine: { show: true, lineStyle: { color: LIGHT.border } },
      splitLine: { lineStyle: { color: LIGHT.border, type: "dashed" } },
      axisLabel: { color: LIGHT.text, fontSize: 12 },
    },
    yAxis: {
      type: "category",
      data: data.map((d) => d[0]),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: LIGHT.text, fontSize: 12 },
      inverse: true,
    },
    series: [
      {
        type: "bar",
        data: data.map((d) => d[1]),
        itemStyle: { color },
        barMaxWidth: 24,
        label: {
          show: true,
          position: "right",
          color: LIGHT.label,
          fontSize: 11,
        },
      },
    ],
    tooltip: {
      trigger: "axis",
      backgroundColor: LIGHT.tooltipBg,
      borderColor: LIGHT.border,
      textStyle: { color: LIGHT.textBright, fontSize: 12 },
    },
  };
}

export default function PatternCharts({ stats }: { stats: PatternStats | null }) {
  if (!stats) return null;

  const hooksOption = barOption(stats.hooks, "Top hooks", 0);
  const emotionsOption = barOption(stats.emotions, "Emotions", 1);
  const offersOption = barOption(stats.offers, "Offers", 2);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pattern distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-6">
          <div className="min-h-[200px] w-[320px]">
            <ReactECharts option={hooksOption} style={{ height: Math.max(120, stats.hooks.length * 28) }} />
          </div>
          <div className="min-h-[200px] w-[320px]">
            <ReactECharts option={emotionsOption} style={{ height: Math.max(120, stats.emotions.length * 28) }} />
          </div>
          <div className="min-h-[200px] w-[320px]">
            <ReactECharts option={offersOption} style={{ height: Math.max(120, stats.offers.length * 28) }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
