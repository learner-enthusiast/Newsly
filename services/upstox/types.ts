/** Upstox REST success envelope (common pattern). */
export type UpstoxSuccessEnvelope<T> = {
  status: string;
  data: T;
};

export type UpstoxPagedMetadata = {
  page?: {
    page_number?: number;
    page_size?: number;
    total_records?: number;
    total_pages?: number;
    records?: number;
  };
};

/** V3 full market quote (`GET /v3/market-quote/quotes`). */
export type UpstoxQuoteDepthLevel = {
  quantity?: number;
  price?: number;
  orders?: number;
};

export type UpstoxFullMarketQuote = {
  ohlc?: {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    ts?: number;
  };
  depth?: {
    buy?: UpstoxQuoteDepthLevel[];
    sell?: UpstoxQuoteDepthLevel[];
  };
  timestamp?: string;
  instrument_token?: string;
  symbol?: string;
  last_price?: number;
  volume?: number;
  average_price?: number;
  oi?: number;
  net_change?: number;
  total_buy_quantity?: number;
  total_sell_quantity?: number;
  lower_circuit_limit?: number;
  upper_circuit_limit?: number;
  last_trade_time?: string;
  oi_day_high?: number;
  oi_day_low?: number;
  prev_close_price?: number;
  year_high?: number;
  year_low?: number;
  previous_oi?: number;
  indicative_equilibrium_price?: number;
  reference_price?: number;
  indicative_equilibrium_quantity?: number;
  indicative_imbalance_quantity_total?: number;
  indicative_imbalance_quantity_market?: number;
  cas_eligible?: boolean;
};

export type UpstoxFullMarketQuoteResponse = UpstoxSuccessEnvelope<
  Record<string, UpstoxFullMarketQuote>
>;

/** V3 OHLC quotes (`GET /v3/market-quote/ohlc`). */
export type UpstoxOhlcCandle = {
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  ts?: number;
};

export type UpstoxOhlcQuote = {
  last_price?: number;
  instrument_token?: string;
  prev_ohlc?: UpstoxOhlcCandle;
  live_ohlc?: UpstoxOhlcCandle;
};

export type UpstoxOhlcQuoteResponse = UpstoxSuccessEnvelope<
  Record<string, UpstoxOhlcQuote>
>;

/** V3 LTP (`GET /v3/market-quote/ltp`). */
export type UpstoxLtpQuote = {
  last_price?: number;
  instrument_token?: string;
  ltq?: number;
  volume?: number;
  cp?: number;
};

export type UpstoxLtpQuoteResponse = UpstoxSuccessEnvelope<
  Record<string, UpstoxLtpQuote>
>;

/** V3 option greek (`GET /v3/market-quote/option-greek`). */
export type UpstoxOptionGreekQuote = {
  last_price?: number;
  instrument_token?: string;
  ltq?: number;
  volume?: number;
  cp?: number;
  iv?: number;
  vega?: number;
  gamma?: number;
  theta?: number;
  delta?: number;
  oi?: number;
};

export type UpstoxOptionGreekQuoteResponse = UpstoxSuccessEnvelope<
  Record<string, UpstoxOptionGreekQuote>
>;

/** V3 historical candles — tuple order per Upstox docs. */
export type UpstoxCandleTuple = [
  string,
  number,
  number,
  number,
  number,
  number,
  number?,
];

export type UpstoxHistoricalCandlesData = {
  candles?: UpstoxCandleTuple[];
};

export type UpstoxHistoricalCandlesResponse =
  UpstoxSuccessEnvelope<UpstoxHistoricalCandlesData>;

/** Brokerage (`GET /v2/charges/brokerage`). */
export type UpstoxBrokerageCharges = {
  total?: number;
  brokerage?: number;
  taxes?: {
    gst?: number;
    stt?: number;
    stamp_duty?: number;
  };
  other_charges?: {
    transaction?: number;
    clearing?: number;
    ipft?: number;
    sebi_turnover?: number;
  };
  dp_plan?: {
    name?: string;
    min_expense?: number;
  };
};

