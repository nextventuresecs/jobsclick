export function getWorkerHealthStatus(): { status: string; uptime: number; timestamp: string } {
  return {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}
