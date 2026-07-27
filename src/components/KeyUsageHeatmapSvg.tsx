import type { PhysicalLayout } from "../hooks/useKeymap";
import { heatColor, heatLevel } from "../lib/keyUsageStats";

const HEAT_UNIT = 48;

/**
 * Shared SVG heatmap renderer for a physical layout, extracted from the
 * (previously duplicated) heatmap markup in InsightsPage and KeyUsagePage.
 * Callers supply the per-position count and the max count to scale against.
 */
export function KeyUsageHeatmapSvg({
  layout,
  getCount,
  maxCount,
  className,
}: {
  layout: PhysicalLayout;
  getCount: (position: number) => number;
  maxCount: number;
  className?: string;
}) {
  if (layout.keys.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of layout.keys) {
    minX = Math.min(minX, key.x / 100);
    minY = Math.min(minY, key.y / 100);
    maxX = Math.max(maxX, key.x / 100 + key.width / 100);
    maxY = Math.max(maxY, key.y / 100 + key.height / 100);
  }
  const width = (maxX - minX) * HEAT_UNIT;
  const height = (maxY - minY) * HEAT_UNIT;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className ?? "w-full max-w-3xl"}
    >
      {layout.keys.map((key, position) => {
        const x = (key.x / 100 - minX) * HEAT_UNIT;
        const y = (key.y / 100 - minY) * HEAT_UNIT;
        const w = (key.width / 100) * HEAT_UNIT;
        const h = (key.height / 100) * HEAT_UNIT;
        const count = getCount(position);
        const rotation = key.r
          ? `rotate(${key.r / 100} ${(key.rx / 100 - minX) * HEAT_UNIT} ${(key.ry / 100 - minY) * HEAT_UNIT})`
          : undefined;
        return (
          <g key={position} transform={rotation}>
            <rect
              x={x + 1.5}
              y={y + 1.5}
              width={w - 3}
              height={h - 3}
              rx={5}
              fill={heatColor(heatLevel(count, maxCount))}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            {count > 0 && (
              <text
                x={x + w / 2}
                y={y + h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={HEAT_UNIT * 0.26}
                fill="var(--color-text)"
              >
                {count}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
