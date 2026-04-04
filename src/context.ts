/**
 * Singleton SDK client instances.
 * Imported once at startup and shared across all route handlers.
 */

import { createHederaContext } from "./clients/hedera";
import { create0gContext } from "./clients/0g";
import { createEthClients } from "./clients/eth";

export const hedera = createHederaContext();
export const zeroG = create0gContext();
export const eth = createEthClients();
