# Agent Model Caller

这个项目提供一个 Python 脚本，用来调用适配OpenAI的模型接口。它支持从本地配置读取接口地址和默认模型，也可以读取可用模型列表、切换模型，并进行连续对话。

## 文件说明

- `call_model.py`：主程序，负责读取配置、创建客户端、调用模型。
- `info.txt`：本地配置文件，可填写接口地址、默认模型和 API key。
- `requirements.txt`：Python 依赖列表。

## 安装依赖

```powershell
python -m pip install openai
```

## 配置方式

程序读取配置的优先级是：

```text
info.txt > 环境变量 > 交互输入
```

推荐的 `info.txt` 格式：

```txt
url=
model=
# api_key=
```

如果要从 `info.txt` 读取 API key，需要去掉前面的 `#`：

```txt
api_key=your_api_key_here
```

也可以不把 API key 写入文件，改用环境变量：

```powershell
$env:OPENAI_API_KEY="your_api_key_here"
```

## 模型管理

查看接口返回的可用模型：

```powershell
python .\call_model.py --list-models
```

从可用模型列表中交互选择模型：

```powershell
python .\call_model.py --choose-model
```

临时指定模型，覆盖 `info.txt` 里的默认模型：

```powershell
python .\call_model.py --model "deepseek-v3" --prompt "你好"
```

## 系统 Prompt

```python
DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant."
```

也可以运行时临时覆盖：

```powershell
python .\call_model.py --system "你是一个严谨的中文技术助手。" --prompt "解释一下 RAG"
```
