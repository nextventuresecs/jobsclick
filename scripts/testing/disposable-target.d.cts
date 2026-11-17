export interface DisposableManifest { version: 1; runId: string; databasePort: number; apiPort: number; redisPort: number }
export function assertDisposableTargets(targets: { databaseUrl?: string; apiUrl?: string; redisUrl?: string }, manifest?: DisposableManifest): void;
export function assertAllowedConnection(host: string, port: number | string): void;
export function installTestNetworkFence(): void;
export function assertDisposableDatabase(connectionString: string, manifestPath?: string, apiUrl?: string): Promise<void>;
