import { computed, ref } from "vue";

function splitParameterInput(value) {
  const source = String(value ?? "").trim();

  if (!source) {
    return [];
  }

  return source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildInvocationTemplate(definition) {
  const parameterCount = definition.parameters.length;

  if (parameterCount === 0) {
    return {
      text: `${definition.name}()`,
      cursorOffset: definition.name.length + 2,
    };
  }

  return {
    text: `${definition.name}(${new Array(parameterCount).fill("").join(", ")})`,
    cursorOffset: definition.name.length + 1,
  };
}

export function useUserFunctions(userStore, actions) {
  const version = ref(0);
  const functionName = ref("");
  const functionParams = ref("");
  const functionStatus = ref({
    message: "用户函数仓库已就绪。",
    tone: "muted",
  });
  const functionJsonText = ref("");

  function markChanged() {
    version.value += 1;
  }

  function setStatus(message, tone = "muted") {
    functionStatus.value = { message, tone };
  }

  function loadPersistedFunctions() {
    userStore.list();

    const persistenceStatus = userStore.getPersistenceStatus();

    if (persistenceStatus.lastLoadError) {
      setStatus(`本地存储加载失败，已忽略旧数据：${persistenceStatus.lastLoadError.message}`, "error");
      return;
    }

    markChanged();
    setStatus("已从本地存储加载用户函数。", "success");
  }

  function resetForm() {
    functionName.value = "";
    functionParams.value = "";
    setStatus("已清空函数编辑表单。");
  }

  function saveCurrentExpression() {
    try {
      const name = functionName.value.trim();
      const bodySource = actions.getRawInput().trim();

      if (!name) {
        throw new Error("函数名不能为空。");
      }

      if (!bodySource) {
        throw new Error("当前表达式为空，无法保存为函数。");
      }

      const spec = {
        name,
        parameters: splitParameterInput(functionParams.value),
        bodySource,
      };

      const replacing = userStore.has(spec.name);
      const definition = userStore.define(spec, { replace: replacing });

      markChanged();
      actions.refresh();
      setStatus(`${replacing ? "已更新" : "已保存"}函数 ${definition.name}。`, "success");
    } catch (error) {
      setStatus(`保存失败：${error.message}`, "error");
    }
  }

  function editFunction(name) {
    const definition = userStore.get(name);

    if (!definition) {
      setStatus(`未找到函数 ${name}。`, "error");
      return;
    }

    functionName.value = definition.name;
    functionParams.value = definition.parameters.map((parameter) => parameter.name).join(", ");
    actions.replaceRawInput(definition.metadata.source || "");
    setStatus(`已载入函数 ${name}，可以继续编辑。`, "success");
  }

  function insertFunctionCall(name) {
    const definition = userStore.get(name);

    if (!definition) {
      setStatus(`未找到函数 ${name}。`, "error");
      return;
    }

    const template = buildInvocationTemplate(definition);
    actions.insertTemplate(template.text, template.cursorOffset, {
      kind: "savedFunctionInsert",
      functionName: name,
    });
    setStatus(`已插入函数 ${name} 的调用模板。`, "success");
  }

  function deleteFunction(name) {
    if (!userStore.remove(name)) {
      setStatus(`未找到函数 ${name}。`, "error");
      return;
    }

    markChanged();
    actions.refresh();
    setStatus(`已删除函数 ${name}。`, "success");
  }

  function exportFunctions() {
    functionJsonText.value = JSON.stringify(userStore.exportRecords(), null, 2);
    setStatus("已导出函数 JSON。", "success");
  }

  function importFunctions() {
    try {
      const records = JSON.parse(functionJsonText.value || "[]");
      const loaded = userStore.loadRecords(records, { replace: true });
      markChanged();
      actions.refresh();
      setStatus(`已导入 ${loaded.length} 个函数。`, "success");
    } catch (error) {
      setStatus(`导入失败：${error.message}`, "error");
    }
  }

  const functions = computed(() => {
    void version.value;
    return userStore.list();
  });

  return {
    deleteFunction,
    editFunction,
    exportFunctions,
    functionJsonText,
    functionName,
    functionParams,
    functionStatus,
    functions,
    importFunctions,
    insertFunctionCall,
    loadPersistedFunctions,
    resetForm,
    saveCurrentExpression,
  };
}
