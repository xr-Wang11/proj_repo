from __future__ import annotations

from typing import Any

from model_client import request_chat_completion


# 连续对话中用于结束程序的用户输入。
EXIT_COMMANDS = {"exit", "quit", "q", "bye", "退出", "再见"}


# 执行单轮问答：系统提示词 + 用户问题 + 一次模型回复。
def run_single_turn(
    client: Any,
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


# 执行连续对话：保留历史消息，让后续问题带着上下文继续回答。
def run_chat_loop(
    client: Any,
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
