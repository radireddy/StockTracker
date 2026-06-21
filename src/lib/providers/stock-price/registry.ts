import { StockPriceProvider } from "./types";
import { ManualPriceProvider } from "./manual-provider";
import { YahooFinanceProvider } from "./yahoo-finance-provider";

class StockPriceProviderRegistry {
  private providers = new Map<string, StockPriceProvider>();
  private activeProvider: string = "manual";

  constructor() {
    this.register(new ManualPriceProvider());
    this.register(new YahooFinanceProvider());
    this.setActive("yahoo-finance");
  }

  register(provider: StockPriceProvider) {
    this.providers.set(provider.name, provider);
  }

  setActive(name: string) {
    if (!this.providers.has(name)) {
      throw new Error(`Provider "${name}" not registered`);
    }
    this.activeProvider = name;
  }

  getActive(): StockPriceProvider {
    return this.providers.get(this.activeProvider)!;
  }

  getProvider(name: string): StockPriceProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const stockPriceRegistry = new StockPriceProviderRegistry();
