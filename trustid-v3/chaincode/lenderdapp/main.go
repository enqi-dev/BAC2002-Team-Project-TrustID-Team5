package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type LenderDApp struct {
	contractapi.Contract
}

type LoanApplication struct {
	ID              string  `json:"id"`
	ApplicantDID    string  `json:"applicantDID"`
	AmountSGD       float64 `json:"amountSGD"`
	InterestRate    float64 `json:"interestRate"`
	TermMonths      int     `json:"termMonths"`
	MonthlyPayment  float64 `json:"monthlyPayment"`
	Status          string  `json:"status"`
	BehaviorScore   int     `json:"behaviorScore"`
	Tier            string  `json:"tier"`
	AppliedAt       string  `json:"appliedAt"`
	UpdatedAt       string  `json:"updatedAt"`
	RejectionReason string  `json:"rejectionReason,omitempty"`
}

type Tier struct {
	Label        string
	MinScore     int
	InterestRate float64
	MaxAmountSGD float64
}

var loanTiers = []Tier{
	{"Prime",    80, 3.5,  50000},
	{"Standard", 65, 6.0,  20000},
	{"Subprime", 50, 9.5,   8000},
	{"Rejected",  0, 0.0,      0},
}

func getTier(score int) Tier {
	for _, t := range loanTiers {
		if score >= t.MinScore {
			return t
		}
	}
	return loanTiers[len(loanTiers)-1]
}

func calcMonthly(p, r float64, n int) float64 {
	if r == 0 || p == 0 || n == 0 {
		return 0
	}
	mr := r / 100 / 12
	pow := 1.0
	for i := 0; i < n; i++ {
		pow *= (1 + mr)
	}
	return p * mr * pow / (pow - 1)
}

func getTxTime(ctx contractapi.TransactionContextInterface) string {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Now().UTC().Format(time.RFC3339)
	}
	return time.Unix(ts.Seconds, 0).UTC().Format(time.RFC3339)
}

// CheckEligibility returns loan terms for a DID based on trust score
func (l *LenderDApp) CheckEligibility(
	ctx contractapi.TransactionContextInterface,
	applicantDID string,
) (map[string]interface{}, error) {
	score, t, err := l.getScoreAndTier(ctx, applicantDID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"did":           applicantDID,
		"behaviorScore": score,
		"tier":          t.Label,
		"interestRate":  t.InterestRate,
		"maxAmountSGD":  t.MaxAmountSGD,
		"eligible":      t.Label != "Rejected",
		"checkedAt":     getTxTime(ctx),
	}, nil
}

// ApplyForLoan auto-approves or rejects based on trust score
func (l *LenderDApp) ApplyForLoan(
	ctx contractapi.TransactionContextInterface,
	loanID, applicantDID string,
	amountSGD float64,
	termMonths int,
) (*LoanApplication, error) {
	existing, _ := ctx.GetStub().GetState("LOAN~" + loanID)
	if existing != nil {
		return nil, fmt.Errorf("loan ID %s already exists", loanID)
	}

	score, t, err := l.getScoreAndTier(ctx, applicantDID)
	if err != nil {
		return nil, err
	}

	now := getTxTime(ctx)
	app := &LoanApplication{
		ID: loanID, ApplicantDID: applicantDID,
		AmountSGD: amountSGD, TermMonths: termMonths,
		BehaviorScore: score, Tier: t.Label,
		InterestRate: t.InterestRate,
		AppliedAt: now, UpdatedAt: now,
	}

	if t.Label == "Rejected" {
		app.Status = "REJECTED"
		app.RejectionReason = fmt.Sprintf(
			"Trust score %d is below minimum threshold of 50", score)
	} else if amountSGD > t.MaxAmountSGD {
		app.Status = "REJECTED"
		app.RejectionReason = fmt.Sprintf(
			"Requested S$%.0f exceeds maximum S$%.0f for %s tier (score: %d)",
			amountSGD, t.MaxAmountSGD, t.Label, score)
	} else {
		app.Status = "APPROVED"
		app.MonthlyPayment = calcMonthly(amountSGD, t.InterestRate, termMonths)
	}

	b, _ := json.Marshal(app)
	ctx.GetStub().SetEvent("LoanProcessed", b)

	if app.Status == "APPROVED" {
		ctx.GetStub().InvokeChaincode("identityregistry",
			[][]byte{[]byte("LogBehaviorEvent"), []byte(applicantDID),
				[]byte("loan_issued"), []byte(fmt.Sprintf("%.2f", amountSGD))},
			"trustid-channel")
	}

	return app, ctx.GetStub().PutState("LOAN~"+loanID, b)
}

// RepayLoan marks loan repaid and fires positive behavior event
func (l *LenderDApp) RepayLoan(
	ctx contractapi.TransactionContextInterface,
	loanID string,
) error {
	b, _ := ctx.GetStub().GetState("LOAN~" + loanID)
	if b == nil {
		return fmt.Errorf("loan %s not found", loanID)
	}
	var app LoanApplication
	json.Unmarshal(b, &app)
	if app.Status != "APPROVED" {
		return fmt.Errorf("loan %s is not in APPROVED state", loanID)
	}
	app.Status    = "REPAID"
	app.UpdatedAt = getTxTime(ctx)

	ctx.GetStub().InvokeChaincode("identityregistry",
		[][]byte{[]byte("LogBehaviorEvent"), []byte(app.ApplicantDID),
			[]byte("loan_repaid"), []byte(fmt.Sprintf("%.2f", app.AmountSGD))},
		"trustid-channel")

	rb, _ := json.Marshal(map[string]string{
		"did": app.ApplicantDID, "loanID": loanID,
		"amount": fmt.Sprintf("%.2f", app.AmountSGD),
	})
	ctx.GetStub().SetEvent("LoanRepaid", rb)

	nb, _ := json.Marshal(app)
	return ctx.GetStub().PutState("LOAN~"+loanID, nb)
}

// GetLoan retrieves loan details
func (l *LenderDApp) GetLoan(
	ctx contractapi.TransactionContextInterface,
	loanID string,
) (*LoanApplication, error) {
	b, _ := ctx.GetStub().GetState("LOAN~" + loanID)
	if b == nil {
		return nil, fmt.Errorf("loan %s not found", loanID)
	}
	var app LoanApplication
	json.Unmarshal(b, &app)
	return &app, nil
}

func (l *LenderDApp) getScoreAndTier(
	ctx contractapi.TransactionContextInterface,
	didID string,
) (int, Tier, error) {
	resp := ctx.GetStub().InvokeChaincode(
		"identityregistry",
		[][]byte{[]byte("GetDID"), []byte(didID)},
		"trustid-channel",
	)
	if resp.Status != 200 {
		return 0, loanTiers[3], fmt.Errorf("IdentityRegistry error: %s", resp.Message)
	}
	var doc map[string]interface{}
	json.Unmarshal(resp.Payload, &doc)
	score, ok := doc["behaviorScore"].(float64)
	if !ok {
		return 0, loanTiers[3], fmt.Errorf("could not read behavior score")
	}
	return int(score), getTier(int(score)), nil
}

func main() {
	cc, err := contractapi.NewChaincode(&LenderDApp{})
	if err != nil {
		panic(fmt.Sprintf("Error creating LenderDApp: %v", err))
	}
	if err := cc.Start(); err != nil {
		panic(fmt.Sprintf("Error starting LenderDApp: %v", err))
	}
}
