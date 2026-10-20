/**
 * 注册 cordis.patch.yml 里用到的 `{{cwd}}` 插值变量，不阻塞其他服务。
 *
 * 0.2.0 及更早：agent-loop 自己注册 `cwd`，本插件注入时宿主报「已注册」，沿用原注册。
 * 0.2.1-rc.2 起：agent-loop 只注册 provider / model，工作目录改由 working-directory
 * 上下文下发；personaSuffix 里的 `{{cwd}}` 会让 renderPrompt 抛 unknown prompt variable，
 * 整轮运行失败。这里等 systemPrompt / workingDirectory 就绪后把 `cwd` 注册回去，
 * 每次组装按当前会话取真实目录，跟随 cd 变更。
 */
export function installCwdPromptVariable(ctx) {
  return ctx.inject(["systemPrompt", "workingDirectory"], (host) => {
    try {
      host.systemPrompt.variable("cwd", ({ agent }) => agent
        ? host.workingDirectory.get(agent.session)
        : host.workingDirectory.defaultDirectory);
    } catch (error) {
      // 旧宿主（或其他插件）已经注册了 cwd：沿用原注册；其它错误照常抛出。
      if (!/^prompt variable "cwd" is already registered(?: \(| in this scope$|$)/.test(String(error?.message || ""))) {
        throw error;
      }
    }
  });
}
