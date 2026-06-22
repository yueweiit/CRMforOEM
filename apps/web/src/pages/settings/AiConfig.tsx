export function AiConfig() {
  return <div className="detail-grid"><div className="detail-block"><strong>OPENAI_API_KEY</strong><span>已在服务端 .env 中配置，不在前端展示。</span></div><div className="detail-block"><strong>AI_BASE_URL</strong><span>当前使用 OpenAI 兼容网关地址。</span></div><div className="detail-block"><strong>AI_MODEL</strong><span>当前模型：astron-code-latest。</span></div></div>;
}
