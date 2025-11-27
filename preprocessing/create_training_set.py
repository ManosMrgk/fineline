from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from utils import get_label_mappings, get_merchant_category


def build_training_set(
    input_path: Path,
    output_path: Path,
    text_column: str = "transaction_description",
    merchant_col: str = "merchant_category",
    test_size: float = 0.1,
    test_output_path: Path | None = None,
    random_state: int = 42,
) -> None:
    df = pd.read_excel(input_path) if input_path.suffix.lower() in {".xls", ".xlsx"} else pd.read_csv(input_path)

    # If merchant_category is not present, compute it from text
    if merchant_col not in df.columns:
        if text_column not in df.columns:
            raise ValueError(
                f"'{text_column}' column not found in {input_path}. "
                "Please either add it or change --text-column."
            )
        df[merchant_col] = df[text_column].apply(get_merchant_category)

    label2id, _ = get_label_mappings()

    # Keep only rows where merchant_category is a known category
    mask = df[merchant_col].notna() & df[merchant_col].isin(label2id.keys())
    df_labeled = df.loc[mask].copy()

    if df_labeled.empty:
        raise RuntimeError("No rows with valid merchant categories were found. Check your mappings.")

    df_labeled["label"] = df_labeled[merchant_col].map(label2id)

    # Training base: text + integer label (+ human label for debugging)
    df_out = pd.DataFrame({
        "text": df_labeled[text_column].astype(str),
        "label": df_labeled["label"].astype(int),
        "label_name": df_labeled[merchant_col].astype(str),
    })

    # --- NEW: remove duplicates (same text + label) ---
    df_out = df_out.drop_duplicates(subset=["text", "label"], keep="first").reset_index(drop=True)

    if df_out.empty:
        raise RuntimeError("No data left after removing duplicates.")

    # --- NEW: train / test split ---
    n = len(df_out)

    # If test_size <= 0 or there is only 1 row, just use all as train
    if test_size <= 0 or n <= 1:
        df_train = df_out
        df_test = pd.DataFrame(columns=df_out.columns)
    else:
        # Shuffle
        df_shuffled = df_out.sample(frac=1.0, random_state=random_state).reset_index(drop=True)

        # Compute test count (at least 1, but not all the data)
        test_count = max(1, int(round(n * test_size)))
        if test_count >= n:
            test_count = n - 1

        df_test = df_shuffled.iloc[:test_count].reset_index(drop=True)
        df_train = df_shuffled.iloc[test_count:].reset_index(drop=True)

    # Determine test output path if not given
    if test_output_path is None:
        stem = output_path.stem
        suffix = output_path.suffix or ".csv"
        test_output_path = output_path.with_name(f"{stem}_test{suffix}")

    # Make sure directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    test_output_path.parent.mkdir(parents=True, exist_ok=True)

    # Save train and test
    df_train.to_csv(output_path, index=False)
    df_test.to_csv(test_output_path, index=False)

    print(
        f"Saved training set with {len(df_train)} rows to {output_path} "
        f"and test set with {len(df_test)} rows to {test_output_path}"
    )


def main():
    parser = argparse.ArgumentParser(description="Create training and test sets from classified transactions.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("sample_data/classified_transactions.xlsx"),
        help="Input Excel/CSV file with transaction_description and merchant_category.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("sample_data/training_data.csv"),
        help="Output CSV for training data (columns: text, label, label_name).",
    )
    parser.add_argument(
        "--text-column",
        type=str,
        default="transaction_description",
        help="Name of the text column to use as model input.",
    )
    parser.add_argument(
        "--merchant-column",
        type=str,
        default="merchant_category",
        help="Name of the column containing merchant-based categories.",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.1,
        help="Fraction of the dataset to reserve as test set (0-1).",
    )
    parser.add_argument(
        "--test-output",
        type=Path,
        default=None,
        help="Optional path for the test CSV. If not set, '_test' is appended to --output.",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="Random seed for shuffling before the train/test split.",
    )

    args = parser.parse_args()
    build_training_set(
        args.input,
        args.output,
        args.text_column,
        args.merchant_column,
        args.test_size,
        args.test_output,
        args.random_state,
    )


if __name__ == "__main__":
    main()
