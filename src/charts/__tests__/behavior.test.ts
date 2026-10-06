import { describe, expect, it } from "vitest";
import { BEHAVIOR_RULES } from "../behavior";
import { BUILT_IN_SCENARIOS, decodeScenarioFromUrl, encodeScenarioForUrl, parseScenario, scenarioInput } from "../scenarios";
import { buildChartModel } from "../build";

describe("behavior rules", () => {
  for (const rule of BEHAVIOR_RULES) {
    it(`${rule.id}: ${rule.expected}`, () => {
      const r = rule.verify();
      expect(r.detail).toBeTypeOf("string");
      expect(r.pass, r.detail).toBe(true);
    });
  }
});

describe("scenarios", () => {
  it("have unique ids", () => {
    const ids = BUILT_IN_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every built-in scenario derives without throwing", () => {
    for (const s of BUILT_IN_SCENARIOS) {
      expect(() => buildChartModel(scenarioInput(s).input), s.id).not.toThrow();
    }
  });

  it("round-trips through URL and JSON", () => {
    const s = BUILT_IN_SCENARIOS.find((x) => x.id === "line-chart:series-5")!;
    const url = encodeScenarioForUrl(s);
    expect(url.ok && url.value).toBe("id:line-chart:series-5");
    const modified = { ...s, width: 333, config: { ...s.config, "Line::Show data points": true } };
    const enc = encodeScenarioForUrl(modified);
    expect(enc.ok).toBe(true);
    const dec = enc.ok ? decodeScenarioFromUrl(enc.value) : null;
    expect(dec?.ok && dec.scenario.width).toBe(333);
    expect(dec?.ok && dec.scenario.config["Line::Show data points"]).toBe(true);
    const json = parseScenario(JSON.parse(JSON.stringify(modified)));
    expect(json.ok && json.scenario.config).toEqual(modified.config);
  });

  it("refuses URLs for custom data and rejects malformed JSON", () => {
    const s = { ...BUILT_IN_SCENARIOS[0], dataset: { id: "x", name: "x", columns: [], rows: [] } };
    expect(encodeScenarioForUrl(s).ok).toBe(false);
    expect(parseScenario({ version: 1, visualId: "nope" }).ok).toBe(false);
    expect(parseScenario({ version: 99, visualId: "line-chart" }).ok).toBe(false);
    expect(parseScenario({ version: 1, visualId: "line-chart", config: { bad: 1 } }).ok).toBe(false);
  });
});
