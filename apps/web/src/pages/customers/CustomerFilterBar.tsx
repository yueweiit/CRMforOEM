import { Filter, Search } from "lucide-react";
import { STAGE_LABELS, stageLabel } from "@oem-crm/shared";
import { AppSelect } from "../../components/AppSelect";
import type { CustomerOptions } from "../../types/customer";

export function CustomerFilterBar({
  q,
  onQChange,
  stage,
  onStageChange,
  options
}: {
  q: string;
  onQChange: (q: string) => void;
  stage: string;
  onStageChange: (stage: string) => void;
  options?: CustomerOptions;
}) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <Search size={16} />
        <input placeholder="搜索公司、官网" value={q} onChange={(event) => onQChange(event.target.value)} />
      </div>
      <AppSelect
        variant="toolbar"
        value={stage}
        onChange={onStageChange}
        title="筛选阶段"
        options={[
          { value: "", label: "全部阶段" },
          ...((options?.stages ?? Object.keys(STAGE_LABELS)).map((item) => ({ value: item, label: stageLabel(item) })))
        ]}
      />
      <button className="icon-button" title="筛选">
        <Filter size={17} />
      </button>
    </div>
  );
}
