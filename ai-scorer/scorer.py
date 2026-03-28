"""
TrustID AI Scorer — Two-Model Pipeline
Model 1: Random Forest on Kaggle credit card fraud dataset (transaction-level)
Model 2: Random Forest on synthetic behavioural profiles (identity-level trust)
"""

import os, json, warnings, time
import numpy as np
import pandas as pd
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    roc_auc_score, f1_score, accuracy_score,
    precision_score, recall_score
)
from imblearn.over_sampling import SMOTE

warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

MODEL_DIR  = os.path.join(os.path.dirname(__file__), 'models')
KAGGLE_CSV = os.environ.get('KAGGLE_CSV', '/mnt/c/Users/enqi3/Downloads/creditcard.csv/creditcard.csv')

BEHAVIOURAL_FEATURES = [
    'repayment_rate', 'did_age_days', 'tx_per_day',
    'attestation_count', 'tx_interval_cv', 'loan_to_repay_ratio'
]

KAGGLE_FEATURES = ['Time','V1','V2','V3','V4','V5','V6','V7','V8','V9',
                   'V10','V11','V12','V13','V14','V15','V16','V17','V18',
                   'V19','V20','V21','V22','V23','V24','V25','V26','V27',
                   'V28','Amount']

# Global state
model1        = None   # Kaggle transaction fraud RF
scaler1       = None
model2        = None   # Synthetic identity trust RF
scaler2       = None
METRICS_M1    = {}
METRICS_M2    = {}
TRAINING_LOG  = []     # live log lines for frontend to poll

