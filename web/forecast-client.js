export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function drawTimelineChart(svg, points, options = {}) {
  const formatter =
    typeof options === "function" ? options : options.formatter || formatCurrency;
  const selectedIndex =
    typeof options === "object" && options !== null ? options.selectedIndex : null;
  const hoveredIndex =
    typeof options === "object" && options !== null ? options.hoveredIndex : null;
  const width = 720;
  const height = 320;
  const padding = 28;
  const hasValue = (value) => typeof value === "number" && Number.isFinite(value);
  const values = points.map((point) => point.value).filter(hasValue);
  if (values.length === 0) {
    svg.innerHTML = "";
    return;
  }
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 1);
  const todayIndex = points.findIndex((point) => point.period === "current");
  const forecastStart = points.findIndex((point) => point.period === "forecast");

  const xAt = (index) => padding + (index / (points.length - 1)) * (width - padding * 2);
  const yAt = (value) =>
    height - padding - ((value - minValue) / range) * (height - padding * 2);

  const toPath = (pathPoints, startIndex) =>
    pathPoints.reduce((segments, point, index) => {
      if (!hasValue(point.value)) {
        return segments;
      }

      const command = segments.length === 0 || !hasValue(pathPoints[index - 1]?.value) ? "M" : "L";
      segments.push(`${command} ${xAt(startIndex + index)} ${yAt(point.value)}`);
      return segments;
    }, []).join(" ");

  const historicalPoints =
    forecastStart > 0 ? points.slice(0, forecastStart) : points;
  const forecastPoints =
    forecastStart > 0 ? points.slice(Math.max(forecastStart - 1, 0)) : [];

  const historicalPath = toPath(historicalPoints, 0);
  const forecastPath =
    forecastPoints.length > 0 ? toPath(forecastPoints, Math.max(forecastStart - 1, 0)) : "";

  const validPointIndexes = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => hasValue(point.value));
  const areaPath =
    validPointIndexes.length > 1
      ? `${validPointIndexes
          .map(
            ({ point, index }, listIndex) =>
              `${listIndex === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value)}`,
          )
          .join(" ")} L ${xAt(validPointIndexes[validPointIndexes.length - 1].index)} ${height - padding} L ${xAt(validPointIndexes[0].index)} ${height - padding} Z`
      : "";
  const todayX = todayIndex >= 0 ? xAt(todayIndex) : xAt(Math.floor(points.length / 2));
  const activeIndex =
    hoveredIndex !== null && hoveredIndex !== undefined ? hoveredIndex : selectedIndex;
  const activePoint =
    activeIndex !== null && activeIndex !== undefined ? points[activeIndex] : null;
  const activeMarker = activePoint && hasValue(activePoint.value)
    ? `
      <line x1="${xAt(activeIndex)}" y1="${padding}" x2="${xAt(activeIndex)}" y2="${height - padding}" stroke="rgba(255,255,255,0.24)" stroke-dasharray="4 6"></line>
      <circle cx="${xAt(activeIndex)}" cy="${yAt(activePoint.value)}" r="6" fill="#ffffff" stroke="#212121" stroke-width="2"></circle>
      <text x="${xAt(activeIndex)}" y="${padding - 8}" text-anchor="middle" fill="#ececec" font-size="11">${activePoint.displayLabel || activePoint.label} • ${formatter(activePoint.value)}</text>
    `
    : "";
  const todayPoint = points[todayIndex >= 0 ? todayIndex : points.length - 1];
  const todayMarker = todayPoint && hasValue(todayPoint.value)
    ? `
      <line x1="${todayX}" y1="${padding}" x2="${todayX}" y2="${height - padding}" stroke="rgba(255,255,255,0.18)" stroke-dasharray="4 6"></line>
      <circle cx="${todayX}" cy="${yAt(todayPoint.value)}" r="5" fill="#ffffff"></circle>
    `
    : "";

  svg.innerHTML = `
    <defs>
      <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.18)"></stop>
        <stop offset="100%" stop-color="rgba(255,255,255,0.02)"></stop>
      </linearGradient>
    </defs>
    ${areaPath ? `<path d="${areaPath}" fill="url(#fill)"></path>` : ""}
    ${historicalPath ? `<path d="${historicalPath}" fill="none" stroke="#7a7a7a" stroke-width="3" stroke-linecap="round"></path>` : ""}
    ${
      forecastPath
        ? `<path d="${forecastPath}" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"></path>`
        : ""
    }
    ${activeMarker}
    ${todayMarker}
    <text x="${padding}" y="${height - 8}" fill="#a1a1aa" font-size="12">2y ago</text>
    <text x="${todayX}" y="${height - 8}" text-anchor="middle" fill="#a1a1aa" font-size="12">Today</text>
    <text x="${width - padding}" y="${height - 8}" text-anchor="end" fill="#a1a1aa" font-size="12">2y ahead</text>
    <text x="${padding}" y="${yAt(maxValue) - 10}" fill="#a1a1aa" font-size="11">${formatter(maxValue)}</text>
    <text x="${padding}" y="${yAt(minValue) - 10}" fill="#a1a1aa" font-size="11">${formatter(minValue)}</text>
  `;
}

export function drawBarChart(svg, points, formatter = formatCurrency) {
  const width = 720;
  const height = 320;
  const padding = 28;
  const values = points.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const gap = 8;
  const barWidth = Math.max((chartWidth - gap * (points.length - 1)) / points.length, 8);

  const xAt = (index) => padding + index * (barWidth + gap);
  const barHeight = (value) => (value / maxValue) * chartHeight;

  const bars = points
    .map((point, index) => {
      const heightValue = barHeight(point.value);
      const x = xAt(index);
      const y = height - padding - heightValue;
      const fill = index === 0 ? "#ffffff" : "#7a7a7a";
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="6" fill="${fill}"></rect>
      `;
    })
    .join("");

  const labels = points
    .map((point, index) => {
      const x = xAt(index) + barWidth / 2;
      return `
        <text x="${x}" y="${height - 8}" text-anchor="middle" fill="#a1a1aa" font-size="11">${point.label}</text>
      `;
    })
    .join("");

  svg.innerHTML = `
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.12)"></line>
    ${bars}
    ${labels}
    <text x="${padding}" y="${padding - 8}" fill="#a1a1aa" font-size="11">${formatter(maxValue)}</text>
    <text x="${padding}" y="${height - padding - 8}" fill="#a1a1aa" font-size="11">${formatter(0)}</text>
  `;
}

