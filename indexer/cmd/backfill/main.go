package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"

	"trusttrove/indexer/config"
	"trusttrove/indexer/db"
	"trusttrove/indexer/listener"
	"trusttrove/indexer/soroban"
)

func main() {
	fromLedger := flag.Int("from-ledger", 0, "Ledger sequence to start backfilling from")
	toLedger := flag.Int("to-ledger", 0, "Ledger sequence to backfill to")
	flag.Parse()

	if *fromLedger <= 0 || *toLedger <= 0 {
		log.Fatal("invalid ledger flags: --from-ledger and --to-ledger must be positive")
	}
	if *fromLedger > *toLedger {
		log.Fatal("invalid ledger flags: --from-ledger must not be greater than --to-ledger")
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := db.InitDB(ctx, cfg.DatabaseURL); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Pool.Close()

	slog := log.New(os.Stdout, "", log.LstdFlags)
	slog.Info("Starting backfill", "fromLedger", *fromLedger, "toLedger", *toLedger)

	latestLedger, err := soroban.CallSorobanRPC(ctx, cfg.SorobanRPCURL, "getLatestLedger", nil, struct {
		LatestLedger uint32 `json:"latestLedger"`
	}{})
	if err != nil {
		log.Fatalf("Failed to get latest ledger: %v", err)
	}
	tip := latestLedger.LatestLedger
	if *toLedger > tip {
		*toLedger = tip
		slog.Warn("--to-ledger exceeds chain tip, adjusting to", "tip", tip)
	}

	eventListener := listener.NewEventListener(cfg, nil, nil)

	for ledger := *fromLedger; ledger <= *toLedger; ledger++ {
		slog.Info("Backfilling ledger", "ledger", ledger)
		if _, err := eventListener.pollEvents(ctx, int32(ledger)); err != nil {
			slog.Error("Backfill error for ledger", "ledger", ledger, "error", err)
		}
	}

	slog.Info("Backfill complete", "fromLedger", *fromLedger, "toLedger", *toLedger)
}