def log(msg):
    ts = time.strftime('%H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    TRAINING_LOG.append(line)
    if len(TRAINING_LOG) > 200:
        TRAINING_LOG.pop(0)

# ── Synthetic data generators (unchanged from your original) ──────────────────

def gen_real(n):
    return pd.DataFrame({
        'repayment_rate':      np.clip(np.random.normal(0.92,0.08,n),0,1),
        'did_age_days':        np.random.randint(180,1200,n).astype(float),
        'tx_per_day':          np.clip(np.random.normal(0.8,0.5,n),0.05,5.0),
        'attestation_count':   np.random.randint(2,5,n).astype(float),
        'tx_interval_cv':      np.clip(np.random.normal(0.9,0.4,n),0.2,3.0),
        'loan_to_repay_ratio': np.clip(np.random.normal(0.85,0.1,n),0.3,1.2),
        'isFraud': np.zeros(n,dtype=int)
    })

def gen_fraud(n):
    n_a,n_b,n_c = int(n*0.5),int(n*0.3),n-int(n*0.5)-int(n*0.3)
    a = pd.DataFrame({
        'repayment_rate':      np.clip(np.random.normal(0.05,0.05,n_a),0,0.2),
        'did_age_days':        np.random.randint(1,30,n_a).astype(float),
        'tx_per_day':          np.clip(np.random.normal(0.05,0.03,n_a),0,0.15),
        'attestation_count':   np.ones(n_a),
        'tx_interval_cv':      np.clip(np.random.normal(0.02,0.01,n_a),0,0.05),
        'loan_to_repay_ratio': np.clip(np.random.normal(0.05,0.05,n_a),0,0.2),
        'isFraud':             np.ones(n_a,dtype=int)})
    b = pd.DataFrame({
        'repayment_rate':      np.clip(np.random.normal(0.2,0.1,n_b),0,0.4),
        'did_age_days':        np.random.randint(20,90,n_b).astype(float),
        'tx_per_day':          np.clip(np.random.normal(12,2,n_b),8,20),
        'attestation_count':   np.random.randint(1,2,n_b).astype(float),
        'tx_interval_cv':      np.clip(np.random.normal(0.01,0.005,n_b),0,0.03),
        'loan_to_repay_ratio': np.clip(np.random.normal(0.1,0.05,n_b),0,0.25),
        'isFraud':             np.ones(n_b,dtype=int)})
    c = pd.DataFrame({
        'repayment_rate':      np.clip(np.random.normal(0.45,0.1,n_c),0.2,0.6),
        'did_age_days':        np.random.randint(45,120,n_c).astype(float),
        'tx_per_day':          np.clip(np.random.normal(0.4,0.2,n_c),0.1,1.0),
        'attestation_count':   np.random.randint(1,3,n_c).astype(float),
        'tx_interval_cv':      np.clip(np.random.normal(0.08,0.03,n_c),0.04,0.15),
        'loan_to_repay_ratio': np.clip(np.random.normal(0.25,0.1,n_c),0.1,0.45),
        'isFraud':             np.ones(n_c,dtype=int)})
    return pd.concat([a,b,c],ignore_index=True)

# ── Model 1: Kaggle Random Forest ─────────────────────────────────────────────

def train_model1_kaggle():
    global model1, scaler1, METRICS_M1
    log("=== MODEL 1: Transaction Fraud Detector (Kaggle) ===")

    if not os.path.exists(KAGGLE_CSV):
        log(f"ERROR: Kaggle CSV not found at {KAGGLE_CSV}")
        log("Skipping Model 1 — set KAGGLE_CSV env var to fix this")
        return False

    log(f"Loading Kaggle dataset from {KAGGLE_CSV}...")
    df = pd.read_csv(KAGGLE_CSV)
    log(f"Dataset loaded: {len(df):,} rows, fraud rate: {df['Class'].mean()*100:.3f}%")

    X = df[KAGGLE_FEATURES].copy()
    y = df['Class']

    # Scale Amount and Time (V1-V28 already PCA scaled)
    log("Scaling Amount and Time features...")
    sc = StandardScaler()
    X[['Amount','Time']] = sc.fit_transform(X[['Amount','Time']])

    log("Splitting train/test (80/20)...")
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    log(f"Applying SMOTE to balance 578:1 class imbalance...")
    sm = SMOTE(random_state=42, sampling_strategy=0.1)
    X_sm, y_sm = sm.fit_resample(X_tr, y_tr)
    log(f"Post-SMOTE train size: {len(X_sm):,} rows")

    log("Fitting Random Forest (100 estimators, max_depth=10)...")
    log("This takes ~60-90 seconds — please wait...")
    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=10,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1
    )
    rf.fit(X_sm, y_sm)

    log("Evaluating on test set...")
    y_pred = rf.predict(X_te)
    y_prob = rf.predict_proba(X_te)[:,1]

    METRICS_M1 = {
        "roundID":   "round-kaggle-1",
        "modelType": "RandomForest-Kaggle",
        "dataSource": "ULB Credit Card Fraud Dataset (Kaggle)",
        "rocAuc":    round(float(roc_auc_score(y_te, y_prob)), 4),
        "f1Score":   round(float(f1_score(y_te, y_pred)), 4),
        "accuracy":  round(float(accuracy_score(y_te, y_pred)), 4),
        "precision": round(float(precision_score(y_te, y_pred)), 4),
        "recall":    round(float(recall_score(y_te, y_pred)), 4),
        "trainSize": int(len(X_sm)),
        "testSize":  int(len(X_te)),
        "fraudRate": round(float(y.mean()), 6),
    }

    log(f"Model 1 Results:")
    log(f"  ROC-AUC:   {METRICS_M1['rocAuc']}")
    log(f"  F1 Score:  {METRICS_M1['f1Score']}")
    log(f"  Accuracy:  {METRICS_M1['accuracy']}")
    log(f"  Precision: {METRICS_M1['precision']}")
    log(f"  Recall:    {METRICS_M1['recall']}")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(rf, os.path.join(MODEL_DIR, 'model1_kaggle.pkl'))
    joblib.dump(sc, os.path.join(MODEL_DIR, 'scaler1_kaggle.pkl'))
    model1, scaler1 = rf, sc
    log("Model 1 saved to disk.")
    return True

# ── Model 2: Synthetic Behavioural Random Forest ───────────────────────────────

