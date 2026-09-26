import type { Transaction } from '../ledger.ts';
import type { Balance } from '../balances.ts';
import type { CryptoRow } from './gmo.ts';
import { LedgerError } from '../values.ts';

export type BrokerId = 'merrill' | 'gmo';
export type BrokerSelection = 'auto' | BrokerId;
export type DocumentKind = 'activity' | 'holdings' | 'portfolio' | 'crypto-activity';
export type RawRow = Record<string, string>;
export interface ParsedDocument {
  documentKind: DocumentKind;
  transactions: Transaction[];
  balances: Balance[];
  cryptoTransactions: CryptoRow[];
}

/** Local, stateless format adapters. Calculations and application state belong outside this class. */
export abstract class BrokerAdapter {
  abstract readonly id: BrokerId;
  abstract readonly label: string;
  abstract detect(input: string): DocumentKind | null;
  abstract parse(input: string, sourceId: string): ParsedDocument;

  // Unsupported record families fail closed, including during saved-record restoration.
  restoreTransaction(_raw: RawRow, _sourceId: string, _row: number): Transaction {
    throw new LedgerError('documentType');
  }
  restoreBalance(_raw: RawRow, _sourceId: string, _row: number, _kind: Balance['kind']): Balance {
    throw new LedgerError('documentType');
  }
  restoreCrypto(_raw: RawRow, _sourceId: string, _row: number): CryptoRow {
    throw new LedgerError('documentType');
  }
}
