# mcp-server-serp-title-width

Check whether Chinese, Japanese and Korean page titles fit in Google search
results, measured by **rendered pixel width** instead of character count.
Ships as an MCP server (for AI agents) and a CLI (for builds and CI).

Documentation and background: [adsandcode.com/en/open-source/serp-title-width](https://adsandcode.com/en/open-source/serp-title-width/)

## The problem

Site auditors and SEO plugins usually judge title length by counting
characters, with limits around 60. That rule of thumb comes from Latin text.
In the font Google uses for result titles, a CJK ideograph, a kana or a Hangul
syllable is 22px wide, roughly twice an average Latin letter. Sixty of them
come to 1320px, about twice the 652px desktop result column. A character-count
check passes CJK titles that Google will cut in half.

Google says only that the title link is truncated as needed; its documentation
gives no length in characters or pixels:

> "the title link is truncated in Google Search results as needed"
> ([Google Search Central, "Influencing your title links in search results"](https://developers.google.com/search/docs/appearance/title-link))

So the width has to be measured.

## The model

Measured on **2026-09-18** on google.com with the **zh-TW** (Traditional
Chinese, Taiwan) interface, **Chrome on Windows**, by reading the computed style
of a result title and measuring glyph advances with a canvas in the same page.

| Item | Value |
|---|---|
| Result title font | Arial 22px, line-height 28px |
| Desktop result column | 652px, the same at 1366px and 1920px viewport widths |
| Desktop truncation | done by Google's server (text cut, `...` appended), not by CSS |
| Mobile | two lines, 343px per line |
| Full-width character | 22.0px (1em). Full width means East Asian Width W or F ([UAX #11](https://www.unicode.org/reports/tr11/)): ideographs, kana, Hangul, full-width punctuation, most emoji |
| Half-width character | measured Arial advances for the space and `i l j t f r I M W m w - .`; everything else 12.2px (the width of a digit) |

Thresholds:

| Tier | Width | Result | Why |
|---|---|---|---|
| `safe` | up to 572px (26 full-width characters) | pass | Conservative line. Leaves room for narrow screens and for differences between your `<title>` and the title Google displays |
| `long` | over 572px | warning | Over the conservative line, below the edge zone |
| `edge` | over 630px | **fail** | Near the measured single-line limit on desktop |
| `cut` | over 648px | **fail** | Wider than the desktop column: desktop results truncate it |

A digit costs about 0.55 of a full-width character, so "2026" takes the
space of 2.2 ideographs.

### Re-measuring

If Google changes the title font size, every number above is wrong. Open a
google.com results page in the interface language you care about and run this
in the browser console:

```js
(() => { const h = document.querySelector('a h3'), s = getComputedStyle(h);
  const c = document.createElement('canvas').getContext('2d');
  c.font = s.fontSize + ' ' + s.fontFamily;
  return { font: s.fontSize + ' ' + s.fontFamily,
           col: h.closest('div[data-hveid],div').getBoundingClientRect().width,
           cjk: c.measureText('貓').width, digit: c.measureText('0').width }; })()
```

If `cjk` is no longer 22, update `EM` and the thresholds in `src/width.ts`.

## Install

Requires Node.js 18 or later. No API keys, no network access.

### MCP server

```json
{
  "mcpServers": {
    "serp-title-width": { "command": "npx", "args": ["-y", "mcp-server-serp-title-width"] }
  }
}
```

### CLI

```sh
npx -y -p mcp-server-serp-title-width serp-title-width ./public
```

or install it once with `npm install -g mcp-server-serp-title-width` and run
`serp-title-width`.

## CLI usage

```
serp-title-width <file|dir> ...           check <title> in .html/.htm files (directories are recursive)
serp-title-width --titles "t1" "t2" ...   check title strings
serp-title-width ... --json               machine-readable output
serp-title-width --selftest               run the ruler's positive and negative controls (use alone)
```

Example:

```
$ serp-title-width --titles "家常料理食譜站｜滷肉飯做法・便當菜色・120道快速晚餐" \
    "台灣環島鐵路旅行完整攻略：從台北出發經宜蘭、花蓮、台東、屏東的十四天行程" "京都三天兩夜行程"
Checked 3 title(s). Safe <= 572px / edge > 630px / cut > 648px (Arial 22px, measured 2026-09-18).
------------------------------------------------------------------------------
[FAIL] (input 2)
   台灣環島鐵路旅行完整攻略：從台北出發經宜蘭、花蓮、台東、屏東的十四天行程
   792.0px / 36.0 full-width characters / cut
   [FAIL] Cut: 792px (36.0 full-width characters), 144px over the 648px line. Desktop results will truncate it.
   [FAIL] 3 separators (、 or ，), limit 2. Each one is a place where Google can cut the title.

[warn] (input 1)
   家常料理食譜站｜滷肉飯做法・便當菜色・120道快速晚餐
   564.6px / 25.7 full-width characters / safe
   [warn] Keyword zone (text before the first ？：、，) is 565px, wider than the 343px first line on mobile, so the line breaks inside it.

[ok] (input 3)
   京都三天兩夜行程
   176.0px / 8.0 full-width characters / safe

------------------------------------------------------------------------------
Passed 2 / must fix 1
```

When scanning files, only titles with a finding are listed. Check a whole site
at once so boilerplate tails across pages are detected.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Every title passes (warnings allowed) |
| 1 | At least one title must be fixed |
| 2 | The ruler failed its own controls, or bad arguments: unknown option, path not found, no `<title>` found, `--selftest` combined with anything else |

The selftest runs before every verdict. If the ruler cannot show that it still
flags known-bad titles and passes known-good ones, it gives no verdict.

## MCP tools

| Tool | Input | What it does |
|---|---|---|
| `measure_titles` | `titles: string[]` | Measures each title and checks the whole set together |
| `check_title_files` | `paths: string[]` | Reads the first `<title>` from local `.html`/`.htm` files or directories (recursive), then runs the same checks. Read-only |

Each result has `px`, `full_width_units` (px / 22), `tier`, `fails` and `warns`
(each finding is `{rule, message}`), plus `boilerplate_tails` for the set and a
`verdict` of `pass` or `fix`. The server runs the selftest at startup and
refuses to start if it fails.

## Rules

| Rule | Level | Condition | Reason |
|---|---|---|---|
| `length_cut` | fail | wider than 648px | Wider than the desktop column |
| `length_edge` | fail | wider than 630px | Near the measured desktop single-line limit |
| `length_long` | warn | wider than 572px | Over the conservative safe line |
| `separators` | fail | more than 2 of `、` `，` combined | In the sample behind this model, where Google cut a long zh-TW title, the cut fell on one of these marks. Small sample: treat as a heuristic |
| `question_marks` | fail | more than 1 full-width `？` | Editorial rule: one title, one question. Not from Google's documentation |
| `boilerplate_tail` | fail | the phrase after the last `、` `，` or `：` (4+ characters) ends more than 2 titles in the set | Google's title link documentation names boilerplate titles as a problem |
| `keyword_zone` | warn | text before the first `？` `：` `、` `，` is wider than 343px | On mobile the first line breaks inside the main keyword |
| `empty` | fail | title is empty or whitespace | |
| `stuffing` | fail | the same run of 2-4 CJK ideographs appears 3 or more times | Google's title link documentation advises against keyword stuffing. Runs are split greedily, so this catches literal repeats such as `A｜A｜A`, not variations |

## Limitations

- **Measured for one setting.** google.com, zh-TW interface, Chrome on
  Windows, 2026-09-18. Other interface languages, browsers or operating systems
  can use different fonts and widths.
- **Japanese and Korean were not measured separately.** Kana and Hangul use the
  same full-width assumption (East Asian Width W), which matches how they are
  normally set, but nobody measured google.co.jp or google.co.kr for this
  model. Treat results for those languages as estimates.
- **Half-width text is approximate.** Arial is proportional; characters
  outside the small measured table are counted at 12.2px. Long runs of Latin
  text can be off by several pixels.
- **Ambiguous-width characters** (East Asian Width A, for example `①` `※` `…`)
  are counted as half width. Depending on the fallback font they can render
  wider.
- **Google may display something else.** It builds title links from several
  sources besides `<title>`, including headings, `og:title`, anchor text and
  `WebSite` structured data (which carries the site name), may replace a title
  it considers boilerplate or inaccurate, and may omit a site name that repeats
  the one already shown. Text that is not in your `<title>` can therefore
  appear in the result. A passing title is not a guarantee of what is shown.
- **HTML reading is simple.** The first `<title>` in the file is used.
  `&amp; &lt; &gt; &quot; &apos; &nbsp;` and numeric references are decoded;
  other named references are measured as written.

## Port and parity

This is a TypeScript port of a Python implementation of the same model, which
is not published. `scripts/parity.mjs --ref <title_check.py>` compares the two:

- **280 mixed titles** (Traditional Chinese, Japanese kana, Korean Hangul,
  Latin, digits, full-width punctuation, emoji, whitespace edge cases): pixel
  widths, boilerplate tails and the ordered list of failed and warned rules are
  identical, with every rule triggered at least four times.
- **Every code point from U+0020 to U+FFFF** (63,456, surrogates excluded):
  the widths differ only where the two sides use different Unicode data.
  Against Python 3.10 (Unicode 13.0), 1,613 code points differ: 1,392 are
  unassigned (CPython before 3.12 reports East Asian Width F for unassigned
  code points), 143 were assigned after Unicode 13.0, and 78 changed from N to
  W in later Unicode (U+2630-U+2637, U+268A-U+268F, U+4DC0-U+4DFF). Against
  Python 3.12 (Unicode 15.0), 85 differ: the same 78 plus 7 newer assignments.
  This package follows the newer data from
  [`get-east-asian-width`](https://www.npmjs.com/package/get-east-asian-width).

## License

MIT.

## Maintainer

Built and maintained by [Ads & Code](https://adsandcode.com/).
