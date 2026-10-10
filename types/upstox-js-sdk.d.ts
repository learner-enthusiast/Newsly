declare module "upstox-js-sdk" {
  export const ApiClient: {
    instance: {
      authentications: {
        OAUTH2: { accessToken: string };
      };
    };
  };

  export class MarketQuoteV3Api {
    constructor(apiClient?: unknown);
    getFullMarketQuoteV3(
      opts: { instrumentKey?: string },
      callback: (error: unknown, data: unknown) => void,
    ): void;
    getMarketQuoteOHLC(
      interval: string,
      opts: { instrumentKey?: string },
      callback: (error: unknown, data: unknown) => void,
    ): void;
    getLtp(
      opts: { instrumentKey?: string },
      callback: (error: unknown, data: unknown) => void,
    ): void;
    getMarketQuoteOptionGreek(
      opts: { instrumentKey?: string },
      callback: (error: unknown, data: unknown) => void,
    ): void;
  }

  export class HistoryV3Api {
    constructor(apiClient?: unknown);
    getHistoricalCandleData(
      instrumentKey: string,
      unit: string,
      interval: number,
      toDate: string,
      callback: (error: unknown, data: unknown) => void,
    ): void;
    getHistoricalCandleData1(
      instrumentKey: string,
      unit: string,
      interval: number,
      toDate: string,
      fromDate: string,
      callback: (error: unknown, data: unknown) => void,
    ): void;
    getIntraDayCandleData(
      instrumentKey: string,
      unit: string,
      interval: number,
      callback: (error: unknown, data: unknown) => void,
    ): void;
  }

  export class OptionsApi {
    constructor(apiClient?: unknown);
    getPutCallOptionChain(
      instrumentKey: string,
      expiryDate: string,
      callback: (error: unknown, data: unknown) => void,
    ): void;
    getOptionContracts(
      instrumentKey: string,
      opts: { expiryDate?: string },
      callback: (error: unknown, data: unknown) => void,
    ): void;
  }

  export class MarketApi {
    constructor(apiClient?: unknown);
    [method: string]: (...args: unknown[]) => void;
  }

  export class FundamentalsApi {
    constructor(apiClient?: unknown);
    [method: string]: (...args: unknown[]) => void;
  }

  export class NewsApi {
    constructor(apiClient?: unknown);
    [method: string]: (...args: unknown[]) => void;
  }

  export class IPOApi {
    constructor(apiClient?: unknown);
    [method: string]: (...args: unknown[]) => void;
  }

  export class ChargeApi {
    constructor(apiClient?: unknown);
    [method: string]: (...args: unknown[]) => void;
  }

  export class MarketHolidaysAndTimingsApi {
    constructor(apiClient?: unknown);
    [method: string]: (...args: unknown[]) => void;
  }

  export class WebsocketApi {
    constructor(apiClient?: unknown);
    [method: string]: (...args: unknown[]) => void;
  }

  export class MarketDataStreamerV3 {
    constructor(instrumentKeys?: string[], mode?: string);
    Event: Record<string, string>;
    connect(): Promise<void>;
    subscribe(instrumentKeys: string[], mode: string): void;
    unsubscribe(instrumentKeys: string[]): void;
    changeMode(instrumentKeys: string[], mode: string): void;
    disconnect(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
  }
}

declare module "upstox-js-sdk/package.json" {
  const value: { version: string };
  export default value;
}
