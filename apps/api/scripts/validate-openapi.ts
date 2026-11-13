import { fileURLToPath } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";

const specification = await SwaggerParser.validate(
  fileURLToPath(new URL("../../../openapi.yaml", import.meta.url)),
  { resolve: { external: false } },
);
const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);
const count = Object.values(specification.paths ?? {}).reduce((total, path) =>
  total + Object.keys(path ?? {}).filter(key => methods.has(key)).length, 0);
console.log(`OpenAPI ${specification.info.version} validated: ${count} operations (8 application + health + readiness).`);
