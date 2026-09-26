import { BrokerAdapter, type ParsedDocument, type RawRow } from './adapter.ts';
import { isGmo, parseGmo, gmoRow } from './gmo.ts';
import { LedgerError } from '../values.ts';

export class GmoAdapter extends BrokerAdapter {
  readonly id = 'gmo' as const;
  readonly label = 'GMO Coin';

  detect(input: string) { return isGmo(input) ? 'crypto-activity' as const : null; }

  parse(input: string, sourceId: string): ParsedDocument {
    if (!this.detect(input)) throw new LedgerError('documentType');
    return { documentKind: 'crypto-activity', transactions: [], balances: [], cryptoTransactions: parseGmo(input, sourceId) };
  }

  override restoreCrypto(raw: RawRow, sourceId: string, row: number) {
    return gmoRow(raw, sourceId, row);
  }
}
