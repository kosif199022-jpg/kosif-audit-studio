import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./db/schema.ts", "./db/cloud-schema.ts"],
  out: "./drizzle",
});
