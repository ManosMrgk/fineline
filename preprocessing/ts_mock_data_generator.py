from __future__ import annotations

import argparse
import calendar
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, Tuple, List


def parse_greek_date(date_str: str) -> Tuple[int, int, int]:
    """
    Parse date string like '22/11/2025' -> (year, month, day)
    """
    day_s, month_s, year_s = date_str.split("/")
    return int(year_s), int(month_s), int(day_s)


def format_number(n: float) -> str:
    """
    Format a float with up to 2 decimals, without trailing zeros,
    so it can be used as a numeric literal in TypeScript.
    """
    value = round(float(n), 2)
    s = f"{value:.2f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s or "0"


def load_transactions(input_path: Path) -> List[dict]:
    with input_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("Expected top-level JSON array of transactions")
    return data


def build_monthly_aggregates(
    transactions: List[dict],
):
    # (year, month) -> totalSpent
    monthly_totals: Dict[Tuple[int, int], float] = defaultdict(float)

    # (year, month) -> { category_name -> amount }
    monthly_categories: Dict[Tuple[int, int], Dict[str, float]] = defaultdict(
        lambda: defaultdict(float)
    )

    # (year, month) -> { day -> total_amount_for_that_day }
    monthly_daily: Dict[Tuple[int, int], Dict[int, float]] = defaultdict(
        lambda: defaultdict(float)
    )

    # (year, month) -> { day -> [ { merchant, value }, ... ] }
    monthly_daily_expenses: Dict[Tuple[int, int], Dict[int, List[dict]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for row in transactions:
        # Only expenses
        if row.get("Χρέωση / Πίστωση") != "Χ":
            continue

        amount_raw = row.get("Ποσό συναλλαγής", 0) or 0
        try:
            amount = float(amount_raw)
        except (TypeError, ValueError):
            continue

        if amount <= 0:
            # ignore zero or negative amounts for spending
            continue

        date_str = row.get("Ημερομηνία")
        if not date_str:
            continue

        try:
            year, month, day = parse_greek_date(date_str)
        except Exception:
            continue

        key = (year, month)

        # Category: prefer 'category', then 'merchant_category', fallback
        category = row.get("category") or row.get("merchant_category") or "Miscellaneous"

        # Merchant name: prefer counterparty name, then transaction description, then raw description
        merchant_name = (
            row.get("Ονοματεπώνυμο αντισυμβαλλόμενου")
            or row.get("transaction_description")
            or row.get("Περιγραφή")
            or "Unknown"
        )

        monthly_totals[key] += amount
        monthly_categories[key][category] += amount
        monthly_daily[key][day] += amount

        monthly_daily_expenses[key][day].append(
            {
                "merchant": merchant_name,
                "category": category,
                "value": amount,
            }
        )

    return monthly_totals, monthly_categories, monthly_daily, monthly_daily_expenses


def build_ts_content(
    monthly_totals: Dict[Tuple[int, int], float],
    monthly_categories: Dict[Tuple[int, int], Dict[str, float]],
    monthly_daily: Dict[Tuple[int, int], Dict[int, float]],
    monthly_daily_expenses: Dict[Tuple[int, int], Dict[int, List[dict]]],
) -> str:
    # Sort months chronologically
    month_keys = sorted(monthly_totals.keys())  # (year, month)

    if not month_keys:
        raise RuntimeError("No expense data found to build TypeScript file.")

    totals_list = [monthly_totals[k] for k in month_keys]
    overall_avg = sum(totals_list) / len(totals_list)

    # Collect years and month names (for filters)
    years_set = {year for year, _ in month_keys}
    month_name_to_index = {calendar.month_name[i]: i for i in range(1, 13)}
    month_names_set = set()

    # Build spendingData array
    spending_entries: List[str] = []

    for year, month in month_keys:
        month_name = calendar.month_name[month]
        month_names_set.add(month_name)

        total_spent = monthly_totals[(year, month)]

        # Category breakdown
        cat_map = monthly_categories[(year, month)]
        cat_items = sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
        cat_lines = []
        for name, value in cat_items:
            safe_name = str(name).replace('"', '\\"')
            cat_lines.append(
                f'      {{ name: "{safe_name}", value: {format_number(value)} }},'
            )

        # Daily spending + expenses
        daily_map = monthly_daily[(year, month)]
        daily_exp_map = monthly_daily_expenses.get((year, month), {})
        day_items = sorted(daily_map.items())  # by day
        day_lines = []
        for day, value in day_items:
            expenses = daily_exp_map.get(day, [])
            expense_lines: List[str] = []
            for exp in expenses:
                merchant = str(exp.get("merchant", "Unknown")).replace('"', '\\"')
                val = format_number(exp.get("value", 0.0))
                expense_lines.append(
                    f'        {{ merchant: "{merchant}", category: "{exp.get("category", "Shopping")}", value: {val} }},'
                )

            expenses_block = "\n".join(expense_lines)

            day_entry = (
                "      {\n"
                f'        day: "{day}",\n'
                f"        spent: {format_number(value)},\n"
                "        expenses: [\n"
                f"{expenses_block}\n"
                "        ],\n"
                "      }"
            )
            day_lines.append(day_entry)

        entry = (
            "  {\n"
            f'    month: "{month_name}",\n'
            f"    year: {year},\n"
            f"    totalSpent: {format_number(total_spent)},\n"
            f"    averageSpending: {format_number(overall_avg)},\n"
            "    categoryBreakdown: [\n"
            f"{"\n".join(cat_lines)}\n"
            "    ],\n"
            "    dailySpending: [\n"
            f"{",\n".join(day_lines)}\n"
            "    ],\n"
            "  }"
        )
        spending_entries.append(entry)

    # availableYears & availableMonths
    years_list = sorted(years_set)
    # deduplicate month names, but sort by actual month order
    month_names_sorted = sorted(
        month_names_set, key=lambda name: month_name_to_index.get(name, 13)
    )

    years_ts = ", ".join(str(y) for y in years_list)
    months_ts = ", ".join(f'"{m}"' for m in month_names_sorted)

    # Type definition
    type_def = """export type MonthlySpending = {
  month: string;
  year: number;
  totalSpent: number;
  averageSpending: number;
  categoryBreakdown: { name: string; value: number }[];
  dailySpending: { day: string; spent: number; expenses: { merchant: string; category: string; value: number }[] }[];
};"""

    spending_ts = "export const spendingData: MonthlySpending[] = [\n" + ",\n".join(
        spending_entries
    ) + "\n];"

    years_export = f"export const availableYears = [{years_ts}];"
    months_export = f"export const availableMonths = [{months_ts}];"

    return "\n\n".join([type_def, "", spending_ts, "", years_export, months_export]) + "\n"


def main():
    parser = argparse.ArgumentParser(
        description="Generate TypeScript spending data from classified transactions JSON."
    )
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        default=Path("./sample_data/classified_transactions.json"),
        help="Path to JSON file with classified transactions.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("./sample_data/spendingData.ts"),
        help="Path to output TypeScript file (data.ts).",
    )

    args = parser.parse_args()

    transactions = load_transactions(args.input)
    (
        monthly_totals,
        monthly_categories,
        monthly_daily,
        monthly_daily_expenses,
    ) = build_monthly_aggregates(transactions)
    ts_content = build_ts_content(
        monthly_totals, monthly_categories, monthly_daily, monthly_daily_expenses
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(ts_content, encoding="utf-8")
    print(f"Generated TypeScript data at {args.output}")


if __name__ == "__main__":
    main()
