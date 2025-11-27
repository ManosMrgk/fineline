import os
from typing import List, Dict

from fastapi import FastAPI, HTTPException, status
from fastapi.params import Header
from pydantic import BaseModel
from dotenv import load_dotenv

import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from sqlalchemy import (
    create_engine,
    MetaData,
    Table,
    Column,
    Integer,
    String,
    Text,
    DateTime,
    func,
    UniqueConstraint,
    select,
)
from sqlalchemy.orm import Session
from utils import CATEGORIES, KNOWN_MERCHANT_CATEGORIES

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

MODEL_PATH = os.getenv(
    "MODEL_PATH",
    "ManosMrgk/bert_transaction_classifier",
)

MODEL_VERSION = os.getenv("MODEL_VERSION", MODEL_PATH)
CATEGORIZER_SECRET = os.getenv("CATEGORIZER_SECRET")

HF_TOKEN = os.getenv("HUGGING_FACE_TOKEN") or os.getenv("HF_TOKEN")

FALLBACK_CATEGORY = None

engine = None
metadata = MetaData()
transaction_categories = None

if DATABASE_URL:
    engine = create_engine(DATABASE_URL, future=True)

    transaction_categories = Table(
        "transaction_categories",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("normalized_text", String(512), nullable=False, index=True),
        Column("original_text", Text, nullable=False),
        Column("category", String(128), nullable=False),
        Column("model_version", String(128), nullable=False, index=True),
        Column("created_at", DateTime(timezone=True), server_default=func.now()),
        UniqueConstraint(
            "normalized_text", "model_version", name="ux_text_model_version"
        ),
    )

    metadata.create_all(bind=engine)
else:
    print("[WARN] DATABASE_URL not set – caching will be disabled.")

app = FastAPI(title="Transaction Categorizer")

print("[Model] Loading tokenizer & model from:", MODEL_PATH)

load_kwargs: Dict[str, str] = {}
if HF_TOKEN:
    load_kwargs["token"] = HF_TOKEN

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, **load_kwargs)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH, **load_kwargs)
model.eval()
print("[Model] Loaded.")


class CategorizeRequest(BaseModel):
    texts: List[str]


class CategorizeResponse(BaseModel):
    categories: List[str]


def normalize_text(text: str) -> str:
    """
    Normalize text for caching:
    - lowercased
    - stripped
    - collapse internal whitespace
    """
    return " ".join(text.strip().lower().split())


@torch.no_grad()
def predict_categories(texts: List[str]) -> List[str]:
    """
    Predict categories for a list of transaction descriptions.

    Priority:
    1. If the description contains a known merchant keyword
       (from KNOWN_MERCHANT_CATEGORIES), use that category to minimize model calls.
    2. Otherwise, use the finetuned model to predict a label id,
       then map via CATEGORIES.
    """
    if not texts:
        return []

    # First pass: keyword-based categories to minimize model calls
    categories: List[str | None] = [None] * len(texts)
    model_inputs: List[str] = []
    model_indices: List[int] = []

    for i, text in enumerate(texts):
        lower_text = text.lower()
        matched_category: str | None = None

        # Check known merchant keywords
        for keyword, cat in KNOWN_MERCHANT_CATEGORIES.items():
            if keyword in lower_text:
                matched_category = cat
                break

        if matched_category is not None:
            # Use the rule-based category to minimize model computation time
            categories[i] = matched_category
        else:
            model_indices.append(i)
            model_inputs.append(text)

    # run the model for those without a rule-based match
    if model_inputs:
        inputs = tokenizer(
            model_inputs,
            padding=True,
            truncation=True,
            return_tensors="pt",
        )

        outputs = model(**inputs)
        logits = outputs.logits
        preds = torch.argmax(logits, dim=-1).tolist()

        for idx_in_list, label_id in zip(model_indices, preds):
            categories[idx_in_list] = CATEGORIES.get(label_id, FALLBACK_CATEGORY)

    return [cat if cat is not None else FALLBACK_CATEGORY for cat in categories]


def get_cached_categories(
    normalized_texts: List[str],
) -> Dict[str, str]:
    """
    Fetch cached categories for a list of normalized_texts
    for the current MODEL_VERSION.
    Returns dict: normalized_text -> category
    """
    if engine is None or transaction_categories is None:
        return {}

    if not normalized_texts:
        return {}

    with Session(engine) as session:
        stmt = (
            select(
                transaction_categories.c.normalized_text,
                transaction_categories.c.category,
            )
            .where(transaction_categories.c.model_version == MODEL_VERSION)
            .where(transaction_categories.c.normalized_text.in_(normalized_texts))
        )
        rows = session.execute(stmt).all()

    cache: Dict[str, str] = {}
    for norm_text, category in rows:
        cache[norm_text] = category
    return cache


def cache_categories(
    originals: List[str],
    normalized: List[str],
    categories: List[str],
) -> None:
    """
    Insert newly computed categories into DB cache.
    lists must be aligned by index.
    """
    if engine is None or transaction_categories is None:
        return

    if not originals:
        return

    with Session(engine) as session:
        for orig, norm, cat in zip(originals, normalized, categories):
            try:
                session.execute(
                    transaction_categories.insert().values(
                        normalized_text=norm,
                        original_text=orig,
                        category=cat,
                        model_version=MODEL_VERSION,
                    )
                )
            except Exception:
                session.rollback()
            else:
                session.commit()


@app.get("/")
def health():
    return {"status": "ok"}


@app.post("/categorize", response_model=CategorizeResponse)
def categorize(
    req: CategorizeRequest,
    x_categorizer_secret: str | None = Header(default=None),
):
    if CATEGORIZER_SECRET:
        if x_categorizer_secret != CATEGORIZER_SECRET:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing categorizer secret",
            )

    texts = req.texts or []
    if not texts:
        return CategorizeResponse(categories=[])

    normalized_texts = [normalize_text(t) for t in texts]

    cached = get_cached_categories(normalized_texts)

    missing_normals: list[str] = []
    missing_originals: list[str] = []
    seen_missing_norms: set[str] = set()

    for original, norm in zip(texts, normalized_texts):
        # Already in DB cache
        if norm in cached:
            continue

        # Not cached, but already queued in this request
        if norm in seen_missing_norms:
            continue

        seen_missing_norms.add(norm)
        missing_normals.append(norm)
        missing_originals.append(original)

    # Predict only for unique missing texts
    if missing_originals:
        newly_predicted = predict_categories(missing_originals)

        # Cache in DB (one row per unique normalized text)
        cache_categories(missing_originals, missing_normals, newly_predicted)

        # Update in-memory cache
        for norm, cat in zip(missing_normals, newly_predicted):
            cached[norm] = cat

    # Build final categories in original order
    final_categories: list[str] = []
    for norm in normalized_texts:
        cat = cached.get(norm, FALLBACK_CATEGORY)
        final_categories.append(cat)

    return CategorizeResponse(categories=final_categories)
