import { BrokerAdapter, type BrokerSelection } from './adapter.ts';
import { MerrillAdapter } from './merrill.ts';
import { GmoAdapter } from './gmo-adapter.ts';
import { LedgerError } from '../values.ts';

export const brokerAdapters: readonly BrokerAdapter[] = Object.freeze([new MerrillAdapter(), new GmoAdapter()]);

export function getBrokerAdapter(id: string): BrokerAdapter {
  const adapter = brokerAdapters.find(adapter => adapter.id === id);
  if (!adapter) throw new LedgerError('documentType');
  return adapter;
}

export function selectBrokerAdapter(input: string, selection: BrokerSelection): BrokerAdapter {
  if (selection !== 'auto') {
    const adapter = getBrokerAdapter(selection);
    if (!adapter.detect(input)) throw new LedgerError('documentType');
    return adapter;
  }
  const matches = brokerAdapters.filter(adapter => adapter.detect(input) !== null);
  // No silent first-match behavior: ambiguous formats require an explicit broker.
  if (matches.length !== 1) throw new LedgerError('documentType');
  return matches[0];
}
