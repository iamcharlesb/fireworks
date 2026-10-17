---
name: safe-zip-analysis
description: Safely inspect ZIP archives when the user wants files extracted and analyzed without running payloads. Use for .zip uploads, archive inventory, source bundle review, or malware-adjacent triage where extracted executables must not be launched.
---

# Safe ZIP Analysis

Use this skill when the user provides a `.zip` file and wants its contents extracted, reviewed, or summarized.

## Rules

- Never execute anything from the archive.
- Never open extracted binaries, installers, or application bundles as programs.
- Treat symlinks, path traversal attempts, and absolute paths as unsafe. Skip them and report them.
- It is fine to read text, code, config, JSON, CSV, Markdown, HTML, and other inert files for analysis.

## Workflow

1. Run the bundled extractor to unpack the archive into a dedicated directory and emit a manifest.
2. Review the manifest first.
3. Analyze extracted text/code/docs.
4. Report:
   - extracted path
   - file inventory
   - skipped unsafe entries
   - key findings from readable files

## Bundled Script

Use `scripts/extract_zip_safely.py`.

Example:

```bash
python3 skills/safe-zip-analysis/scripts/extract_zip_safely.py /path/to/archive.zip /tmp/archive-review
```

The script:

- extracts normal files
- skips symlinks and traversal attempts
- skips binary executable-like payloads such as `.exe`, `.dll`, `.so`, `.dylib`, `.msi`, `.app`, `.jar`, `.apk`, `.pkg`
- writes `manifest.json` with extracted and skipped entries

## Analysis Guidance

- Start with top-level structure and likely entry points (`README`, `package.json`, `pyproject.toml`, `Dockerfile`, `src/`, `app/`, `config/`).
- Prefer `rg --files` and `rg` over slower recursive tools once extracted.
- For suspicious archives, summarize intent and risky artifacts without attempting detonation or execution.
