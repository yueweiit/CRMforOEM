import { PrismaClient, type Customer, type CustomerSource, type CustomerType } from "@prisma/client";
import * as bcrypt from "bcrypt";
import * as path from "node:path";

const prisma = new PrismaClient();

type ImportRow = {
  customerName: string;
  customerIndustry?: string;
  customerLevel?: string;
  customerType?: string;
  customerSource?: string;
  onlineSourceDetail?: string;
  customerTag?: string;
  region?: string;
  brandContact?: string;
  contactEmail?: string;
  owner?: string;
};

const organizationId = process.env.IMPORT_ORG_ID ?? "default-org";
const teamId = process.env.IMPORT_TEAM_ID ?? "default-sales-team";
const defaultOwnerRoleCode = process.env.IMPORT_OWNER_ROLE_CODE ?? "SALES_REP";
const ownerPassword = process.env.IMPORT_OWNER_PASSWORD ?? "ChangeMe123!";
const workbookPath =
  process.env.IMPORT_CUSTOMERS_XLSX_PATH ??
  path.resolve("D:/WorkMatter", "客户.xlsx");

const IMPORT_ROWS: ImportRow[] = [
  {
    customerName: "Lifeworks",
    customerIndustry: "美国消费品设计与制造集团",
    customerLevel: "重要客户",
    customerType: "最终客户",
    customerSource: "线下",
    customerTag: "全球领先的全周期消费品解决方案提供商",
    region: "美国",
    brandContact: "Isobel Cabanig",
    contactEmail: "ICABANIG@GOLIFEWORKS.COM",
    owner: "Eva"
  },
  {
    customerName: "MWA Cylo",
    customerIndustry: "美国中型时尚电子品牌集团",
    customerLevel: "战略客户",
    customerType: "最终客户",
    customerSource: "线下",
    customerTag: "美国潮流渠道的“大众时尚电子品牌”",
    region: "美国",
    brandContact: "Joey Uziel",
    contactEmail: "JOEY@MWA.NYC",
    owner: "Eva"
  },
  {
    customerName: "New West Development Group",
    customerIndustry: "美国品牌的“中国买手 + 产品经理”音频 / 无线 / 3C 类 ODM/OEM",
    customerLevel: "战略客户",
    customerType: "代理商",
    customerSource: "线下",
    customerTag: "美国加州老牌电子产品开发与亚洲采购代理公司",
    region: "美国加州",
    brandContact: "Jon “Gio” Sanserino",
    contactEmail: "jon.sanserino@nwdginc.com",
    owner: "Eva"
  },
  {
    customerName: "onlyphones",
    customerIndustry: "意大利区域性二手 / 翻新 iPhone 零售商",
    customerLevel: "一般客户",
    customerType: "无",
    customerSource: "线下",
    region: "意大利，俄罗斯",
    brandContact: "Elena Kozlova",
    contactEmail: "mariamsonishvili@gmail.com",
    owner: "Eva"
  },
  {
    customerName: "Sakar",
    customerIndustry: "全球领先的品牌授权消费电子、配件、玩具制造商",
    customerLevel: "战略客户",
    customerType: "最终客户",
    customerSource: "线下",
    customerTag: "美国顶级授权消费电子与配件品牌商 / ODM/OEM",
    region: "美国",
    brandContact: "Stefan Betesh",
    contactEmail: "sbetesh@sakar.com",
    owner: "Eva"
  },
  {
    customerName: "SBS S.p.A.",
    customerIndustry: "欧洲领先智能手机 / 平板配件设计、品牌、批发集团",
    customerLevel: "战略客户",
    customerType: "最终客户",
    customerSource: "线下",
    customerTag: "意大利顶级 3C 配件品牌 / 欧洲头部批发商",
    region: "欧洲、意大利",
    brandContact: "Marco.Visconti",
    contactEmail: "marco.visconti@sbsmobile.com",
    owner: "Eva"
  },
  {
    customerName: "C. K. Group, Inc",
    customerLevel: "一般客户",
    customerType: "代理商",
    customerSource: "线下",
    customerTag: "（便利店）",
    region: "美国",
    brandContact: "Ida.Huang",
    contactEmail: "ida@ckgroupinc.com",
    owner: "Eva"
  },
  {
    customerName: "Tektos Ecosystems",
    customerIndustry: "欧洲管理的高端 3C 配件 ODM/OBM",
    customerLevel: "战略客户",
    customerType: "最终客户",
    customerSource: "线下",
    customerTag: "优质全球渠道 / 运营商客户",
    region: "欧洲",
    brandContact: "Angel Untalan",
    contactEmail: "sourcing@tektosworld.com",
    owner: "Eva"
  }
];

