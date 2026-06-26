import * as assert from "node:assert/strict";
import { NotFoundException } from "@nestjs/common";
import { CustomersService } from "./customers.service";
import type { RequestUser } from "../../common/auth/current-user.decorator";

const user: RequestUser = {
  id: "user-1",
  organizationId: "org-1",
  roleCodes: [],
  permissions: [],
  dataScope: "ALL"
};

function buildPrisma() {
  const calls: {
    contactUpdate?: { where: { id: string }; data: Record<string, unknown> };
    contactDelete?: { where: { id: string } };
  } = {};

  const visibleCustomer = { id: "customer-1", organizationId: user.organizationId };
  const existingContact = { id: "contact-1", customerId: visibleCustomer.id };

  return {
    calls,
    prisma: {
      customer: {
        findFirst: async ({ where }: { where: { id: string } }) =>
          where.id === visibleCustomer.id ? visibleCustomer : null
      },
      contact: {
        findFirst: async ({ where }: { where: { id: string; customerId: string } }) =>
          where.id === existingContact.id && where.customerId === visibleCustomer.id ? existingContact : null,
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          calls.contactUpdate = args;
          return { ...existingContact, ...args.data };
        },
        delete: async (args: { where: { id: string } }) => {
          calls.contactDelete = args;
          return existingContact;
        }
      }
    }
  };
}

async function main() {
  {
    const { prisma, calls } = buildPrisma();
    const service = new CustomersService(prisma as never);

    const result = await service.updateContact(user, "customer-1", "contact-1", {
      name: "Eva Buyer",
      title: "Procurement Director",
      email: "eva@example.com",
      phone: "+1 555 0100",
      qualityScore: 88,
      isDecisionMaker: true
    });

    assert.equal(result.name, "Eva Buyer");
    assert.deepEqual(calls.contactUpdate, {
      where: { id: "contact-1" },
      data: {
        name: "Eva Buyer",
        title: "Procurement Director",
        email: "eva@example.com",
        phone: "+1 555 0100",
        qualityScore: 88,
        isDecisionMaker: true
      }
    });
  }

  {
    const { prisma, calls } = buildPrisma();
    const service = new CustomersService(prisma as never);

    await service.deleteContact(user, "customer-1", "contact-1");

    assert.deepEqual(calls.contactDelete, { where: { id: "contact-1" } });
  }

  {
    const { prisma } = buildPrisma();
    const service = new CustomersService(prisma as never);

    await assert.rejects(
      () => service.updateContact(user, "customer-1", "other-contact", { name: "Wrong" }),
      NotFoundException
    );
  }
}

void main();
