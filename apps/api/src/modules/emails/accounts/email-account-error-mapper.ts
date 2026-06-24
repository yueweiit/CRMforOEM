export function buildEmailTestSummary(
  smtp: { ok: boolean; message: string },
  imap: { ok: boolean; message: string }
) {
  if (smtp.ok && imap.ok) return "SMTP 与 IMAP 均连接正常。";
  if (smtp.ok && !imap.ok) return `SMTP 正常，${imap.message} 该邮箱当前可用于发信，但无法同步回复。`;
  if (!smtp.ok && imap.ok) return `IMAP 正常，${smtp.message} 该邮箱当前可用于收信同步，但无法用于发信。`;
  return `${smtp.message} ${imap.message}`.trim();
}

export function mapSmtpTestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const response = typeof error === "object" && error && "response" in error ? String((error as { response?: unknown }).response ?? "") : "";
  const detail = `${code} ${message} ${response}`.toLowerCase();
  if (detail.includes("invalid login") || detail.includes("auth") || detail.includes("eauth") || detail.includes("535") || detail.includes("username and password not accepted")) return "SMTP 认证失败，请检查用户名或授权码是否正确。";
  if (detail.includes("etimedout") || detail.includes("econnection") || detail.includes("esocket") || detail.includes("ssl") || detail.includes("tls") || detail.includes("certificate") || detail.includes("greeting never received")) return "SMTP 连接失败，请检查服务器地址、端口或 SSL 配置是否正确。";
  return "SMTP 测试失败，请检查服务器地址、端口、SSL、用户名和授权码配置。";
}

export function mapImapTestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const response = typeof error === "object" && error && "response" in error ? String((error as { response?: unknown }).response ?? "") : "";
  const responseText = typeof error === "object" && error && "responseText" in error ? String((error as { responseText?: unknown }).responseText ?? "") : "";
  const authenticationFailed = typeof error === "object" && error && "authenticationFailed" in error ? Boolean((error as { authenticationFailed?: unknown }).authenticationFailed) : false;
  const detail = `${message} ${response} ${responseText}`.toLowerCase();
  if (detail.includes("custom imap off") || detail.includes("imap off")) return "IMAP 未开启，请先在邮箱后台启用 IMAP 或第三方客户端访问。";
  if (authenticationFailed || detail.includes("login failed") || detail.includes("authentication failed") || detail.includes("invalid credentials")) return "IMAP 登录失败，请检查用户名或授权码是否正确。";
  if (detail.includes("etimedout") || detail.includes("econnection") || detail.includes("esocket") || detail.includes("ssl") || detail.includes("tls") || detail.includes("certificate") || detail.includes("greeting never received")) return "IMAP 连接失败，请检查服务器地址、端口或 SSL 配置是否正确。";
  return "IMAP 测试失败，请检查是否已开启 IMAP、服务器地址、端口、SSL、用户名和授权码配置。";
}
