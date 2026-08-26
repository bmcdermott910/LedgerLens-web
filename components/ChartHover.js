'use client';

import { useState } from 'react';

// The hover layer shared by every line chart. It renders INSIDE a parent chart's <svg>, which is
// why it is its own client component: the charts themselves stay server-rendered and only this
// island ships JavaScript.
//
// The hit targets are full-height bands, one per x position, rather than the plotted points
// themselves. Points are 2.5px across and several series can sit almost on top of each other, so
// aiming at them is fiddly and a multi-series chart could only ever show one value at a time.
// A band shows every series for that month at once, which is the question people actually ask.
export default function ChartHover({
  xs, plotTop, plotBottom, plotLeft, plotRight, entries, width,
}) {
  const [active, setActive] = useState(null);

  if (!xs.length) return null;
  const bandW = xs.length > 1
    ? (plotRight - plotLeft) / (xs.length - 1)
    : plotRight - plotLeft;

  const entry = active === null ? null : entries[active];
  const rows = entry?.rows || [];

  // Tooltip geometry. Sized from the longest line rather than measured, since there is no text
  // metrics API available while rendering SVG on the server or on first paint.
  const lineH = 15;
  const boxH = 20 + rows.length * lineH;
  const longest = Math.max(
    (entry?.label || '').length,
    ...rows.map((r) => r.name.length + r.text.length + 3)
  );
  const boxW = Math.max(96, longest * 6.1 + 20);
  const anchor = active === null ? 0 : xs[active];
  // Flip to the left of the cursor near the right edge so the box never runs off the chart.
  const boxX = anchor + boxW + 12 > width ? anchor - boxW - 10 : anchor + 10;
  const boxY = Math.max(2, plotTop - 4);

  return (
    <g>
      {xs.map((cx, i) => (
        <rect
          key={`band-${i}`}
          x={cx - bandW / 2}
          y={plotTop}
          width={bandW}
          height={plotBottom - plotTop}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onMouseEnter={() => setActive(i)}
          onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
        />
      ))}

      {active !== null && (
        <g pointerEvents="none">
          <line
            x1={anchor} y1={plotTop} x2={anchor} y2={plotBottom}
            stroke="#9aa5b5" strokeWidth="1" strokeDasharray="3 3"
          />
          {rows.map((r, i) => (
            r.y === null || r.y === undefined ? null : (
              <circle key={`hi-${i}`} cx={anchor} cy={r.y} r="4.5"
                fill={r.color} stroke="#fff" strokeWidth="1.5" />
            )
          ))}
          <rect
            x={boxX} y={boxY} width={boxW} height={boxH} rx="5"
            fill="#ffffff" stroke="#c7cedb" strokeWidth="1" opacity="0.97"
          />
          <text x={boxX + 10} y={boxY + 15} fontSize="11" fontWeight="600" fill="#0f2a4a">
            {entry.label}
          </text>
          {rows.map((r, i) => (
            <g key={`row-${i}`}>
              <rect
                x={boxX + 10} y={boxY + 22 + i * lineH} width="8" height="8" rx="1.5"
                fill={r.color}
              />
              <text x={boxX + 23} y={boxY + 30 + i * lineH} fontSize="11" fill="#3c4757">
                {r.name}
              </text>
              <text
                x={boxX + boxW - 10} y={boxY + 30 + i * lineH}
                fontSize="11" fill="#0f2a4a" fontWeight="600" textAnchor="end"
              >
                {r.text}
              </text>
            </g>
          ))}
        </g>
      )}
    </g>
  );
}
