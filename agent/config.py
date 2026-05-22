from __future__ import annotations

import argparse
import getpass
import os
from pathlib import Path


# 默认配置：系统提示词、模型名和本地配置文件路径。
DEFAULT_SYSTEM_PROMPT = "你是一个强大的、全面的ai助手."
DEFAULT_MODEL = "tju-llm"
INFO_FILE = Path(__file__).with_name("info.txt")


# 清理配置值两端空白和成对引号，避免读取到多余字符。
def clean_value(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1].strip()
    return value


# 统一配置键名格式，方便兼容 api-key、api key、API_KEY 等写法。
def normalize_key(key: str) -> str:
    return key.strip().lower().replace("-", "_").replace(" ", "_")


# 读取 info.txt，并解析 url、api_key、model、system 等本地配置。
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


# 按顺序返回第一个非空字符串，用于实现配置优先级。
def first_value(*values: str | None) -> str | None:
    for value in values:
        if value:
            stripped = value.strip()
            if stripped:
                return stripped
    return None


# 按顺序返回第一个非空配置值，并同时返回它来自哪里。
def first_config_value(*items: tuple[str, str | None]) -> tuple[str, str]:
    for source, value in items:
        if value:
            stripped = value.strip()
            if stripped:
                return stripped, source
    raise ValueError("No value found")


# 如果已经有值就直接使用，否则从命令行交互读取用户输入。
def ask_value(name: str, current: str | None = None, secret: bool = False) -> str:
    if current:
        return current

    prompt = f"Enter {name}: "
    value = getpass.getpass(prompt) if secret else input(prompt)
    value = value.strip()
    if not value:
        raise ValueError(f"{name} is required")
    return value


# 按优先级确定 API base URL，顺序为命令行、info.txt、环境变量。
def resolve_base_url(args: argparse.Namespace, info: dict[str, str]) -> str | None:
    return first_value(args.url, info.get("url"), os.getenv("OPENAI_BASE_URL"))


# 按优先级确定 API key，顺序为命令行、info.txt、环境变量。
def resolve_api_key(args: argparse.Namespace, info: dict[str, str]) -> str | None:
    return first_value(args.api_key, info.get("api_key"), os.getenv("OPENAI_API_KEY"))


# 按优先级确定模型名，并返回模型值及其来源。
def resolve_model(args: argparse.Namespace, info: dict[str, str]) -> tuple[str, str]:
    return first_config_value(
        ("command line", args.model),
        ("info.txt", info.get("model")),
        ("environment", os.getenv("OPENAI_MODEL")),
        ("default", DEFAULT_MODEL),
    )


# 按优先级确定系统提示词，顺序为命令行、info.txt、环境变量、默认值。
def resolve_system_prompt(args: argparse.Namespace, info: dict[str, str]) -> str:
    return first_value(
        args.system,
        info.get("system"),
        os.getenv("OPENAI_SYSTEM_PROMPT"),
        DEFAULT_SYSTEM_PROMPT,
    ) or DEFAULT_SYSTEM_PROMPT
