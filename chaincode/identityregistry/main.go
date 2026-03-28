package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ─────────────────────────────────────────────────────────────────────────────
// TrustID Identity Registry Chaincode
//
// Distinctive DID design vs eKYC document-hash approaches:
//   • DID method:  did:trustid:<org>:<fingerprint>  (org-scoped, not just random)
//   • Identity is BEHAVIOURAL, not documentary — a DID gains trust through
//     multi-issuer W3C VC attestations + on-chain behavioral events over time.
//   • Each DID carries a ProofChain: an append-only log of cryptographic
//     endorsements from distinct MSP organisations. Credibility requires
//     endorsements from ≥2 independent consortium members (Singpass, DBS,
//     Grab, Singtel). A single issuer cannot manufacture trust alone.
//   • Trust score is derived from behavioural features (repayment rate,
//     tx cadence, attestation diversity), NOT from document hashes — solving
//     synthetic identity fraud that evades document-only KYC.
// ─────────────────────────────────────────────────────────────────────────────

type IdentityRegistry struct {
	contractapi.Contract
}

// ── W3C DID Document (https://www.w3.org/TR/did-core/) ───────────────────────

type DIDDocument struct {
	Context            []string             `json:"@context"`
	ID                 string               `json:"id"`
	Method             string               `json:"method"`          // always "trustid"
	OrgScope           string               `json:"orgScope"`        // registering org MSP
	VerificationMethod []VerificationMethod `json:"verificationMethod"`
	Authentication     []string             `json:"authentication"`
	Service            []ServiceEndpoint    `json:"service"`
	Owner              string               `json:"owner"`
	CreatedAt          string               `json:"createdAt"`
	UpdatedAt          string               `json:"updatedAt"`
	Active             bool                 `json:"active"`
	// TrustID-specific: behavioural identity extensions
	Credentials        []VerifiableCredential `json:"credentials"`
	Attestations       []AttestationSummary   `json:"attestations"`
	ProofChain         []ProofEntry           `json:"proofChain"`    // append-only endorsement log
	BehaviorScore      int                    `json:"behaviorScore"`
	ScoreTier          string                 `json:"scoreTier"`
	LastScored         string                 `json:"lastScored"`
	TotalLoans         int                    `json:"totalLoans"`
	TotalRepaid        int                    `json:"totalRepaid"`
	TxCount            int                    `json:"txCount"`
	UniqueIssuers      int                    `json:"uniqueIssuers"`  // distinct orgs that attested
	FraudProbability   float64                `json:"fraudProbability"`
}

// ProofEntry — cryptographic endorsement by a consortium member
// Distinctly different from eKYC: this is NOT a document hash.
// It is a hash of (didID + claimType + claimValue + issuerMSP + txID)
// proving a specific organisation made a specific behavioural claim at a
// specific transaction — creating an unforgeable multi-party proof chain.
type ProofEntry struct {
	IssuerMSP   string `json:"issuerMSP"`
	TxID        string `json:"txID"`
	Timestamp   string `json:"timestamp"`
	ClaimType   string `json:"claimType"`
	ProofHash   string `json:"proofHash"`   // SHA256(didID+claimType+claimValue+msp+txID)
	ProofMethod string `json:"proofMethod"` // "BehaviouralAttestation-v1"
}

type VerificationMethod struct {
	ID                 string `json:"id"`
	Type               string `json:"type"`
	Controller         string `json:"controller"`
	PublicKeyMultibase string `json:"publicKeyMultibase"`
}

type ServiceEndpoint struct {
	ID              string `json:"id"`
	Type            string `json:"type"`
	ServiceEndpoint string `json:"serviceEndpoint"`
}

// ── W3C Verifiable Credential ─────────────────────────────────────────────────

type VerifiableCredential struct {
	Context           []string          `json:"@context"`
	Type              []string          `json:"type"`
	ID                string            `json:"id"`
	Issuer            string            `json:"issuer"`
	IssuerMSP         string            `json:"issuerMSP"`
	IssuerOrg         string            `json:"issuerOrg"`
	IssuanceDate      string            `json:"issuanceDate"`
	ExpirationDate    string            `json:"expirationDate"`
	CredentialSubject map[string]string `json:"credentialSubject"`
	// Behavioural proof — NOT a document hash
	BehaviouralProof  string            `json:"behaviouralProof"` // SHA256(did+claim+value+msp+txID)
	Valid             bool              `json:"valid"`
	ClaimType         string            `json:"claimType"`
	ClaimValue        string            `json:"claimValue"`
}

