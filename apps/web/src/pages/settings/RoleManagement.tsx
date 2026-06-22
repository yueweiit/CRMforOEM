import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../../api/http";
import { getCurrentUser, hasPermission } from "../../auth/permissions";
import { notifyMutationStep } from "../../components/Toast";
import type { RoleRow, PermissionRow } from "./types";

// Role inheritance: direct parent → child (parent includes all descendant permissions recursively)
const ROLE_CHILDREN: Record<string, string[]> = {
  ADMIN: ["EXECUTIVE", "OPERATOR"],
  EXECUTIVE: ["SALES_MANAGER"],
  SALES_MANAGER: ["SALES_REP"],
  SALES_REP: [],
  OPERATOR: []
};

function collectDescendantCodes(rootCode: string): string[] {
  const result = new Set<string>();
  const queue = [...(ROLE_CHILDREN[rootCode] ?? [])];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    result.add(current);

    for (const child of ROLE_CHILDREN[current] ?? []) {
      if (!visited.has(child)) queue.push(child);
    }
  }

  return [...result];
}

function computeInheritedPermissionCodes(selectedRoleCode: string, allRoles: RoleRow[]): Set<string> {
  const descendantCodes = collectDescendantCodes(selectedRoleCode);
  const codes = new Set<string>();
  for (const descendantCode of descendantCodes) {
    const descendantRole = allRoles.find((r) => r.code === descendantCode);
    if (descendantRole) {
      for (const rp of descendantRole.rolePermissions) {
        codes.add(rp.permission.code);
      }
    }
  }
  return codes;
}

