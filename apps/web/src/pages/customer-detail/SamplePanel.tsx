import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../api/http";
import { CommercialPanel } from "./shared/ui";
import type { Sample } from "./shared/types";

export function SamplePanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ productSummary: "", carrier: "", trackingNo: "" });
  const { data = [] } = useQuery({ queryKey: ["samples", customerId], queryFn: () => apiGet<Sample[]>(`/samples?customerId=${customerId}`) });
  const create = useMutation({ mutationFn: () => apiPost("/samples", { ...form, customerId }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["samples", customerId] }) });
  return <CommercialPanel title="样品记录" rows={data.map((item) => ({ id: item.id, title: item.productSummary, meta: `${item.status} · ${item.trackingNo ?? "-"} · ${new Date(item.createdAt).toLocaleDateString()}` }))} form={form} setForm={(value) => setForm(value as typeof form)} onSubmit={() => create.mutate()} fields={[["productSummary", "样品/产品"], ["carrier", "物流商"], ["trackingNo", "运单号"]]} />;
}
