import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {initialState,mutate,projection,principal} from '../lib/finance.mjs';import {stockAt} from '../lib/warehouse.mjs';import {config as fixture} from './fixtures.mjs';
const config=structuredClone(fixture);config.units[0].type='售货机';const company=config.companies[0],owner={id:'owner',email:'owner@example.com'},staff={id:'s',email:'s@example.com'},other={id:'t',email:'t@example.com'};let n=0;
const run=(s,a,p={},i=owner)=>mutate(s,i,a,p,'2026-11-16T00:00:00Z','roles-'+(++n)).state;
function setup(){let s=initialState(owner.email,config);for(const [i,g,code] of [[staff,1,'R1'],[other,2,'R2']])s=run(s,'user.save',{name:code,email:i.email,code,role:'replenisher',companies:[company],units:['store-a'],categories:[],singleLimit:0,monthlyLimit:0,approvalLimit:0,replenishmentGroup:g});s=run(s,'w.product',{sku:'R',barcode:'4006381333931',name:'商品',spec:'测试',baseUnit:'瓶',packRate:24});return s}
test('replenisher gets team-specific quantity documents and cannot dispatch or cross teams',()=>{let s=setup(),product=s.products[0].id;
s=run(s,'w.opening',{warehouse:'warehouse-a',date:'2026-11-16',lines:[{product,qty:100,unitCost:50}]});
assert.throws(()=>run(s,'w.order',{warehouse:'warehouse-a',unit:'store-a',group:2,date:'2026-11-16',lines:[{product,qty:2}]},staff),/授权/);
for(const [i,group] of [[staff,1],[other,2]])s=run(s,'w.order',{warehouse:'warehouse-a',unit:'store-a',group,date:'2026-11-16',lines:[{product,qty:2}]},i);
s=run(s,'w.dispatch',{id:s.orders[0].id,date:'2026-11-16',lines:[{product,qty:2}]});
assert.throws(()=>run(s,'w.dispatch',{id:s.orders[1].id,date:'2026-11-16',lines:[{product,qty:2}]},staff),/权限/);
assert.throws(()=>run(s,'w.receive',{id:s.shipments[0].id,date:'2026-11-16',actual:[2]},other),/授权/);
let d=projection(s,principal(s,staff),'2026-11');assert.equal(d.orders.length,1);assert.equal(d.shipments.length,1);assert.equal(d.warehouses.length,0);assert.equal(d.stocks.length,0);assert.equal(d.accounts.length,0);assert(!('value' in d.shipments[0].lines[0]));
s=run(s,'w.receive',{id:s.shipments[0].id,date:'2026-11-16',actual:[2]},staff);assert.equal(stockAt(s,'shop:store-a',product).qty,2);assert.throws(()=>run(s,'w.receive',{id:s.shipments[0].id,date:'2026-11-16',actual:[2]},staff),/重复/);
});
test('collection requires finance confirmation, is private and posts exactly once',()=>{let s=setup();const p={unit:'store-a',date:'2026-11-16',amount:100,method:'现金',reference:'bag-1',note:'设备收款'};
s=run(s,'field.collection.add',p,staff);assert.equal(s.banks.length,0);assert.equal(projection(s,principal(s,other),'2026-11').collections.length,0);
assert.throws(()=>run(s,'field.collection.add',p,staff),/重复/);assert.throws(()=>run(s,'field.collection.add',{...p,reference:'x',date:'2026-02-30'},staff),/日期/);
s=run(s,'account.add',{company,name:'现金',kind:'现金',openingDate:'2026-11-01',opening:0,unit:''});
const q={id:s.collections[0].id,account:s.accounts[0].id,date:'2026-11-16',reference:'receipt-1'};
assert.throws(()=>run(s,'field.collection.confirm',q,staff),/财务/);s=run(s,'field.collection.confirm',q);assert.equal(s.banks.length,1);assert.equal(s.banks[0].amount,100);assert.throws(()=>run(s,'field.collection.confirm',q),/重复/);
});
test('fault reporting stays private, staff cannot resolve and legacy state upgrades',()=>{let s=setup();s=run(s,'field.fault.add',{unit:'store-a',date:'2026-11-16',device:'TEST-01',location:'测试点',note:'不制冷',priority:'紧急'},staff);assert.equal(projection(s,principal(s,other),'2026-11').deviceFaults.length,0);const q={id:s.deviceFaults[0].id,note:'已更换配件'};assert.throws(()=>run(s,'field.fault.resolve',q,staff),/权限/);s=run(s,'field.fault.resolve',q);assert.equal(s.deviceFaults[0].status,'已处理');delete s.deviceFaults;delete s.collections;assert.deepEqual(projection(s,principal(s,staff),'2026-11').deviceFaults,[])});
test('replenisher account requires explicit vending scope and team assignment',()=>{const s=setup(),u=s.users.find(x=>x.email===staff.email);assert.throws(()=>run(s,'user.save',{...u,replenishmentGroup:0}),/组号/);assert.throws(()=>run(s,'user.save',{...u,units:[]}),/组号/);assert.throws(()=>run(s,'expense.add',{company,unit:'store-a',date:'2026-11-16',amount:1,note:'x',category:'办公费'},staff),/权限/)});
test('role screens put relevant work first and replenisher has exactly three business tabs',async()=>{const source=readFileSync(new URL('../public/finance.js',import.meta.url),'utf8');for(const role of ['finance','warehouse','manager','replenisher']){
const s=setup(),u={...s.users.find(x=>x.email===staff.email),role},d={...projection(s,u,'2026-11'),version:1};let html='';const root={addEventListener(){},set innerHTML(v){html=v},get innerHTML(){return html}};const window={approvalUI:()=>({view:()=>'',paymentView:()=>''}),warehouseUI:()=>({view:()=>'',select(){}})};
const context={window,document:{getElementById:id=>id==='finance-root'?root:null},fetch:async()=>({ok:true,json:async()=>d}),Intl,Date,console,setTimeout,URL,Blob};vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
assert(html.includes(role==='replenisher'?'新建出库申请':role==='finance'?'待核对流水':role==='warehouse'?'待验收入库':'待确认收货'));
const nav=html.match(/<nav>(.*?)<\/nav>/s)[1];if(role==='replenisher'){assert.equal((nav.match(/data-action="nav"/g)||[]).length,3);assert(!nav.includes('报销'));assert(nav.includes('收款单'));assert(nav.includes('设备故障'))}
}});