export function drawMultiLineChart(svg, series, options = {}) {
  const width = 720;
  const height = 320;
  const padding = 28;
  const allPoints = series.flatMap((entry) => entry.points || []);
  const values = allPoints.map((point) => point.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const range = Math.max(maxValue - minValue, 1);
  const count = Math.max(...series.map((entry) => entry.points.length), 1);
  const formatter = options.formatter || formatCurrency;
  const xStartLabel = options.xStartLabel || "Now";
  const xEndLabel = options.xEndLabel || "Future";

  const xAt = (index) =>
    count <= 1 ? width / 2 : padding + (index / (count - 1)) * (width - padding * 2);
  const yAt = (value) =>
    height - padding - ((value - minValue) / range) * (height - padding * 2);

  const paths = series
    .map((entry) => {
      const d = entry.points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value)}`)
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${entry.color}" stroke-width="4" stroke-linecap="round"></path>`;
    })
    .join("");

  const legends = series
    .map(
      (entry, index) => `
        <g transform="translate(${padding + index * 150}, ${padding - 12})">
          <line x1="0" y1="0" x2="22" y2="0" stroke="${entry.color}" stroke-width="4" stroke-linecap="round"></line>
          <text x="30" y="4" fill="#a1a1aa" font-size="12">${entry.label}</text>
        </g>
      `,
    )
    .join("");

  svg.innerHTML = `
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.12)"></line>
    ${paths}
    ${legends}
    <text x="${padding}" y="${height - 8}" fill="#a1a1aa" font-size="12">${xStartLabel}</text>
    <text x="${width - padding}" y="${height - 8}" text-anchor="end" fill="#a1a1aa" font-size="12">${xEndLabel}</text>
    <text x="${padding}" y="${padding - 28}" fill="#a1a1aa" font-size="11">${formatter(maxValue)}</text>
    <text x="${padding}" y="${height - padding - 8}" fill="#a1a1aa" font-size="11">${formatter(minValue)}</text>
  `;
}
