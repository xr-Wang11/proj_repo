from __future__ import annotations

import sys

from chat import run_chat_loop, run_single_turn
from cli import build_parser
from config import (
    ask_value,
    load_info_file,
    resolve_api_key,
    resolve_base_url,
    resolve_model,
    resolve_system_prompt,
)
from model_client import choose_model, create_client, fetch_model_ids, print_model_ids


# 程序主流程：读取参数和配置，创建客户端，选择模型并启动对话。
def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        info = load_info_file()
        base_url = ask_value("API base URL", resolve_base_url(args, info))
        api_key_value = resolve_api_key(args, info)
        if not api_key_value and info.get("_disabled_api_key"):
            print(
                "Warning: info.txt contains a commented api_key line. Remove the leading # to enable it.",
                file=sys.stderr,
            )

        api_key = ask_value("API key", api_key_value, secret=True)
        model, model_source = resolve_model(args, info)
        system_prompt = resolve_system_prompt(args, info)
        client = create_client(api_key=api_key, base_url=base_url)

        if args.list_models or args.choose_model:
            try:
                model_ids = fetch_model_ids(client)
            except RuntimeError as exc:
                print(f"Warning: {exc}")
                print("Falling back to the configured model.")
                model_ids = [model]
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
