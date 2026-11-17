import test from 'node:test';import assert from 'node:assert/strict';
import {initialState,mutate,projection,principal} from '../lib/finance.mjs';import {service} from '../lib/service.mjs';import {config} from './fixtures.mjs';
const owner={id:'owner',email:'owner@example.com'},day='2026-11-17';
test('upgrade retains existing organization, users, transactions, fieldwork and legacy payment records',()=>{
 const original=initialState(owner.email,config);delete original.opsVersion;for(const k of ['writeoffs','discounts','supplierReturns','supplierPayments','replenishmentRequests'])delete original[k];original.collections.push({id:'old-collection',company:config.companies[0],unit:'store-a',amount:100,createdBy:'owner'});original.paymentRequests=[{id:'old-request',status:'待审批',company:config.companies[0],person:'owner',approval:{steps:[{approvers:['owner']}],current:0}}];const before=structuredClone(original);const d=projection(original,principal(original,owner),'2026-11');assert.equal(d.operationsVersion,7);for(const k of ['users','units','warehouses','banks','collections','paymentRequests'])assert.deepEqual(original[k],before[k]);assert.equal(original.products.length,0);assert.equal(original.writeoffs.length,0);
});
test('old store actions cannot bypass combined ordering, staged receipt or purchase confirmation',()=>{
 const s=initialState(owner.email,config),run=(a,p)=>mutate(s,owner,a,{date:day,...p});assert.throws(()=>run('w.order',{unit:'store-a'}),/店长/);assert.throws(()=>run('w.receive',{id:'not-found'}),/清点/);assert.throws(()=>run('w.purchase',{}),/新版采购/);assert.throws(()=>run('w.purchase.receive',{}),/分批到货/);assert.throws(()=>run('supplier.pay',{}),/指定一位/);
});
test('two simultaneous clients persist one version and reject the stale write without losing the accepted request',async()=>{
 let payload=JSON.stringify(initialState(owner.email,config)),version=7;
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return {version,payload}},async run(){if(sql.startsWith('UPDATE')){if(args[1]!==version)return {meta:{changes:0}};payload=args[0];version++;return {meta:{changes:1}}}throw Error('unexpected SQL')}}}};
 const env={DB},headers={origin:'https://finance.test','Content-Type':'application/json'};
 const make=name=>new Request('https://finance.test/api/action',{method:'POST',headers,body:JSON.stringify({version:7,action:'w.product',payload:{sku:name,name,spec:'测试',baseUnit:'件',packRate:24}})});
 const rs=await Promise.all([service(make('A'),env,owner),service(make('B'),env,owner)]);assert.deepEqual(rs.map(x=>x.status).sort(),[200,409]);assert.equal(version,8);assert.equal(JSON.parse(payload).products.length,1);
 const read=await service(new Request('https://finance.test/api/data?month=2026-11'),env,owner);const d=await read.json();assert.equal(d.version,8);assert.equal(d.operationsVersion,7);assert.equal(d.products.length,1);
});
