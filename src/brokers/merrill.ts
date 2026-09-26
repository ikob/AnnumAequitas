import { BrokerAdapter, type ParsedDocument, type RawRow } from './adapter.ts';
import { balanceRow, detectDocument, parseBalances, type Balance } from '../balances.ts';
import { parseCsv, parseRow } from './merrill-activity.ts';
import { LedgerError } from '../values.ts';

export class MerrillAdapter extends BrokerAdapter {
  readonly id = 'merrill' as const;
  readonly label = 'Merrill';

  detect(input: string) {
    try { return detectDocument(input); }
    catch (error) {
      if (error instanceof LedgerError) return null;
      throw error;
    }
  }

  parse(input: string, sourceId: string): ParsedDocument {
    const documentKind = detectDocument(input);
    return { documentKind, cryptoTransactions: [],
      transactions: documentKind === 'activity' ? parseCsv(input, sourceId) : [],
      balances: documentKind === 'activity' ? [] : parseBalances(input, sourceId, documentKind),
    };
  }

  override restoreTransaction(raw: RawRow, sourceId: string, row: number) {
    return parseRow(raw, sourceId, row);
  }
  override restoreBalance(raw: RawRow, sourceId: string, row: number, kind: Balance['kind']) {
    return balanceRow(raw, sourceId, row, kind);
  }
}
