from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    classification_report,
    confusion_matrix,
)
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from utils import get_label_mappings


# ---- Constants ----
BASE_MODEL_NAME = "kuro-08/bert-transaction-categorization"
DEFAULT_FINETUNED_MODEL_PATH = "finetuned-transaction-model"


def load_model_and_tokenizer(model_name_or_path: str):
    tokenizer = AutoTokenizer.from_pretrained(model_name_or_path)
    model = AutoModelForSequenceClassification.from_pretrained(model_name_or_path)
    return model, tokenizer


def predict_labels(
    model: AutoModelForSequenceClassification,
    tokenizer: AutoTokenizer,
    texts: List[str],
    batch_size: int = 16,
    max_length: int = 128,
    device: torch.device | None = None,
) -> np.ndarray:
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model.to(device)
    model.eval()

    all_preds: List[int] = []

    with torch.no_grad():
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i : i + batch_size]
            encodings = tokenizer(
                batch_texts,
                padding=True,
                truncation=True,
                max_length=max_length,
                return_tensors="pt",
            )
            encodings = {k: v.to(device) for k, v in encodings.items()}

            outputs = model(**encodings)
            logits = outputs.logits
            preds = torch.argmax(logits, dim=-1)
            all_preds.extend(preds.cpu().numpy().tolist())

    return np.array(all_preds)


def compute_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    id2label: Dict[int, str] | Dict[str, str],
) -> Dict[str, Any]:
    acc = accuracy_score(y_true, y_pred)
    precision_macro, recall_macro, f1_macro, _ = precision_recall_fscore_support(
        y_true, y_pred, average="macro", zero_division=0
    )
    precision_weighted, recall_weighted, f1_weighted, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )

    # Robust id2label lookup (int or str keys)
    def get_name(label_id: int) -> str:
        if label_id in id2label:
            return id2label[label_id]  # type: ignore[index]
        if str(label_id) in id2label:
            return id2label[str(label_id)]  # type: ignore[index]
        return str(label_id)

    unique_labels = sorted(set(y_true.tolist() + y_pred.tolist()))
    target_names = [get_name(l) for l in unique_labels]

    cls_report = classification_report(
        y_true,
        y_pred,
        labels=unique_labels,
        target_names=target_names,
        digits=3,
        zero_division=0,
    )

    cm = confusion_matrix(y_true, y_pred, labels=unique_labels)

    return {
        "accuracy": acc,
        "precision_macro": precision_macro,
        "recall_macro": recall_macro,
        "f1_macro": f1_macro,
        "precision_weighted": precision_weighted,
        "recall_weighted": recall_weighted,
        "f1_weighted": f1_weighted,
        "classification_report": cls_report,
        "confusion_matrix": cm,
        "labels": unique_labels,
        "label_names": target_names,
    }


def print_metrics(title: str, metrics: Dict[str, Any]) -> None:
    print("=" * 80)
    print(title)
    print("=" * 80)
    print(f"Accuracy             : {metrics['accuracy']:.4f}")
    print(f"Precision (macro)    : {metrics['precision_macro']:.4f}")
    print(f"Recall (macro)       : {metrics['recall_macro']:.4f}")
    print(f"F1-score (macro)     : {metrics['f1_macro']:.4f}")
    print(f"Precision (weighted) : {metrics['precision_weighted']:.4f}")
    print(f"Recall (weighted)    : {metrics['recall_weighted']:.4f}")
    print(f"F1-score (weighted)  : {metrics['f1_weighted']:.4f}")
    print("\nPer-class report:")
    print(metrics["classification_report"])
    print("Confusion matrix (rows=true, cols=pred):")
    print(metrics["confusion_matrix"])
    print("Labels:", metrics["labels"])
    print("Label names:", metrics["label_names"])
    print()


def evaluate_model_on_testset(
    model_name_or_path: str,
    df_test: pd.DataFrame,
    text_column: str,
    label_column: str,
    id2label: Dict[int, str] | Dict[str, str],
    batch_size: int = 16,
    max_length: int = 128,
    device: torch.device | None = None,
) -> Dict[str, Any]:
    texts = df_test[text_column].astype(str).tolist()
    y_true = df_test[label_column].astype(int).to_numpy()

    model, tokenizer = load_model_and_tokenizer(model_name_or_path)
    y_pred = predict_labels(
        model=model,
        tokenizer=tokenizer,
        texts=texts,
        batch_size=batch_size,
        max_length=max_length,
        device=device,
    )

    metrics = compute_metrics(y_true, y_pred, id2label)
    return metrics


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate base (HF) and fine-tuned transaction models on the test set."
    )
    parser.add_argument(
        "--test-file",
        type=Path,
        default=Path("sample_data/training_data_test.csv"),
        help="CSV file with columns including 'text' and 'label'.",
    )
    parser.add_argument(
        "--text-column",
        type=str,
        default="text",
        help="Name of the text column in the test CSV.",
    )
    parser.add_argument(
        "--label-column",
        type=str,
        default="label",
        help="Name of the label column in the test CSV (integer labels).",
    )
    parser.add_argument(
        "--finetuned-model",
        type=str,
        default=DEFAULT_FINETUNED_MODEL_PATH,
        help=(
            "Path or model name for the fine-tuned model. "
            f"Default: {DEFAULT_FINETUNED_MODEL_PATH}"
        ),
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Batch size for inference.",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        default=128,
        help="Maximum sequence length for tokenization.",
    )

    args = parser.parse_args()

    # Load label mappings (must match training)
    label2id, id2label = get_label_mappings()

    # Load test set
    df_test = pd.read_csv(args.test_file)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Evaluate base model (fixed HF model)
    print(f"Evaluating base model: {BASE_MODEL_NAME}")
    base_metrics = evaluate_model_on_testset(
        model_name_or_path=BASE_MODEL_NAME,
        df_test=df_test,
        text_column=args.text_column,
        label_column=args.label_column,
        id2label=id2label,
        batch_size=args.batch_size,
        max_length=args.max_length,
        device=device,
    )

    # Evaluate fine-tuned model (default or user-provided)
    print(f"Evaluating fine-tuned model: {args.finetuned_model}")
    ft_metrics = evaluate_model_on_testset(
        model_name_or_path=args.finetuned_model,
        df_test=df_test,
        text_column=args.text_column,
        label_column=args.label_column,
        id2label=id2label,
        batch_size=args.batch_size,
        max_length=args.max_length,
        device=device,
    )

    # Print comparison
    print_metrics("Base model performance", base_metrics)
    print_metrics("Fine-tuned model performance", ft_metrics)


if __name__ == "__main__":
    main()
