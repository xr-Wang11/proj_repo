import { computed, ref, watch } from "vue";
import { solveEquationInputs } from "@/solver/linear-system.js";
import { buildEquationPlotModel } from "@/utils/equation-plot.js";
import { translateErrorMessage } from "@/utils/error-display.js";

function normalizeEquationArray(equations, expectedLength) {
  const next = equations.slice(0, expectedLength);

  while (next.length < expectedLength) {
    next.push("");
  }

  return next;
}

function parseVariableNames(source) {
  return String(source ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function useEquationSystem(userStore) {
  const angleUnit = ref("rad");
  const variableSource = ref("x, y");
  const equationInputs = ref(["", ""]);
  const plotXAxisVariable = ref("");
  const plotYAxisVariable = ref("");
  const plotViewportInput = ref({
    maxX: null,
    maxY: null,
    minX: null,
    minY: null,
  });

  function syncPlotAxes() {
    const variableNames = parseVariableNames(variableSource.value).slice(0, 2);

    if (variableNames.length < 2) {
      plotXAxisVariable.value = "";
      plotYAxisVariable.value = "";
      return;
    }

    if (!variableNames.includes(plotXAxisVariable.value)) {
      plotXAxisVariable.value = variableNames[0];
    }

    if (!variableNames.includes(plotYAxisVariable.value) || plotYAxisVariable.value === plotXAxisVariable.value) {
      plotYAxisVariable.value = variableNames.find((item) => item !== plotXAxisVariable.value) || variableNames[1];
    }
  }

  watch(variableSource, syncPlotAxes, { immediate: true });

  const result = computed(() => {
    const normalizedEquations = equationInputs.value.map((item) => String(item ?? "").trim());
    const hasAnyEquationInput = normalizedEquations.some(Boolean);
    const hasVariableInput = String(variableSource.value ?? "").trim().length > 0;

    if (!hasAnyEquationInput) {
      return {
        error: null,
        message: hasVariableInput ? "请开始输入方程。" : "请先声明变量并输入方程。",
        roots: [],
        solutions: [],
        status: "idle",
        variableNames: [],
      };
    }

    try {
      const solved = solveEquationInputs({
        angleUnit: angleUnit.value,
        equations: normalizedEquations,
        functions: userStore.toDefinitionTable(),
        variableSource: variableSource.value,
      });

      return {
        ...solved,
        error: null,
      };
    } catch (error) {
      return {
        error,
        message: translateErrorMessage(error?.message || "方程求解失败。"),
        roots: [],
        solutions: [],
        status: "error",
        variableNames: [],
      };
    }
  });

  const plot = computed(() =>
    buildEquationPlotModel({
      angleUnit: angleUnit.value,
      equations: equationInputs.value,
      functions: userStore.toDefinitionTable(),
      result: result.value,
      variableSource: variableSource.value,
      viewportInput: plotViewportInput.value,
      xAxisVariable: plotXAxisVariable.value,
      yAxisVariable: plotYAxisVariable.value,
    })
  );

  function setEquationInput(index, value) {
    const next = equationInputs.value.slice();
    next[index] = value;
    equationInputs.value = next;
  }

  function addEquation() {
    equationInputs.value = [...equationInputs.value, ""];
  }

  function removeEquation() {
    if (equationInputs.value.length <= 1) {
      return;
    }

    equationInputs.value = equationInputs.value.slice(0, -1);
  }

  function setEquationCount(count) {
    equationInputs.value = normalizeEquationArray(equationInputs.value, Math.max(1, count));
  }

  function setPlotXAxisVariable(value) {
    plotXAxisVariable.value = String(value ?? "").trim();
    syncPlotAxes();
  }

  function setPlotYAxisVariable(value) {
    plotYAxisVariable.value = String(value ?? "").trim();
    syncPlotAxes();
  }

  function setPlotViewportInput(payload) {
    if (!payload || typeof payload.key !== "string") {
      return;
    }

    const currentViewport = plot.value?.viewport || {};

    plotViewportInput.value = {
      maxX: plotViewportInput.value.maxX ?? String(currentViewport.maxX ?? ""),
      maxY: plotViewportInput.value.maxY ?? String(currentViewport.maxY ?? ""),
      minX: plotViewportInput.value.minX ?? String(currentViewport.minX ?? ""),
      minY: plotViewportInput.value.minY ?? String(currentViewport.minY ?? ""),
      [payload.key]: payload.value === null ? null : String(payload.value),
    };
  }

  function resetPlotViewport() {
    plotViewportInput.value = {
      maxX: null,
      maxY: null,
      minX: null,
      minY: null,
    };
  }

  return {
    addEquation,
    angleUnit,
    equationCount: computed(() => equationInputs.value.length),
    equationInputs,
    removeEquation,
    plot,
    plotViewportInput,
    result,
    resetPlotViewport,
    setEquationCount,
    setEquationInput,
    setPlotViewportInput,
    setPlotXAxisVariable,
    setPlotYAxisVariable,
    variableSource,
  };
}