def train_model2_synthetic():
    global model2, scaler2, METRICS_M2
    log("=== MODEL 2: Identity Trust Scorer (Synthetic Behavioural) ===")
    log("Generating synthetic behavioural profiles...")

    np.random.seed(42)
    df = pd.concat([gen_real(2000), gen_fraud(400)], ignore_index=True).sample(frac=1, random_state=42)
    X  = df[BEHAVIOURAL_FEATURES].copy()
    y  = df['isFraud']

    log(f"Dataset: {len(df):,} rows | Fraud: {y.mean()*100:.1f}%")

    for col in BEHAVIOURAL_FEATURES:
        if X[col].skew() > 1:
            X[col] = np.log1p(X[col])

    sc = StandardScaler()
    X_scaled = sc.fit_transform(X)

    X_tr, X_te, y_tr, y_te = train_test_split(
        X_scaled, y, test_size=0.2, random_state=43, stratify=y
    )

    log("Applying SMOTE...")
    X_sm, y_sm = SMOTE(random_state=42).fit_resample(X_tr, y_tr)
    log(f"Post-SMOTE train size: {len(X_sm):,} rows")

    log("Fitting Random Forest (200 estimators)...")
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=None,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1
    )
    rf.fit(X_sm, y_sm)

    y_pred = rf.predict(X_te)
    y_prob = rf.predict_proba(X_te)[:,1]

    METRICS_M2 = {
        "roundID":   "round-synthetic-1",
        "modelType": "RandomForest-Synthetic",
        "dataSource": "Synthetic Behavioural Profiles",
        "rocAuc":    round(float(roc_auc_score(y_te, y_prob)), 4),
        "f1Score":   round(float(f1_score(y_te, y_pred)), 4),
        "accuracy":  round(float(accuracy_score(y_te, y_pred)), 4),
        "precision": round(float(precision_score(y_te, y_pred)), 4),
        "recall":    round(float(recall_score(y_te, y_pred)), 4),
        "trainSize": int(len(X_sm)),
        "testSize":  int(len(X_te)),
    }

    log(f"Model 2 Results:")
    log(f"  ROC-AUC:   {METRICS_M2['rocAuc']}")
    log(f"  F1 Score:  {METRICS_M2['f1Score']}")
    log(f"  Accuracy:  {METRICS_M2['accuracy']}")
    log(f"  Precision: {METRICS_M2['precision']}")
    log(f"  Recall:    {METRICS_M2['recall']}")

    # Feature importance for demo
    importances = dict(zip(BEHAVIOURAL_FEATURES, rf.feature_importances_.tolist()))
    METRICS_M2['featureImportances'] = {k: round(v,4) for k,v in importances.items()}
    log(f"  Top feature: {max(importances, key=importances.get)}")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(rf, os.path.join(MODEL_DIR, 'model2_synthetic.pkl'))
    joblib.dump(sc, os.path.join(MODEL_DIR, 'scaler2_synthetic.pkl'))
    model2, scaler2 = rf, sc
    log("Model 2 saved to disk.")
    return True

# ── Boot: load from disk or train ─────────────────────────────────────────────

def load_or_train():
    global model1, scaler1, model2, scaler2

    m1_path = os.path.join(MODEL_DIR, 'model1_kaggle.pkl')
    m2_path = os.path.join(MODEL_DIR, 'model2_synthetic.pkl')

    if os.path.exists(m1_path):
        model1  = joblib.load(m1_path)
        scaler1 = joblib.load(os.path.join(MODEL_DIR, 'scaler1_kaggle.pkl'))
        log("Model 1 (Kaggle RF) loaded from disk")
    else:
        log("Model 1 not found on disk — training now...")
        train_model1_kaggle()

    if os.path.exists(m2_path):
        model2  = joblib.load(m2_path)
        scaler2 = joblib.load(os.path.join(MODEL_DIR, 'scaler2_synthetic.pkl'))
        log("Model 2 (Synthetic RF) loaded from disk")
    else:
        log("Model 2 not found on disk — training now...")
        train_model2_synthetic()

load_or_train()

