export type SampleCostFeeInput = {
  id?: string;
  sampleRoundId?: string | null;
  feeType?: string;
  amount: string | number;
  currency: string;
  costNature?: string | null;
  paymentStatus?: string | null;
};

export type SampleCostRoundInput = {
  id: string;
  roundNo: number;
};

export type SampleCurrencyCostSummary = {
  currency: string;
  firstRoundCost: number;
  resampleCost: number;
  totalActualCost: number;
  customerCharge: number;
  receivedAmount: number;
  companyBorneAmount: number;
};

export type SampleRoundCostSummary = {
  roundId: string | null;
  roundNo: number | null;
  currencies: SampleCurrencyCostSummary[];
};

const money = (value: number) => Number(value.toFixed(2));

export function buildSampleCostSummary(
  fees: SampleCostFeeInput[],
  rounds: SampleCostRoundInput[]
) {
  const roundNoById = new Map(rounds.map((round) => [round.id, round.roundNo]));
  const byCurrency = new Map<string, SampleCurrencyCostSummary>();
  const byRound = new Map<string, SampleRoundCostSummary>();

  for (const fee of fees) {
    const currency = fee.currency.trim().toUpperCase() || "N/A";
    const amount = Number(fee.amount);
    if (!Number.isFinite(amount)) continue;
    const roundNo = fee.sampleRoundId ? (roundNoById.get(fee.sampleRoundId) ?? null) : null;
    const actualCost = fee.costNature !== "CUSTOMER_CHARGE";
    const customerCharge = !actualCost;
    const target = byCurrency.get(currency) ?? {
      currency,
      firstRoundCost: 0,
      resampleCost: 0,
      totalActualCost: 0,
      customerCharge: 0,
      receivedAmount: 0,
      companyBorneAmount: 0
    };
    const roundTarget = byRound.get(fee.sampleRoundId ?? "PUBLIC") ?? {
      roundId: fee.sampleRoundId ?? null,
      roundNo,
      currencies: []
    };
    const roundCurrency = roundTarget.currencies.find((item) => item.currency === currency) ?? {
      currency,
      firstRoundCost: 0,
      resampleCost: 0,
      totalActualCost: 0,
      customerCharge: 0,
      receivedAmount: 0,
      companyBorneAmount: 0
    };

    if (actualCost) {
      target.totalActualCost += amount;
      roundCurrency.totalActualCost += amount;
      if (roundNo === null || roundNo === 1) {
        target.firstRoundCost += amount;
        roundCurrency.firstRoundCost += amount;
      } else {
        target.resampleCost += amount;
        roundCurrency.resampleCost += amount;
      }
    } else if (customerCharge) {
      target.customerCharge += amount;
      roundCurrency.customerCharge += amount;
      if (fee.paymentStatus === "RECEIVED") {
        target.receivedAmount += amount;
        roundCurrency.receivedAmount += amount;
      }
    }
    target.companyBorneAmount = Math.max(0, target.totalActualCost - target.receivedAmount);
    roundCurrency.companyBorneAmount = Math.max(0, roundCurrency.totalActualCost - roundCurrency.receivedAmount);
    byCurrency.set(currency, target);
    const existingRoundCurrency = roundTarget.currencies.findIndex((item) => item.currency === currency);
    if (existingRoundCurrency >= 0) roundTarget.currencies[existingRoundCurrency] = roundCurrency;
    else roundTarget.currencies.push(roundCurrency);
    byRound.set(fee.sampleRoundId ?? "PUBLIC", roundTarget);
  }

  for (const item of byCurrency.values()) {
    item.firstRoundCost = money(item.firstRoundCost);
    item.resampleCost = money(item.resampleCost);
    item.totalActualCost = money(item.totalActualCost);
    item.customerCharge = money(item.customerCharge);
    item.receivedAmount = money(item.receivedAmount);
    item.companyBorneAmount = money(item.companyBorneAmount);
  }
  for (const item of byRound.values()) {
    item.currencies = item.currencies.map((currency) => ({
      ...currency,
      firstRoundCost: money(currency.firstRoundCost),
      resampleCost: money(currency.resampleCost),
      totalActualCost: money(currency.totalActualCost),
      customerCharge: money(currency.customerCharge),
      receivedAmount: money(currency.receivedAmount),
      companyBorneAmount: money(currency.companyBorneAmount)
    }));
  }

  return {
    byCurrency: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    byRound: [...byRound.values()].sort((a, b) => (a.roundNo ?? 0) - (b.roundNo ?? 0))
  };
}
