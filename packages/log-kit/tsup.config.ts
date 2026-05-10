import { definePackagePreset } from "@arshad-shah/internal-config/tsup.preset";

export default definePackagePreset({
	index: "src/index.ts",
	"transports/console": "src/transports/console.ts",
	"transports/http": "src/transports/http.ts",
	"transports/file": "src/transports/file.ts",
	"transports/datadog": "src/transports/datadog.ts",
});
