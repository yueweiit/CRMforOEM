export const zhCN = {
  common: {
    appName: "客户开发CRM",
    appTagline: "外贸开发闭环",
    cancel: "取消",
    save: "保存",
    view: "查看",
    viewEmail: "查看邮件",
    language: "语言",
    loading: "加载中..."
  },
  nav: {
    dashboard: "工作台",
    customers: "客户开发",
    emailCenter: "邮件中心",
    followUps: "跟进任务",
    knowledge: "企业资料库",
    reports: "数据看板",
    settings: "系统设置"
  },
  auth: {
    email: "邮箱",
    password: "密码",
    login: "登录",
    loggingIn: "登录中...",
    loginFailed: "登录失败，请检查邮箱和密码。"
  },
  toast: {
    processing: "处理中",
    uploading: "上传中",
    loadingCreate: "正在提交数据，请稍候。",
    loadingUpdate: "正在保存修改，请稍候。",
    loadingDelete: "正在删除数据，请稍候。",
    loadingUpload: "正在上传文件，请稍候。",
    successCreateTitle: "操作成功",
    successUpdateTitle: "保存成功",
    successDeleteTitle: "删除成功",
    successUploadTitle: "上传成功",
    successCreate: "操作成功。",
    successUpdate: "保存成功。",
    successDelete: "删除成功。",
    successUpload: "上传成功。",
    errorCreate: "提交失败。",
    errorUpdate: "保存失败。",
    errorDelete: "删除失败。",
    errorUpload: "上传失败。",
    clientSuccessTitle: "success"
  },
  events: {
    taskGenerated: "新跟进任务已生成",
    requirementTask: "客户回复后已创建需求确认任务。",
    sampleTask: "已创建样品跟进任务，请确认样品测试反馈。",
    quoteTask: "已创建报价跟进任务，请确认客户报价反馈。",
    secondFollowUpTask: "首封邮件已发送，已创建二次跟进任务。",
    thirdFollowUpTask: "二次跟进已过期，已创建三次跟进任务。",
    customTask: "已创建后续跟进任务，请及时处理。",
    inboundMailReceived: "收到客户回复"
  }
} as const;
