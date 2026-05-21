<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

const props = defineProps({
  plot: {
    type: Object,
    required: true,
  },
  viewportInput: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits([
  "reset-viewport",
  "update:viewport-input",
  "update:x-axis-variable",
  "update:y-axis-variable",
]);

const canvasRef = ref(null);
let resizeObserver = null;

const PLOT_MARGIN = Object.freeze({
  bottom: 34,
  left: 58,
  right: 16,
  top: 16,
});

const legendItems = computed(() => props.plot.curves || []);

function createPlotRect(width, height) {
  return {
    height: Math.max(40, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom),
    left: PLOT_MARGIN.left,
    top: PLOT_MARGIN.top,
    width: Math.max(40, width - PLOT_MARGIN.left - PLOT_MARGIN.right),
  };
}

function projectPoint(point, viewport, rect) {
  const x = rect.left + ((point.x - viewport.minX) / (viewport.maxX - viewport.minX)) * rect.width;
  const y = rect.top + ((viewport.maxY - point.y) / (viewport.maxY - viewport.minY)) * rect.height;
  return { x, y };
}

function niceStep(rawStep) {
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / (10 ** exponent);

  if (fraction <= 1) {
    return 10 ** exponent;
  }

  if (fraction <= 2) {
    return 2 * (10 ** exponent);
  }

  if (fraction <= 5) {
    return 5 * (10 ** exponent);
  }

  return 10 * (10 ** exponent);
}

function buildTicks(min, max, targetCount = 6) {
  const span = Math.max(1e-9, max - min);
  const step = niceStep(span / targetCount);
  const start = Math.ceil(min / step) * step;
  const ticks = [];

  for (let value = start; value <= max + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(12)));
  }

  return { step, ticks };
}

function formatTick(value, step) {
  const normalized = Math.abs(value) <= 1e-12 ? 0 : value;

  if (normalized !== 0 && (Math.abs(normalized) >= 1e4 || Math.abs(normalized) < 1e-3)) {
    return normalized.toExponential(2).replace(/e\+/u, "e");
  }

  const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step)) + 1));
  return normalized.toFixed(decimals).replace(/\.0+$/u, "").replace(/(\.\d*?[1-9])0+$/u, "$1");
}

