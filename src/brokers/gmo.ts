import Papa from 'papaparse';
import { z } from 'zod';
import { dateValue, numberValue, LedgerError } from '../values.ts';
export const gmoColumns = ['日時','精算区分','日本円受渡金額','注文ID','約定ID','建玉ID','銘柄名','注文タイプ','取引区分','売買区分','執行条件','約定数量','約定レート','約定金額','注文手数料','レバレッジ手数料','入出金区分','入出金金額','授受区分','数量','送付手数料','送付先/送付元','トランザクションID'];
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/).nullable();
export const cryptoRowSchema = z.object({
 id:z.string(),sourceId:z.string(),row:z.number().int().min(2),broker:z.literal('gmo'),
 timestamp:z.string(),date:z.string().nullable(),asset:z.string(),
 kind:z.enum(['buy','sell','deposit','withdrawal','fiat-deposit','fiat-withdrawal','swap','other']),
 quantity:decimal,cashJpy:decimal,priceJpy:decimal,tradeAmountJpy:decimal,orderFee:decimal,transferFee:decimal,
 raw:z.record(z.string(),z.string()),fingerprint:z.string(),issues:z.array(z.string()),
}).strict();
export type CryptoRow = z.infer<typeof cryptoRowSchema>;
function table(input:string) { return Papa.parse<string[]>(input.replace(/^\uFEFF/,''),{skipEmptyLines:'greedy'}); }
export function isGmo(input:string) {
 const header=table(input).data[0]?.map(v=>v.trim())??[];
 return ['日時','精算区分','日本円受渡金額','銘柄名','授受区分'].every(h=>header.includes(h));
}
export function gmoRow(raw:Record<string,string>,sourceId:string,row:number):CryptoRow {
 if(gmoColumns.some(h=>typeof raw[h]!=='string')) throw new LedgerError('missingColumns',row);
 const issues:string[]=[];
 const n=(key:string)=>{try{return numberValue(raw[key]);}catch{issues.push(`number:${key}`);return null;}};
 const timestamp=raw['日時'].trim(), match=/^(\d{4}\/\d{1,2}\/\d{1,2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timestamp);
 const date=match && Number(match[2])<24 && Number(match[3])<60 && Number(match[4]??0)<60 ? dateValue(match[1].split('/').map((v,i)=>i?v.padStart(2,'0'):v).join('-')):null;
 if(!date) issues.push('date');
 const asset=raw['銘柄名'].trim().toUpperCase();if(!asset) issues.push('asset');
 let kind:CryptoRow['kind']='other', quantity:string|null=null;
 const category=raw['精算区分'].trim(), side=raw['売買区分'].trim();
 const signed=(q:string|null,negative:boolean)=>q===null?null:negative&&/[1-9]/.test(q)?'-'+q.replace(/^-/,''):q.replace(/^-/,'');
 // Explicit synthetic extension only: real GMO swap export syntax is not verified.
 if(category==='DEMO_CRYPTO_SWAP' && ['交換元資産','交換先資産'].every(k=>/^[A-Z0-9]+$/.test(raw[k]??'') && !['JPY','USD'].includes(raw[k])) && !raw['日本円受渡金額'].trim()) {
  kind='swap';issues.push('out-of-scope');
 } else if(category==='販売所取引' && ['買','売'].includes(side)) {
  kind=side==='買'?'buy':'sell';const q=n('約定数量');
  if(q===null || q.startsWith('-') || !/[1-9]/.test(q)) issues.push('quantity');
  quantity=signed(q,kind==='sell');
 } else if(category==='暗号資産預入・送付' && ['預入','送付'].includes(raw['授受区分'].trim())) {
  kind=raw['授受区分'].trim()==='預入'?'deposit':'withdrawal';const q=n('数量');
  if(q===null || q.startsWith('-') || !/[1-9]/.test(q)) issues.push('quantity');
  quantity=signed(q,kind==='withdrawal');
  if(kind==='deposit') issues.push('acquisition-history');
 } else if(category==='日本円入出金' && asset==='JPY' && ['入金','出金'].includes(raw['入出金区分'].trim())) kind=raw['入出金区分'].trim()==='入金'?'fiat-deposit':'fiat-withdrawal';
 else issues.push('unsupported');
 const cashJpy=n('日本円受渡金額');
 if(['buy','sell','fiat-deposit','fiat-withdrawal'].includes(kind) && (cashJpy===null || (['buy','fiat-withdrawal'].includes(kind)?!cashJpy.startsWith('-'):cashJpy.startsWith('-')))) issues.push('cash');
 return {id:`${sourceId}:${row}`,sourceId,row,broker:'gmo',timestamp,date,asset,kind,quantity,cashJpy,priceJpy:n('約定レート'),tradeAmountJpy:n('約定金額'),orderFee:n('注文手数料'),transferFee:n('送付手数料'),raw,fingerprint:JSON.stringify(Object.entries(raw).sort(([a],[b])=>a.localeCompare(b))),issues};
}
export function parseGmo(input:string,sourceId:string):CryptoRow[] {
 const parsed=table(input);if(parsed.errors.length) throw new LedgerError('csvSyntax');
 const header=parsed.data.shift()?.map(h=>h.trim())??[];
 if(new Set(header).size!==header.length || gmoColumns.some(h=>!header.includes(h))) throw new LedgerError('csvHeaders');
 return parsed.data.map((cells,i)=>{
  if(cells.length!==header.length)throw new LedgerError('csvWidth',i+2);
  return gmoRow(Object.fromEntries(header.map((h,j)=>[h,cells[j]])),sourceId,i+2);
 });
}
export function cryptoDuplicateIds(rows:CryptoRow[]) {
 const groups=new Map<string,CryptoRow[]>();
 for(const row of rows){const key=row.raw['約定ID'].trim()?`${row.kind}:${row.asset}:${row.raw['約定ID'].trim()}`:row.fingerprint;groups.set(key,[...(groups.get(key)??[]),row]);}
 return new Set([...groups.values()].filter(g=>g.length>1).flat().map(r=>r.id));
}
