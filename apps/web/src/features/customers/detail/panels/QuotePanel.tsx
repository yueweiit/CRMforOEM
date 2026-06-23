import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createQuote, getQuotes } from "../../../../api/customers";
import { CommercialPanel } from "../shared/ui";
import type { Quote } from "../shared/types";

export function QuotePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ quoteNo: `Q-${Date.now()}`, currency: "USD", amount: "", notes: "" });
  const { data = [] } = useQuery({ queryKey: ["quotes", customerId], queryFn: () => getQuotes<Quote[]>(customerId) });
  const create = useMutation({ mutationFn: () => createQuote({ ...form, customerId, amount: Number(form.amount) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes", customerId] }) });
  return <CommercialPanel title="报价记录" rows={data.map((item) => ({ id: item.id, title: `${item.quoteNo} · ${item.currency} ${item.amount}`, meta: `${item.status} · ${new Date(item.createdAt).toLocaleDateString()}` }))} form={form} setForm={(value) => setForm(value as typeof form)} onSubmit={() => create.mutate()} fields={[["quoteNo", "报价编号"], ["currency", "币种"], ["amount", "金额"], ["notes", "备注"]]} />;
}
