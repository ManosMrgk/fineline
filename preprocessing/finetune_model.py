from __future__ import annotations

import argparse
import os
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from dotenv import load_dotenv
from huggingface_hub import login
from torch.utils.data import Dataset, random_split
from transformers import (
    BertTokenizer,
    BertForSequenceClassification,
    Trainer,
    TrainingArguments,
)

from utils import get_label_mappings


class TransactionsDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_len: int = 64):
        self.texts = list(texts)
        self.labels = list(labels)
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx: int):
        text = str(self.texts[idx])
        label = int(self.labels[idx])

        enc = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_len,
            return_tensors="pt",
        )

        item = {k: v.squeeze(0) for k, v in enc.items()}
        item["labels"] = torch.tensor(label, dtype=torch.long)
        return item


def load_env_and_login():
    """Login to HF Hub."""
    load_dotenv()
    hf_token = os.getenv("HUGGING_FACE_TOKEN")
    if hf_token:
        login(token=hf_token)
    else:
        print("Warning: HUGGING_FACE_TOKEN not set; skipping HF Hub login.")


def finetune(
    training_csv: Path,
    model_name: str,
    output_dir: Path,
    epochs: int = 3,
    batch_size: int = 16,
    max_len: int = 64,
    learning_rate: float = 2e-5,
) -> None:
    df = pd.read_csv(training_csv)

    if "text" not in df.columns or "label" not in df.columns:
        raise ValueError(f"{training_csv} must contain 'text' and 'label' columns.")

    label2id, id2label = get_label_mappings()

    # Basic sanity check that labels are within your ID space
    unknown_labels = set(df["label"]) - set(label2id.values())
    if unknown_labels:
        print(f"Warning: Found labels not in CATEGORIES: {unknown_labels}")

    tokenizer = BertTokenizer.from_pretrained(model_name)
    model = BertForSequenceClassification.from_pretrained(
        model_name,
        num_labels=len(label2id),
        id2label=id2label,
        label2id=label2id,
    )

    dataset = TransactionsDataset(df["text"], df["label"], tokenizer, max_len=max_len)

    # Simple train/val split
    if len(dataset) < 10:
        raise RuntimeError("Not enough training examples (<10). Add more labeled data first.")

    val_size = max(1, int(0.2 * len(dataset)))
    train_size = len(dataset) - val_size
    train_dataset, val_dataset = random_split(dataset, [train_size, val_size])

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        num_train_epochs=epochs,
        learning_rate=learning_rate,
        weight_decay=0.01,
        logging_steps=10,
    )

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        accuracy = (preds == labels).mean()
        return {"accuracy": float(accuracy)}

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        processing_class=tokenizer,
        compute_metrics=compute_metrics,
    )

    print("Starting training...")
    trainer.train()

    print(f"Saving fine-tuned model to {output_dir}...")
    output_dir.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    print("Done.")


def main():
    parser = argparse.ArgumentParser(description="Fine-tune BERT transaction classifier.")
    parser.add_argument(
        "--training-csv",
        type=Path,
        default=Path("sample_data/training_data.csv"),
        help="CSV produced by create_training_set.py (columns: text, label, label_name).",
    )
    parser.add_argument(
        "--model-name",
        type=str,
        default="kuro-08/bert-transaction-categorization",
        help="Base model name or path.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("finetuned-transaction-model"),
        help="Where to save the fine-tuned model.",
    )
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs.")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size per device.")
    parser.add_argument("--max-len", type=int, default=64, help="Max token length.")
    parser.add_argument("--lr", type=float, default=2e-5, help="Learning rate.")

    args = parser.parse_args()

    load_env_and_login() 

    finetune(
        training_csv=args.training_csv,
        model_name=args.model_name,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        max_len=args.max_len,
        learning_rate=args.lr,
    )


if __name__ == "__main__":
    main()