# ── Scoring helpers ───────────────────────────────────────────────────────────

def get_tier(score):
    if score >= 80: return "Prime"
    if score >= 65: return "Standard"
    if score >= 50: return "Subprime"
    return "Rejected"

def compute_trust_score(data: dict) -> dict:
    """Model 2: identity-level trust score from behavioural features"""
    if model2 is None:
        return {"error": "Model 2 not trained yet"}

    row = {f: float(data.get(f, 0)) for f in BEHAVIOURAL_FEATURES}
    df  = pd.DataFrame([row])[BEHAVIOURAL_FEATURES]
    for col in BEHAVIOURAL_FEATURES:
        if df[col].skew() > 1:
            df[col] = np.log1p(df[col])

    scaled     = scaler2.transform(df)
    fraud_prob = float(model2.predict_proba(scaled)[0][1])
    trust      = int((1 - fraud_prob) * 100)
    tier       = get_tier(trust)

    return {
        "did":          data.get("did", "unknown"),
        "trustScore":   trust,
        "fraudProb":    round(fraud_prob, 4),
        "tier":         tier,
        "eligible":     tier != "Rejected",
        "maxLoanSGD":   {"Prime":50000,"Standard":20000,"Subprime":8000,"Rejected":0}[tier],
        "interestRate": {"Prime":3.5,"Standard":6.0,"Subprime":9.5,"Rejected":0}[tier],
        "features":     row,
        "model":        "RandomForest-Synthetic",
    }

def score_transaction(data: dict) -> dict:
    """Model 1: transaction-level fraud flag from Kaggle features"""
    if model1 is None:
        return {"fraudFlag": 0, "fraudProb": 0.0, "note": "Model 1 not available"}

    row = {f: float(data.get(f, 0)) for f in KAGGLE_FEATURES}
    df  = pd.DataFrame([row])[KAGGLE_FEATURES]
    df[['Amount','Time']] = scaler1.transform(df[['Amount','Time']])

    fraud_prob = float(model1.predict_proba(df)[0][1])
    fraud_flag = int(model1.predict(df)[0])

    return {
        "fraudFlag":  fraud_flag,
        "fraudProb":  round(fraud_prob, 4),
        "model":      "RandomForest-Kaggle",
    }

# ── Flask routes ──────────────────────────────────────────────────────────────

@app.route("/score", methods=["POST"])
def score():
    data = request.json
    if not data:
        return jsonify({"error": "No data"}), 400
    return jsonify(compute_trust_score(data))

@app.route("/score-transaction", methods=["POST"])
def score_transaction_route():
    data = request.json
    if not data:
        return jsonify({"error": "No data"}), 400
    return jsonify(score_transaction(data))

@app.route("/metrics", methods=["GET"])
def metrics():
    return jsonify({
        "model1": METRICS_M1,
        "model2": METRICS_M2,
    })

@app.route("/metrics/m1", methods=["GET"])
def metrics_m1():
    return jsonify(METRICS_M1)

@app.route("/metrics/m2", methods=["GET"])
def metrics_m2():
    return jsonify(METRICS_M2)

@app.route("/retrain", methods=["POST"])
def retrain():
    data = request.json or {}
    which = data.get("model", "both")
    log(f"Retrain requested: model={which}")
    if which in ("1", "both"):
        train_model1_kaggle()
    if which in ("2", "both"):
        train_model2_synthetic()
    return jsonify({
        "success": True,
        "model1":  METRICS_M1,
        "model2":  METRICS_M2,
    })

@app.route("/training-log", methods=["GET"])
def training_log():
    """Frontend polls this every 5 seconds to show live training progress"""
    since = int(request.args.get("since", 0))
    return jsonify({
        "logs": TRAINING_LOG[since:],
        "total": len(TRAINING_LOG),
    })

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":   "ok",
        "model1":   model1 is not None,
        "model2":   model2 is not None,
        "metrics":  {"model1": METRICS_M1, "model2": METRICS_M2},
    })

if __name__ == "__main__":
    log("[Scorer] Running on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=False)
