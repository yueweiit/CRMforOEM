import { Mail, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/settings";
import { LanguageSelect } from "../components/LanguageSelect";
import { useI18n } from "../i18n";

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    roleCodes: string[];
    permissions?: string[];
    dataScope: string;
  };
};

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [email, setEmail] = useState("admin@oem-crm.local");
  const [password, setPassword] = useState("Admin@123456");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await login<LoginResponse>(email, password);
      localStorage.setItem("accessToken", response.accessToken);
      localStorage.setItem("refreshToken", response.refreshToken);
      localStorage.setItem("currentUser", JSON.stringify(response.user));
      navigate("/dashboard", { replace: true });
    } catch {
      setError(t("auth.loginFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="brand-block login-brand">
          <div className="brand-mark">OEM</div>
          <div>
            <strong>{t("common.appName")}</strong>
            <span>Sales intelligence workspace</span>
          </div>
        </div>
        <LanguageSelect className="login-language-select" />
        <label>
          <span>{t("auth.email")}</span>
          <div className="input-with-icon">
            <Mail size={16} />
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="sales@example.com" />
          </div>
        </label>
        <label>
          <span>{t("auth.password")}</span>
          <div className="input-with-icon">
            <LockKeyhole size={16} />
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="********" />
          </div>
        </label>
        {error ? <div className="error-state">{error}</div> : null}
        <button className="primary-button" disabled={!email || !password || isSubmitting}>{isSubmitting ? t("auth.loggingIn") : t("auth.login")}</button>
      </form>
    </main>
  );
}
