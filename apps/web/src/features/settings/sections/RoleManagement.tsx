import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPermissions, getRoles, updateRolePermissions } from "../../../api/settings";
import { getCurrentUser, hasPermission } from "../../../auth/permissions";
import { notifyMutationStep } from "../../../components/Toast";
import { useI18n } from "../../../i18n";
import type { TranslationKey } from "../../../i18n/resources";
import type { RoleRow, PermissionRow } from "../shared/types";

// Role inheritance: direct parent → child (parent includes all descendant permissions recursively)
const ROLE_CHILDREN: Record<string, string[]> = {
  ADMIN: ["EXECUTIVE", "OPERATOR"],
  EXECUTIVE: ["SALES_MANAGER"],
  SALES_MANAGER: ["SALES_REP"],
  SALES_REP: [],
  OPERATOR: []
};

const ROLE_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  ADMIN: "settings.roleManagement.roles.admin",
  EXECUTIVE: "settings.roleManagement.roles.executive",
  SALES_MANAGER: "settings.roleManagement.roles.salesManager",
  SALES_REP: "settings.roleManagement.roles.salesRep",
  OPERATOR: "settings.roleManagement.roles.operator"
};

const MODULE_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  customers: "settings.roleManagement.modules.customers",
  website: "settings.roleManagement.modules.website",
  research: "settings.roleManagement.modules.research",
  scoring: "settings.roleManagement.modules.scoring",
  emails: "settings.roleManagement.modules.emails",
  dashboards: "settings.roleManagement.modules.dashboards",
  knowledge: "settings.roleManagement.modules.knowledge",
  settings: "settings.roleManagement.modules.settings"
};

const PERMISSION_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  "dashboards.personal": "permissions.dashboards.personal.legacy"
};

type Translate = (key: TranslationKey) => string;

function localizedLabel(key: TranslationKey | undefined, fallback: string, t: Translate) {
  if (!key) return fallback;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

function localizedRoleLabel(code: string, fallback: string, t: Translate) {
  return localizedLabel(ROLE_TRANSLATION_KEYS[code], fallback, t);
}

function localizedModuleLabel(module: string, fallback: string, t: Translate) {
  return localizedLabel(MODULE_TRANSLATION_KEYS[module], fallback, t);
}

function localizedPermissionLabel(code: string, fallback: string, t: Translate) {
  return localizedLabel(PERMISSION_TRANSLATION_KEYS[code] ?? `permissions.${code}` as TranslationKey, fallback, t);
}

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
  const { t } = useI18n();

  const { data: roles = [] } = useQuery({
    queryKey: ["settings-roles"],
    queryFn: () => getRoles<RoleRow[]>()
  });
  const { data: allPermissions = [] } = useQuery({
    queryKey: ["settings-permissions"],
    queryFn: () => getPermissions<PermissionRow[]>()
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
    mutationFn: () => updateRolePermissions<{ permissionCodes: string[]; expandedFrom: string[] }>(selectedRoleId, [...editedCodes]),
    onMutate: () => notifyMutationStep({ phase: "loading", title: t("settings.roleManagement.savingTitle"), message: t("settings.roleManagement.savingMessage"), dedupeKey: "role-permissions-save" }),
    onSuccess: (result: { permissionCodes: string[]; expandedFrom: string[] }) => {
      notifyMutationStep({
        phase: "success",
        title: t("settings.roleManagement.saveSuccessTitle"),
        message: t("settings.roleManagement.saveSuccessMessage").replace("{direct}", String(result.expandedFrom.length)).replace("{total}", String(result.permissionCodes.length))
      });
      queryClient.invalidateQueries({ queryKey: ["settings-roles"] });
      setHasChanges(false);
    },
    onError: (error) => {
      notifyMutationStep({ phase: "error", title: t("settings.roleManagement.saveFailedTitle"), message: error instanceof Error ? error.message : t("settings.roleManagement.saveFailedMessage") });
    }
  });

  // Select first role on load
  useEffect(() => {
    if (roles.length && !selectedRoleId) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  if (!roles.length) return <div className="empty-state">{t("settings.roleManagement.noRoles")}</div>;

  const sortedRoles = [...roles].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

  return (
    <div className="content-grid settings-role-grid">
      {/* Left: role list */}
      <nav className="settings-role-sidebar">
        <div className="settings-role-sidebar-title">
          {t("settings.roleManagement.roleList")}
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
              <div className="settings-role-card-name">{localizedRoleLabel(role.code, role.name, t)}</div>
              <div className="settings-role-card-meta">
                {role.dataScope === "ALL" ? t("settings.roleManagement.allData") : role.dataScope === "TEAM" ? t("settings.roleManagement.teamData") : t("settings.roleManagement.personalData")}
                {childCodes.length > 0 ? (
                  <span style={{ marginLeft: 6 }}>
                    {t("settings.roleManagement.inheritsRoles").replace("{roles}", childCodes.map((code) => localizedRoleLabel(code, code, t)).join(", "))}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Right: permission grid */}
      <div className="page-stack">
        {!canEdit ? (
          <div className="empty-state" style={{ background: "#fef9c3", color: "#854d0e", padding: 12, borderRadius: 6, fontSize: 13 }}>
            {t("settings.roleManagement.readOnlyHint")}
          </div>
        ) : null}

        <div className="empty-state" style={{ fontSize: 13 }}>
          {t("settings.roleManagement.inheritanceHint")}
        </div>

        {selectedRole ? (
          <>
            {moduleGroups.map(([module, { group, permissions }]) => (
              <section className="panel" key={module}>
                <div className="panel-title">
                  <h2>{localizedModuleLabel(module, group, t)}</h2>
                  <span>{t("settings.roleManagement.permissionCount").replace("{current}", String(permissions.filter((p) => effectiveCodes.has(p.code)).length)).replace("{total}", String(permissions.length))}</span>
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
                            isInheritedOnly ? t("settings.roleManagement.inheritedTooltip") : "",
                            isNowDirect ? t("settings.roleManagement.directTooltip") : "",
                            wasDirect && !isChecked ? t("settings.roleManagement.removedTooltip") : "",
                            hasDep ? t("settings.roleManagement.dependsTooltip").replace("{deps}", perm.dependsOn.map((dependency) => localizedPermissionLabel(dependency, dependency, t)).join(", ")) : ""
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
                          {localizedPermissionLabel(perm.code, perm.name, t)}
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
                    if (window.confirm(t("settings.roleManagement.confirmSave"))) {
                      saveRole.mutate();
                    }
                  }}
                >
                  {saveRole.isPending ? t("settings.roleManagement.saving") : t("settings.roleManagement.saveRolePermissions")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setEditedCodes(new Set(selectedRole.rolePermissions.map((rp) => rp.permission.code)));
                    setHasChanges(false);
                  }}
                >
                  {t("settings.roleManagement.cancelEdit")}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
