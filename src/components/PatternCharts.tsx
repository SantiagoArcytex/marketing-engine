import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Box, Typography, Paper } from "@mui/material";

export interface PatternStats {
  hooks: [string, number][];
  emotions: [string, number][];
  offers: [string, number][];
}

function drawBarChart(
  container: SVGSVGElement | null,
  data: [string, number][],
  title: string,
  color: string
) {
  if (!container || data.length === 0) return;
  d3.select(container).selectAll("*").remove();

  const margin = { top: 20, right: 20, bottom: 30, left: 120 };
  const width = Math.max(280, container.clientWidth) - margin.left - margin.right;
  const height = Math.max(120, data.length * 22);

  const svg = d3
    .select(container)
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d[1]) ?? 1]).range([0, width]);
  const y = d3
    .scaleBand()
    .domain(data.map((d) => d[0]))
    .range([0, height])
    .padding(0.2);

  g.append("text")
    .attr("x", 0)
    .attr("y", -8)
    .attr("font-size", "12px")
    .attr("fill", "currentColor")
    .text(title);

  g.selectAll(".bar")
    .data(data)
    .join("rect")
    .attr("class", "bar")
    .attr("x", 0)
    .attr("y", (d) => y(d[0]) ?? 0)
    .attr("height", y.bandwidth())
    .attr("width", (d) => x(d[1]))
    .attr("fill", color);

  g.selectAll(".label")
    .data(data)
    .join("text")
    .attr("class", "label")
    .attr("x", (d) => x(d[1]) + 4)
    .attr("y", (d) => (y(d[0]) ?? 0) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("font-size", "11px")
    .attr("fill", "currentColor")
    .text((d) => d[1]);
}

export default function PatternCharts({ stats }: { stats: PatternStats | null }) {
  const hooksRef = useRef<SVGSVGElement>(null);
  const emotionsRef = useRef<SVGSVGElement>(null);
  const offersRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!stats) return;
    drawBarChart(hooksRef.current, stats.hooks, "Top hooks", "#1976d2");
    drawBarChart(emotionsRef.current, stats.emotions, "Emotions", "#2e7d32");
    drawBarChart(offersRef.current, stats.offers, "Offers", "#ed6c02");
  }, [stats]);

  if (!stats) return null;

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Pattern distribution
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        <Box>
          <svg ref={hooksRef} />
        </Box>
        <Box>
          <svg ref={emotionsRef} />
        </Box>
        <Box>
          <svg ref={offersRef} />
        </Box>
      </Box>
    </Paper>
  );
}
