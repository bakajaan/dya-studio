import {
  forecastBattery,
  formatHours,
  linearRegression,
  splitDischargeSegments,
  summarizeDailyDrain,
} from "../batteryForecast";

const HOUR = 3600;
const BASE = Math.floor(new Date("2026-07-27T00:00:00Z").getTime() / 1000);

function ramp(
  startLevel: number,
  dropPerHour: number,
  hours: number,
  startAt: number = BASE,
) {
  const points = [];
  for (let index = 0; index <= hours; index += 1) {
    points.push({
      timestamp: startAt + index * HOUR,
      batteryLevel: startLevel - dropPerHour * index,
    });
  }
  return points;
}

describe("batteryForecast", () => {
  it("fits a straight discharge line", () => {
    const regression = linearRegression(ramp(100, 5, 10));
    expect(regression).not.toBeNull();
    expect(regression?.slopePerHour).toBeCloseTo(-5, 6);
    expect(regression?.rSquared).toBeCloseTo(1, 6);
  });

  it("splits segments at charge events", () => {
    const points = [
      // 0〜4時間: 60% から 5%/時 で放電
      ...ramp(60, 5, 4),
      // 5時間目に 95% へ充電。以降 9時間目まで 5%/時 で放電
      ...ramp(95, 5, 4, BASE + 5 * HOUR),
    ];
    const segments = splitDischargeSegments(points);
    expect(segments).toHaveLength(2);
    expect(segments[0].startLevel).toBe(60);
    expect(segments[0].endLevel).toBe(40);
    expect(segments[0].ratePerHour).toBeCloseTo(5, 6);
    expect(segments[1].startLevel).toBe(95);
    expect(segments[1].endLevel).toBe(75);
    expect(segments[1].ratePerHour).toBeCloseTo(5, 6);
  });

  it("predicts remaining time from the latest segment", () => {
    const points = ramp(100, 4, 10);
    const now = BASE + 10 * HOUR;
    const forecast = forecastBattery(points, {
      nowSeconds: now,
      thresholdPercent: 20,
    });
    expect(forecast.reason).toBe("ok");
    expect(forecast.currentLevel).toBe(60);
    expect(forecast.ratePerHour).toBeCloseTo(4, 6);
    expect(forecast.hoursToEmpty).toBeCloseTo(15, 6);
    expect(forecast.hoursToThreshold).toBeCloseTo(10, 6);
    expect(forecast.emptyAt).toBe(now + 15 * HOUR);
  });

  it("reports charging instead of a bogus prediction", () => {
    const points = [
      { timestamp: BASE, batteryLevel: 40 },
      { timestamp: BASE + HOUR, batteryLevel: 41 },
      { timestamp: BASE + 2 * HOUR, batteryLevel: 41.5 },
    ];
    const forecast = forecastBattery(points);
    expect(forecast.ratePerHour).toBeNull();
    expect(forecast.reason).toBe("charging");
  });

  it("needs at least two points", () => {
    expect(forecastBattery([]).reason).toBe("not-enough-data");
    expect(
      forecastBattery([{ timestamp: BASE, batteryLevel: 50 }]).reason,
    ).toBe("not-enough-data");
  });

  it("summarizes drain per day", () => {
    const daily = summarizeDailyDrain(ramp(100, 2, 30));
    expect(daily.length).toBeGreaterThanOrEqual(2);
    const total = daily.reduce((sum, entry) => sum + entry.drop, 0);
    expect(total).toBeCloseTo(60, 6);
  });

  it("formats hours for display", () => {
    expect(formatHours(null)).toBe("—");
    expect(formatHours(0.5)).toBe("30分");
    expect(formatHours(3)).toBe("3時間");
    expect(formatHours(30)).toBe("1日6時間");
  });
});
