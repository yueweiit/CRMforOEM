import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

// [code, name, module, group, dependsOn[]]
const permissionDefs: Array<[string, string, string, string, string[]]> = [
  // 客户管理
  ["customers.read", "View customers", "customers", "客户管理", []],
  ["customers.write", "Create and update customers", "customers", "客户管理", ["customers.read"]],
  ["customers.assign", "Assign customers", "customers", "客户管理", ["customers.read"]],
  // 官网分析
  ["website.analyze", "Analyze customer websites", "website", "官网分析", ["customers.read"]],
  // 背调报告
  ["research.generate", "Generate research reports", "research", "背调报告", ["customers.read"]],
  // OEM 评分
  ["scoring.generate", "Generate OEM fit scores", "scoring", "OEM评分", ["customers.read"]],
  // 邮件中心
  ["emails.generate", "Generate email drafts", "emails", "邮件中心", ["customers.read"]],
  ["emails.send", "Send approved emails", "emails", "邮件中心", ["customers.read", "emails.generate"]],
  ["emails.approve", "Approve email drafts", "emails", "邮件中心", ["emails.generate"]],
  ["emails.accounts.manage_personal", "Manage personal email accounts", "emails", "邮件中心", []],
  ["emails.accounts.manage_shared", "Manage shared email accounts", "emails", "邮件中心", ["emails.accounts.manage_personal"]],
  // 报价管理
  ["quotes.read", "View quotes", "quotes", "报价管理", ["customers.read"]],
  ["quotes.write", "Create and update quotes", "quotes", "报价管理", ["quotes.read"]],
  ["quotes.approve", "Approve quotes", "quotes", "报价管理", ["quotes.read"]],
  ["quotes.export", "Export quotes", "quotes", "报价管理", ["quotes.read"]],
  ["quotes.send", "Send approved quotes", "quotes", "报价管理", ["quotes.read", "emails.send"]],
  ["quotes.reference.read", "Reference historical quotes", "quotes", "报价管理", ["quotes.read"]],
  ["quotes.resolve_reply", "Resolve customer quote replies", "quotes", "报价管理", ["quotes.read"]],
  // 数据看板
  ["dashboards.personal.view", "View personal workbench", "dashboards", "数据看板", []],
  ["dashboards.view", "View team/management dashboards", "dashboards", "数据看板", ["customers.read"]],
  // 企业资料库
  ["knowledge.write", "Maintain company knowledge base", "knowledge", "企业资料库", []],
  // 系统设置
  ["settings.users.manage", "Manage users", "settings", "系统设置", []],
  ["settings.roles.manage", "Manage roles and permissions", "settings", "系统设置", []],
  ["settings.audit_logs.read", "View audit logs", "settings", "系统设置", []],
  ["settings.customer_dictionaries.manage", "Manage customer dictionaries", "settings", "系统设置", []],
  ["settings.blacklist.manage", "Manage blacklist rules", "settings", "系统设置", []],
  ["settings.ai_config.manage", "Manage AI configuration", "settings", "系统设置", []],
  ["settings.scoring_weights.manage", "Manage OEM scoring weights", "settings", "系统设置", []],
  ["settings.email_prompt.manage", "Manage email prompt configuration", "settings", "系统设置", []],
  // 兼容旧权限码（双写过渡期）
  ["dashboards.personal", "View personal dashboards (legacy)", "dashboards", "数据看板", []],
  ["dashboards.team", "View team dashboards (legacy)", "dashboards", "数据看板", []],
  ["dashboards.management", "View management dashboards (legacy)", "dashboards", "数据看板", []],
  ["settings.manage", "Manage system settings (legacy)", "settings", "系统设置", []]
];

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "default-org" },
    update: {},
    create: {
      id: "default-org",
      name: "OEM CRM Demo Organization"
    }
  });

  const team = await prisma.team.upsert({
    where: { id: "default-sales-team" },
    update: {},
    create: {
      id: "default-sales-team",
      organizationId: organization.id,
      name: "Sales Team"
    }
  });

  const createdPermissions = await Promise.all(
    permissionDefs.map(([code, name, module, group, dependsOn]) =>
      prisma.permission.upsert({
        where: { organizationId_code: { organizationId: organization.id, code } },
        update: { name, module, group, dependsOn: dependsOn as never },
        create: { organizationId: organization.id, code, name, module, group, dependsOn: dependsOn as never }
      })
    )
  );

  const roleDefinitions = [
    { code: "ADMIN", name: "系统管理员", dataScope: "ALL", level: 100,
      permissionCodes: permissionDefs.map(([code]) => code) },
    {
      code: "EXECUTIVE", name: "管理层", dataScope: "ALL", level: 80,
      permissionCodes: [
        "customers.read",
        "dashboards.personal.view",
        "dashboards.view",
        "dashboards.personal", "dashboards.team", "dashboards.management",
        "emails.accounts.manage_shared",
        "quotes.read",
        "quotes.approve",
        "quotes.export",
        "quotes.reference.read",
        "settings.scoring_weights.manage",
        "settings.blacklist.manage",
        "settings.customer_dictionaries.manage",
        "scoring.generate"
      ]
    },
    {
      code: "SALES_MANAGER", name: "销售主管", dataScope: "TEAM", level: 60,
      permissionCodes: [
        "customers.read",
        "customers.write",
        "customers.assign",
        "research.generate",
        "website.analyze",
        "scoring.generate",
        "emails.generate",
        "emails.approve",
        "emails.send",
        "quotes.read",
        "quotes.write",
        "quotes.approve",
        "quotes.export",
        "quotes.send",
        "quotes.reference.read",
        "quotes.resolve_reply",
        "dashboards.personal.view",
        "dashboards.view",
        "dashboards.personal", "dashboards.team"
      ]
    },
    {
      code: "SALES_REP", name: "业务员", dataScope: "SELF", level: 40,
      permissionCodes: [
        "customers.read",
        "customers.write",
        "research.generate",
        "website.analyze",
        "scoring.generate",
        "emails.generate",
        "emails.send",
        "emails.accounts.manage_personal",
        "quotes.read",
        "quotes.write",
        "quotes.export",
        "quotes.send",
        "quotes.reference.read",
        "quotes.resolve_reply",
        "dashboards.personal.view",
        "dashboards.personal"
      ]
    },
    {
      code: "OPERATOR", name: "运营人员", dataScope: "ALL", level: 20,
      permissionCodes: [
        "knowledge.write",
        "customers.read",
        "settings.customer_dictionaries.manage"
      ]
    }
  ] as const;

  for (const definition of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: definition.code } },
      update: { name: definition.name, dataScope: definition.dataScope, level: definition.level },
      create: {
        organizationId: organization.id,
        code: definition.code,
        name: definition.name,
        dataScope: definition.dataScope,
        level: definition.level
      }
    });

    const permissionCodeSet = new Set<string>(definition.permissionCodes);
    const permissionIds = createdPermissions
      .filter((permission) => permissionCodeSet.has(permission.code))
      .map((permission) => permission.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: organization.id, code: "ADMIN" } }
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin@oem-crm.local" },
    update: {},
    create: {
      organizationId: organization.id,
      teamId: team.id,
      email: "admin@oem-crm.local",
      name: "System Admin",
      passwordHash: await bcrypt.hash("Admin@123456", 10)
    }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id }
  });

  const sourceSeeds = [
    ["手动录入", "Manual customer entry"],
    ["线下", "Offline lead or existing offline customer"],
    ["Google搜索", "Customers found through Google search"],
    ["LinkedIn", "Customers found through LinkedIn"],
    ["展会", "Trade show leads"],
    ["阿里国际站", "Alibaba international leads"],
    ["老客推荐", "Customer referral"],
    ["行业名录", "Industry directory"]
  ];
  for (const [name, description] of sourceSeeds) {
    await prisma.customerSource.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { description, isActive: true },
      create: { organizationId: organization.id, name, description }
    });
  }

  const typeSeeds = [
    ["品牌商", "Brand owner"],
    ["最终客户", "End customer"],
    ["代理商", "Agent or buying representative"],
    ["批发商", "Wholesaler"],
    ["分销商", "Distributor"],
    ["零售商", "Retailer"],
    ["跨境电商", "Cross-border ecommerce"],
    ["采购商", "Procurement buyer"],
    ["OEM/ODM Target", "General OEM/ODM target"]
  ];
  for (const [name, description] of typeSeeds) {
    await prisma.customerType.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { description, isActive: true },
      create: { organizationId: organization.id, name, description }
    });
  }

  await prisma.companyProfile.upsert({
    where: { id: "default-company-profile" },
    update: {},
    create: {
      id: "default-company-profile",
      organizationId: organization.id,
      legalName: "Demo Manufacturing Co., Ltd.",
      displayName: "Demo Manufacturing",
      summary: "Private deployment seed profile for OEM/ODM development."
    }
  });

  console.log("Seed completed. Login with admin@oem-crm.local / Admin@123456");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
