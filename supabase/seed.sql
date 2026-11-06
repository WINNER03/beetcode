-- Beetcode seed: first 5 of the 100 curated problems.
-- I/O model: programs read from stdin and print to stdout.

insert into public.problems (slug, title, difficulty, description, starter_code, tags, order_index) values
('two-sum', 'Two Sum', 'easy',
$md$Given an array of integers `nums` and an integer `target`, print the indices of the two numbers that add up to `target`.

**Input:** line 1 = space-separated `nums`, line 2 = `target`
**Output:** the two indices, space-separated, smaller first.

Exactly one solution exists.

**Example**
```
2 7 11 15
9
```
Output: `0 1`$md$,
$json${
  "python": "import sys\n\ndef two_sum(nums, target):\n    # your code here\n    pass\n\nlines = sys.stdin.read().split('\\n')\nnums = list(map(int, lines[0].split()))\ntarget = int(lines[1])\nprint(*two_sum(nums, target))\n",
  "javascript": "const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\nconst nums = lines[0].split(' ').map(Number);\nconst target = Number(lines[1]);\n\nfunction twoSum(nums, target) {\n  // your code here\n}\n\nconsole.log(twoSum(nums, target).join(' '));\n"
}$json$, '{array,hash-map}', 1),

('valid-parentheses', 'Valid Parentheses', 'easy',
$md$Given a string containing only `()[]{}`, print `true` if the brackets are balanced and correctly nested, otherwise `false`.

**Example**
```
()[]{}
```
Output: `true`$md$,
$json${
  "python": "import sys\n\ndef is_valid(s):\n    # your code here\n    pass\n\ns = sys.stdin.read().strip()\nprint(str(is_valid(s)).lower())\n",
  "javascript": "const s = require('fs').readFileSync(0, 'utf8').trim();\n\nfunction isValid(s) {\n  // your code here\n}\n\nconsole.log(String(isValid(s)));\n"
}$json$, '{stack,string}', 2),

('fizzbuzz', 'FizzBuzz', 'easy',
$md$Given `n`, print numbers 1..n one per line, but print `Fizz` for multiples of 3, `Buzz` for multiples of 5 and `FizzBuzz` for multiples of both.

**Example**
```
5
```
Output:
```
1
2
Fizz
4
Buzz
```$md$,
$json${
  "python": "n = int(input())\n# your code here\n",
  "javascript": "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\n// your code here\n"
}$json$, '{math}', 3),

('reverse-words', 'Reverse Words', 'easy',
$md$Given a sentence, print its words in reverse order separated by single spaces.

**Example**
```
the sky is blue
```
Output: `blue is sky the`$md$,
$json${
  "python": "s = input()\n# your code here\n",
  "javascript": "const s = require('fs').readFileSync(0, 'utf8').trim();\n// your code here\n"
}$json$, '{string,two-pointers}', 4),

('maximum-subarray', 'Maximum Subarray', 'medium',
$md$Given an array of integers, print the largest sum of any contiguous non-empty subarray.

**Example**
```
-2 1 -3 4 -1 2 1 -5 4
```
Output: `6` (subarray `4 -1 2 1`)$md$,
$json${
  "python": "nums = list(map(int, input().split()))\n# your code here\n",
  "javascript": "const nums = require('fs').readFileSync(0, 'utf8').trim().split(' ').map(Number);\n// your code here\n"
}$json$, '{array,dynamic-programming}', 5);

-- Test cases (first one per problem is a visible sample)
insert into public.test_cases (problem_id, input, expected_output, is_hidden, order_index)
select p.id, t.input, t.expected, t.hidden, t.ord
from public.problems p
join (values
  ('two-sum', E'2 7 11 15\n9', '0 1', false, 1),
  ('two-sum', E'3 2 4\n6', '1 2', true, 2),
  ('two-sum', E'3 3\n6', '0 1', true, 3),
  ('two-sum', E'-1 -2 -3 -4 -5\n-8', '2 4', true, 4),

  ('valid-parentheses', '()[]{}', 'true', false, 1),
  ('valid-parentheses', '(]', 'false', true, 2),
  ('valid-parentheses', '([{}])', 'true', true, 3),
  ('valid-parentheses', '((', 'false', true, 4),

  ('fizzbuzz', '5', E'1\n2\nFizz\n4\nBuzz', false, 1),
  ('fizzbuzz', '15', E'1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz', true, 2),
  ('fizzbuzz', '1', '1', true, 3),

  ('reverse-words', 'the sky is blue', 'blue is sky the', false, 1),
  ('reverse-words', 'hello', 'hello', true, 2),
  ('reverse-words', 'a good   example', 'example good a', true, 3),

  ('maximum-subarray', '-2 1 -3 4 -1 2 1 -5 4', '6', false, 1),
  ('maximum-subarray', '1', '1', true, 2),
  ('maximum-subarray', '-3 -1 -2', '-1', true, 3),
  ('maximum-subarray', '5 4 -1 7 8', '23', true, 4)
) as t(slug, input, expected, hidden, ord) on t.slug = p.slug;
