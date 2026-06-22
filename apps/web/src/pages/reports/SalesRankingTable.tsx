export type SalesRankingRow = {
  owner_id: string;
  owner_name: string;
  customer_total: number;
  new_customers: number;
  researched_customers: number;
  sent_emails: number;
  replied_customers: number;
  quoted_customers: number;
  sample_customers: number;
  won_customers: number;
  won_rate: number;
};

export function SalesRankingTable({ rows }: { rows: SalesRankingRow[] }) {
  if (!rows.length) return <div className="empty-state">暂无业务员绩效数据。</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>业务员</th>
          <th>客户</th>
          <th>新增</th>
          <th>背调</th>
          <th>发送</th>
          <th>回复</th>
          <th>报价</th>
          <th>样品</th>
          <th>成交</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.owner_id}>
            <td>{row.owner_name}</td>
            <td>{row.customer_total}</td>
            <td>{row.new_customers}</td>
            <td>{row.researched_customers}</td>
            <td>{row.sent_emails}</td>
            <td>{row.replied_customers}</td>
            <td>{row.quoted_customers}</td>
            <td>{row.sample_customers}</td>
            <td>{row.won_customers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
