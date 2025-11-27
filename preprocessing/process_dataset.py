from __future__ import annotations

import os
import argparse
from pathlib import Path

import numpy as np
import torch
import pandas as pd
from transformers import BertTokenizer, BertForSequenceClassification
from dotenv import load_dotenv
from huggingface_hub import login

from utils import CATEGORIES, get_merchant_category


BASE_MODEL_NAME = "kuro-08/bert-transaction-categorization"
DEFAULT_FINETUNED_MODEL_PATH = "finetuned-transaction-model"


def load_hf_token():
    load_dotenv()
    hf_token = os.getenv("HUGGING_FACE_TOKEN")
    if hf_token is None:
        raise RuntimeError("HUGGING_FACE_TOKEN is not set in .env")
    login(token=hf_token)


def load_model_and_tokenizer(model_name_or_path: str):
    tokenizer = BertTokenizer.from_pretrained(model_name_or_path)
    model = BertForSequenceClassification.from_pretrained(model_name_or_path)
    return tokenizer, model


def classify_dataset(
    input_path: Path,
    output_path: Path,
    model_type: str = "finetuned",
    finetuned_model_path: str = DEFAULT_FINETUNED_MODEL_PATH,
    batch_size: int = 32,
    json_output_path: Path | None = None,
):
    # Decide which model to use
    if model_type == "base":
        model_name = BASE_MODEL_NAME
        print(f"Using base model: {model_name}")
    elif model_type == "finetuned":
        model_name = finetuned_model_path
        print(f"Using fine-tuned model: {model_name}")
    else:
        raise ValueError(f"Unknown model_type '{model_type}'. Use 'base' or 'finetuned'.")

    # Login to HF (needed for remote models like the base one)
    load_hf_token()

    # Load model + tokenizer
    tokenizer, model = load_model_and_tokenizer(model_name)

    # Load excel data
    df = pd.read_excel(input_path)

    # Build text field (same logic as before)
    df["transaction_description"] = (
        df["Περιγραφή"].astype(str)
        + " "
        + df["Κανάλι"].astype(str)
    )

    # Initialize category column
    df["category"] = None

    # Mark incomes directly
    income_mask = df["Χρέωση / Πίστωση"] == "Π"
    df.loc[income_mask, "category"] = "Income"

    # Rows to classify with the model
    to_classify_idx = df.index[~income_mask]
    texts = df.loc[to_classify_idx, "transaction_description"].tolist()

    all_labels: list[str] = []
    batch_num = 0

    model.eval()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    print(f"Using device: {device}")

    for start in range(0, len(texts), batch_size):
        batch_num += 1
        print(f"Processing batch {batch_num}...")
        batch_texts = texts[start : start + batch_size]

        inputs = tokenizer(
            batch_texts,
            return_tensors="pt",
            truncation=True,
            padding=True,
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            preds = logits.argmax(dim=-1).tolist()

        batch_labels = [CATEGORIES.get(p, p) for p in preds]
        all_labels.extend(batch_labels)

    df.loc[to_classify_idx, "category"] = all_labels

    # Merchant category using your rule-based helper
    df["merchant_category"] = df["transaction_description"].apply(get_merchant_category)

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_excel(output_path, index=False)
    print(f"Saved Excel to {output_path}")

    # Optional: JSON export for Vue dashboard
    if json_output_path is not None:
        json_output_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_json(json_output_path, orient="records", force_ascii=False, indent=2)
        print(f"Saved JSON to {json_output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Classify transactions using base or fine-tuned BERT model."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("sample_data/payments_test.xlsx"),
        help="Input Excel file with raw payments.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("sample_data/classified_transactions.xlsx"),
        help="Output Excel file with predicted categories.",
    )
    parser.add_argument(
        "--model-type",
        type=str,
        choices=["base", "finetuned"],
        default="finetuned",
        help="Which model to use: 'base' Hugging Face model or 'finetuned'.",
    )
    parser.add_argument(
        "--finetuned-model",
        type=str,
        default=DEFAULT_FINETUNED_MODEL_PATH,
        help=(
            "Path or HF name for the fine-tuned model "
            "(used when --model-type=finetuned). "
            f"Default: {DEFAULT_FINETUNED_MODEL_PATH}"
        ),
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="Batch size for inference.",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=None,
        help="Optional path to also export the classified data as JSON (for the Vue dashboard).",
    )

    args = parser.parse_args()

    classify_dataset(
        input_path=args.input,
        output_path=args.output,
        model_type=args.model_type,
        finetuned_model_path=args.finetuned_model,
        batch_size=args.batch_size,
        json_output_path=args.json_output,
    )


if __name__ == "__main__":
    main()
