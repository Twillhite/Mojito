export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function drawTimelineChart(svg, points, formatter = formatCurrency) {
  const width = 720;
  const height = 320;
  const padding = 28;
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 1);
  const todayIndex = points.findIndex((point) => point.period === "current");
  const forecastStart = points.findIndex((point) => point.period === "forecast");

  const xAt = (index) => padding + (index / (points.length - 1)) * (width - padding * 2);
  const yAt = (value) =>
    height - padding - ((value - minValue) / range) * (height - padding * 2);

  const toPath = (pathPoints, startIndex) =>
    pathPoints
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${xAt(startIndex + index)} ${yAt(point.value)}`,
      )
      .join(" ");

  const historicalPoints =
    forecastStart > 0 ? points.slice(0, forecastStart) : points;
  const forecastPoints =
    forecastStart > 0 ? points.slice(Math.max(forecastStart - 1, 0)) : [];

  const historicalPath = toPath(historicalPoints, 0);
  const forecastPath =
    forecastPoints.length > 0 ? toPath(forecastPoints, Math.max(forecastStart - 1, 0)) : "";

  const area = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value)}`)
    .join(" ");
  const areaPath = `${area} L ${xAt(points.length - 1)} ${height - padding} L ${xAt(0)} ${height - padding} Z`;
  const todayX = todayIndex >= 0 ? xAt(todayIndex) : xAt(Math.floor(points.length / 2));

  svg.innerHTML = `
    <defs>
      <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.18)"></stop>
        <stop offset="100%" stop-color="rgba(255,255,255,0.02)"></stop>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#fill)"></path>
    <path d="${historicalPath}" fill="none" stroke="#7a7a7a" stroke-width="3" stroke-linecap="round"></path>
    ${
      forecastPath
        ? `<path d="${forecastPath}" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"></path>`
        : ""
    }
    <line x1="${todayX}" y1="${padding}" x2="${todayX}" y2="${height - padding}" stroke="rgba(255,255,255,0.18)" stroke-dasharray="4 6"></line>
    <circle cx="${todayX}" cy="${yAt(points[todayIndex >= 0 ? todayIndex : points.length - 1].value)}" r="5" fill="#ffffff"></circle>
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
