import {
  buildCheatsheetSvg,
  escapeXml,
  truncateLabel,
} from "../cheatsheetSvg";

describe("cheatsheetSvg", () => {
  const layers = [
    {
      name: "Base",
      keys: [
        { x: 0, y: 0, width: 1, height: 1, label: "Q" },
        { x: 1, y: 0, width: 1, height: 1, label: "<&>" },
      ],
    },
  ];

  it("renders an svg with title, layer name and labels", () => {
    const svg = buildCheatsheetSvg(layers, { title: "jisaku_1" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("jisaku_1");
    expect(svg).toContain("Base");
    expect(svg).toContain(">Q<");
    expect(svg).toContain("&lt;&amp;&gt;");
  });

  it("renders one block per layer", () => {
    const svg = buildCheatsheetSvg([
      { name: "L0", keys: [] },
      { name: "L1", keys: [] },
    ]);
    expect(svg).toContain("L0");
    expect(svg).toContain("L1");
  });

  it("escapes xml entities", () => {
    expect(escapeXml('<a "b" & c>')).toBe("&lt;a &quot;b&quot; &amp; c&gt;");
  });

  it("truncates long labels", () => {
    expect(truncateLabel("ABCDEFGHIJ", 8)).toBe("ABCDEFG…");
    expect(truncateLabel("SHORT", 8)).toBe("SHORT");
  });
});
