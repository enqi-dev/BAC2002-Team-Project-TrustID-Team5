"""
TrustID AI Scorer
- Trains behavioral identity model on startup if model not found
- Serves trust scores 0-100 via REST API
- Adapted from: keshabh/fraudtransactiondetection (Kaggle)
  Pipeline: SMOTE + Logistic Regression + ROC-AUC

Run: python3 scorer.py
"""

import os, json, warnings
import numpy as np
import pandas as pd
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS

warnings.filterwarnings('ignore')

app    = Flask(__name__)
CORS(app)

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
FEATURES  = ['repayment_rate','did_age_days','tx_per_day',
             'attestation_count','tx_interval_cv','loan_to_repay_ratio']

# ── Train if model doesn't exist ─────────────────────────────────────────────

def train_model():
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import roc_auc_score
    from imblearn.over_sampling import SMOTE

    print("[Scorer] Training behavioral identity model...")
    np.random.seed(42)
    N_REAL, N_FRAUD = 2000, 400

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
        a = pd.DataFrame({'repayment_rate':np.clip(np.random.normal(0.05,0.05,n_a),0,0.2),
            'did_age_days':np.random.randint(1,30,n_a).astype(float),
            'tx_per_day':np.clip(np.random.normal(0.05,0.03,n_a),0,0.15),
            'attestation_count':np.ones(n_a),
            'tx_interval_cv':np.clip(np.random.normal(0.02,0.01,n_a),0,0.05),
            'loan_to_repay_ratio':np.clip(np.random.normal(0.05,0.05,n_a),0,0.2),
            'isFraud':np.ones(n_a,dtype=int)})
        b = pd.DataFrame({'repayment_rate':np.clip(np.random.normal(0.2,0.1,n_b),0,0.4),
            'did_age_days':np.random.randint(20,90,n_b).astype(float),
            'tx_per_day':np.clip(np.random.normal(12,2,n_b),8,20),
            'attestation_count':np.random.randint(1,2,n_b).astype(float),
            'tx_interval_cv':np.clip(np.random.normal(0.01,0.005,n_b),0,0.03),
            'loan_to_repay_ratio':np.clip(np.random.normal(0.1,0.05,n_b),0,0.25),
            'isFraud':np.ones(n_b,dtype=int)})
        c = pd.DataFrame({'repayment_rate':np.clip(np.random.normal(0.45,0.1,n_c),0.2,0.6),
            'did_age_days':np.random.randint(45,120,n_c).astype(float),
            'tx_per_day':np.clip(np.random.normal(0.4,0.2,n_c),0.1,1.0),
            'attestation_count':np.random.randint(1,3,n_c).astype(float),
            'tx_interval_cv':np.clip(np.random.normal(0.08,0.03,n_c),0.04,0.15),
            'loan_to_repay_ratio':np.clip(np.random.normal(0.25,0.1,n_c),0.1,0.45),
            'isFraud':np.ones(n_c,dtype=int)})
        return pd.concat([a,b,c],ignore_index=True)

    df = pd.concat([gen_real(N_REAL),gen_fraud(N_FRAUD)],ignore_index=True).sample(frac=1,random_state=42)
    X  = df[FEATURES].copy()
    y  = df['isFraud']
    for col in FEATURES:
        if X[col].skew() > 1: X[col] = np.log1p(X[col])
    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    X_tr,X_te,y_tr,y_te = train_test_split(X_scaled,y,test_size=0.2,random_state=43,stratify=y)
    X_sm,y_sm = SMOTE(random_state=42).fit_resample(X_tr,y_tr)
    model = LogisticRegression(max_iter=1000,class_weight='balanced',solver='lbfgs',random_state=42)
    model.fit(X_sm,y_sm)
    auc = roc_auc_score(y_te, model.predict_proba(X_te)[:,1])
    print(f"[Scorer] Model trained — ROC-AUC: {auc:.4f}")
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model,  os.path.join(MODEL_DIR,'trust_scorer.pkl'))
    joblib.dump(scaler, os.path.join(MODEL_DIR,'scaler.pkl'))
    with open(os.path.join(MODEL_DIR,'features.json'),'w') as f:
        json.dump(FEATURES,f)
    return model, scaler

# Load or train
if os.path.exists(os.path.join(MODEL_DIR,'trust_scorer.pkl')):
    model  = joblib.load(os.path.join(MODEL_DIR,'trust_scorer.pkl'))
    scaler = joblib.load(os.path.join(MODEL_DIR,'scaler.pkl'))
    print("[Scorer] Model loaded from disk")
else:
    model, scaler = train_model()

# ── Scoring logic ─────────────────────────────────────────────────────────────

def get_tier(score):
    if score >= 80: return "Prime"
    if score >= 65: return "Standard"
    if score >= 50: return "Subprime"
    return "Rejected"

def compute_trust_score(data: dict) -> dict:
    row = {f: float(data.get(f, 0)) for f in FEATURES}
    df  = pd.DataFrame([row])[FEATURES]
    for col in FEATURES:
        if df[col].skew() > 1: df[col] = np.log1p(df[col])
    scaled     = scaler.transform(df)
    fraud_prob = model.predict_proba(scaled)[0][1]
    trust      = int((1 - fraud_prob) * 100)
    tier       = get_tier(trust)
    # Determine max loan
    max_loan = {
        "Prime": 50000, "Standard": 20000,
        "Subprime": 8000, "Rejected": 0
    }[tier]
    interest = {
        "Prime": 3.5, "Standard": 6.0,
        "Subprime": 9.5, "Rejected": 0
    }[tier]
    return {
        "did":         data.get("did","unknown"),
        "trustScore":  trust,
        "fraudProb":   round(float(fraud_prob),4),
        "tier":        tier,
        "eligible":    tier != "Rejected",
        "maxLoanSGD":  max_loan,
        "interestRate": interest,
        "features":    row,
    }

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/score", methods=["POST"])
def score():
    data = request.json
    if not data: return jsonify({"error":"No data"}), 400
    return jsonify(compute_trust_score(data))

@app.route("/score/batch", methods=["POST"])
def score_batch():
    items = request.json
    if not isinstance(items,list): return jsonify({"error":"Expected list"}), 400
    return jsonify([compute_trust_score(i) for i in items])

@app.route("/health")
def health():
    return jsonify({"status":"ok","features":FEATURES})

if __name__ == "__main__":
    print("[Scorer] Running on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=False)
