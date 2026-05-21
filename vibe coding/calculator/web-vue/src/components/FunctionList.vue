<script setup>
defineProps({
  functions: {
    type: Array,
    required: true,
  },
});

defineEmits(["delete", "edit", "insert"]);
</script>

<template>
  <section class="panel info-card">
    <h2 class="panel-title">已保存函数</h2>
    <div class="function-stack">
      <div v-if="functions.length === 0" class="function-empty">当前还没有已保存函数。</div>
      <div
        v-for="definition in functions"
        :key="definition.name"
        class="function-item"
      >
        <div class="function-item-header">
          <div class="function-item-title">
            {{ definition.name }}({{ definition.parameters.map((item) => item.name).join(", ") }})
          </div>
          <div class="function-item-actions">
            <button type="button" @click="$emit('edit', definition.name)">编辑</button>
            <button type="button" @click="$emit('insert', definition.name)">插入调用</button>
            <button data-tone="danger" type="button" @click="$emit('delete', definition.name)">删除</button>
          </div>
        </div>
        <div class="function-item-body">{{ definition.metadata.source }}</div>
      </div>
    </div>
  </section>
</template>
