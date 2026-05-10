import { defineVitestPreset } from "@arshad-shah/internal-config/vitest.preset";
import { defineConfig } from "vitest/config";

export default defineConfig(defineVitestPreset({ environment: "jsdom" }));
