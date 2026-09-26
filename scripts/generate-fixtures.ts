// Fully invented Merrill-shaped software fixtures. Never reads personal files.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { emptyLedger, importCsv } from '../src/ledger.ts';
import { makePriceSeries } from '../src/market.ts';
import { makeFxSeries } from '../src/fx.ts';
const root = fileURLToPath(new URL('../data/sample-ml/multi-year/', import.meta.url));
await mkdir(root, { recursive: true });
const header = ['Trade Date','Settlement Date','Pending/Settled','Account Nickname','Account Registration','Account #','Type','Description 1 ','Description 2','Symbol/CUSIP #','Quantity','Price ($)','Amount ($)'];
const account = ['FICTIONAL RSU','FICTIONAL TEST HOLDER','DEMO-MULTI-0001'];
const business = (date:string) => { const d=new Date(date+'T00:00:00Z'); while([0,6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); };
const company = 'Fictional Cloud Corporation';
const md = (d:string) => `${d.slice(5,7)}/${d.slice(8,10)}/${d.slice(0,4)}`;
const money = (c:number) => (c / 100).toFixed(2);
const signed = (c:number) => c < 0 ? `(${money(-c)})` : money(c);
const csv = (head:string[], rows:string[][]) => Papa.unparse([head,...rows],{newline:'\r\n'})+'\r\n';
const output = async (name:string, text:string) => writeFile(root+name,text);
let shares=40, cash=10000;
const all:string[][]=[], prices=new Map<string,number>([['2021-12-31',40]]), fx=new Map<string,number>([['2021-12-31',125],['2022-01-03',125]]);
const expected:{year:number; date:string; quantity:string; cash:string; investments:string; net:string; dividends:string; withholding:string; proceeds:string; vested:string; rows:number}[]=[];
const specs=[
 {y:2022, v1:60,p1:40,v2:40,p2:45,s1:20,sp1:50,s2:0,sp2:0,close:48,fx:125},
 {y:2023, v1:20,p1:50,v2:30,p2:55,s1:110,sp1:60,s2:10,sp2:40,close:52,fx:135},
 {y:2024, v1:40,p1:60,v2:30,p2:65,s1:20,sp1:55,s2:0,sp2:0,close:68,fx:145},
 {y:2025, v1:50,p1:70,v2:20,p2:72,s1:30,sp1:80,s2:15,sp2:60,close:74,fx:150},
 {y:2026, v1:25,p1:75,v2:35,p2:82,s1:10,sp1:90,s2:0,sp2:0,close:84,fx:148},
];
const holdingHeader=['COB Date','Security #','Symbol','CUSIP #','Security Description','Account Nickname','Account Registration','Account #','Quantity','Price ($)','Value ($)','Unrealized Gain/Loss ($)','Unrealized Gain/Loss (%)','Cumulative Investment Return ($)','Cumulative Investment Return (%)','Accrued Interest ($)'];
const portfolioHeader=['COB Date','Account Nickname','Account Registration','Account #','Cash Balance ($)','Money Accounts ($)','Priced Investments ($)','Margin Balance ($)','Loan Balance ($)','Total Advance Value ($)','Revolving Line of Credit ($)','Term Loans ($)','Credit Available ($)','Net Value ($)',''];
for(const spec of specs) {
 const {y}=spec;const rows:string[][]=[];
 let dividends=0,tax=0,proceeds=0,vested=0;
 function event(date:string,description:string,detail:string,q:string,price:string,amount:number,type:string) {
   rows.push([md(date),md(date),'Settled',...account,type,description,detail,'FICT',q,price,signed(amount)]);
   cash+=amount; fx.set(date,spec.fx);
 }
 function vest(date:string,q:number,price:number) {
   date=business(date);shares+=q;vested+=q*price*100;prices.set(date,price);
   event(date,'Transfer / Adjustment',`${company} FICTIONAL RSU ACTIVITY GRANT DATE 01/10/${y-2} LAPSE DATE ${md(date)} CB ${price.toFixed(2)} JN DEMO-${y}-${q} EX DEMO BATCH FICTIONAL`,String(q),'--',0,'SecurityTransactions');
 }
 function sale(date:string,q:number,price:number,fee:number) {
   date=business(date);shares-=q;const net=q*price*100-fee;proceeds+=net;prices.set(date,price);
   event(date,'Sale',`${company} FICTIONAL SALE FORMAT; commission USD ${money(fee)}; Amount is NET proceeds; not verified Merrill sale syntax`,`(${q})`,price.toFixed(2),net,'SecurityTransactions');
 }
 function dividend(date:string,perShareCents:number) {
   date=business(date);const gross=shares*perShareCents, withheld=Math.round(gross*24/100);dividends+=gross;tax-=withheld;
   event(date,'Dividend',`${company} FICTIONAL CASH DIVIDEND ${money(perShareCents)} USD per share`,'--','--',gross,'DividendAndInterest');
   event(date,'Federal Tax Withholding',`${company} FICTIONAL Federal Backup Withholding; assumed 24 percent for testing only`,'--','--',-withheld,'Other');
 }
 vest(`${y}-02-15`,spec.v1,spec.p1);
 dividend(`${y}-03-15`,25);
 sale(`${y}-05-15`,spec.s1,spec.sp1,spec.s1>100?200:100);
 vest(`${y}-08-15`,spec.v2,spec.p2);
 if(spec.s2) sale(`${y}-09-15`,spec.s2,spec.sp2,100);
 dividend(`${y}-09-20`,30);
 const date=y===2026?'2026-09-25':`${y}-12-31`;
 const priceDay=new Date(date+'T00:00:00Z');
 while([0,6].includes(priceDay.getUTCDay())) priceDay.setUTCDate(priceDay.getUTCDate()-1);
 prices.set(priceDay.toISOString().slice(0,10),spec.close);fx.set(priceDay.toISOString().slice(0,10),spec.fx);
 const investments=shares*spec.close*100;
 await output(`activity-${y}.csv`,csv(header,rows));all.push(...rows);
 await output(`holdings-${y}.csv`,csv(holdingHeader,[[md(date),'DEMO-SEC-FICT','FICT','DEMO-CUSIP-FICT',company,...account,String(shares),spec.close.toFixed(2),money(investments),'--','--','--','--','0.00']]));
 await output(`portfolio-${y}.csv`,csv(portfolioHeader,[[md(date),...account,money(cash),'0.00',money(investments),'--','--','--','--','--','--',money(cash+investments),'']]));
 expected.push({year:y,date,quantity:String(shares),cash:money(cash),investments:money(investments),net:money(cash+investments),dividends:money(dividends),withholding:signed(tax),proceeds:money(proceeds),vested:money(vested),rows:rows.length});
}
await output('activity-all.csv',csv(header,all));
await output('prices-fictional.csv',csv(['Date','Open','High','Low','Close'],[...prices].sort(([a],[b])=>a.localeCompare(b)).map(([d,p])=>[d,...Array(4).fill(p.toFixed(2))])));
await output('fx-fictional.csv',csv(['observation_date','DEXJPUS'],[...fx].sort(([a],[b])=>a.localeCompare(b)).map(([d,p])=>[d,p.toFixed(2)])));
await output('expected.json',JSON.stringify({fictional:true,opening:{date:'2022-01-01',quantity:'40',cash:'100.00',cost:null},snapshots:expected},null,2)+'\n');
// Separate unsupported-corporate-action scenario, never mixed with the normal set.
await mkdir(root+'split-unsupported/',{recursive:true});
const splitRows=[
 [ '02/15/2024','02/15/2024','Settled',...account,'SecurityTransactions','Transfer / Adjustment',`${company} FICTIONAL RSU ACTIVITY LAPSE DATE 02/15/2024 CB 100.00`,'FICT','10','--','0.00'],
 [ '06/14/2024','06/14/2024','Settled',...account,'SecurityTransactions','Stock Split',`${company} FICTIONAL 2 FOR 1 SPLIT; additional shares 10; NOT VERIFIED MERRILL FORMAT`,'FICT','10','--','0.00'],
 [ '08/15/2024','08/15/2024','Settled',...account,'SecurityTransactions','Sale',`${company} FICTIONAL SALE; net after USD 1 commission`,'FICT','(4)','60.00','239.00'],
];
await output('split-unsupported/activity.csv',csv(header,splitRows));
await output('split-unsupported/holdings.csv',csv(holdingHeader,[['12/31/2024','DEMO-SEC-FICT','FICT','DEMO-CUSIP-FICT',company,...account,'16','60.00','960.00','--','--','--','--','0.00']]));
await output('split-unsupported/portfolio.csv',csv(portfolioHeader,[['12/31/2024',...account,'239.00','0.00','960.00','--','--','--','--','--','--','1199.00','']]));
console.log('Created fully fictional 2022–2026 CSV fixtures and a separate unsupported split scenario.');

// Ready-to-open demo, built only from the invented CSVs above. Provider-shaped
// metadata is simulated for parser testing, not evidence of a download.
let ledger=emptyLedger();
for (const spec of specs) {
 const name=`activity-${spec.y}.csv`;
 ledger=(await importCsv(ledger,await readFile(root+name,'utf8'),name)).ledger;
 const source=ledger.sources.at(-1)!;
 source.importedAt='2026-09-26T00:00:00Z';
 source.coverage={start:`${spec.y}-01-01`,end:spec.y===2026?'2026-09-25':`${spec.y}-12-31`,note:'Fully fictional fixture; complete invented history for this interval.'};
}
for (const name of ['holdings-2026.csv','portfolio-2026.csv']) {
 ledger=(await importCsv(ledger,await readFile(root+name,'utf8'),name)).ledger;
 ledger.sources.at(-1)!.importedAt='2026-09-26T00:00:00Z';
}
ledger.mode='demo';
ledger.mappings=[{key:'symbol:FICT',instrument:{symbol:'FICT',exchange:'OTHER',name:'Fictional Cloud Corporation (fictional)'}}];
ledger.marketPrices=[{...await makePriceSeries(await readFile(root+'prices-fictional.csv','utf8'),{symbol:'FICT',exchange:'OTHER',providerSymbol:'fict.us',start:'2021-12-31',end:'2026-09-25',fetchedAt:'2026-09-26T00:00:00Z'}),adjustment:'unadjusted'}];
ledger.fxRates=[await makeFxSeries(await readFile(root+'fx-fictional.csv','utf8'),'2026-09-26T00:00:00Z')];
await output('fictional-ledger.json',JSON.stringify(ledger,null,2)+'\n');
