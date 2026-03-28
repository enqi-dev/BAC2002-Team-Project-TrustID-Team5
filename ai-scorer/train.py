"""
TrustID AI Scorer — Training Script
Adapted from: keshabh/fraudtransactiondetection (Kaggle)
Run: python3 train.py
"""
import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd, joblib, json, os
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, classification_report
from imblearn.over_sampling import SMOTE

np.random.seed(42)
FEATURES = ['repayment_rate','did_age_days','tx_per_day','attestation_count','tx_interval_cv','loan_to_repay_ratio']

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
    a = pd.DataFrame({'repayment_rate':np.clip(np.random.normal(0.05,0.05,n_a),0,0.2),'did_age_days':np.random.randint(1,30,n_a).astype(float),'tx_per_day':np.clip(np.random.normal(0.05,0.03,n_a),0,0.15),'attestation_count':np.ones(n_a),'tx_interval_cv':np.clip(np.random.normal(0.02,0.01,n_a),0,0.05),'loan_to_repay_ratio':np.clip(np.random.normal(0.05,0.05,n_a),0,0.2),'isFraud':np.ones(n_a,dtype=int)})
    b = pd.DataFrame({'repayment_rate':np.clip(np.random.normal(0.2,0.1,n_b),0,0.4),'did_age_days':np.random.randint(20,90,n_b).astype(float),'tx_per_day':np.clip(np.random.normal(12,2,n_b),8,20),'attestation_count':np.ones(n_b),'tx_interval_cv':np.clip(np.random.normal(0.01,0.005,n_b),0,0.03),'loan_to_repay_ratio':np.clip(np.random.normal(0.1,0.05,n_b),0,0.25),'isFraud':np.ones(n_b,dtype=int)})
    c = pd.DataFrame({'repayment_rate':np.clip(np.random.normal(0.45,0.1,n_c),0.2,0.6),'did_age_days':np.random.randint(45,120,n_c).astype(float),'tx_per_day':np.clip(np.random.normal(0.4,0.2,n_c),0.1,1.0),'attestation_count':np.random.randint(1,3,n_c).astype(float),'tx_interval_cv':np.clip(np.random.normal(0.08,0.03,n_c),0.04,0.15),'loan_to_repay_ratio':np.clip(np.random.normal(0.25,0.1,n_c),0.1,0.45),'isFraud':np.ones(n_c,dtype=int)})
    return pd.concat([a,b,c],ignore_index=True)

print("Training TrustID behavioral scorer...")
df = pd.concat([gen_real(2000),gen_fraud(400)],ignore_index=True).sample(frac=1,random_state=42)
X  = df[FEATURES].copy(); y = df['isFraud']
for c in FEATURES:
    if X[c].skew()>1: X[c]=np.log1p(X[c])
sc = StandardScaler(); Xs = sc.fit_transform(X)
Xt,Xe,yt,ye = train_test_split(Xs,y,test_size=0.2,random_state=43,stratify=y)
Xm,ym = SMOTE(random_state=42).fit_resample(Xt,yt)
m = LogisticRegression(max_iter=1000,class_weight='balanced',solver='lbfgs',random_state=42)
m.fit(Xm,ym)
print(f"ROC-AUC: {roc_auc_score(ye,m.predict_proba(Xe)[:,1]):.4f}")
print(classification_report(ye,m.predict(Xe),target_names=['Real','Fraud']))
os.makedirs('models',exist_ok=True)
joblib.dump(m,'models/trust_scorer.pkl')
joblib.dump(sc,'models/scaler.pkl')
with open('models/features.json','w') as f: json.dump(FEATURES,f)
print("✓ Model saved to models/")
