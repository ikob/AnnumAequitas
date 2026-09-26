// Independent fictional values. No personal files are read.
import {writeFile} from 'node:fs/promises';
import Papa from 'papaparse';
import {gmoColumns} from '../src/brokers/gmo.ts';
const columns=[...gmoColumns,'交換元資産','交換元数量','交換先資産','交換先数量'];
const rows:Record<string,string>[]=[];
let serial=0;
function row(date:string,category:string,asset:string,fields:Record<string,string>) {
 rows.push({'日時':date,'精算区分':category,'銘柄名':asset,...fields});
}
function trade(date:string,asset:string,side:string,q:string,price:string,gross:string,fee='0') {
 row(date,'販売所取引',asset,{'売買区分':side,'約定ID':`FICTIONAL-TRADE-${++serial}`,'約定数量':q,'約定レート':price,'約定金額':gross,'注文手数料':fee,'日本円受渡金額':String(side==='買'?-Number(gross)-Number(fee):Number(gross)-Number(fee))});
}
function fiat(date:string,side:string,amount:string) {row(date,'日本円入出金','JPY',{'入出金区分':side,'入出金金額':amount,'日本円受渡金額':side==='出金'?'-'+amount:amount});}
function swap(date:string,from:string,q:string,to:string,received:string) {
 row(date,'DEMO_CRYPTO_SWAP',`${from}/${to}`,{'約定ID':`FICTIONAL-SWAP-${++serial}`,'交換元資産':from,'交換元数量':q,'交換先資産':to,'交換先数量':received});
}
fiat('2022/01/10 09:00','入金','5000000');
trade('2022/01/12 10:00','BTC','買','0.5','4000000','2000000');
trade('2022/02/15 11:00','ETH','買','2','300000','600000');
trade('2022/05/20 12:00','BTC','買','0.25','3600000','900000');
swap('2022/06/15 13:00','BTC','0.1','ETH','1.5');
trade('2022/10/20 10:00','ETH','売','0.5','280000','140000');
fiat('2023/01/10 09:00','入金','3000000');
trade('2023/02/10 10:00','BTC','買','0.2','3500000','700000','100');
trade('2023/03/15 10:00','ETH','買','3','250000','750000');
swap('2023/05/10 10:00','ETH','1','BTC','0.06');
trade('2023/09/20 10:00','BTC','売','0.15','4200000','630000','100');
fiat('2023/09/25 09:00','出金','500000');
row('2024/01/15 10:00','暗号資産預入・送付','BTC',{'授受区分':'預入','数量':'0.4','送付手数料':'0','送付先/送付元':'FICTIONAL-ORIGIN','トランザクションID':'FICTIONAL-IN'});
trade('2024/04/12 12:00','BTC','売','0.2','6000000','1200000');
trade('2024/05/10 10:00','ETH','売','1','500000','500000');
swap('2024/06/10 10:00','BTC','0.05','ETH','0.8');
trade('2025/02/10 10:00','BTC','買','0.1','8000000','800000');
trade('2025/04/10 10:00','BTC','売','0.3','10000000','3000000');
row('2025/05/15 10:00','暗号資産預入・送付','ETH',{'授受区分':'送付','数量':'0.2','送付手数料':'0','送付先/送付元':'FICTIONAL-DESTINATION','トランザクションID':'FICTIONAL-OUT'});
trade('2026/02/10 10:00','ETH','買','0.5','400000','200000');
trade('2026/04/10 10:00','ETH','売','0.4','350000','140000');
fiat('2026/05/10 09:00','出金','1000000');
await writeFile('data/sample-gmo/multi-year.csv',Papa.unparse([columns,...rows.map(r=>columns.map(c=>r[c]??''))])+'\n');
console.log('Generated fictional multi-year crypto activity.');