export function RoleManagement() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const canEdit = hasPermission(currentUser, "settings.roles.manage");

  const { data: roles = [] } = useQuery({
    queryKey: ["settings-roles"],
    queryFn: () => apiGet<RoleRow[]>("/settings/roles")
  });
  const { data: allPermissions = [] } = useQuery({
    queryKey: ["settings-permissions"],
    queryFn: () => apiGet<PermissionRow[]>("/settings/permissions")
  });

  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [editedCodes, setEditedCodes] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const directCodes = new Set(selectedRole?.rolePermissions.map((rp) => rp.permission.code) ?? []);
  const inheritedCodes = selectedRole ? computeInheritedPermissionCodes(selectedRole.code, roles) : new Set<string>();
  const effectiveCodes = new Set([...directCodes, ...inheritedCodes]);

  // Group permissions by module
  const moduleGroups = useMemo(() => {
    const map = new Map<string, { group: string; permissions: PermissionRow[] }>();
    for (const perm of allPermissions) {
      const mod = perm.module || "other";
      if (!map.has(mod)) map.set(mod, { group: perm.group || mod, permissions: [] });
      map.get(mod)!.permissions.push(perm);
    }
    return [...map.entries()].sort((a, b) => {
      // System settings last, others alphabetical
      if (a[0] === "settings") return 1;
      if (b[0] === "settings") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [allPermissions]);

  // Sync editedCodes when selected role changes
  useEffect(() => {
    if (selectedRole) {
      setEditedCodes(new Set(selectedRole.rolePermissions.map((rp) => rp.permission.code)));
      setHasChanges(false);
      setSelectedRoleId(selectedRole.id);
    }
  }, [selectedRoleId]);

  function togglePermission(code: string) {
    if (!canEdit) return;
    // Inherited-only permissions cannot be toggled
    if (inheritedCodes.has(code) && !directCodes.has(code)) return;

    const next = new Set(editedCodes);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
      // Recursively add all transitive dependencies
      const queue = [code];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const perm = allPermissions.find((p) => p.code === cur);
        if (perm?.dependsOn) {
          for (const dep of perm.dependsOn) {
            if (!next.has(dep)) {
              next.add(dep);
              queue.push(dep);
            }
          }
        }
      }
    }
    setEditedCodes(next);
    setHasChanges(true);
  }

  const saveRole = useMutation({
    mutationFn: () => apiPatch<{ permissionCodes: string[]; expandedFrom: string[] }>(`/settings/roles/${selectedRoleId}/permissions`, { permissionCodes: [...editedCodes] }),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "保存中", message: "正在保存角色权限配置。", dedupeKey: "role-permissions-save" }),
    onSuccess: (result: { permissionCodes: string[]; expandedFrom: string[] }) => {
      notifyMutationStep({
        phase: "success",
        title: "保存成功",
        message: `角色权限已更新（${result.expandedFrom.length} 项直接授权，展开为 ${result.permissionCodes.length} 项含依赖）。相关用户需重新登录后生效。`
      });
      queryClient.invalidateQueries({ queryKey: ["settings-roles"] });
      setHasChanges(false);
    },
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: "保存失败", message: error instanceof Error ? error.message : "保存失败" });
    }
  });

  // Select first role on load
  useEffect(() => {
    if (roles.length && !selectedRoleId) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  if (!roles.length) return <div className="empty-state">暂无角色数据。</div>;

  const sortedRoles = [...roles].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

  return (
    <div className="content-grid settings-role-grid">
      {/* Left: role list */}
      <nav className="settings-role-sidebar">
        <div className="settings-role-sidebar-title">
          角色列表
        </div>
        {sortedRoles.map((role) => {
          const childCodes = ROLE_CHILDREN[role.code] ?? [];
          const isActive = role.id === selectedRoleId;
          return (
            <button
              key={role.id}
              className={`settings-role-card${isActive ? " active" : ""}`}
              onClick={() => { setSelectedRoleId(role.id); }}
              type="button"
            >
              <div className="settings-role-card-name">{role.name}</div>
              <div className="settings-role-card-meta">
                {role.dataScope === "ALL" ? "全部数据" : role.dataScope === "TEAM" ? "团队数据" : "个人数据"}
                {childCodes.length > 0 ? <span style={{ marginLeft: 6 }}>▸ {childCodes.join(", ")}</span> : null}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Right: permission grid */}
      <div className="page-stack">
        {!canEdit ? (
          <div className="empty-state" style={{ background: "#fef9c3", color: "#854d0e", padding: 12, borderRadius: 6, fontSize: 13 }}>
            当前账号仅可查看角色权限，只有拥有"角色权限管理"权限的用户可以修改。
          </div>
        ) : null}

        <div className="empty-state" style={{ fontSize: 13 }}>
          上级角色自动拥有下级角色的全部权限。灰色虚线勾选表示来自下级角色包含，不可在当前角色中单独取消。
        </div>

        {selectedRole ? (
          <>
            {moduleGroups.map(([module, { group, permissions }]) => (
              <section className="panel" key={module}>
                <div className="panel-title">
                  <h2>{group}</h2>
                  <span>{permissions.filter((p) => effectiveCodes.has(p.code)).length}/{permissions.length} 项</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                  {permissions.map((perm) => {
                    const wasDirect = directCodes.has(perm.code);
                    const isChecked = editedCodes.has(perm.code);
                    const isInheritedOnly = inheritedCodes.has(perm.code) && !wasDirect;
                    const isNowDirect = editedCodes.has(perm.code) && !isInheritedOnly;
                    const hasDep = perm.dependsOn?.length > 0;

                    return (
                      <label
                        key={perm.code}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 0",
                          cursor: isInheritedOnly ? "default" : canEdit ? "pointer" : "default",
                          opacity: isInheritedOnly ? 0.6 : 1,
                          fontSize: 13
                        }}
                        title={
                          [
                            isInheritedOnly ? "来自下级角色继承，不可在当前角色单独取消" : "",
                            isNowDirect ? "当前角色直接授权" : "",
                            wasDirect && !isChecked ? "已从当前角色移除，保存后生效" : "",
                            hasDep ? `依赖：${perm.dependsOn.join("、")}` : ""
                          ].filter(Boolean).join("\n") || perm.name
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!canEdit || isInheritedOnly}
                          onChange={() => togglePermission(perm.code)}
                          style={isInheritedOnly ? { accentColor: "var(--color-muted)", opacity: 0.5 } : undefined}
                        />
                        <span style={{ flex: 1 }}>
                          {perm.name}
                          <span style={{ color: "var(--color-muted)", fontSize: 11, marginLeft: 4 }}>{perm.code}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            {canEdit && hasChanges ? (
              <div className="toolbar" style={{ gap: 8 }}>
                <button
                  className="primary-button"
                  disabled={saveRole.isPending}
                  onClick={() => {
                    if (window.confirm("修改角色权限会影响该角色下所有用户。保存后相关用户可能需要重新登录。确认保存？")) {
                      saveRole.mutate();
                    }
                  }}
                >
                  {saveRole.isPending ? "保存中..." : "保存角色权限"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setEditedCodes(new Set(selectedRole.rolePermissions.map((rp) => rp.permission.code)));
                    setHasChanges(false);
                  }}
                >
                  取消修改
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
