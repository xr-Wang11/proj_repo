from __future__ import annotations

import argparse


# 定义命令行参数，包括配置覆盖、模型管理、对话模式和采样温度。
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Call an OpenAI-compatible chat model with local credentials."
    )
    parser.add_argument(
        "--url",
        default=None,
        help="Model API base URL. Overrides automatic lookup.",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="API key. Overrides automatic lookup.",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Model name. Defaults to info.txt, OPENAI_MODEL, or tju-llm.",
    )
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="Read available models from the server, print them, and exit.",
    )
    parser.add_argument(
        "--choose-model",
        action="store_true",
        help="Read available models from the server and choose one interactively.",
    )
    parser.add_argument(
        "--prompt",
        default=None,
        help="User prompt. If omitted, the script starts a continuous chat.",
    )
    parser.add_argument(
        "--chat",
        action="store_true",
        help="Keep conversation history and continue chatting after the first prompt.",
    )
    parser.add_argument(
        "--system",
        default=None,
        help="System prompt.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.7,
        help="Sampling temperature.",
    )
    return parser
