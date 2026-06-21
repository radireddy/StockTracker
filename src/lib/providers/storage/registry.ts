import type { StorageProvider } from "./types";
import { SupabaseStorageProvider } from "./supabase-storage";

class StorageProviderRegistry {
  private providers = new Map<string, StorageProvider>();
  private activeProvider: string = "supabase";

  constructor() {
    this.register(new SupabaseStorageProvider());
  }

  register(provider: StorageProvider) {
    this.providers.set(provider.name, provider);
  }

  setActive(name: string) {
    if (!this.providers.has(name)) {
      throw new Error(`Storage provider "${name}" not registered`);
    }
    this.activeProvider = name;
  }

  getActive(): StorageProvider {
    return this.providers.get(this.activeProvider)!;
  }

  getProvider(name: string): StorageProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const storageRegistry = new StorageProviderRegistry();
