/**
 * Server-side SmartAccess SA-AI21 hook.
 *
 * Face terminals typically sit on the gym LAN and should be driven by the
 * local Node process, not the cloud. After the manufacturer releases the
 * official SDK or TCP protocol:
 *
 * 1. Open a persistent socket to DEVICE_HOST:DEVICE_PORT
 * 2. Authenticate with DEVICE_USERNAME / DEVICE_PASSWORD from env
 * 3. Map recognition events onto POST /api/access/check
 * 4. Drive lock output via unlockGate / lockGate
 *
 * Do not invent a REST API for this device.
 */
export class SmartAccessServerProvider {
  unavailable(action: string): Error {
    return new Error(`SmartAccess SA-AI21 ${action} is not wired. Official protocol pending.`);
  }
}
