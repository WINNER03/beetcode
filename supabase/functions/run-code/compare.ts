// Output comparison for Beetcode. Pure TypeScript (works in Deno and Node).
// Every program prints one JSON value; we compare it to the expected JSON.

export type CompareMode =
  | "exact"              // deep equal (floats within 1e-5)
  | "unordered"          // top-level list in any order
  | "unordered_nested"   // top-level list and each inner list in any order
  | "topo"               // any valid course order (input: [n, prerequisites])
  | "alien"              // any valid alien alphabet order (input: [words])
  | "palindrome_substring" // any longest palindromic substring (input: [s])
  | "min_remove_parens";   // any valid string with minimum removals (input: [s])

function parse(text: string): { ok: boolean; value?: unknown } {
  try {
    return { ok: true, value: JSON.parse(text.trim()) };
  } catch {
    return { ok: false };
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isInteger(a) && Number.isInteger(b)) return a === b;
    return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length &&
      ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

function order(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function sortedCopy(v: unknown, nested: boolean): unknown {
  if (!Array.isArray(v)) return v;
  const items = nested ? v.map((x) => (Array.isArray(x) ? [...x].sort(order) : x)) : [...v];
  return items.sort(order);
}

function isPalindrome(s: string): boolean {
  for (let i = 0, j = s.length - 1; i < j; i++, j--) if (s[i] !== s[j]) return false;
  return true;
}

function isSubsequence(t: string, s: string): boolean {
  let i = 0;
  for (const ch of s) if (i < t.length && t[i] === ch) i++;
  return i === t.length;
}

function balanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

export function check(mode: CompareMode | string, inputJson: string, expectedJson: string, stdout: string | null): boolean {
  const actual = parse(stdout ?? "");
  const expected = parse(expectedJson);
  if (!actual.ok || !expected.ok) return (stdout ?? "").trim() === expectedJson.trim();
  const got = actual.value, want = expected.value;
  const input = parse(inputJson).value as unknown[];

  switch (mode) {
    case "unordered":
      return deepEqual(sortedCopy(got, false), sortedCopy(want, false));
    case "unordered_nested":
      return deepEqual(sortedCopy(got, true), sortedCopy(want, true));

    case "topo": {
      const [n, prereqs] = input as [number, number[][]];
      if (!Array.isArray(got)) return false;
      if (Array.isArray(want) && want.length === 0) return got.length === 0;
      if (got.length !== n) return false;
      const pos = new Map<number, number>();
      got.forEach((c, i) => pos.set(c as number, i));
      if (pos.size !== n || [...pos.keys()].some((c) => !(c >= 0 && c < n))) return false;
      return prereqs.every(([a, b]) => pos.get(b)! < pos.get(a)!);
    }

    case "alien": {
      const [words] = input as [string[]];
      if (typeof got !== "string") return false;
      if (want === "") return got === "";
      const letters = new Set(words.join(""));
      if (got.length !== letters.size || new Set(got).size !== got.length) return false;
      if ([...got].some((c) => !letters.has(c))) return false;
      const rank = new Map([...got].map((c, i) => [c, i] as [string, number]));
      for (let i = 0; i + 1 < words.length; i++) {
        const a = words[i], b = words[i + 1];
        for (let j = 0; j < Math.min(a.length, b.length); j++) {
          if (a[j] !== b[j]) {
            if (rank.get(a[j])! > rank.get(b[j])!) return false;
            break;
          }
        }
      }
      return true;
    }

    case "palindrome_substring": {
      const [s] = input as [string];
      return typeof got === "string" && typeof want === "string" &&
        got.length === want.length && isPalindrome(got) && s.includes(got);
    }

    case "min_remove_parens": {
      const [s] = input as [string];
      return typeof got === "string" && typeof want === "string" &&
        got.length === want.length && balanced(got) && isSubsequence(got, s);
    }

    default:
      return deepEqual(got, want);
  }
}
