import { useMutation } from "@tanstack/react-query";
import { apiPost, clearSessionAndRedirect } from "../../api/http";

export function LogoutSection() {
  const logout = useMutation({
    mutationFn: () => apiPost("/auth/logout"),
    onSettled: () => clearSessionAndRedirect()
  });
  const currentUser = (() => {
    try {
      const raw = localStorage.getItem("currentUser");
      return raw ? JSON.parse(raw) as { name?: string; email?: string } : null;
    } catch {
      return null;
    }
  })();
  return (
    <div className="page-stack" style={{ alignItems: "center", paddingBlock: 40 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        {currentUser ? (
          <>
            <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{currentUser.name}</p>
            <p style={{ color: "var(--color-muted)", marginBlock: 4 }}>{currentUser.email}</p>
          </>
        ) : null}
        <p style={{ color: "var(--color-muted)", marginBlock: 16 }}>确认要登出当前账号吗？</p>
        <button
          className="primary-button"
          style={{ background: "var(--color-danger, #dc2626)", borderColor: "var(--color-danger, #dc2626)" }}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? "登出中..." : "确认登出"}
        </button>
      </div>
    </div>
  );
}
