"""Ask Amumata: Llama answers only from the given passages, with citations."""

from unittest.mock import MagicMock, patch

from assistant.answer import (
    NOT_FOUND_ANSWER,
    answer_question,
    build_prompt,
    cited_sources,
    parse_answer,
)

PASSAGES = [
    {"source": "Defense Q&A", "title": "How accurate are the models?", "text": "SER 78.95%."},
    {"source": "Guide", "title": "Fusion", "text": "Face 50%, voice 50%."},
]


def test_prompt_numbers_each_passage_and_ends_with_the_question() -> None:
    prompt = build_prompt("  How accurate is SER? ", PASSAGES)
    assert "[1] How accurate are the models? (Defense Q&A)\nSER 78.95%." in prompt
    assert "[2] Fusion (Guide)" in prompt
    assert prompt.endswith("Question: How accurate is SER?\nAnswer:")


def test_only_real_passage_numbers_count_as_sources() -> None:
    assert cited_sources("SER is 78.95% [1]. Fusion is 50/50 [2][1]. See [7].", 2) == [1, 2]


def test_not_found_and_empty_answers_say_it_isnt_documented() -> None:
    for raw in ["NOT_FOUND", "  NOT_FOUND.", ""]:
        assert parse_answer(raw, 2) == {"answer": NOT_FOUND_ANSWER, "found": False, "sources": []}


def test_no_passages_skips_the_model() -> None:
    with patch("assistant.answer.requests.post") as post:
        assert answer_question("Anything?", [])["found"] is False
        post.assert_not_called()


def test_answer_comes_back_with_its_sources() -> None:
    reply = MagicMock(status_code=200)
    reply.json.return_value = {"response": "The voice model scores 78.95% [1]."}
    with patch("assistant.answer.requests.post", return_value=reply) as post:
        result = answer_question("How accurate is SER?", PASSAGES)
    assert result == {"answer": "The voice model scores 78.95% [1].", "found": True, "sources": [1]}
    assert post.call_args.kwargs["json"]["options"]["num_ctx"] == 3072


def test_ollama_failure_returns_none() -> None:
    with patch("assistant.answer.requests.post", side_effect=TimeoutError("slow")):
        assert answer_question("How accurate is SER?", PASSAGES) is None
