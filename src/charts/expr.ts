/**
 * Flag expressions: a small, side-effect-free language evaluated against the
 * asset context record. No `eval`; unknown names are reported, never guessed.
 *
 *   value > 90 && status != "Watch"
 *   abs(change) / max(previous, 1) * 100 >= 5
 *   {Completion rate (%)} >= target
 *
 * Literals: numbers, "double" or 'single' quoted strings, true, false, null.
 * Names: identifiers (letters, digits, _ and .) or any text in {braces}.
 * Operators by precedence: ! unary-; * / %; + -; < <= > >=; == !=; &&; ||.
 * Functions: abs, min, max, round, floor, ceil, len, lower, upper.
 */

export type ExprValue = number | string | boolean | null;
export type ExprResult = { ok: true; value: ExprValue; names: string[] } | { ok: false; error: string; missing?: string[] };

type Tok = { t: "num"; v: number } | { t: "str"; v: string } | { t: "name"; v: string } | { t: "op"; v: string } | { t: "end" };

const OPS = ["&&", "||", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "!", "(", ")", ","];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new Error(`Unexpected “${c}” at ${i + 1}`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        s += src[j++];
      }
      if (src[j] !== c) throw new Error("Unclosed string");
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (c === "{") {
      const j = src.indexOf("}", i);
      if (j < 0) throw new Error("Unclosed {name}");
      out.push({ t: "name", v: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w.]*/.exec(src.slice(i))!;
      out.push({ t: "name", v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`Unexpected “${c}” at ${i + 1}`);
    out.push({ t: "op", v: op });
    i += op.length;
  }
  out.push({ t: "end" });
  return out;
}

type Node =
  | { k: "lit"; v: ExprValue }
  | { k: "name"; v: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const LEVELS = [["||"], ["&&"], ["==", "!="], ["<", "<=", ">", ">="], ["+", "-"], ["*", "/", "%"]];
const FNS: Record<string, (...a: ExprValue[]) => ExprValue> = {
  abs: (x) => Math.abs(num(x)),
  min: (...xs) => Math.min(...xs.map(num)),
  max: (...xs) => Math.max(...xs.map(num)),
  round: (x, d = 0) => {
    const f = Math.pow(10, num(d));
    return Math.round(num(x) * f) / f;
  },
  floor: (x) => Math.floor(num(x)),
  ceil: (x) => Math.ceil(num(x)),
  len: (x) => String(x ?? "").length,
  lower: (x) => String(x ?? "").toLowerCase(),
  upper: (x) => String(x ?? "").toUpperCase(),
};

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek().t === "op" && (peek() as { v: string }).v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected “${v}”`);
    p++;
  };
  const level = (n: number): Node => {
    if (n >= LEVELS.length) return unary();
    let a = level(n + 1);
    while (peek().t === "op" && LEVELS[n].includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v;
      a = { k: "bin", op, a, b: level(n + 1) };
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp("!") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      return { k: "un", op, a: unary() };
    }
    return primary();
  };
  const primary = (): Node => {
    const t = toks[p++];
    if (t.t === "num" || t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "name") {
      if (isOp("(")) {
        const fn = t.v.toLowerCase();
        if (!FNS[fn]) throw new Error(`Unknown function ${t.v}()`);
        p++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(level(0));
          while (isOp(",")) {
            p++;
            args.push(level(0));
          }
        }
        expect(")");
        return { k: "call", fn, args };
      }
      if (t.v === "true" || t.v === "false") return { k: "lit", v: t.v === "true" };
      if (t.v === "null") return { k: "lit", v: null };
      return { k: "name", v: t.v };
    }
    if (t.t === "op" && t.v === "(") {
      const e = level(0);
      expect(")");
      return e;
    }
    throw new Error(t.t === "end" ? "Expression ends early" : `Unexpected “${(t as { v: unknown }).v}”`);
  };
  const tree = level(0);
  if (peek().t !== "end") throw new Error(`Unexpected “${(peek() as { v: unknown }).v}”`);
  return tree;
}

function num(v: ExprValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function truthy(v: ExprValue): boolean {
  return v !== null && v !== false && v !== 0 && v !== "" && !(typeof v === "number" && Number.isNaN(v));
}

function equal(a: ExprValue, b: ExprValue): boolean {
  if (typeof a === "number" || typeof b === "number") {
    const x = num(a);
    const y = num(b);
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x === y;
  }
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
}

function toValue(v: unknown): ExprValue {
  if (v === undefined) return null;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean" || v === null) return v;
  if (v instanceof Date) return v.getTime();
  return String(v);
}

export function evaluateExpression(src: string, context: Record<string, unknown>): ExprResult {
  let tree: Node;
  try {
    tree = parse(src);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const names: string[] = [];
  const missing: string[] = [];
  const lookup = (name: string): ExprValue => {
    names.push(name);
    if (name in context) return toValue(context[name]);
    const key = Object.keys(context).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key) return toValue(context[key]);
    missing.push(name);
    return null;
  };
  const ev = (n: Node): ExprValue => {
    switch (n.k) {
      case "lit":
        return n.v;
      case "name":
        return lookup(n.v);
      case "un":
        return n.op === "!" ? !truthy(ev(n.a)) : -num(ev(n.a));
      case "call":
        return FNS[n.fn](...n.args.map(ev));
      case "bin": {
        if (n.op === "&&") return truthy(ev(n.a)) ? truthy(ev(n.b)) : false;
        if (n.op === "||") return truthy(ev(n.a)) ? true : truthy(ev(n.b));
        const a = ev(n.a);
        const b = ev(n.b);
        switch (n.op) {
          case "==":
            return equal(a, b);
          case "!=":
            return !equal(a, b);
          case "<":
            return num(a) < num(b);
          case "<=":
            return num(a) <= num(b);
          case ">":
            return num(a) > num(b);
          case ">=":
            return num(a) >= num(b);
          case "+":
            return typeof a === "string" || typeof b === "string" ? `${a ?? ""}${b ?? ""}` : num(a) + num(b);
          case "-":
            return num(a) - num(b);
          case "*":
            return num(a) * num(b);
          case "/":
            return num(b) === 0 ? null : num(a) / num(b);
          case "%":
            return num(b) === 0 ? null : num(a) % num(b);
        }
      }
    }
    return null;
  };
  const value = ev(tree);
  if (missing.length) return { ok: false, error: `${[...new Set(missing)].join(", ")} ${missing.length === 1 ? "is" : "are"} not in the asset context`, missing: [...new Set(missing)] };
  return { ok: true, value: typeof value === "number" && Number.isNaN(value) ? null : value, names };
}

/** Replaces {expression} segments in a template, e.g. tooltip text “Up {round(change, 1)}%”. */
export function renderTemplate(template: string, context: Record<string, unknown>): { text: string; error?: string } {
  let error: string | undefined;
  const text = template.replace(/\{([^{}]+)\}/g, (whole, inner: string) => {
    const r = evaluateExpression(inner, context);
    if (!r.ok) {
      const direct = evaluateExpression(`{${inner}}`, context);
      if (direct.ok) return String(direct.value ?? "");
      error ??= r.error;
      return whole;
    }
    return String(r.value ?? "");
  });
  return { text, error };
}