function drawAxesAndGrid(ctx, viewport, rect) {
  const xTicks = buildTicks(viewport.minX, viewport.maxX);
  const yTicks = buildTicks(viewport.minY, viewport.maxY);

  ctx.save();
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  ctx.strokeStyle = "rgba(95, 104, 111, 0.12)";
  ctx.lineWidth = 1;

  for (const tick of xTicks.ticks) {
    const point = projectPoint({ x: tick, y: viewport.minY }, viewport, rect);
    ctx.beginPath();
    ctx.moveTo(point.x, rect.top);
    ctx.lineTo(point.x, rect.top + rect.height);
    ctx.stroke();
  }

  for (const tick of yTicks.ticks) {
    const point = projectPoint({ x: viewport.minX, y: tick }, viewport, rect);
    ctx.beginPath();
    ctx.moveTo(rect.left, point.y);
    ctx.lineTo(rect.left + rect.width, point.y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(31, 36, 38, 0.28)";
  ctx.lineWidth = 1;

  const xAxisY = viewport.minY <= 0 && viewport.maxY >= 0
    ? projectPoint({ x: 0, y: 0 }, viewport, rect).y
    : rect.top + rect.height;
  const yAxisX = viewport.minX <= 0 && viewport.maxX >= 0
    ? projectPoint({ x: 0, y: 0 }, viewport, rect).x
    : rect.left;

  ctx.beginPath();
  ctx.moveTo(rect.left, xAxisY);
  ctx.lineTo(rect.left + rect.width, xAxisY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(yAxisX, rect.top);
  ctx.lineTo(yAxisX, rect.top + rect.height);
  ctx.stroke();

  ctx.fillStyle = "#5f686f";
  ctx.font = '12px "Consolas", "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (const tick of xTicks.ticks) {
    const point = projectPoint({ x: tick, y: viewport.minY }, viewport, rect);
    ctx.fillText(formatTick(tick, xTicks.step), point.x, rect.top + rect.height + 6);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (const tick of yTicks.ticks) {
    const point = projectPoint({ x: viewport.minX, y: tick }, viewport, rect);
    ctx.fillText(formatTick(tick, yTicks.step), rect.left - 8, point.y);
  }

  ctx.restore();
}

function drawCurves(ctx, viewport, rect) {
  for (const curve of props.plot.curves || []) {
    ctx.save();
    ctx.strokeStyle = curve.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = curve.isLinear ? 1 : 1.2;
    ctx.globalAlpha = 0.92;

    for (const segment of curve.segments || []) {
      const start = projectPoint(segment[0], viewport, rect);
      const end = projectPoint(segment[1], viewport, rect);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawSolutionPoints(ctx, viewport, rect) {
  for (const point of props.plot.solutionPoints || []) {
    const projected = projectPoint(point, viewport, rect);

    ctx.save();
    ctx.fillStyle = "#a53a24";
    ctx.strokeStyle = "#fffaf2";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlot() {
  const canvas = canvasRef.value;

  if (!canvas || !props.plot.visible || !props.plot.curves?.length) {
    return;
  }

  const width = Math.max(320, Math.round(canvas.clientWidth || 480));
  const height = 340;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  const rect = createPlotRect(width, height);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(0, 0, width, height);
  drawAxesAndGrid(ctx, props.plot.viewport, rect);
  drawCurves(ctx, props.plot.viewport, rect);
  drawSolutionPoints(ctx, props.plot.viewport, rect);

  ctx.strokeStyle = "rgba(214, 204, 182, 0.95)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.left + 0.5, rect.top + 0.5, rect.width - 1, rect.height - 1);
}

function setupResizeObserver() {
  const canvas = canvasRef.value;

  if (!canvas || typeof ResizeObserver === "undefined") {
    return;
  }

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => {
    drawPlot();
  });
  resizeObserver.observe(canvas);
}

function emitViewportInput(key, rawValue) {
  const text = String(rawValue ?? "").trim();
  emit("update:viewport-input", {
    key,
    value: text === "" ? null : text,
  });
}

onMounted(() => {
  setupResizeObserver();
  void nextTick(drawPlot);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  () => props.plot,
  () => {
    void nextTick(drawPlot);
  },
  { deep: true }
);
</script>

<template>
  <section
    v-if="plot.visible"
    class="panel status-card"
  >
    <div class="status-header">
      <h2 class="panel-title">二维图像</h2>
      <div class="equation-plot-axis">
        当前横轴：{{ plot.xAxisVariable || "x" }}，纵轴：{{ plot.yAxisVariable || "y" }}
      </div>
    </div>

    <div
      v-if="plot.curves.length > 0"
      class="equation-plot-frame"
    >
      <canvas ref="canvasRef" class="equation-plot-canvas" />
    </div>

    <div
      v-if="plot.curves.length === 0"
      class="status-box"
    >
      <div class="status-label">绘图状态</div>
      <div class="status-value">当前没有可绘制的方程曲线。</div>
    </div>

    <div class="equation-plot-controls">
      <div class="equation-plot-control-card">
        <div class="system-toggle-label">坐标轴选择</div>
        <div class="equation-plot-axis-grid">
          <div>
            <label for="plotXAxis">横轴变量</label>
            <select
              id="plotXAxis"
              :value="plot.xAxisVariable"
              @change="$emit('update:x-axis-variable', $event.target.value)"
            >
              <option
                v-for="name in plot.axisVariableOptions"
                :key="`x-${name}`"
                :value="name"
              >
                {{ name }}
              </option>
            </select>
          </div>
          <div>
            <label for="plotYAxis">纵轴变量</label>
            <select
              id="plotYAxis"
              :value="plot.yAxisVariable"
              @change="$emit('update:y-axis-variable', $event.target.value)"
            >
              <option
                v-for="name in plot.axisVariableOptions"
                :key="`y-${name}`"
                :value="name"
              >
                {{ name }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="equation-plot-control-card">
        <div class="system-toggle-label">
          视窗范围
          <span class="equation-plot-mode-tag">当前：{{ plot.viewportMode === "manual" ? "手动" : "自动" }}</span>
        </div>
        <div class="equation-plot-viewport-grid">
          <div>
            <label for="plotMinX">最小 X</label>
            <input
              id="plotMinX"
              :value="viewportInput.minX ?? String(plot.viewport.minX)"
              class="field-input"
              type="number"
              @input="emitViewportInput('minX', $event.target.value)"
            />
          </div>
          <div>
            <label for="plotMaxX">最大 X</label>
            <input
              id="plotMaxX"
              :value="viewportInput.maxX ?? String(plot.viewport.maxX)"
              class="field-input"
              type="number"
              @input="emitViewportInput('maxX', $event.target.value)"
            />
          </div>
          <div>
            <label for="plotMinY">最小 Y</label>
            <input
              id="plotMinY"
              :value="viewportInput.minY ?? String(plot.viewport.minY)"
              class="field-input"
              type="number"
              @input="emitViewportInput('minY', $event.target.value)"
            />
          </div>
          <div>
            <label for="plotMaxY">最大 Y</label>
            <input
              id="plotMaxY"
              :value="viewportInput.maxY ?? String(plot.viewport.maxY)"
              class="field-input"
              type="number"
              @input="emitViewportInput('maxY', $event.target.value)"
            />
          </div>
        </div>
        <div class="equation-plot-actions">
          <button type="button" @click="$emit('reset-viewport')">恢复自动视窗</button>
        </div>
      </div>
    </div>

    <div class="equation-plot-legend">
      <div
        v-for="item in legendItems"
        :key="item.label"
        class="equation-plot-legend-item"
      >
        <span
          :style="{ backgroundColor: item.color }"
          class="equation-plot-swatch"
        />
        <span>{{ item.label }}：{{ item.source }}</span>
      </div>
      <div
        v-if="plot.solutionPoints.length > 0"
        class="equation-plot-legend-item"
      >
        <span class="equation-plot-swatch equation-plot-swatch-solution" />
        <span>红点表示实数解</span>
      </div>
    </div>

    <div class="equation-plot-footer">
      视窗范围：{{ plot.xAxisVariable }} ∈ [{{ plot.viewport.minX.toFixed(3) }}, {{ plot.viewport.maxX.toFixed(3) }}]，
      {{ plot.yAxisVariable }} ∈ [{{ plot.viewport.minY.toFixed(3) }}, {{ plot.viewport.maxY.toFixed(3) }}]
    </div>
  </section>
</template>
