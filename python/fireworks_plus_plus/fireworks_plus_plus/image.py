"""Raster image helpers mirroring AgentMiller Image studio operations (Pillow)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal, Tuple, Union

try:
    from PIL import Image, ImageEnhance, ImageOps
except ImportError:  # pragma: no cover - optional dependency
    Image = None  # type: ignore[misc, assignment]
    ImageEnhance = None  # type: ignore[misc, assignment]
    ImageOps = None  # type: ignore[misc, assignment]

PathLike = Union[str, Path]


def _require_pillow() -> None:
    if Image is None:
        raise RuntimeError('Install the image extra: pip install ".[image]" or pip install fireworks_plus_plus[image]')


def load_rgba(path: PathLike) -> "Image.Image":
    """Load an image file as RGBA (matches lossless canvas-style editing)."""
    _require_pillow()
    return Image.open(Path(path)).convert("RGBA")


def save_rgba(
    image: "Image.Image",
    path: PathLike,
    format: Literal["PNG", "JPEG", "WEBP"] = "PNG",
    quality: int = 92,
) -> None:
    """Save RGBA image; alpha is flattened for JPEG."""
    _require_pillow()
    dest = Path(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if format == "JPEG" and image.mode == "RGBA":
        image = image.convert("RGB")
    save_kwargs = {}
    if format in ("JPEG", "WEBP"):
        save_kwargs["quality"] = quality
    image.save(dest, format=format, **save_kwargs)


def resize(image: "Image.Image", width: int, height: int) -> "Image.Image":
    """Resize to exact dimensions (no aspect preservation)."""
    _require_pillow()
    return image.resize((max(1, width), max(1, height)), Image.Resampling.LANCZOS)


def resize_max_edge(image: "Image.Image", max_edge: int) -> "Image.Image":
    """Uniform scale so the longest side is at most ``max_edge`` (like AgentMiller load cap)."""
    _require_pillow()
    w, h = image.size
    longest = max(w, h)
    if longest <= max_edge:
        return image.copy()
    scale = max_edge / longest
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return image.resize((nw, nh), Image.Resampling.LANCZOS)


def crop_box(image: "Image.Image", box: Tuple[int, int, int, int]) -> "Image.Image":
    """Crop to (left, upper, right, lower) inclusive-exclusive PIL box."""
    _require_pillow()
    return image.crop(box)


def rotate_90(image: "Image.Image", times: int = 1) -> "Image.Image":
    """Rotate 90° clockwise ``times`` (1 = one quarter turn)."""
    _require_pillow()
    out = image
    for _ in range(times % 4):
        out = out.transpose(Image.Transpose.ROTATE_270)
    return out


def flip_horizontal(image: "Image.Image") -> "Image.Image":
    _require_pillow()
    return ImageOps.mirror(image)


def flip_vertical(image: "Image.Image") -> "Image.Image":
    _require_pillow()
    return ImageOps.flip(image)


def adjust_brightness(image: "Image.Image", factor: float) -> "Image.Image":
    """``factor`` 1.0 = unchanged, >1 brighter, <1 darker."""
    _require_pillow()
    return ImageEnhance.Brightness(image).enhance(factor)


def adjust_contrast(image: "Image.Image", factor: float) -> "Image.Image":
    """``factor`` 1.0 = unchanged."""
    _require_pillow()
    return ImageEnhance.Contrast(image).enhance(factor)


def adjust_color(image: "Image.Image", factor: float) -> "Image.Image":
    """Saturation: 1.0 = unchanged, 0 = grayscale."""
    _require_pillow()
    return ImageEnhance.Color(image).enhance(factor)
