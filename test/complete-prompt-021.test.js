import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ALL_PATCHES, applyReplacementsToText } from "../lib/core.js";
import { hostPromptKeepsInject } from "../lib/host-clean.js";

const patch40 = ALL_PATCHES.find((p) => p.id === 40);
assert.ok(patch40, "patch #40 COMPLETE_PROMPT_KEEP_INJECT must exist");

// @deepseek-ai/dsh-system-prompt@0.2.1-rc.2 lib/index.js 的 assemble 尾巴原文（tab 缩进）。
const TAIL_021 =
  "\t\tconst transformed = await this.ctx.waterfall(scopeTarget(this, scope), \"system-prompt/assemble\", assembly, context, () => Promise.resolve(assembly));\n" +
  "\t\tif (completeSection === void 0 && !runtimeContextSuppressed) return transformed;\n" +
  "\t\tconst requiredContexts = new Set([...contextByName.values()].filter((entry) => entry.required === true).map((entry) => entry.name));\n" +
  "\t\treturn {\n" +
  "\t\t\t...transformed,\n" +
  "\t\t\tsections: completeSection === void 0 ? transformed.sections : [completeSection],\n" +
  "\t\t\tcontexts: runtimeContextSuppressed ? transformed.contexts.filter((entry) => requiredContexts.has(entry.name)) : transformed.contexts\n" +
  "\t\t};";

// 0.2.0 的 assemble 尾巴（没有 requiredContexts，contexts 直接置 []）。
const TAIL_020 =
  "\t\tconst transformed = await this.ctx.waterfall(scopeTarget(this, scope), \"system-prompt/assemble\", assembly, context, () => Promise.resolve(assembly));\n" +
  "\t\tif (completeSection === void 0 && !runtimeContextSuppressed) return transformed;\n" +
  "\t\treturn {\n" +
  "\t\t\t...transformed,\n" +
  "\t\t\tsections: completeSection === void 0 ? transformed.sections : [completeSection],\n" +
  "\t\t\tcontexts: runtimeContextSuppressed ? [] : transformed.contexts\n" +
  "\t\t};";

const spaceIndent = (text) => text.replace(/^\t\t/gm, "      ").replace(/^\t/gm, "   ");

function checkSyntax(fragment) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-40-"));
  const fp = path.join(dir, "wrapped.mjs");
  fs.writeFileSync(fp, `export async function assemble(scope, context) {\n${fragment}\n}\n`);
  execFileSync(process.execPath, ["--check", fp]);
}

test("#40 matches the 0.2.1-rc.2 assemble tail and keeps requiredContexts", () => {
  assert.equal(hostPromptKeepsInject(TAIL_021), false);
  const { text, changed } = applyReplacementsToText(TAIL_021, patch40, "system-prompt/lib/index.js");
  assert.equal(changed, true);
  // 注入标记落盘，重启校验才认。
  assert.ok(text.includes("[dsh-purge] fold-complete inject first"));
  // 0.2.1 新增的 required context 过滤不能丢。
  assert.ok(text.includes("const requiredContexts = new Set("));
  assert.ok(text.includes("transformed.contexts.filter((entry) => requiredContexts.has(entry.name))"));
  // 旧的「只留 complete 段」形态必须消失。
  assert.ok(!text.includes(": [completeSection]"));
  assert.equal(hostPromptKeepsInject(text), true);
  checkSyntax(text);
});

test("#40 matches the 0.2.1 tail with space indentation too", () => {
  const { text, changed } = applyReplacementsToText(spaceIndent(TAIL_021), patch40, "system-prompt/lib/index.js");
  assert.equal(changed, true);
  assert.ok(text.includes("[dsh-purge] fold-complete inject first"));
  assert.ok(text.includes("requiredContexts"));
});

test("#40 still matches the 0.2.0 tail and does not invent requiredContexts", () => {
  const { text, changed } = applyReplacementsToText(TAIL_020, patch40, "system-prompt/lib/index.js");
  assert.equal(changed, true);
  assert.ok(text.includes("[dsh-purge] fold-complete inject first"));
  assert.ok(!text.includes("requiredContexts"));
  checkSyntax(text);
});

test("#40 leaves an already-patched 0.2.1 tail semantically intact", () => {
  const once = applyReplacementsToText(TAIL_021, patch40, "system-prompt/lib/index.js").text;
  const twice = applyReplacementsToText(once, patch40, "system-prompt/lib/index.js").text;
  // 再打一遍只允许原样或等价重写，绝不能把 requiredContexts 过滤打回 `[]`。
  assert.ok(twice.includes("transformed.contexts.filter((entry) => requiredContexts.has(entry.name))"));
  checkSyntax(twice);
});
