import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Subject } from "rxjs";
import { SSE_EVENTS, InboundMailReceivedPayload, FollowUpTaskChangedPayload } from "../events/event-types";

type SseConnection = {
  subject: Subject<MessageEvent>;
  userId: string;
  orgId: string;
};

@Injectable()
export class SseService {
  private connections = new Map<string, SseConnection>();
  private counter = 0;

  createConnection(userId: string, orgId: string): { id: string; subject: Subject<MessageEvent> } {
    const id = `sse_${++this.counter}_${Date.now()}`;
    const subject = new Subject<MessageEvent>();
    this.connections.set(id, { subject, userId, orgId });
    return { id, subject };
  }

  removeConnection(id: string) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.subject.complete();
      this.connections.delete(id);
    }
  }

  private pushToOrg(orgId: string, event: string, data: unknown) {
    for (const [, conn] of this.connections) {
      if (conn.orgId === orgId) {
        conn.subject.next({ data: JSON.stringify(data), type: event } as MessageEvent);
      }
    }
  }

  @OnEvent(SSE_EVENTS.INBOUND_MAIL_RECEIVED)
  onInboundMailReceived(payload: InboundMailReceivedPayload) {
    this.pushToOrg(payload.orgId, SSE_EVENTS.INBOUND_MAIL_RECEIVED, payload);
  }

  @OnEvent(SSE_EVENTS.FOLLOW_UP_TASK_CREATED)
  onFollowUpTaskCreated(payload: FollowUpTaskChangedPayload) {
    this.pushToOrg(payload.orgId, SSE_EVENTS.FOLLOW_UP_TASK_CREATED, payload);
  }

  @OnEvent(SSE_EVENTS.FOLLOW_UP_TASK_COMPLETED)
  onFollowUpTaskCompleted(payload: FollowUpTaskChangedPayload) {
    this.pushToOrg(payload.orgId, SSE_EVENTS.FOLLOW_UP_TASK_COMPLETED, payload);
  }

  @OnEvent(SSE_EVENTS.FOLLOW_UP_TASK_CANCELLED)
  onFollowUpTaskCancelled(payload: FollowUpTaskChangedPayload) {
    this.pushToOrg(payload.orgId, SSE_EVENTS.FOLLOW_UP_TASK_CANCELLED, payload);
  }
}
