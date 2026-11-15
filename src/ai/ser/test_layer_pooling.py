"""The app must build the SER model the way the checkpoint was trained."""

from ser.ser_service import layer_pooling_of


def test_new_checkpoint_says_weighted() -> None:
    checkpoint = {"config": {"layer_pooling": "weighted"}, "model_state_dict": {}}
    assert layer_pooling_of(checkpoint) == "weighted"


def test_layer_weights_mean_weighted_even_without_config() -> None:
    assert layer_pooling_of({"model_state_dict": {"layer_weights": 0}}) == "weighted"


def test_old_checkpoint_uses_last_layer() -> None:
    assert layer_pooling_of({"model_state_dict": {"classifier.0.weight": 0}}) == "last"
