import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {initialState,projection,principal,mutate} from '../lib/finance.mjs';
import {config} from './fixtures.mjs';
const context={window:{}};
vm.runInNewContext(readFileSync(new URL('../public/warehouse-reports.js',import.meta.url),'utf8'),context);
const report=context.window.warehouseReportData;
function fixture(){return {warehouses:[{id:'a',company:'A'},{id:'b',company:'B'}],products:[{id:'tea',name:'乌龙茶',sku:'T1',barcode:'123',baseUnit:'瓶',packRate:24},{id:'rice',name:'大米',baseUnit:'袋'}],opsSuppliers:[{id:'s1',name:'供应商甲'},{id:'s2',name:'供应商乙'}],stocks:[{location:'wh:a',product:'tea',qty:125,value:1250},{location:'wh:b',product:'rice',qty:10,value:500}],purchases:[{id:'p1',source:'PO-1',supplier:'s1',warehouse:'a',lines:[{product:'tea'}],batches:[{id:'receipt1'}]},{id:'p2',source:'PO-2',supplier:'s2',warehouse:'a',lines:[{product:'tea'}],batches:[{id:'receipt2'}]}],shipments:[{id:'ship1',unit:'store-a'}],supplierReturns:[{id:'return1',supplier:'s1'}],warehouseHistory:[{location:'wh:a',product:'tea',qty:100,value:1000,date:'2026-10-31',source:'opening'},{location:'wh:a',product:'tea',qty:24,value:240,date:'2026-11-02',source:'receipt1'},{location:'wh:a',product:'tea',qty:-10,value:-100,date:'2026-11-04',source:'ship1'},{location:'wh:a',product:'tea',qty:12,value:120,date:'2026-11-05',source:'receipt2'},{location:'wh:a',product:'tea',qty:-1,value:-10,date:'2026-11-06',source:'dispatch-return',document:'return1'},{location:'wh:b',product:'rice',qty:10,value:500,date:'2026-11-01',source:'rice-opening'}]};}
test('historical period reconciles opening, movement and ending without mixing warehouses or units',()=>{
 const r=report(fixture(),{warehouse:'a',from:'2026-11-01',to:'2026-11-04'});assert.equal(r.rows.length,1);const row=r.rows[0];assert.equal(row.opening,100);assert.equal(row.incoming,24);assert.equal(row.outgoing,10);assert.equal(row.ending,114);assert.equal(row.value,1140);assert.equal(r.ledger[0].balance,114);assert.equal(r.ledger[1].balance,124);
});
test('supplier query isolates receipts and supplier returns while preserving total related-product stock',()=>{
 const r=report(fixture(),{supplier:'s1',from:'2026-11-01',to:'2026-11-30'});assert.equal(r.rows.length,1);assert.equal(r.rows[0].ending,125);assert.equal(r.ledger.length,2);assert(r.ledger.every(m=>m.supplier==='s1'));assert.equal(r.ledger[0].kind,'供应商退货');assert.equal(r.ledger[0].balance,125);
});
test('product search accepts name, SKU and barcode and empty results stay empty',()=>{
 for(const q of ['乌龙','t1','123'])assert.equal(report(fixture(),{q}).rows.length,1);assert.equal(report(fixture(),{q:'not-found'}).rows.length,0);assert.equal(report(fixture(),{product:'rice'}).rows[0].ending,10);
});
test('report UI renders tabs and query actions without mutating business data',()=>{
 const data=fixture();data.costAccess=true;const before=JSON.stringify(data),handlers={};let rendered=0,selected='',message='';
 context.document={getElementById:id=>id==='finance-root'?{addEventListener:(name,fn)=>handlers[name]=fn}:id==='month'?{value:'2026-11'}:null};
 context.FormData=class{constructor(form){this.values=form.values}*[Symbol.iterator](){yield*Object.entries(this.values)}};
 const esc=x=>String(x??'').replaceAll('<','&lt;');
 const ui=context.window.warehouseReports({data:()=>data,filter:xs=>xs,today:'2026-11-19',esc,fmt:String,names:id=>id,table:(heads,rows)=>JSON.stringify([heads,rows]),panel:(title,body)=>title+body,button:(label)=>label,render:()=>rendered++,select:x=>selected=x,toast:x=>message=x});
 assert.match(ui.view(),/商品进销存明细/);assert.match(ui.view('ledger'),/商品进出库流水/);assert.match(ui.view('supplier'),/供应商供货查询/);
 handlers.submit({target:{id:'warehouse-query',values:{q:'not-found',from:'2026-11-01',to:'2026-11-30'}},preventDefault(){},stopImmediatePropagation(){}});assert.equal(rendered,1);assert.match(ui.view('stock'),/没有符合条件的库存/);
 handlers.click({target:{closest:()=>({dataset:{action:'wr-product',id:'tea|a'}})}});assert.equal(selected,'ledger');
 handlers.submit({target:{id:'warehouse-query',values:{from:'2026-12-01',to:'2026-11-01'}},preventDefault(){},stopImmediatePropagation(){}});assert.equal(message,'开始日期不能晚于结束日期');assert.equal(JSON.stringify(data),before);
});
test('full history crosses months but respects warehouse and cost permissions',()=>{
 let s=initialState('owner@example.com',config);s=mutate(s,{id:'owner',email:'owner@example.com'},'w.product',{sku:'P1',barcode:'4006381333931',name:'测试',baseUnit:'瓶',packRate:24,spec:'24瓶'},'2026-11-19T00:00:00Z','product1').state;
 const product=s.products[0].id;s.stockMoves.push({location:'wh:warehouse-a',company:config.companies[0],product,qty:24,value:240,date:'2026-10-01',source:'old'},{location:'wh:warehouse-b',company:config.companies[1],product,qty:2,value:20,date:'2026-10-01',source:'other'},{location:'shop:store-a',company:config.companies[0],product,qty:1,value:10,date:'2026-10-01',source:'shop'});
 const owner=principal(s,{id:'owner',email:'owner@example.com'});const limited={...owner,role:'warehouse',companies:[config.companies[0]],warehouses:['warehouse-a'],units:[]};const w=projection(s,limited,'2026-11');assert.equal(w.warehouseHistory.length,1);assert.equal(w.warehouseHistory[0].date,'2026-10-01');assert.equal(w.stockMoves.length,0);const manager=projection(s,{...limited,role:'manager',units:['store-a']},'2026-11');assert(manager.warehouseHistory.every(m=>!('value'in JSON.parse(JSON.stringify(m)))));assert(manager.warehouseHistory.every(m=>m.location==='shop:store-a'));
});
