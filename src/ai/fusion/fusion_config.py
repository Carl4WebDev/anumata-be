"""
Fusion configuration — configurable weights for multimodal fusion.

Change these values to adjust modality influence WITHOUT modifying fusion logic.
"""

from config import DEFAULT_FUSION_WEIGHTS, RISK_HIGH_THRESHOLD, RISK_MODERATE_THRESHOLD


class FusionConfig:
    """Configurable fusion weights."""

    def __init__(
        self,
        fer_weight: float = None,
        ser_weight: float = None,
        ler_weight: float = None,
    ):
        self.fer_weight = fer_weight or DEFAULT_FUSION_WEIGHTS["fer"]
        self.ser_weight = ser_weight or DEFAULT_FUSION_WEIGHTS["ser"]
        self.ler_weight = ler_weight or DEFAULT_FUSION_WEIGHTS["ler"]
        self.risk_high = RISK_HIGH_THRESHOLD
        self.risk_moderate = RISK_MODERATE_THRESHOLD

    def to_dict(self) -> dict:
        return {
            "fer_weight": self.fer_weight,
            "ser_weight": self.ser_weight,
            "ler_weight": self.ler_weight,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "FusionConfig":
        return cls(
            fer_weight=data.get("fer_weight"),
            ser_weight=data.get("ser_weight"),
            ler_weight=data.get("ler_weight"),
        )


# Default configuration
DEFAULT_CONFIG = FusionConfig()