export type UpstoxBrokerageResponse = UpstoxSuccessEnvelope<{
  charges?: UpstoxBrokerageCharges;
}>;

/** Option chain (`GET /v2/option/chain`, `/v2/option/contract`). */
export type UpstoxOptionMarketData = {
  ltp?: number;
  close_price?: number;
  volume?: number;
  oi?: number;
  bid_price?: number;
  bid_qty?: number;
  ask_price?: number;
  ask_qty?: number;
  prev_oi?: number;
};

export type UpstoxOptionGreeksSide = {
  delta?: number;
  theta?: number;
  gamma?: number;
  vega?: number;
  rho?: number;
  iv?: number;
};

export type UpstoxOptionSide = {
  instrument_key?: string;
  market_data?: UpstoxOptionMarketData;
  option_greeks?: UpstoxOptionGreeksSide;
};

export type UpstoxOptionChainRow = {
  expiry?: string;
  pcr?: number;
  strike_price?: number;
  underlying_key?: string;
  underlying_spot_price?: number;
  call_options?: UpstoxOptionSide;
  put_options?: UpstoxOptionSide;
};

export type UpstoxOptionChainResponse = UpstoxSuccessEnvelope<
  UpstoxOptionChainRow[]
>;

export type UpstoxOptionContract = {
  instrument_key?: string;
  trading_symbol?: string;
  expiry?: string;
  strike_price?: number;
  option_type?: string;
  underlying_key?: string;
  underlying_type?: string;
  tick_size?: number;
  lot_size?: number;
};

export type UpstoxOptionContractsResponse = UpstoxSuccessEnvelope<
  UpstoxOptionContract[]
>;

/** Market information / analytics (`GET /v2/market/*`). */
export type UpstoxInstitutionalRow = {
  time_stamp?: number;
  buy_amount?: number;
  sell_amount?: number;
  buy_contracts?: number;
  sell_contracts?: number;
  oi_contracts?: number;
  oi_amount?: number;
};

export type UpstoxFiiDiiResponse = UpstoxSuccessEnvelope<
  Record<string, UpstoxInstitutionalRow[]>
>;

export type UpstoxOpenInterestStrike = {
  strike_price?: number;
  call_oi?: number;
  put_oi?: number;
};

export type UpstoxOpenInterestData = {
  total_puts?: number;
  total_calls?: number;
  spot_closing_price?: number;
  expiry?: string;
  call_put_oi_data_list?: UpstoxOpenInterestStrike[];
};

export type UpstoxOpenInterestResponse =
  UpstoxSuccessEnvelope<UpstoxOpenInterestData>;

export type UpstoxChangeOiStrike = {
  strike_price?: number;
  call_change_oi?: number;
  put_change_oi?: number;
};

export type UpstoxChangeOiData = {
  total_put_change_oi?: number;
  total_call_change_oi?: number;
  spot_closing_price?: number;
  expiry?: string;
  call_put_oi_data_list?: UpstoxChangeOiStrike[];
};

export type UpstoxChangeOiResponse = UpstoxSuccessEnvelope<UpstoxChangeOiData>;

export type UpstoxMaxPainInsight = {
  max_pain?: number;
  spot_price?: number;
  time?: string;
};

export type UpstoxMaxPainData = {
  instrument_key?: string;
  expiry_date?: string;
  max_pain?: number;
  spot_closing_price?: number;
  insights?: UpstoxMaxPainInsight[];
};

export type UpstoxMaxPainResponse = UpstoxSuccessEnvelope<UpstoxMaxPainData>;

export type UpstoxPcrInsight = {
  pcr?: number;
  spot_price?: number;
  time?: string;
};

export type UpstoxPcrData = {
  instrument_key?: string;
  expiry_date?: string;
  pcr?: number;
  spot_closing_price?: number;
  insights?: UpstoxPcrInsight[];
};

export type UpstoxPcrResponse = UpstoxSuccessEnvelope<UpstoxPcrData>;

