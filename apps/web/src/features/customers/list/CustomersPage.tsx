import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createCustomer, getCustomerFilterOptions, getCustomers } from "../../../api/customers";
import { getCurrentUser, hasPermission } from "../../../auth/permissions";
import plusIconUrl from "../../../components/icons/加号.svg";
import { notifyMutationStep } from "../../../components/Toast";
import { DetailPageHeader } from "../../../components/ui/DetailPageHeader";
import { useI18n } from "../../../i18n";
import type { CustomerOptions } from "../../../shared/types/customer";
import { splitList } from "../../../shared/utils/string";
import { CustomerCreateForm } from "./CustomerCreateForm";
import { CustomerFilterBar } from "./CustomerFilterBar";
import { CustomerListTable, type Customer } from "./CustomerListTable";

/**
 * 客户页面主组件。
 * mode 为 "create" 时渲染新建客户表单，否则渲染客户列表 + 筛选栏。
 */
export function CustomersPage({ mode }: { mode?: "create" }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useI18n();
  const currentUser = getCurrentUser();
  const canManageDictionaries = hasPermission(currentUser, "settings.customer_dictionaries.manage");

  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [form, setForm] = useState(defaultCustomerForm());

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [q, stage]);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["customers", queryString],
    queryFn: () => getCustomers<Customer[]>(queryString),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });

  const { data: options } = useQuery({
    queryKey: ["customer-filter-options"],
    queryFn: () => getCustomerFilterOptions<CustomerOptions>(),
    enabled: Boolean(localStorage.getItem("accessToken"))
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createCustomer<Customer>(payload),
    onMutate: () => notifyMutationStep({ phase: "loading", title: "处理中", message: "正在创建客户。", dedupeKey: `customer-create:${form.name}` }),
    onSuccess: (customer) => {
      notifyMutationStep({ phase: "success", title: "操作成功", message: "客户已创建。" });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      navigate(`/customers/${customer.id}/overview`);
    },
    onError: (error) => notifyMutationStep({ phase: "error", title: "操作失败", message: error instanceof Error ? error.message : "创建客户失败。", dedupeKey: `customer-create:${form.name}:error` })
  });

  function updateField(key: string, value: string) {
    setForm({ ...form, [key]: value });
  }

  function submitCustomer() {
    createMutation.mutate({
      ...form,
      tags: splitList(form.tags),
      ownerId: form.ownerId || undefined,
      sourceId: form.sourceId || undefined,
      typeId: form.typeId || undefined
    });
  }

  if (mode === "create") {
    return (
      <section className="page-stack">
        <DetailPageHeader
          backTo="/customers"
          backLabel={t("customerDetail.backToPool")}
          breadcrumbs={[
            { label: t("customerDetail.breadcrumbCustomers"), to: "/customers" },
            { label: t("customers.newTitle") }
          ]}
          eyebrow="Customer Development"
          title={t("customers.newTitle")}
        />
        <CustomerCreateForm
          form={form}
          onFieldChange={updateField}
          options={options}
          isError={createMutation.isError}
          error={createMutation.error}
          isPending={createMutation.isPending}
          onSubmit={submitCustomer}
          canManageDictionaries={canManageDictionaries}
        />
      </section>
    );
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Customer Development</p>
          <h1>{t("customers.poolTitle")}</h1>
        </div>
        <Link to="/customers/new" className="primary-button">
          <img alt="" aria-hidden="true" className="button-svg-icon" src={plusIconUrl} />
          {t("customers.addCustomer")}
        </Link>
      </header>

      <CustomerFilterBar
        q={q}
        onQChange={setQ}
        stage={stage}
        onStageChange={setStage}
        options={options}
      />

      <CustomerListTable data={data} isLoading={isLoading} isError={isError} />
    </section>
  );
}

/** 创建客户表单的初始空值，字段对应 Customer 实体的创建接口参数 */
function defaultCustomerForm() {
  return {
    name: "",
    websiteUrl: "",
    country: "",
    language: "",
    timezone: "",
    currency: "",
    sourceId: "",
    typeId: "",
    ownerId: "",
    tags: "",
    notes: ""
  };
}
