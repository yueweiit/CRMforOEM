import { PrismaClient, type Customer, type CustomerSource, type CustomerType } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

type EvaCustomerImportRow = {
  name: string;
  industry?: string;
  level?: string;
  customerType?: string;
  source?: string;
  onlineSourceDetail?: string;
  tag?: string;
  region?: string;
  contactName?: string;
  contactEmail?: string;
  owner?: string;
};

const organizationId = process.env.IMPORT_ORG_ID ?? "default-org";
const teamId = process.env.IMPORT_TEAM_ID ?? "default-sales-team";
const evaEmail = process.env.EVA_EMAIL ?? "eva@oem-crm.local";
const evaPassword = process.env.EVA_PASSWORD ?? "Eva@123456";

const evaCustomers: EvaCustomerImportRow[] = [
  {
    name: "Lifeworks",
    industry: "美国消费品设计与制造集团",
    level: "重要客户",
    customerType: "最终客户",
    source: "线下",
    tag: "全球领先的全周期消费品解决方案提供商",
    region: "美国",
    contactName: "Isobel Cabanig",
    contactEmail: "ICABANIG@GOLIFEWORKS.COM",
    owner: "Eva"
  },
  {
    name: "MWA Cylo",
    industry: "美国中型时尚电子品牌集团",
    level: "战略客户",
    customerType: "最终客户",
    source: "线下",
    tag: "美国商超渠道的“大众时尚电子配件品牌”",
    region: "美国",
    contactName: "Joey Uziel",
    contactEmail: "JOEY@MWA.NYC",
    owner: "Eva"
  },
  {
    name: "New West Development Group",
    industry: "美国品牌的“中国买手 + 产品经理”音频/无线/3C 类 ODM/OEM",
    level: "战略客户",
    customerType: "代理商",
    source: "线下",
    tag: "美国加州老牌电子产品开发与亚洲采购代理公司",
    region: "美国加州",
    contactName: "Jon“Gio”Sanserino",
    contactEmail: "jon.sanserino@nwdginc.com",
    owner: "Eva"
  },
  {
    name: "onlyphones",
    industry: "意大利区域性二手/翻新 iPhone 零售商",
    level: "一般客户",
    customerType: "无",
    source: "线下",
    region: "意大利，俄罗斯",
    contactName: "Elena Kozlova",
    contactEmail: "mariamsonishvili@gmail.com",
    owner: "Eva"
  },
  {
    name: "Sakar",
    industry: "全球领先的品牌授权消费电子、配件、玩具制造商",
    level: "战略客户",
    customerType: "最终客户",
    source: "线下",
    tag: "美国顶级授权消费电子与配件品牌商/ODM/OEM",
    region: "美国",
    contactName: "Stefan Betesh",
    contactEmail: "sbetesh@sakar.com",
    owner: "Eva"
  },
  {
    name: "SBS S.p.A.",
    industry: "欧洲领先智能手机/平板配件设计、品牌、批发集团",
    level: "战略客户",
    customerType: "最终客户",
    source: "线下",
    tag: "意大利顶级 3C 配件品牌/欧洲头部批发商",
    region: "欧洲、意大利",
    contactName: "Marco.Visconti",
    contactEmail: "marco.visconti@sbsmobile.com",
    owner: "Eva"
  },
  {
    name: "C.K.Group,Inc",
    level: "一般客户",
    customerType: "代理商",
    source: "线下",
    tag: "（便利店）",
    region: "美国",
    contactName: "Ida.Huang",
    contactEmail: "ida@ckgroupinc.com",
    owner: "Eva"
  },
  {
    name: "Tektos Ecosystems",
    industry: "欧洲管理的高端 3C 配件 ODM/OBM",
    level: "战略客户",
    customerType: "最终客户",
    source: "线下",
    tag: "优质全球渠道/运营商客户",
    region: "欧洲",
    contactName: "Angel Untalan",
    contactEmail: "sourcing@tektosworld.com",
    owner: "Eva"
  }
];

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: organizationId },
    update: {},
    create: { id: organizationId, name: "OEM CRM Demo Organization" }
  });

  const team = await prisma.team.upsert({
    where: { id: teamId },
    update: { organizationId: organization.id, name: "Sales Team" },
    create: { id: teamId, organizationId: organization.id, name: "Sales Team" }
  });

  const eva = await prisma.user.upsert({
    where: { email: evaEmail },
    update: {
      organizationId: organization.id,
      teamId: team.id,
      name: "黄凤Eva",
      isActive: true
    },
    create: {
      organizationId: organization.id,
      teamId: team.id,
      email: evaEmail,
      name: "黄凤Eva",
      passwordHash: await bcrypt.hash(evaPassword, 10)
    }
  });

  await attachEvaSalesRole(organization.id, eva.id);

  const sources = await ensureCustomerSources(organization.id, uniqueNonEmpty(evaCustomers.map((row) => row.source)));
  const types = await ensureCustomerTypes(
    organization.id,
    uniqueNonEmpty(evaCustomers.map((row) => (row.customerType === "无" ? undefined : row.customerType)))
  );

  const sourceByName = new Map(sources.map((source) => [source.name, source]));
  const typeByName = new Map(types.map((type) => [type.name, type]));

  const summary = {
    customersCreated: 0,
    customersUpdated: 0,
    contactsCreated: 0,
    contactsUpdated: 0
  };

  for (const row of evaCustomers) {
    const customer = await upsertCustomer(row, organization.id, eva.id, sourceByName, typeByName);
    if (customer.created) {
      summary.customersCreated += 1;
    } else {
      summary.customersUpdated += 1;
    }

    const contactResult = await upsertContact(customer.value, row);
    if (contactResult === "created") summary.contactsCreated += 1;
    if (contactResult === "updated") summary.contactsUpdated += 1;
  }

  console.log("Eva customer import completed.");
  console.table(summary);
  console.log("Skipped source workbook rows: 2 placeholder ABC rows without owner/contact/business data.");
  console.log(`Eva user: ${eva.email} / ${eva.name}`);
}