async function main() {
  console.log(`Import workbook path: ${workbookPath}`);
  console.warn("Current workbook only contains a template header, importing the provided visible dataset without changing schema.");
  const rows = normalizeRows(IMPORT_ROWS);
  if (!rows.length) {
    console.log("No importable rows found.");
    return;
  }

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

  const role = await prisma.role.findUnique({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: defaultOwnerRoleCode
      }
    }
  });

  const ownerNames = uniqueNonEmpty(rows.map((row) => row.owner));
  const owners = new Map<string, { id: string; name: string; email: string }>();
  for (const ownerName of ownerNames) {
    const user = await upsertOwnerUser(organization.id, team.id, ownerName, ownerPassword);
    owners.set(ownerName, user);
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id }
      });
    }
  }

  const sources = await ensureCustomerSources(organization.id, uniqueNonEmpty(rows.map((row) => row.customerSource)));
  const types = await ensureCustomerTypes(
    organization.id,
    uniqueNonEmpty(rows.map((row) => (row.customerType === "无" ? undefined : row.customerType)))
  );
  const sourceByName = new Map(sources.map((source) => [source.name, source]));
  const typeByName = new Map(types.map((type) => [type.name, type]));

  const summary = {
    ownersCreatedOrUpdated: ownerNames.length,
    customersCreated: 0,
    customersUpdated: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    contactsSkipped: 0
  };

  for (const row of rows) {
    const owner = row.owner ? owners.get(row.owner) : undefined;
    const customer = await upsertCustomer(row, organization.id, owner?.id, sourceByName, typeByName);
    if (customer.created) {
      summary.customersCreated += 1;
    } else {
      summary.customersUpdated += 1;
    }

    const contactResult = await upsertContact(customer.value, row);
    if (contactResult === "created") summary.contactsCreated += 1;
    if (contactResult === "updated") summary.contactsUpdated += 1;
    if (contactResult === "skipped") summary.contactsSkipped += 1;
  }

  console.log("Customer workbook import completed.");
  console.table(summary);
}

async function upsertOwnerUser(organizationIdValue: string, teamIdValue: string, ownerName: string, password: string) {
  const normalizedOwner = ownerName.trim();
  const email = buildOwnerEmail(normalizedOwner);
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {
      organizationId: organizationIdValue,
      teamId: teamIdValue,
      name: normalizedOwner,
      isActive: true
    },
    create: {
      organizationId: organizationIdValue,
      teamId: teamIdValue,
      email,
      name: normalizedOwner,
      passwordHash
    },
    select: { id: true, name: true, email: true }
  });
}

async function ensureCustomerSources(organizationIdValue: string, names: string[]) {
  return Promise.all(
    names.map((name) =>
      prisma.customerSource.upsert({
        where: { organizationId_name: { organizationId: organizationIdValue, name } },
        update: { isActive: true },
        create: { organizationId: organizationIdValue, name, description: "Imported from 客户.xlsx" }
      })
    )
  );
}

async function ensureCustomerTypes(organizationIdValue: string, names: string[]) {
  return Promise.all(
    names.map((name) =>
      prisma.customerType.upsert({
        where: { organizationId_name: { organizationId: organizationIdValue, name } },
        update: { isActive: true },
        create: { organizationId: organizationIdValue, name, description: "Imported from 客户.xlsx" }
      })
    )
  );
}

async function upsertCustomer(
  row: ImportRow,
  organizationIdValue: string,
  ownerId: string | undefined,
  sourceByName: Map<string, CustomerSource>,
  typeByName: Map<string, CustomerType>
) {
  const normalizedName = normalizeCustomerName(row.customerName);
  const existing = await prisma.customer.findUnique({
    where: {
      organizationId_normalizedName: {
        organizationId: organizationIdValue,
        normalizedName
      }
    }
  });

  const sourceId = row.customerSource ? sourceByName.get(row.customerSource)?.id ?? null : null;
  const typeId = row.customerType && row.customerType !== "无" ? typeByName.get(row.customerType)?.id ?? null : null;
  const data = {
    sourceId,
    typeId,
    ownerId,
    createdById: ownerId,
    name: cleanText(row.customerName),
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
      organizationId: organizationIdValue,
      ...data,
      stage: "PENDING_RESEARCH"
    }
  });

  await prisma.customerStageHistory.create({
    data: {
      customerId: value.id,
      toStage: "PENDING_RESEARCH",
      changedById: ownerId,
      reason: "Imported from 客户.xlsx"
    }
  });

  return { value, created: true };
}

async function upsertContact(customer: Customer, row: ImportRow) {
  const email = normalizeEmail(row.contactEmail);
  const name = cleanText(row.brandContact);
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
    await prisma.contact.update({
      where: { id: existing.id },
      data
    });
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

function normalizeRows(rows: ImportRow[]) {
  return rows
    .map((row) => ({
      customerName: cleanText(row.customerName),
      customerIndustry: cleanText(row.customerIndustry),
      customerLevel: cleanText(row.customerLevel),
      customerType: cleanText(row.customerType),
      customerSource: cleanText(row.customerSource),
      onlineSourceDetail: cleanText(row.onlineSourceDetail),
      customerTag: cleanText(row.customerTag),
      region: cleanText(row.region),
      brandContact: cleanText(row.brandContact),
      contactEmail: cleanText(row.contactEmail),
      owner: cleanText(row.owner)
    }))
    .filter((row) => row.customerName);
}

function buildOwnerEmail(ownerName: string) {
  const slug = ownerName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".");
  return `${slug || "owner"}@oem-crm.local`;
}

function buildTags(row: ImportRow) {
  return uniqueNonEmpty([row.customerLevel, row.customerTag]);
}

function buildNotes(row: ImportRow) {
  const lines = [
    ["客户行业", row.customerIndustry],
    ["客户等级", row.customerLevel],
    ["客户类型", row.customerType],
    ["客户来源", row.customerSource],
    ["线上来源详情", row.onlineSourceDetail],
    ["地区", row.region],
    ["品牌对接人", row.brandContact],
    ["联系方式", row.contactEmail],
    ["负责人", row.owner]
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
