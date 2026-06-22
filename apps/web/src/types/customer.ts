export type CustomerOptions = {
  sources: Array<{ id: string; name: string }>;
  types: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; email: string }>;
  stages: string[];
};

type BaseCustomerRow = {
  id: string;
  name: string;
  country?: string | null;
  stage: string;
  owner_name: string;
  score?: number | null;
  grade?: string | null;
  quote_amount?: number;
};

export type PriorityCustomerRow = BaseCustomerRow & {
  next_task_due_at?: string | null;
  updated_at?: string;
  priority_level?: "A" | "B" | "C";
  priority_reason?: string;
  priority_tags?: string[];
};

export type ReportCustomerRow = BaseCustomerRow & {
  risk_level?: string;
  overdue_tasks?: number;
};
