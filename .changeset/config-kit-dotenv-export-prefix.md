---
"@arshad-shah/config-kit": patch
---

Fix: `parseDotenv` now accepts the optional `export ` prefix (e.g. `export FOO=bar`). Files that double as shell scripts commonly carry it; previously those lines were silently dropped because `export FOO` isn't a valid key. A genuine variable named `exportFOO` (no whitespace) is left untouched.
