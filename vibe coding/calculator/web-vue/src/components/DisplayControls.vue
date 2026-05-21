<script setup>
defineProps({
  angleUnit: {
    type: String,
    required: true,
  },
  displayMode: {
    type: String,
    required: true,
  },
});

defineEmits(["update:angleUnit", "update:displayMode"]);
</script>

<template>
  <div class="toolbar">
    <div class="select-card">
      <label for="displayMode">结果显示模式</label>
      <select
        id="displayMode"
        :value="displayMode"
        @change="$emit('update:displayMode', $event.target.value)"
      >
        <option value="plain">普通</option>
        <option value="rect">直角坐标</option>
        <option value="polar">相量</option>
        <option value="debug">调试</option>
      </select>
    </div>

    <div class="select-card">
      <label for="angleUnit">角度单位</label>
      <select
        id="angleUnit"
        :value="angleUnit"
        @change="$emit('update:angleUnit', $event.target.value)"
      >
        <option value="rad">弧度</option>
        <option value="deg">角度</option>
      </select>
    </div>
  </div>
</template>
