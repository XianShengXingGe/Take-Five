import type { SupportedAgent, UnifiedEventType } from '../../types/event.js';

export interface LocaleEventTemplate {
  title: string;
  body: string;
}

export interface CliLocaleDictionary {
  description: string;
  commands: {
    notify: string;
    test: string;
    install: string;
    status: string;
    config: string;
    repair: string;
    uninstall: string;
  };
  options: {
    agent: string;
    event: string;
    project: string;
    reason: string;
    url: string;
    force: string;
    forceRepair: string;
    quiet: string;
    yes: string;
    json: string;
  };
  status: {
    title: string;
    barkTitle: string;
    configured: string;
    notConfigured: string;
    notConfiguredHint: string;
    agentsTitle: string;
    active: string;
    detectedHooksMissing: string;
    notDetected: string;
    enabled: string;
    disabled: string;
    configPath: string;
    backupPresent: string;
    backupNone: string;
    hooksRegistered: string;
    configTitle: string;
    language: string;
    debounceWindow: string;
    eventRules: string;
  };
  install: {
    intro: string;
    scanning: string;
    scanned: string;
    detectedTitle: string;
    noAgentsDetected: string;
    noAgentsNoteTitle: string;
    barkPrompt: string;
    barkEmptyError: string;
    cancelled: string;
    testingBark: string;
    barkSuccess: string;
    barkFail: string;
    failPrompt: string;
    retryInput: string;
    retrySend: string;
    forceSave: string;
    cancelChoice: string;
    languagePrompt: string;
    defaultRulesTitle: string;
    confirmRulesPrompt: string;
    savingConfig: string;
    savedConfig: string;
    outro: string;
  };
  config: {
    intro: string;
    menuPrompt: string;
    barkUrlOption: string;
    langOption: string;
    debounceOption: string;
    rulesOption: string;
    agentsOption: string;
    resetOption: string;
    saveOption: string;
    cancelOption: string;
    cancelledOutro: string;
    saveSuccessOutro: string;
    currentBarkPrompt: string;
    barkTesting: string;
    barkSuccessNote: string;
    barkFailConfirm: string;
    barkForceSaved: string;
    langPrompt: string;
    langUpdated: string;
    debouncePrompt: string;
    debounceUpdated: string;
    toggleAgentsPrompt: string;
    toggleEventsPrompt: string;
    resetConfirm: string;
    resetDone: string;
    editEventRulePrompt: string;
    editEventRuleToggle: string;
    editEventRuleLevel: string;
    editEventRuleTitle: string;
    editEventRuleBody: string;
    backOption: string;
  };
  repair: {
    scannerTitle: string;
    repaired: string;
    healthy: string;
    skipped: string;
    failed: string;
    summarySuccess: string;
    summaryFailed: string;
  };
  uninstall: {
    intro: string;
    confirmMessage: string;
    cancelledOutro: string;
    purging: string;
    purgeDone: string;
    summaryTitle: string;
    restoredFromBak: string;
    hooksRemoved: string;
    configPurged: string;
    credsPurged: string;
    outroSuccess: string;
  };
  test: {
    testingTitle: string;
    sent: string;
    missingCredError: string;
    skippedAgentDisabled: string;
    skippedEventDisabled: string;
    pushFailed: string;
    allSuccess: string;
  };
  notify: {
    sent: string;
    debounced: string;
    agentDisabled: string;
    eventDisabled: string;
    missingCred: string;
    pushFailed: string;
  };
  errors: {
    unsupportedAgent: string;
    unsupportedEvent: string;
  };
}

export interface LocaleDictionary {
  events: Record<UnifiedEventType, LocaleEventTemplate>;
  agents: Record<SupportedAgent, string>;
  cli: CliLocaleDictionary;
}

