export const SSE_EVENTS = {
  INBOUND_MAIL_RECEIVED: "inbound-mail.received",
  FOLLOW_UP_TASK_CREATED: "follow-up.task.created",
  FOLLOW_UP_TASK_COMPLETED: "follow-up.task.completed",
  FOLLOW_UP_TASK_CANCELLED: "follow-up.task.cancelled"
} as const;

export interface InboundMailReceivedPayload {
  orgId: string;
  targetUserIds: string[];
  threadId: string;
  customerId: string;
  customerName: string;
  fromEmail: string;
  subject: string;
}

export interface FollowUpTaskChangedPayload {
  orgId: string;
  targetUserIds: string[];
  taskId: string;
  customerId: string;
  type: string;
  overdueCount: number;
}
