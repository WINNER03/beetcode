// Helpers for showing test inputs/outputs the LeetCode way: `nums = [2,7,11,15], target = 9`

export function compact(jsonText: string | null | undefined): string {
  if (jsonText == null) return "";
  try {
    return JSON.stringify(JSON.parse(jsonText));
  } catch {
    return jsonText.trim();
  }
}

export function formatArgs(inputJson: string, params: string[]): string[] {
  try {
    const args = JSON.parse(inputJson) as unknown[];
    return args.map((a, i) => `${params[i] ?? `arg${i + 1}`} = ${JSON.stringify(a)}`);
  } catch {
    return [inputJson];
  }
}
