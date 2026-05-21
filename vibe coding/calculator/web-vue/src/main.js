import { createApp } from "vue";
import App from "./App.vue";
import { useDiagnostics } from "./composables/useDiagnostics.js";
import "./styles.css";

const app = createApp(App);
const diagnostics = useDiagnostics();

diagnostics.installGlobalHandlers();

app.config.errorHandler = (error, instance, info) => {
  diagnostics.recordError("vue", error, {
    detail: {
      component: instance?.type?.name || "anonymous",
      info,
    },
    message: `Vue 运行错误：${info}`,
  });
};

app.mount("#app");
