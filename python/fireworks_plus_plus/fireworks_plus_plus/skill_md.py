"""Parse Claude Code / Open Design style SKILL.md files (YAML frontmatter + Markdown body).

Format reference: https://github.com/nexu-io/open-design (Apache-2.0).
Requires PyYAML (`pip install fireworks_plus_plus[skills]`).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, TypedDict

_FRONT_MATTER_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$")


class ParsedSkillMarkdown(TypedDict):
    id: str
    name: str
    description: str
    triggers: list[str]
    instructions: list[str]
    enabled: bool
    createdAt: str
    origin: str


def _slug_stem(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:48] if s else ""


def _normalize_description(meta: dict[str, Any]) -> str:
    raw = meta.get("description")
    if isinstance(raw, str):
        return raw.strip()
    if raw is not None and not isinstance(raw, (dict, list)):
        return str(raw).strip()
    return ""


def _normalize_triggers(meta: dict[str, Any]) -> list[str]:
    raw = meta.get("triggers")
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if isinstance(raw, str):
        return [p.strip() for p in re.split(r"[,;]", raw) if p.strip()]
    return []


def parse_skill_markdown(markdown: str, source_basename: str | None = None) -> ParsedSkillMarkdown:
    try:
        import yaml
    except ImportError as exc:
        raise ImportError(
            "parse_skill_markdown requires PyYAML. Install with: pip install 'fireworks_plus_plus[skills]'"
        ) from exc

    text = markdown.lstrip("\ufeff").strip()
    match = _FRONT_MATTER_RE.match(text)
    if not match:
        raise ValueError(
            'Expected SKILL.md to begin with YAML frontmatter between "---" lines '
            "(Claude Code / Open Design convention)."
        )
    try:
        parsed = yaml.safe_load(match.group(1))
        meta: dict[str, Any] = parsed if isinstance(parsed, dict) else {}
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML frontmatter in SKILL.md: {exc}") from exc

    body = match.group(2).strip()
    name = str(meta.get("name") or "").strip()
    if not name:
        raise ValueError('SKILL.md frontmatter must include a non-empty "name" field.')

    triggers = _normalize_triggers(meta)
    stop = {"true", "false", "null", ""}
    triggers = [t for t in triggers if t.lower() not in stop]
    if not triggers:
        triggers = [_slug_stem(name) or "skill"]

    description = _normalize_description(meta) or f"Imported skill: {name}"
    stem = _slug_stem(name) or "skill"
    skill_id = f"od-{stem}-{uuid.uuid4().hex[:8]}"

    provenance = ""
    if source_basename is not None:
        provenance = (
            f"\n\n---\n_Imported from `{source_basename}`. Compatible with "
            "[Open Design](https://github.com/nexu-io/open-design) / Claude Code SKILL.md._"
        )

    instructions = [f"{body}{provenance}"]

    created = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    return ParsedSkillMarkdown(
        id=skill_id,
        name=name,
        description=description,
        triggers=triggers,
        instructions=instructions,
        enabled=True,
        createdAt=created,
        origin="custom",
    )
