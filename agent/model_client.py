from __future__ import annotations

import json
from typing import Any

try:
    from openai import OpenAI
except ModuleNotFoundError:
    OpenAI = None


# 检查 openai 依赖是否安装，缺失时给出清晰的安装提示。
def ensure_openai_installed() -> None:
    if OpenAI is None:
        raise RuntimeError(
            "Missing dependency: openai. Install it with: python -m pip install openai"
        )


# 使用 base_url 和 api_key 创建 OpenAI-compatible 客户端。
def create_client(api_key: str, base_url: str) -> Any:
    ensure_openai_installed()
    return OpenAI(api_key=api_key, base_url=base_url)


# 从不同形态的模型对象里提取模型 ID。
def get_model_id(item: Any) -> str | None:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        value = item.get("id") or item.get("name") or item.get("model")
        return str(value) if value else None

    value = getattr(item, "id", None)
    return str(value) if value else None


# 从 OpenAI 标准格式或常见兼容格式中提取模型 ID 列表。
def extract_model_ids(payload: Any) -> list[str]:
    if isinstance(payload, dict):
        data = payload.get("data") or payload.get("models") or payload.get("model_list")
    else:
        data = getattr(payload, "data", payload)

    if isinstance(data, dict):
        data = data.values()
    if not isinstance(data, list):
        data = list(data) if data is not None and not isinstance(data, str) else []

    model_ids: list[str] = []
    seen: set[str] = set()
    for item in data:
        model_id = get_model_id(item)
        if model_id and model_id not in seen:
            model_ids.append(model_id)
            seen.add(model_id)
    return model_ids


# 调用模型服务的 models 接口，获取当前 API key 可用的模型 ID 列表。
def fetch_model_ids(client: Any) -> list[str]:
    raw_response = client.models.with_raw_response.list()
    text = raw_response.text.strip()

    if text.startswith("<!DOCTYPE html") or text.startswith("<html"):
        raise RuntimeError(
            "The model list endpoint returned an HTML page, not model JSON. "
            "This API may not support /models; use the model in info.txt or pass --model."
        )

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"The model list endpoint did not return valid JSON: {exc}") from exc

    return extract_model_ids(payload)


# 打印可用模型列表，并用星号标出当前默认模型。
def print_model_ids(model_ids: list[str], default_model: str | None = None) -> None:
    if not model_ids:
        print("No available models returned by the server.")
        return

    print("Available models:")
    for index, model_id in enumerate(model_ids, start=1):
        marker = "*" if default_model and model_id == default_model else " "
        print(f"{index:>2}. {marker} {model_id}")


# 让用户通过序号或模型名从可用模型列表中选择本次使用的模型。
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


# 发起一次聊天补全请求，并返回助手生成的文本。
def request_chat_completion(
    client: Any,
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
