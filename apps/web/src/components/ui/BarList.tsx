type BarListProps = {
  data: Array<{ label: string; value: number }>;
  emptyMessage?: string;
};

export function BarList({ data, emptyMessage = "暂无统计数据。" }: BarListProps) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="bar-list">
      {data.length ? data.map((item) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <div><i style={{ width: `${Math.max(4, item.value / max * 100)}%` }} /></div>
          <strong>{item.value}</strong>
        </div>
      )) : <div className="empty-state">{emptyMessage}</div>}
    </div>
  );
}
