import type { FollowUpTask } from "./shared/types";
import { SimpleRows } from "./shared/ui";

export function FollowUpPanel({ tasks }: { tasks: FollowUpTask[] }) {
  return <section className="panel"><div className="panel-title"><h2>跟进任务</h2><span>{tasks.length} 项</span></div><SimpleRows rows={tasks.map((task) => ({ id: task.id, title: task.title, meta: `${task.type} · ${task.status} · ${new Date(task.dueAt).toLocaleString()}` }))} empty="暂无跟进任务。" /></section>;
}
