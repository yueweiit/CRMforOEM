import { Filter, Search } from "lucide-react";
import { STAGE_LABELS, stageLabel } from "@oem-crm/shared";
import { AppSelect } from "../../../components/AppSelect";
import { useI18n } from "../../../i18n";
import type { CustomerOptions } from "../../../shared/types/customer";

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
  const { locale, t } = useI18n();
  return (
    <div className="toolbar">
      <div className="search-box">
        <Search size={16} />
        <input placeholder={t("customers.searchPlaceholder")} value={q} onChange={(event) => onQChange(event.target.value)} />
      </div>
      <AppSelect
        variant="toolbar"
        value={stage}
        onChange={onStageChange}
        title={t("customers.filterStage")}
        options={[
          { value: "", label: t("common.allStages") },
          ...((options?.stages ?? Object.keys(STAGE_LABELS)).map((item) => ({ value: item, label: stageLabel(item, locale) })))
        ]}
      />
      <button className="icon-button" title={t("customers.filterStage")}>
        <Filter size={17} />
      </button>
    </div>
  );
}