async function attachEvaSalesRole(orgId: string, userId: string) {
  const salesRole = await prisma.role.findUnique({
    where: { organizationId_code: { organizationId: orgId, code: "SALES_REP" } }
  });
  if (!salesRole) {
    console.warn("Role SALES_REP was not found. Run npm run db:seed before importing if role permissions are needed.");
    return;
  }
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: salesRole.id } },
    update: {},
    create: { userId, roleId: salesRole.id }
  });
}

async function ensureCustomerSources(orgId: string, names: string[]) {
  const sources = await Promise.all(
    names.map((name) =>
      prisma.customerSource.upsert({
        where: { organizationId_name: { organizationId: orgId, name } },
        update: { isActive: true },
        create: { organizationId: orgId, name, description: "Imported from Eva customer workbook" }
      })
    )
  );
  return sources;
}

async function ensureCustomerTypes(orgId: string, names: string[]) {
  const types = await Promise.all(
    names.map((name) =>
      prisma.customerType.upsert({
        where: { organizationId_name: { organizationId: orgId, name } },
        update: { isActive: true },
        create: { organizationId: orgId, name, description: "Imported from Eva customer workbook" }
      })
    )
  );
  return types;
}

async function upsertCustomer(
  row: EvaCustomerImportRow,
  orgId: string,
  evaId: string,
  sourceByName: Map<string, CustomerSource>,
  typeByName: Map<string, CustomerType>
) {
  const normalizedName = normalizeCustomerName(row.name);
  const existing = await prisma.customer.findUnique({
    where: { organizationId_normalizedName: { organizationId: orgId, normalizedName } }
  });

  const sourceId = row.source ? sourceByName.get(row.source)?.id ?? null : null;
  const typeId = row.customerType && row.customerType !== "无" ? typeByName.get(row.customerType)?.id ?? null : null;
  const data = {
    sourceId,
    typeId,
    ownerId: evaId,
    createdById: evaId,
    name: cleanText(row.name),
    normalizedName,
    country: cleanText(row.region),
    tags: buildTags(row),
    notes: buildNotes(row)
  };

  if (existing) {
    const value = await prisma.customer.update({
      where: { id: existing.id },
      data
    });
    return { value, created: false };
  }

  const value = await prisma.customer.create({
    data: {
      organizationId: orgId,
      ...data,
      stage: "PENDING_RESEARCH"
    }
  });
  await prisma.customerStageHistory.create({
    data: {
      customerId: value.id,
      toStage: "PENDING_RESEARCH",
      changedById: evaId,
      reason: "Imported from Eva customer workbook"
    }
  });
  return { value, created: true };
}

async function upsertContact(customer: Customer, row: EvaCustomerImportRow) {
  const email = normalizeEmail(row.contactEmail);
  const name = cleanText(row.contactName);
  if (!email && !name) return "skipped" as const;

  const existing = await prisma.contact.findFirst({
    where: email ? { customerId: customer.id, email } : { customerId: customer.id, name }
  });
  const data = {
    name,
    email,
    qualityScore: email ? 75 : 35
  };

  if (existing) {
    await prisma.contact.update({ where: { id: existing.id }, data });
    return "updated" as const;
  }

  await prisma.contact.create({
    data: {
      customerId: customer.id,
      ...data
    }
  });
  return "created" as const;
}

function buildTags(row: EvaCustomerImportRow) {
  return uniqueNonEmpty([row.level, row.tag]);
}

function buildNotes(row: EvaCustomerImportRow) {
  const lines = [
    ["客户行业", row.industry],
    ["客户等级", row.level],
    ["客户类型", row.customerType],
    ["客户来源", row.source],
    ["线上来源详情", row.onlineSourceDetail],
    ["地区", row.region],
    ["品牌对接人", row.contactName],
    ["联系方式", row.contactEmail],
    ["原始负责人", row.owner]
  ]
    .filter(([, value]) => Boolean(cleanText(value)))
    .map(([label, value]) => `${label}: ${cleanText(value)}`);
  return lines.join("\n");
}

function normalizeCustomerName(name: string) {
  return cleanText(name).toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(email?: string) {
  const cleaned = cleanText(email).toLowerCase();
  return cleaned || undefined;
}

function cleanText(value?: string) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function uniqueNonEmpty(values: Array<string | undefined>) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
