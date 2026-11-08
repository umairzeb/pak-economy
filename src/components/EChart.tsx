import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { LabelLayout } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, LabelLayout, SVGRenderer]);

interface Props {
  /** Built from the container width so labels and spacing adapt to phones. */
  option: (width: number) => EChartsOption;
  height: number;
  label: string;
  /** Called with a category name when its label or bar is clicked (bar charts). */
  onItemClick?: (name: string) => void;
}

export function EChart({ option, height, label, onItemClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);
  const clickRef = useRef(onItemClick);
  clickRef.current = onItemClick;

  useEffect(() => {
    const el = ref.current!;
    chart.current = echarts.init(el, undefined, { renderer: "svg" });
    chart.current.on("click", (p) => {
      const name = p.componentType === "yAxis" ? p.value : p.name;
      if (typeof name === "string") clickRef.current?.(name);
    });
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      chart.current?.resize();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (chart.current && width > 0) chart.current.setOption(option(width), true);
  }, [option, width]);

  return <div ref={ref} style={{ width: "100%", height }} role="img" aria-label={label} />;
}
