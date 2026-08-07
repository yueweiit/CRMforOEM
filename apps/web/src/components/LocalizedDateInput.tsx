import { useEffect } from "react";
import { ConfigProvider } from "@alifd/next";
import DatePicker from "@alifd/next/lib/date-picker2";
import "@alifd/next/lib/date-picker2/style.js";
import dayjs from "dayjs";
import "dayjs/locale/es";
import "dayjs/locale/zh-cn";
import type { Locale } from "@oem-crm/shared";
import { useI18n } from "../i18n";

type LocalizedDateInputProps = {
  value: string;
  onChange: (value: string) => void;
};

type DateFormat = {
  format: string;
  placeholder: string;
  dayjsLocale: string;
};

const DATE_FORMATS: Record<Locale, DateFormat> = {
  "zh-CN": { format: "YYYY/MM/DD", placeholder: "年/月/日", dayjsLocale: "zh-cn" },
  "en-US": { format: "MM/DD/YYYY", placeholder: "mm/dd/yyyy", dayjsLocale: "en" },
  "es-ES": { format: "DD/MM/YYYY", placeholder: "dd/mm/aaaa", dayjsLocale: "es" }
};

const DATE_PICKER_LOCALES = {
  "zh-CN": {
    Calendar: {
      today: "今天",
      now: "此刻",
      ok: "确定",
      clear: "清除",
      month: "月",
      year: "年",
      prevYear: "上一年",
      nextYear: "下一年",
      prevMonth: "上个月",
      nextMonth: "下个月",
      prevDecade: "上十年",
      nextDecade: "后十年",
      yearSelectAriaLabel: "选择年份",
      monthSelectAriaLabel: "选择月份"
    },
    DatePicker: {
      placeholder: "年/月/日",
      datetimePlaceholder: "年/月/日",
      monthPlaceholder: "请选择月份",
      yearPlaceholder: "请选择年份",
      weekPlaceholder: "请选择周",
      now: "此刻",
      selectTime: "选择时间",
      selectDate: "选择日期",
      ok: "确定",
      clear: "清除",
      startPlaceholder: "起始日期",
      endPlaceholder: "结束日期",
      hour: "时",
      minute: "分",
      second: "秒",
      monthBeforeYear: false
    }
  },
  "en-US": {
    Calendar: {
      today: "Today",
      now: "Now",
      ok: "OK",
      clear: "Clear",
      month: "Month",
      year: "Year",
      prevYear: "Previous Year",
      nextYear: "Next Year",
      prevMonth: "Previous Month",
      nextMonth: "Next Month",
      prevDecade: "Previous Decade",
      nextDecade: "Next Decade",
      yearSelectAriaLabel: "Select Year",
      monthSelectAriaLabel: "Select Month"
    },
    DatePicker: {
      placeholder: "mm/dd/yyyy",
      datetimePlaceholder: "mm/dd/yyyy",
      monthPlaceholder: "Select Month",
      yearPlaceholder: "Select Year",
      weekPlaceholder: "Select Week",
      now: "Now",
      selectTime: "Select Time",
      selectDate: "Select Date",
      ok: "OK",
      clear: "Clear",
      startPlaceholder: "Start Date",
      endPlaceholder: "End Date",
      hour: "H",
      minute: "M",
      second: "S",
      monthBeforeYear: true
    }
  },
  "es-ES": {
    Calendar: {
      today: "Hoy",
      now: "Ahora",
      ok: "Aceptar",
      clear: "Limpiar",
      month: "Mes",
      year: "Año",
      prevYear: "Año anterior",
      nextYear: "Año siguiente",
      prevMonth: "Mes anterior",
      nextMonth: "Mes siguiente",
      prevDecade: "Década anterior",
      nextDecade: "Década siguiente",
      yearSelectAriaLabel: "Seleccionar año",
      monthSelectAriaLabel: "Seleccionar mes"
    },
    DatePicker: {
      placeholder: "dd/mm/aaaa",
      datetimePlaceholder: "dd/mm/aaaa",
      monthPlaceholder: "Seleccionar mes",
      yearPlaceholder: "Seleccionar año",
      weekPlaceholder: "Seleccionar semana",
      now: "Ahora",
      selectTime: "Seleccionar hora",
      selectDate: "Seleccionar fecha",
      ok: "Aceptar",
      clear: "Limpiar",
      startPlaceholder: "Fecha inicial",
      endPlaceholder: "Fecha final",
      hour: "h",
      minute: "min",
      second: "s",
      monthBeforeYear: false
    }
  }
} as const;

export function LocalizedDateInput({ value, onChange }: LocalizedDateInputProps) {
  const { locale, t } = useI18n();
  const format = DATE_FORMATS[locale];
  const pickerLocale = { ...DATE_PICKER_LOCALES[locale].Calendar, ...DATE_PICKER_LOCALES[locale].DatePicker };
  const nextLocale = {
    Calendar: DATE_PICKER_LOCALES[locale].Calendar,
    DatePicker: DATE_PICKER_LOCALES[locale].DatePicker,
    Input: { clear: DATE_PICKER_LOCALES[locale].DatePicker.clear }
  };

  useEffect(() => {
    dayjs.locale(format.dayjsLocale);
  }, [format.dayjsLocale]);

  return (
    <ConfigProvider locale={nextLocale}>
      <DatePicker
        aria-label={t("common.date")}
        className="localized-date-picker"
        dateInputAriaLabel={t("common.date")}
        format={format.format}
        hasClear
        locale={pickerLocale}
        placeholder={format.placeholder}
        value={value || undefined}
        onChange={(nextValue) => onChange(nextValue ? nextValue.format("YYYY-MM-DD") : "")}
      />
    </ConfigProvider>
  );
}
