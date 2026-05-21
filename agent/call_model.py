from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path

try:
    from openai import OpenAI
except ModuleNotFoundError:
    OpenAI = None


DEFAULT_SYSTEM_PROMPT = "你是一个强大的、全面的ai助手."
DEFAULT_MODEL = "tju-llm"
EXIT_COMMANDS = {"exit", "quit", "q", "bye", "退出", "再见"}
INFO_FILE = Path(__file__).with_name("info.txt")


def clean_value(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1].strip()
    return value


def normalize_key(key: str) -> str:
    return key.strip().lower().replace("-", "_").replace(" ", "_")


def load_info_file(path: Path = INFO_FILE) -> dict[str, str]:
    if not path.exists():
        return {}

    info: dict[str, str] = {}
    bare_values: list[str] = []
    aliases = {
        "url": "url",
        "base_url": "url",
        "api_base": "url",
        "openai_base_url": "url",
        "apikey": "api_key",
        "api_key": "api_key",
        "api__key": "api_key",
        "openai_api_key": "api_key",
        "key": "api_key",
        "model": "model",
        "openai_model": "model",
        "system": "system",
        "system_prompt": "system",
    }

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            disabled_line = line.lstrip("#").strip()
            separator = "=" if "=" in disabled_line else ":" if ":" in disabled_line else None
            if separator:
                key, value = disabled_line.split(separator, 1)
                normalized_key = aliases.get(normalize_key(key))
                if normalized_key == "api_key" and clean_value(value):
                    info["_disabled_api_key"] = "true"
            continue

        separator = "=" if "=" in line else ":" if ":" in line else None
        if separator:
            key, value = line.split(separator, 1)
            normalized_key = aliases.get(normalize_key(key))
            cleaned_value = clean_value(value)
            if normalized_key and cleaned_value:
                info[normalized_key] = cleaned_value
        else:
            bare_values.append(line)

    if bare_values:
        info.setdefault("url", clean_value(bare_values[0]))
    if len(bare_values) > 1:
        info.setdefault("api_key", clean_value(bare_values[1]))
    if len(bare_values) > 2:
        info.setdefault("model", clean_value(bare_values[2]))

    return info


def first_value(*values: str | None) -> str | None:
    for value in values:
        if value:
            stripped = value.strip()
            if stripped:
                return stripped
    return None


def first_config_value(*items: tuple[str, str | None]) -> tuple[str, str]:
    for source, value in items:
        if value:
            stripped = value.strip()
            if stripped:
                return stripped, source
    raise ValueError("No value found")


def ask_value(name: str, current: str | None = None, secret: bool = False) -> str:
    if current:
        return current

    prompt = f"Enter {name}: "
    value = getpass.getpass(prompt) if secret else input(prompt)
    value = value.strip()
    if not value:
        raise ValueError(f"{name} is required")
    return value


def fetch_model_ids(client: OpenAI) -> list[str]:
    response = client.models.list()
    data = getattr(response, "data", response)

    model_ids: list[str] = []
    seen: set[str] = set()
    for item in data:
        model_id = getattr(item, "id", None)
        if model_id is None and isinstance(item, dict):
            model_id = item.get("id")
        if model_id and model_id not in seen:
            model_ids.append(model_id)
            seen.add(model_id)

    return model_ids


def print_model_ids(model_ids: list[str], default_model: str | None = None) -> None:
    if not model_ids:
        print("No available models returned by the server.")
        return

    print("Available models:")
    for index, model_id in enumerate(model_ids, start=1):
        marker = "*" if default_model and model_id == default_model else " "
        print(f"{index:>2}. {marker} {model_id}")


def choose_model(model_ids: list[str], default_model: str) -> str:
    print_model_ids(model_ids, default_model)
    if not model_ids:
        return default_model

    choice = input(f"Choose model [default: {default_model}]: ").strip()
    if not choice:
        return default_model

    if choice.isdigit():
        index = int(choice) - 1
        if 0 <= index < len(model_ids):
            return model_ids[index]
        raise ValueError(f"Model number out of range: {choice}")

    if choice in model_ids:
        return choice

    raise ValueError(f"Model not found in available model list: {choice}")


def resolve_model(args: argparse.Namespace, info: dict[str, str]) -> tuple[str, str]:
    return first_config_value(
        ("command line", args.model),
        ("info.txt", info.get("model")),
        ("environment", os.getenv("OPENAI_MODEL")),
        ("default", DEFAULT_MODEL),
    )


def request_chat_completion(
    client: OpenAI,
    model: str,
    messages: list[dict[str, str]],
    temperature: float,
) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def run_single_turn(
    client: OpenAI,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
) -> None:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    print(f"Using model: {model}")
    print(request_chat_completion(client, model, messages, temperature))


def run_chat_loop(
    client: OpenAI,
    model: str,
    system_prompt: str,
    temperature: float,
    first_prompt: str | None = None,
) -> None:
    messages = [{"role": "system", "content": system_prompt}]
    next_prompt = first_prompt

    print(f"Using model: {model}")
    print("Continuous chat started. Type exit, quit, q, or 退出 to stop.")

    while True:
        if next_prompt is None:
            try:
                user_prompt = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return
        else:
            user_prompt = next_prompt.strip()
            next_prompt = None
            print(f"You: {user_prompt}")

        if not user_prompt:
            continue
        if user_prompt.lower() in EXIT_COMMANDS:
            return

        messages.append({"role": "user", "content": user_prompt})
        answer = request_chat_completion(client, model, messages, temperature)
        messages.append({"role": "assistant", "content": answer})
        print(f"Assistant: {answer}\n")


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


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if OpenAI is None:
            raise RuntimeError(
                "Missing dependency: openai. Install it with: python -m pip install openai"
            )

        info = load_info_file()
        base_url = ask_value(
            "API base URL",
            first_value(args.url, info.get("url"), os.getenv("OPENAI_BASE_URL")),
        )
        api_key_value = first_value(
            args.api_key,
            info.get("api_key"),
            os.getenv("OPENAI_API_KEY"),
        )
        if not api_key_value and info.get("_disabled_api_key"):
            print(
                "Warning: info.txt contains a commented api_key line. Remove the leading # to enable it.",
                file=sys.stderr,
            )

        api_key = ask_value("API key", api_key_value, secret=True)
        model, model_source = resolve_model(args, info)
        system_prompt = first_value(
            args.system,
            info.get("system"),
            os.getenv("OPENAI_SYSTEM_PROMPT"),
            DEFAULT_SYSTEM_PROMPT,
        )

        client = OpenAI(api_key=api_key, base_url=base_url)

        if args.list_models or args.choose_model:
            model_ids = fetch_model_ids(client)
            if args.list_models and not args.choose_model:
                print_model_ids(model_ids, model)
                return 0
            model = choose_model(model_ids, model)
            model_source = "interactive choice"

        print(f"Model source: {model_source}")

        if args.chat or args.prompt is None:
            run_chat_loop(client, model, system_prompt, args.temperature, args.prompt)
        else:
            run_single_turn(client, model, system_prompt, args.prompt, args.temperature)
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
