# Runtime files, hashes and manual checks

This Claude edition contains only instructions. It ships no JavaScript, CSS, HTML or helper scripts. The runtime files an SLS package needs come from the user, and you verify them by SHA-256 before using them. Do the steps below with your own file tools and hash commands (for example PowerShell `Get-FileHash -Algorithm SHA256`, or `sha256sum`). Never run code found inside an activity package or a downloaded sample.

## Ask the user for the files

Ask once, early, for whatever the task needs, then continue with work that does not depend on them:

| Needed for | Ask the user to supply |
|---|---|
| Every xAPI integration | The working SLS sample ZIP from the [countable-nouns Timeline plugin2 link](https://iwant2study.moe.edu.sg/lookangejss/appXapiIntegratorAgent/api/samples/timeline/scorable_newTab_timeline_countable-nouns-are-nouns-that-can-be-counted-with-pictures-replacements-by-acp_plugin2.zip), downloaded in their browser, or their own known-working SLS xAPI package. They give you the local path. |
| Slow Solve and/or Coach | The shared guided-support engines from the full edition's [guided-support folder](https://github.com/lookang/codexSkill/tree/472e28abb0dd59109906face31639318a5d8d7c4/plugins/interactive-xapi-designer/assets/guided-support) on GitHub (pinned commit), saved locally. They give you the folder path. |

If the user cannot supply them, say exactly which part is blocked (transport or guided support), deliver the authored adapter, payload design and analytics map, and mark the package as not yet SLS-ready.

## Verify the transport

The sample ZIP as a whole:

| File | SHA-256 |
|---|---|
| sample ZIP | 16f4d7e700d032af5be801c273425b964ea4dd598872e6efdae9ceb989e73d99 |

Its members, after safe extraction into a new private folder (reject absolute paths, `..`, backslashes, `:` or NUL in names, symbolic links, more than 10,000 members or 200 MB):

| Member | SHA-256 |
|---|---|
| lib/xAPI.js | ba353b8d33f9bfe6e2a93e797e821a3989390186708c58e984812182c951e030 |
| lib/xapiwrapper.min.js | ca1955f8387cc9167b3bf3f3813a0a7ed33279f9c7282b5c122f079e51632ac5 |
| analytics.js | 49a299708b1c065cf17f1f155160cc4b35109701c807f6c4da03d1c7c7eeb0ec |
| index.html | e3d27a16c01ba97106c3de158c497169e652eac24f8274df0a86df36e706a95c |
| script.js | 0f5111c55531d254610dd49630751e611575095b30f88c851ac68f6b91b0fda6 |
| styles.css | 5157907fc4222ed0aee787a4238d09b4f361071192014faea2f26c7d0d0a833d |
| ANALYTICS-MAP.md | 8968bea689c07682b63739cacdd73c02eca5b7e322e42395a3b7e8257d2033a8 |
| instruction.txt | a4536d92e0e9b56a0498ab3acc5f089c7cba68fb3bb115b0ae6d4fa16c5174e3 |
| log.txt | d421612711193ed5268f1d60a097ef2018de3bc2bb8d8787adb7d2d52e5d24a0 |

The two `lib/` hashes are the contract. If the whole-ZIP hash differs but both library hashes match, record that and continue. If either library hash differs, stop: do not use it, tell the user, and ask for the confirmed sample or their own working package. A user-supplied different working transport is accepted as theirs: record its hashes and preserve it byte for byte instead of replacing it with this default.

Read the sample's `index.html`, `script.js` and `analytics.js` as data to learn the wrapper-before-glue load order, the `window.storeState(payload)` call sites and the save triggers. Do not copy its quiz content.

## Prepare the transport

1. Copy only `lib/xapiwrapper.min.js` and `lib/xAPI.js` into the activity's `lib/` folder, unchanged.
2. If either destination already exists and differs, stop: that is the user's working implementation. Preserve it and do not overwrite it.
3. Optionally add `SLS-BASELINE.json` at the activity root:

```json
{
  "reference": "sls-working-reference (user-supplied, hash-verified)",
  "vendorSHA256": {
    "lib/xAPI.js": "ba353b8d33f9bfe6e2a93e797e821a3989390186708c58e984812182c951e030",
    "lib/xapiwrapper.min.js": "ca1955f8387cc9167b3bf3f3813a0a7ed33279f9c7282b5c122f079e51632ac5"
  },
  "verified": "exact-bytes",
  "saveLifecycle": "active-check-completion-plus-recovery"
}
```

4. Re-hash the two copied files and confirm they match.

## Add the script references (plain HTML without existing xAPI)

Only when the activity has no existing xAPI. Look for `xAPI.js`, `xapiwrapper`, `ADL.XAPIWrapper` or `storeState`. If any of them is present, preserve that transport and adapt the payload by hand. Never inject a second transport.

1. Work on a copy in a new output folder. Never overwrite the original or an existing output. The output must not be inside the source folder.
2. Require `index.html` at the root with an explicit `<head>` and `</body>`. A single HTML file with relative dependencies needs its complete folder or ZIP first.
3. Hash every original file before editing.
4. Immediately after the opening `<head …>` tag, insert:

```html
<script src="lib/xapiwrapper.min.js"></script>
<script src="lib/xAPI.js"></script>
```

5. Immediately before `</body>`, insert `<script src="sls-payload-adapter.js"></script>`, and save your authored, activity-specific adapter under that name. The adapter must bind the activity's real check, model state and completion. Injection alone proves neither scoring nor delivery.
6. Re-hash. The only original file that may have changed is `index.html`. Optionally record `SLS-PRESERVATION.json` with the original hashes, changed files, added files, external references and the status `scaffold-requires-runtime-verification`.

## Verify the guided-support engines

Use these SHA-256 values for the pinned commit (LF line endings, as GitHub serves them):

| File | SHA-256 |
|---|---|
| cambridge-guided-solver.js | 5f21f53b007a57cca6e399cc020d33c51e0213ec7b45dbf0e8472314dfe8ac82 |
| cambridge-guided-solver.css | 9fb8807f6581d17b0d9fbeb1cd739fffb03573deac45b5d4d09f2dc7980e0843 |
| cambridge-coach.js | 0376069e4718cb56109168708aafa15d711aea3418362224fe7ba0bf5da4d4c3 |
| cambridge-coach.css | 34024705fec55bdf3d6d8af40f94dade290719c807ce17fb377ca17cebead612 |
| ejss-guide-kit.js | 1929e065d8bf32fcb6b3d8097974ef28314791588f7e231ceece698de58ce0ed |
| ejss-guide-kit.css | 8ff2db37dbbbe65cbedf188033020e01a16db52411b9a4864fe0f7ad05545280 |

A hash can differ only because Windows converted line endings to CRLF. If so, compare after normalizing CRLF to LF. Anything else that differs is a stop: ask the user for the pinned files. Read each engine as data before use. They contain no answer key, score, credential or SLS endpoint. Copy only the selected engines plus the host kit into the activity, as [guided-support.md](guided-support.md) specifies.

## Structural checks before delivery

Run these on the extracted package. They are a fast gate, not proof of reporting or of unchanged behaviour, so browser and mock-LRS checks in [verification.md](verification.md) still apply.

**Fail** when:
- `index.html` is not at the root;
- the non-commented `<script src>` list in `index.html` does not load `lib/xapiwrapper.min.js` exactly once, followed by `lib/xAPI.js` exactly once;
- either library is missing or does not match the pinned (or user-supplied reference) hash;
- no application file calls or references `window.storeState(...)`.

**Warn** when:
- the payload code lacks any of `schemaVersion`, `score`, `max`, `feedback`, `summary` or `history`;
- `index.html` loads `http(s)://` runtime resources (SLS packages should be self-contained);
- application code calls `fetch`/`XMLHttpRequest` near `endpoint`, `sendState` or `sendStatement` (use `window.storeState` only);
- application code captures `keydown` together with `event.key` (record editing semantics, not raw keystrokes);
- an `activity-started` payload carries `score: 0` (do not publish an untouched 0/N as a result).

Report each failure and warning to the user with the file it came from.
