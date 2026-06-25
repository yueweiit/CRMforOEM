import "reflect-metadata";
import * as assert from "node:assert/strict";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { AiModule } from "./ai.module";
import { AiSummaryCache } from "./services/ai-summary-cache.service";

function run() {
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AiModule) as unknown[];
  const cacheProvider = providers.find((provider) =>
    provider && typeof provider === "object" && (provider as { provide?: unknown }).provide === AiSummaryCache
  ) as { provide: unknown; useFactory?: unknown } | undefined;

  assert.ok(cacheProvider, "AiSummaryCache should be registered through an explicit provider");
  assert.equal(typeof cacheProvider.useFactory, "function", "AiSummaryCache provider should use a factory");
  assert.equal(providers.includes(AiSummaryCache), false, "AiSummaryCache should not be registered as a bare class provider");

  console.log("ai.module.spec.ts OK");
}

run();
