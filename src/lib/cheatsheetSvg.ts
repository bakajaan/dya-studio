/**
 * Keymap cheat sheet SVG generator (printable layout reference, Oryx-style).
 * Pure string generation so it is unit-testable; the page feeds it key
 * geometry (in key units) and display labels per layer.
 */

export interface CheatsheetKey {
  /** Position/size in key units (1u = one key). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees around (rx, ry), optional. */
  r?: number;
  rx?: number;
  ry?: number;
  label: string;
}

export interface CheatsheetLayer {
  name: string;
  keys: CheatsheetKey[];
}

export interface CheatsheetOptions {
  title?: string;
  /** Pixels per key unit. Default 64. */
  unitSize?: number;
  /** Max label characters before truncation. Default 8. */
  maxLabelLength?: number;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function truncateLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function buildCheatsheetSvg(
  layers: CheatsheetLayer[],
  options: CheatsheetOptions = {},
): string {
  const unit = options.unitSize ?? 64;
  const maxLabelLength = options.maxLabelLength ?? 8;
  const padding = unit * 0.5;
  const headerHeight = unit * 0.75;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layer of layers) {
    for (const key of layer.keys) {
      minX = Math.min(minX, key.x);
      minY = Math.min(minY, key.y);
      maxX = Math.max(maxX, key.x + key.width);
      maxY = Math.max(maxY, key.y + key.height);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }

  const boardWidth = (maxX - minX) * unit;
  const boardHeight = (maxY - minY) * unit;
  const blockHeight = headerHeight + boardHeight + padding;
  const titleBlock = options.title ? headerHeight : 0;
  const totalWidth = boardWidth + padding * 2;
  const totalHeight = titleBlock + blockHeight * layers.length + padding;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(totalWidth)}" height="${Math.ceil(totalHeight)}" viewBox="0 0 ${Math.ceil(totalWidth)} ${Math.ceil(totalHeight)}" font-family="sans-serif">`,
  );
  parts.push(`<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>`);

  let cursorY = padding * 0.5;
  if (options.title) {
    parts.push(
      `<text x="${padding}" y="${cursorY + headerHeight * 0.6}" font-size="${unit * 0.32}" font-weight="bold" fill="#111111">${escapeXml(options.title)}</text>`,
    );
    cursorY += titleBlock;
  }

  for (const layer of layers) {
    parts.push(
      `<text x="${padding}" y="${cursorY + headerHeight * 0.6}" font-size="${unit * 0.26}" font-weight="bold" fill="#333333">${escapeXml(layer.name)}</text>`,
    );
    const originY = cursorY + headerHeight;
    for (const key of layer.keys) {
      const px = padding + (key.x - minX) * unit;
      const py = originY + (key.y - minY) * unit;
      const w = key.width * unit;
      const h = key.height * unit;
      const rotation =
        key.r && key.r !== 0
          ? ` transform="rotate(${key.r} ${padding + ((key.rx ?? key.x) - minX) * unit} ${originY + ((key.ry ?? key.y) - minY) * unit})"`
          : "";
      const label = escapeXml(truncateLabel(key.label, maxLabelLength));
      parts.push(`<g${rotation}>`);
      parts.push(
        `<rect x="${px + 2}" y="${py + 2}" width="${w - 4}" height="${h - 4}" rx="6" fill="#f4f4f5" stroke="#52525b" stroke-width="1"/>`,
      );
      parts.push(
        `<text x="${px + w / 2}" y="${py + h / 2}" font-size="${unit * 0.2}" fill="#111111" text-anchor="middle" dominant-baseline="central">${label}</text>`,
      );
      parts.push(`</g>`);
    }
    cursorY += blockHeight;
  }

  parts.push("</svg>");
  return parts.join("");
}
