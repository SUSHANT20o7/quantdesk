-- QuantDesk database schema
-- Run automatically on first docker-compose up

CREATE TABLE IF NOT EXISTS price_history (
    id          BIGSERIAL PRIMARY KEY,
    symbol      VARCHAR(10)    NOT NULL,
    date        DATE           NOT NULL,
    open        NUMERIC(12,4),
    high        NUMERIC(12,4),
    low         NUMERIC(12,4),
    close       NUMERIC(12,4),
    volume      BIGINT,
    created_at  TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_price_history_symbol_date ON price_history (symbol, date DESC);

CREATE TABLE IF NOT EXISTS watchlist (
    id         SERIAL PRIMARY KEY,
    symbol     VARCHAR(10) NOT NULL UNIQUE,
    added_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO watchlist (symbol) VALUES
    ('AAPL'), ('MSFT'), ('NVDA'), ('TSLA'), ('AMZN'), ('META')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id           SERIAL PRIMARY KEY,
    symbol       VARCHAR(10)  NOT NULL,
    quantity     NUMERIC(14,4) NOT NULL,
    avg_cost     NUMERIC(12,4) NOT NULL,
    bought_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backtest_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol          VARCHAR(10),
    strategy        VARCHAR(50),
    period          VARCHAR(20),
    initial_capital NUMERIC(14,2),
    final_value     NUMERIC(14,2),
    total_return    NUMERIC(8,4),
    sharpe_ratio    NUMERIC(6,4),
    max_drawdown    NUMERIC(6,4),
    total_trades    INTEGER,
    win_rate        NUMERIC(5,4),
    params          JSONB,
    equity_curve    JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sentiment_scores (
    id         BIGSERIAL PRIMARY KEY,
    symbol     VARCHAR(10) NOT NULL,
    score      NUMERIC(5,4),
    label      VARCHAR(20),
    source     VARCHAR(50),
    headline   TEXT,
    scored_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentiment_symbol_time ON sentiment_scores (symbol, scored_at DESC);