export const zhCN: LocaleDictionary = {
  events: {
    task_completed: {
      title: '✅ 任务完成',
      body: '恭喜！任务已完成',
    },
    waiting_input: {
      title: '⏳ 等待输入',
      body: 'Coding Agent 正在等待您的下一步输入',
    },
    waiting_permission: {
      title: '🔐 等待授权',
      body: 'Coding Agent 请求执行敏感操作，请审批',
    },
    task_failed: {
      title: '❌ 任务失败',
      body: 'Coding Agent 执行出错，请检查终端',
    },
  },
  agents: {
    claude: 'Claude Code',
    codex: 'Codex',
    opencode: 'OpenCode',
    antigravity: 'Antigravity',
  },
  cli: {
    description: '智能 Coding Agent 手机推送通知工具（支持 Codex, Claude Code, OpenCode, Antigravity）',
    commands: {
      notify: '为智能体生命周期事件发送推送通知',
      test: '发送测试推送通知以验证 Bark 配置与手机提醒',
      install: '交互式配置向导：设置 Bark 凭据、智能体及默认规则',
      status: '显示 Bark 连接状态、智能体钩子状态及通知规则',
      config: '交互式配置菜单：修改 Bark 凭据、通知规则及首选项',
      repair: '扫描并自动修复损坏或缺失的智能体通知钩子',
      uninstall: '完全还原智能体钩子、删除 ~/.takefive/ 并清除已存凭据',
    },
    options: {
      agent: '智能体名称（claude, codex, opencode, antigravity）',
      event: '生命周期事件类型（task_completed, waiting_input, waiting_permission, task_failed）',
      project: '项目工作区名称（省略时自动检测）',
      reason: '可选的附加上下文或错误信息',
      url: '直接覆盖 Bark 推送端点 URL',
      force: '绕过 2 秒防抖静默窗口',
      forceRepair: '强制重新注入所有智能体钩子',
      quiet: '静默模式，隐藏非错误输出',
      yes: '跳过确认提示直接执行完全清除',
      json: '以 JSON 格式输出状态',
    },
    status: {
      title: 'Take Five (片刻) · 系统状态',
      barkTitle: '📱 Bark 推送服务',
      configured: '✔ 已配置',
      notConfigured: '✖ 未配置',
      notConfiguredHint: '运行 "takefive install" 设置凭据。',
      agentsTitle: '🤖 编码智能体集成',
      active: '✔ 运行中',
      detectedHooksMissing: '⚠ 已检测到环境（钩子未注册）',
      notDetected: '○ 未检测到',
      enabled: '已启用',
      disabled: '已禁用',
      configPath: '配置路径',
      backupPresent: '已存在 (.takefive.bak)',
      backupNone: '无',
      hooksRegistered: '个事件已注册',
      configTitle: '⚙ 配置与通知规则',
      language: '当前语言',
      debounceWindow: '防抖窗口',
      eventRules: '事件规则',
    },
    install: {
      intro: ' Take Five (片刻) · 安装向导 ',
      scanning: '正在扫描已安装的 Coding Agent 环境...',
      scanned: '智能体环境扫描完成。',
      detectedTitle: '已检测到的 Coding Agent',
      noAgentsDetected: '用户主目录下未发现预设智能体配置。\n将为所有受支持的智能体配置默认通知钩子。',
      noAgentsNoteTitle: '智能体环境',
      barkPrompt: '请输入您的 Bark 服务器地址或设备推送 Key（如 https://api.day.app/YOUR_KEY/）：',
      barkEmptyError: 'Bark URL 或设备 Key 不能为空。',
      cancelled: '安装已取消。',
      testingBark: '正在发送测试推送通知以验证手机连通性...',
      barkSuccess: '✔ 测试通知已成功送达您的设备！📱',
      barkFail: '✖ 无法连接到 Bark 服务器：',
      failPrompt: 'Bark 推送发送失败，您希望如何处理？',
      retryInput: '重新输入 Bark URL / 设备 Key',
      retrySend: '重试发送测试通知',
      forceSave: '仍然保存此 URL（跳过连通性测试）',
      cancelChoice: '取消安装',
      languagePrompt: '选择首选通知与终端语言：',
      defaultRulesTitle: '默认通知规则',
      confirmRulesPrompt: '确认默认通知规则并继续保存配置？',
      savingConfig: '正在初始化配置到 ~/.takefive/config.json ...',
      savedConfig: '配置文件初始化成功。',
      outro: '✨ Take Five 安装配置成功完成！\n\n运行 takefive test 即可随时向手机发送测试推送通知。',
    },
    config: {
      intro: ' Take Five (片刻) · 偏好设置 ',
      menuPrompt: '请选择您想要配置的项目：',
      barkUrlOption: '📱 Bark 服务器 URL / 设备 Key',
      langOption: '🌐 界面与通知语言',
      debounceOption: '⏱  防抖静默窗口',
      rulesOption: '🔔 单项事件通知规则',
      agentsOption: '🤖 启用的智能体列表',
      resetOption: '🔄 恢复所有默认设置',
      saveOption: '💾 保存并退出',
      cancelOption: '❌ 取消（放弃未保存的更改）',
      cancelledOutro: '已取消配置，未保存任何更改。',
      saveSuccessOutro: '✔ 配置已成功保存至 ~/.takefive/config.json！',
      currentBarkPrompt: '请输入新的 Bark 服务器 URL 或设备 Key',
      barkTesting: '正在验证 Bark 推送端点...',
      barkSuccessNote: 'Bark 凭据已安全保存到系统钥匙串中。',
      barkFailConfirm: '虽然测试未通过，仍要强行保存此 Bark URL 吗？',
      barkForceSaved: 'Bark 凭据已保存（未通过测试验证）。',
      langPrompt: '选择首选通知与终端显示语言：',
      langUpdated: '语言已更新为',
      debouncePrompt: '请输入防抖冷却时间（秒，默认 2）：',
      debounceUpdated: '防抖时间已设置为',
      toggleAgentsPrompt: '选择要开启/关闭的智能体，或返回：',
      toggleEventsPrompt: '选择要配置的事件类型，或返回：',
      resetConfirm: '确定要将所有配置重置为出厂默认值吗？',
      resetDone: '配置已重置为默认值（尚未保存到磁盘）。',
      editEventRulePrompt: '配置事件规则',
      editEventRuleToggle: '启用状态',
      editEventRuleLevel: '推送紧急级别',
      editEventRuleTitle: '自定义标题',
      editEventRuleBody: '自定义正文',
      backOption: '⬅ 返回上一级菜单',
    },
    repair: {
      scannerTitle: 'Take Five (片刻) · 钩子修复扫描器',
      repaired: '钩子已修复并重新注册',
      healthy: '钩子状态正常（未检测到漂移）',
      skipped: '未找到环境，已跳过',
      failed: '修复失败',
      summarySuccess: '✔ 钩子修复完成。',
      summaryFailed: '✖ 钩子修复结束，存在错误。',
    },
    uninstall: {
      intro: ' Take Five (片刻) · 卸载程序 ',
      confirmMessage: '确定要彻底卸载 Take Five 吗？\n这将还原所有智能体配置钩子、删除 ~/.takefive/ 并清除系统钥匙串中的凭据。',
      cancelledOutro: '卸载已取消，未进行任何修改。',
      purging: '正在清除 Take Five 配置、智能体钩子及凭据...',
      purgeDone: '清除完成。',
      summaryTitle: '卸载摘要：',
      restoredFromBak: '已从 .takefive.bak 恢复',
      hooksRemoved: '个钩子已清除',
      configPurged: '配置目录：~/.takefive/ 已完全删除',
      credsPurged: '系统凭据：com.takefive.cli 密钥已从钥匙串中清除',
      outroSuccess: '✨ Take Five 已完全卸载，系统中无任何残留。',
    },
    test: {
      testingTitle: '正在测试 Take Five 手机推送通知',
      sent: '发送成功',
      missingCredError: '错误: Bark URL 尚未配置。请运行 "takefive install" 设置凭据。',
      skippedAgentDisabled: '已跳过：智能体在配置中处于禁用状态。',
      skippedEventDisabled: '已跳过：事件在配置中处于禁用状态。',
      pushFailed: '推送失败',
      allSuccess: '条测试通知全部发送成功。',
    },
    notify: {
      sent: '通知已发送',
      debounced: '通知已跳过：处于防抖冷却窗口期。',
      agentDisabled: '通知已跳过：智能体在配置中处于禁用状态。',
      eventDisabled: '通知已跳过：事件在配置中处于禁用状态。',
      missingCred: '错误: Bark URL 尚未配置。请运行 "takefive install" 设置凭据。',
      pushFailed: '推送失败',
    },
    errors: {
      unsupportedAgent: '错误: 不支持的智能体',
      unsupportedEvent: '错误: 不支持的事件类型',
    },
  },
};