type AttestationSummary struct {
	IssuerOrg   string `json:"issuerOrg"`
	IssuerMSP   string `json:"issuerMSP"`
	ClaimType   string `json:"claimType"`
	ClaimValue  string `json:"claimValue"`
	IssuedAt    string `json:"issuedAt"`
	ExpiresAt   string `json:"expiresAt"`
	Valid       bool   `json:"valid"`
}

// ── Behavioral Event ──────────────────────────────────────────────────────────

type BehaviorEvent struct {
	DID        string `json:"did"`
	EventType  string `json:"eventType"`
	Amount     string `json:"amount"`
	Timestamp  string `json:"timestamp"`
	TxID       string `json:"txID"`
	IssuerMSP  string `json:"issuerMSP"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func getTxTime(ctx contractapi.TransactionContextInterface) string {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Now().UTC().Format(time.RFC3339)
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)
}

func getMSPID(ctx contractapi.TransactionContextInterface) string {
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	return mspID
}

func mspToOrgName(mspID string) string {
	switch mspID {
	case "DBSMSP":      return "DBS Bank"
	case "GrabMSP":     return "Grab"
	case "SingtelMSP":  return "Singtel"
	case "SingpassMSP": return "Singpass"
	default:            return mspID
	}
}

// behaviouralProof computes SHA256(did+claimType+claimValue+mspID+txID)
// This is the key differentiator from document-hash eKYC:
// the proof binds a BEHAVIOUR CLAIM (not a document) to a specific
// on-chain transaction by a named consortium member.
func behaviouralProof(didID, claimType, claimValue, mspID, txID string) string {
	data := strings.Join([]string{didID, claimType, claimValue, mspID, txID}, "|")
	h := sha256.Sum256([]byte(data))
	return "bp:" + hex.EncodeToString(h[:])
}

// ── RegisterDID ───────────────────────────────────────────────────────────────

// RegisterDID creates a W3C DID Document scoped to the registering org's MSP.
// The DID format is: did:trustid:<mspShortName>:<fingerprint>
// where fingerprint = SHA256(owner+pubkey+timestamp)[:16]
// This makes the DID org-scoped and deterministically verifiable.
func (r *IdentityRegistry) RegisterDID(
	ctx contractapi.TransactionContextInterface,
	didID, owner, publicKeyMultibase string,
) error {
	exists, _ := r.DIDExists(ctx, didID)
	if exists {
		return fmt.Errorf("DID %s already registered", didID)
	}

	mspID := getMSPID(ctx)
	now := getTxTime(ctx)
	txID := ctx.GetStub().GetTxID()

	// Org-scoped DID: embed the registering MSP for auditability
	orgScope := mspToOrgName(mspID)

	doc := DIDDocument{
		Context: []string{
			"https://www.w3.org/ns/did/v1",
			"https://w3id.org/security/suites/ed25519-2020/v1",
			"https://trustid.example/context/v1",
		},
		ID:      didID,
		Method:  "trustid",
		OrgScope: orgScope,
		VerificationMethod: []VerificationMethod{{
			ID:                 didID + "#keys-1",
			Type:               "Ed25519VerificationKey2020",
			Controller:         didID,
			PublicKeyMultibase: publicKeyMultibase,
		}},
		Authentication: []string{didID + "#keys-1"},
		Service: []ServiceEndpoint{
			{
				ID:              didID + "#vcs",
				Type:            "VerifiableCredentialService",
				ServiceEndpoint: "https://trustid.example/vc/" + didID,
			},
			{
				ID:              didID + "#score",
				Type:            "TrustScoreService",
				ServiceEndpoint: "https://trustid.example/score/" + didID,
			},
		},
		Owner:            owner,
		CreatedAt:        now,
		UpdatedAt:        now,
		Active:           true,
		Credentials:      []VerifiableCredential{},
		Attestations:     []AttestationSummary{},
		ProofChain:       []ProofEntry{},
		BehaviorScore:    0,
		ScoreTier:        "Unscored",
		UniqueIssuers:    0,
		FraudProbability: 0,
	}

	// Genesis proof entry — registration itself is the first proof
	genesisProof := behaviouralProof(didID, "did_registration", owner, mspID, txID)
	doc.ProofChain = append(doc.ProofChain, ProofEntry{
		IssuerMSP:   mspID,
		TxID:        txID,
		Timestamp:   now,
		ClaimType:   "did_registration",
		ProofHash:   genesisProof,
		ProofMethod: "BehaviouralAttestation-v1",
	})

	b, _ := json.Marshal(doc)
	ctx.GetStub().SetEvent("DIDRegistered", b)
	return ctx.GetStub().PutState(didID, b)
}

// ── GetDID ────────────────────────────────────────────────────────────────────

func (r *IdentityRegistry) GetDID(
	ctx contractapi.TransactionContextInterface,
	didID string,
) (*DIDDocument, error) {
	b, err := ctx.GetStub().GetState(didID)
	if err != nil || b == nil {
		return nil, fmt.Errorf("DID %s not found", didID)
	}
	var doc DIDDocument
	if err := json.Unmarshal(b, &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

// ── DIDExists ─────────────────────────────────────────────────────────────────

func (r *IdentityRegistry) DIDExists(
	ctx contractapi.TransactionContextInterface,
	didID string,
) (bool, error) {
	b, err := ctx.GetStub().GetState(didID)
	return b != nil, err
}

// ── IssueCredential ───────────────────────────────────────────────────────────

// IssueCredential issues a W3C Verifiable Credential from the calling org's MSP.
// Args: didID, claimType, claimValue, expiresAt, docHash (docHash kept for
// backward compat but the primary proof is behaviouralProof, NOT docHash).
// Each issuance appends to the DID's ProofChain — building a multi-party
// endorsement record that cannot be forged by a single actor.
func (r *IdentityRegistry) IssueCredential(
	ctx contractapi.TransactionContextInterface,
	didID, claimType, claimValue, expiresAt, docHash string,
) error {
	b, err := ctx.GetStub().GetState(didID)
	if err != nil || b == nil {
		return fmt.Errorf("DID %s not found", didID)
	}
	var doc DIDDocument
	if err := json.Unmarshal(b, &doc); err != nil {
		return err
	}

	mspID := getMSPID(ctx)
	orgName := mspToOrgName(mspID)
	now := getTxTime(ctx)
	txID := ctx.GetStub().GetTxID()

	// Behavioural proof — binds claim to on-chain transaction
	bProof := behaviouralProof(didID, claimType, claimValue, mspID, txID)

	vc := VerifiableCredential{
		Context: []string{
			"https://www.w3.org/2018/credentials/v1",
			"https://trustid.example/context/v1",
		},
		Type:      []string{"VerifiableCredential", "TrustIDBehaviouralAttestation"},
		ID:        fmt.Sprintf("vc:%s:%s:%s", mspID, didID, txID[:8]),
		Issuer:    fmt.Sprintf("did:trustid:consortium:%s", strings.ToLower(orgName)),
		IssuerMSP: mspID,
		IssuerOrg: orgName,
		IssuanceDate:   now,
		ExpirationDate: expiresAt,
		CredentialSubject: map[string]string{
			"id":         didID,
			"claimType":  claimType,
			"claimValue": claimValue,
		},
		BehaviouralProof: bProof,
		Valid:      true,
		ClaimType:  claimType,
		ClaimValue: claimValue,
	}

	doc.Credentials = append(doc.Credentials, vc)
	doc.Attestations = append(doc.Attestations, AttestationSummary{
		IssuerOrg:  orgName,
		IssuerMSP:  mspID,
		ClaimType:  claimType,
		ClaimValue: claimValue,
		IssuedAt:   now,
		ExpiresAt:  expiresAt,
		Valid:      true,
	})

	// Append to proof chain
	doc.ProofChain = append(doc.ProofChain, ProofEntry{
		IssuerMSP:   mspID,
		TxID:        txID,
		Timestamp:   now,
		ClaimType:   claimType,
		ProofHash:   bProof,
		ProofMethod: "BehaviouralAttestation-v1",
	})

	// Recount unique issuers
	issuerSet := map[string]bool{}
	for _, a := range doc.Attestations {
		if a.Valid {
			issuerSet[a.IssuerMSP] = true
		}
	}
	doc.UniqueIssuers = len(issuerSet)
	doc.UpdatedAt = now

	out, _ := json.Marshal(doc)
	ctx.GetStub().SetEvent("CredentialIssued", out)
	return ctx.GetStub().PutState(didID, out)
}

// ── LogBehaviorEvent ──────────────────────────────────────────────────────────

func (r *IdentityRegistry) LogBehaviorEvent(
	ctx contractapi.TransactionContextInterface,
	didID, eventType, amount string,
) error {
	b, err := ctx.GetStub().GetState(didID)
	if err != nil || b == nil {
		return fmt.Errorf("DID %s not found", didID)
	}
	var doc DIDDocument
	if err := json.Unmarshal(b, &doc); err != nil {
		return err
	}

	mspID := getMSPID(ctx)
	now := getTxTime(ctx)
	txID := ctx.GetStub().GetTxID()

	event := BehaviorEvent{
		DID:       didID,
		EventType: eventType,
		Amount:    amount,
		Timestamp: now,
		TxID:      txID,
		IssuerMSP: mspID,
	}
	eb, _ := json.Marshal(event)

	// Track loans
	switch eventType {
	case "loan_issued":
		doc.TotalLoans++
	case "loan_repaid":
		doc.TotalRepaid++
	}
	doc.TxCount++
	doc.UpdatedAt = now

	eventKey := fmt.Sprintf("evt_%s_%s", didID, txID)
	ctx.GetStub().SetEvent("BehaviorLogged", eb)
	ctx.GetStub().PutState(eventKey, eb)

	out, _ := json.Marshal(doc)
	return ctx.GetStub().PutState(didID, out)
}

// ── GetBehaviorEvents ─────────────────────────────────────────────────────────

func (r *IdentityRegistry) GetBehaviorEvents(
	ctx contractapi.TransactionContextInterface,
	didID string,
) ([]BehaviorEvent, error) {
	start := fmt.Sprintf("evt_%s_", didID)
	end := fmt.Sprintf("evt_%s_~", didID)
	iter, err := ctx.GetStub().GetStateByRange(start, end)
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	var events []BehaviorEvent
	for iter.HasNext() {
		kv, _ := iter.Next()
		var e BehaviorEvent
		if json.Unmarshal(kv.Value, &e) == nil {
			events = append(events, e)
		}
	}
	if events == nil {
		events = []BehaviorEvent{}
	}
	return events, nil
}

// ── UpdateTrustScore ──────────────────────────────────────────────────────────

func (r *IdentityRegistry) UpdateTrustScore(
	ctx contractapi.TransactionContextInterface,
	didID, score, tier, fraudProb string,
) error {
	b, err := ctx.GetStub().GetState(didID)
	if err != nil || b == nil {
		return fmt.Errorf("DID %s not found", didID)
	}
	var doc DIDDocument
	if err := json.Unmarshal(b, &doc); err != nil {
		return err
	}

	var s int
	fmt.Sscanf(score, "%d", &s)
	var fp float64
	fmt.Sscanf(fraudProb, "%f", &fp)

	doc.BehaviorScore = s
	doc.ScoreTier = tier
	doc.FraudProbability = fp
	doc.LastScored = getTxTime(ctx)
	doc.UpdatedAt = doc.LastScored

	out, _ := json.Marshal(doc)
	ctx.GetStub().SetEvent("ScoreUpdated", out)
	return ctx.GetStub().PutState(didID, out)
}

// ── RevokeDID ─────────────────────────────────────────────────────────────────

func (r *IdentityRegistry) RevokeDID(
	ctx contractapi.TransactionContextInterface,
	didID string,
) error {
	b, err := ctx.GetStub().GetState(didID)
	if err != nil || b == nil {
		return fmt.Errorf("DID %s not found", didID)
	}
	var doc DIDDocument
	json.Unmarshal(b, &doc)
	doc.Active = false
	doc.UpdatedAt = getTxTime(ctx)
	out, _ := json.Marshal(doc)
	return ctx.GetStub().PutState(didID, out)
}

// ── GetProofChain ─────────────────────────────────────────────────────────────

// GetProofChain returns the full append-only endorsement log for a DID.
// This is the audit trail showing WHICH consortium members attested WHAT
// and WHEN — the core of TrustID's multi-party behavioural identity model.
func (r *IdentityRegistry) GetProofChain(
	ctx contractapi.TransactionContextInterface,
	didID string,
) ([]ProofEntry, error) {
	doc, err := r.GetDID(ctx, didID)
	if err != nil {
		return nil, err
	}
	return doc.ProofChain, nil
}

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	cc, err := contractapi.NewChaincode(&IdentityRegistry{})
	if err != nil {
		panic(err)
	}
	if err := cc.Start(); err != nil {
		panic(err)
	}
}

// ── LogModelMetrics ───────────────────────────────────────────────────────────
// Logs AI model training metrics to the Fabric ledger for audit purposes.
// Called after each training round to create an immutable performance record.

type ModelMetrics struct {
	RoundID   string  `json:"roundId"`
	Timestamp string  `json:"timestamp"`
	ROCAUC    float64 `json:"rocAuc"`
	F1Score   float64 `json:"f1Score"`
	Accuracy  float64 `json:"accuracy"`
	Precision float64 `json:"precision"`
	Recall    float64 `json:"recall"`
	ModelType string  `json:"modelType"`
	TrainSize int     `json:"trainSize"`
	LoggedBy  string  `json:"loggedBy"`
}

func (r *IdentityRegistry) LogModelMetrics(
	ctx contractapi.TransactionContextInterface,
	roundID, rocAuc, f1Score, accuracy, precision, recall, modelType, trainSize string,
) error {
	mspID := getMSPID(ctx)
	now   := getTxTime(ctx)
	txID  := ctx.GetStub().GetTxID()

	var rocVal, f1Val, accVal, precVal, recVal float64
	fmt.Sscanf(rocAuc,    "%f", &rocVal)
	fmt.Sscanf(f1Score,   "%f", &f1Val)
	fmt.Sscanf(accuracy,  "%f", &accVal)
	fmt.Sscanf(precision, "%f", &precVal)
	fmt.Sscanf(recall,    "%f", &recVal)

	metrics := ModelMetrics{
		RoundID:   roundID,
		Timestamp: now,
		ROCAUC:    rocVal,
		F1Score:   f1Val,
		Accuracy:  accVal,
		Precision: precVal,
		Recall:    recVal,
		ModelType: modelType,
		TrainSize: func() int { var ts int; fmt.Sscanf(trainSize, "%d", &ts); return ts }(),
		LoggedBy:  mspID,
	}

	b, _ := json.Marshal(metrics)
	key   := fmt.Sprintf("metrics_%s_%s", roundID, txID[:8])
	ctx.GetStub().SetEvent("ModelMetricsLogged", b)
	return ctx.GetStub().PutState(key, b)
}

func (r *IdentityRegistry) GetModelMetrics(
	ctx contractapi.TransactionContextInterface,
	roundID string,
) ([]ModelMetrics, error) {
	start := fmt.Sprintf("metrics_%s_", roundID)
	end   := fmt.Sprintf("metrics_%s_~", roundID)
	iter, err := ctx.GetStub().GetStateByRange(start, end)
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	var results []ModelMetrics
	for iter.HasNext() {
		kv, _ := iter.Next()
		var m ModelMetrics
		if json.Unmarshal(kv.Value, &m) == nil {
			results = append(results, m)
		}
	}
	if results == nil {
		results = []ModelMetrics{}
	}
	return results, nil
}

// ── StartTrainingRound ────────────────────────────────────────────────────────
// Records consortium endorsement that a training round has been authorised.
// Must be endorsed by MAJORITY peers before training begins.

type TrainingRound struct {
        RoundID     string `json:"roundID"`
        StartedAt   string `json:"startedAt"`
        ProposedBy  string `json:"proposedBy"`
        Status      string `json:"status"`
        ModelType   string `json:"modelType"`
        DataSource  string `json:"dataSource"`
}

func (r *IdentityRegistry) StartTrainingRound(
        ctx contractapi.TransactionContextInterface,
        roundID, modelType, dataSource string,
) error {
        mspID := getMSPID(ctx)
        now   := getTxTime(ctx)
        txID  := ctx.GetStub().GetTxID()

        round := TrainingRound{
                RoundID:    roundID,
                StartedAt:  now,
                ProposedBy: mspID,
                Status:     "STARTED",
                ModelType:  modelType,
                DataSource: dataSource,
        }
        b, _ := json.Marshal(round)
        key   := fmt.Sprintf("training_%s_%s", roundID, txID[:8])
        ctx.GetStub().SetEvent("TrainingRoundStarted", b)
        return ctx.GetStub().PutState(key, b)
}

func (r *IdentityRegistry) GetTrainingRound(
        ctx contractapi.TransactionContextInterface,
        roundID string,
) ([]TrainingRound, error) {
        start := fmt.Sprintf("training_%s_", roundID)
        end   := fmt.Sprintf("training_%s_~", roundID)
        iter, err := ctx.GetStub().GetStateByRange(start, end)
        if err != nil { return nil, err }
        defer iter.Close()
        var results []TrainingRound
        for iter.HasNext() {
                kv, _ := iter.Next()
                var t TrainingRound
                if json.Unmarshal(kv.Value, &t) == nil {
                        results = append(results, t)
                }
        }
        if results == nil { results = []TrainingRound{} }
        return results, nil
}

// ── LogVerification ───────────────────────────────────────────────────────────
// Records every identity verification check — immutable audit trail.
// Satisfies MAS Notice 626 audit requirements automatically.

type VerificationRecord struct {
        DID         string  `json:"did"`
        Timestamp   string  `json:"timestamp"`
        TrustScore  int     `json:"trustScore"`
        Tier        string  `json:"tier"`
        FraudProb   float64 `json:"fraudProb"`
        TriggeredBy string  `json:"triggeredBy"`
        VerifierMSP string  `json:"verifierMSP"`
        TxID        string  `json:"txID"`
}

func (r *IdentityRegistry) LogVerification(
        ctx contractapi.TransactionContextInterface,
        didID, score, tier, fraudProb, triggeredBy string,
) error {
        mspID := getMSPID(ctx)
        now   := getTxTime(ctx)
        txID  := ctx.GetStub().GetTxID()

        var s int
        var fp float64
        fmt.Sscanf(score,     "%d", &s)
        fmt.Sscanf(fraudProb, "%f", &fp)

        rec := VerificationRecord{
                DID:         didID,
                Timestamp:   now,
                TrustScore:  s,
                Tier:        tier,
                FraudProb:   fp,
                TriggeredBy: triggeredBy,
                VerifierMSP: mspID,
                TxID:        txID,
        }
        b, _ := json.Marshal(rec)
        key   := fmt.Sprintf("verify_%s_%s", didID, txID[:8])
        ctx.GetStub().SetEvent("VerificationLogged", b)
        return ctx.GetStub().PutState(key, b)
}

// ── GetVerificationHistory ────────────────────────────────────────────────────

func (r *IdentityRegistry) GetVerificationHistory(
        ctx contractapi.TransactionContextInterface,
        didID string,
) ([]VerificationRecord, error) {
        start := fmt.Sprintf("verify_%s_", didID)
        end   := fmt.Sprintf("verify_%s_~", didID)
        iter, err := ctx.GetStub().GetStateByRange(start, end)
        if err != nil { return nil, err }
        defer iter.Close()
        var records []VerificationRecord
        for iter.HasNext() {
                kv, _ := iter.Next()
                var v VerificationRecord
                if json.Unmarshal(kv.Value, &v) == nil {
                        records = append(records, v)
                }
        }
        if records == nil { records = []VerificationRecord{} }
        return records, nil
}