export type UpstoxExchangeStatusData = {
  exchange?: string;
  status?: string;
  last_updated?: number;
};

export type UpstoxExchangeStatusResponse =
  UpstoxSuccessEnvelope<UpstoxExchangeStatusData>;

export type UpstoxMarketHolidayOpenExchange = {
  exchange?: string;
  start_time?: number;
  end_time?: number;
};

export type UpstoxMarketHoliday = {
  date?: string;
  description?: string;
  holiday_type?: string;
  closed_exchanges?: string[];
  open_exchanges?: UpstoxMarketHolidayOpenExchange[];
};

export type UpstoxMarketHolidaysResponse = UpstoxSuccessEnvelope<
  UpstoxMarketHoliday[]
>;

export type UpstoxMarketTiming = {
  exchange?: string;
  start_time?: number;
  end_time?: number;
};

export type UpstoxMarketTimingsResponse = UpstoxSuccessEnvelope<
  UpstoxMarketTiming[]
>;

/** Fundamentals (`GET /v2/fundamentals/:isin/*`). */
export type UpstoxCompanyProfile = {
  company_profile?: string;
  sector?: string;
  sector_market_cap_inr?: {
    value?: number;
    unit?: string;
    formatted?: string;
  };
  sector_market_cap_usd?: {
    value?: number;
    unit?: string;
    formatted?: string;
  };
};

export type UpstoxCompanyProfileResponse =
  UpstoxSuccessEnvelope<UpstoxCompanyProfile>;

export type UpstoxKeyRatio = {
  name?: string;
  company_value?: string;
  sector_value?: string;
};

export type UpstoxKeyRatiosResponse = UpstoxSuccessEnvelope<UpstoxKeyRatio[]>;

export type UpstoxShareholdingHistory = {
  period?: string;
  value?: number;
  change?: string;
};

export type UpstoxShareholdingCategory = {
  category?: string;
  history?: UpstoxShareholdingHistory[];
};

export type UpstoxShareHoldingsResponse = UpstoxSuccessEnvelope<
  UpstoxShareholdingCategory[]
>;

export type UpstoxCompetitorsResponse = UpstoxSuccessEnvelope<{
  competitors?: string[];
}>;

/** News (`GET /v2/news`). */
export type UpstoxNewsItem = {
  heading?: string;
  summary?: string;
  thumbnail?: string;
  article_link?: string;
  published_time?: number;
};

export type UpstoxNewsResponse = UpstoxSuccessEnvelope<
  Record<string, UpstoxNewsItem[]>
> & {
  metadata?: UpstoxPagedMetadata;
};

/** IPO (`GET /v2/ipos`, `/v2/ipos/:id`). */
export type UpstoxIpoListItem = {
  id?: string;
  symbol?: string;
  name?: string;
  status?: string;
  isin?: string;
  issue_type?: string;
  issue_size?: number;
  industry?: string;
  minimum_price?: number;
  maximum_price?: number;
  bidding_start_date?: string;
  bidding_end_date?: string;
  total_subscription?: string;
};

export type UpstoxIposListResponse = UpstoxSuccessEnvelope<
  UpstoxIpoListItem[]
> & {
  meta_data?: UpstoxPagedMetadata;
};

/** IPO details payload is large; typed fields are documented on Upstox — extend as needed. */
export type UpstoxIpoDetailsResponse = UpstoxSuccessEnvelope<
  Record<string, unknown>
>;

/** WebSocket authorize (`GET /v3/feed/market-data-feed/authorize`). */
export type UpstoxMarketFeedAuthorizeResponse = UpstoxSuccessEnvelope<{
  authorized_redirect_uri?: string;
}>;

export type UpstoxMarketFeedMode =
  | "ltpc"
  | "full"
  | "full_d30"
  | "option_greeks";

export type UpstoxMarketFeedSubscriptionRequest = {
  guid: string;
  method: "sub" | "unsub" | "change_mode";
  data: {
    mode?: UpstoxMarketFeedMode;
    instrumentKeys: string[];
  };
};
