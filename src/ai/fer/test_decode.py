"""Frames from the interview room must always decode — or say clearly why not."""

import io
import logging

import numpy as np
from PIL import Image

from fer.fer_service import _decode_image


def _jpeg(width: int = 64, height: int = 48) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (200, 120, 40)).save(buf, format="JPEG", quality=70)
    return buf.getvalue()


def test_a_browser_style_jpeg_decodes_to_a_bgr_image() -> None:
    img = _decode_image(_jpeg())
    assert img is not None
    assert img.shape == (48, 64, 3)
    # BGR order: the orange (R=200, B=40) has a low first channel.
    assert int(np.mean(img[..., 0])) < int(np.mean(img[..., 2]))


def test_a_broken_file_is_reported_not_silent(caplog) -> None:
    with caplog.at_level(logging.WARNING):
        assert _decode_image(b"not an image at all") is None
    assert "could not decode frame" in caplog.text
