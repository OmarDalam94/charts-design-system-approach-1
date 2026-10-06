import { coverageForAsset, summarize } from "../src/charts/coverage";
import { CHART_ASSETS } from "../src/charts/assets";

const t0 = performance.now();
for (const a of CHART_ASSETS) {
  const e = coverageForAsset(a.visualId);
  const s = summarize(e);
  console.log(a.visualId, JSON.stringify(s));
  for (const x of e.filter((x) => x.status === "missing" || x.status === "implemented-unverified")) console.log("   ", x.status, x.key, x.nested ?? "", "|", x.evidence[0] ?? x.note);
}
console.log("ms", Math.round(performance.now() - t0));
