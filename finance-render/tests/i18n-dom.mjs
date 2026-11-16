// DOM integration suite: npm install, then npm run test:ui (no live data or credentials).
import {readFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const base=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const {initialState,mutate,projection,principal}=await import(base+'/lib/finance.mjs');const {config}=await import(base+'/tests/fixtures.mjs');let cfg=structuredClone(config);cfg.units[0].type='售货机';const owner={id:'owner',email:'owner@example.com'};let state=initialState(owner.email,cfg),n=0;function run(a,p){state=mutate(state,owner,a,p,'2026-11-16T00:00:00Z','i18n-'+(++n)).state}
run('w.product',{sku:'P1',barcode:'0891234567891',name:'商品名称 原文保留',spec:'24瓶',baseUnit:'瓶',packRate:24});
run('user.save',{name:'财务',email:'staff@example.com',code:'R1',role:'replenisher',companies:[cfg.companies[0]],units:['store-a'],categories:[],singleLimit:0,monthlyLimit:0,approvalLimit:0,replenishmentGroup:4});
run('w.opening',{warehouse:'warehouse-a',date:'2026-11-16',lines:[{product:state.products[0].id,qty:100,unitCost:50}]});

const {JSDOM}=await import('jsdom');
const source=readFileSync(base+'/app.mjs','utf8').replace(/^import .*\n/,'').split('export function createHandler')[0],ctx={};vm.createContext(ctx);vm.runInContext(source+';globalThis.pages={authPage,appHTML}',ctx);
const pause=()=>new Promise(r=>setTimeout(r,0));let requests=[];
function dom(html,role='owner',lang='vi'){
 const d=new JSDOM(html,{url:'https://finance.test/',runScripts:'outside-only'}),w=d.window;
 w.localStorage.setItem('finance.ui.language',lang);w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>true;
 w.fetch=async(url,opts)=>{if(url.startsWith('/api/data')){let u=role==='replenisher'?principal(state,{id:'staff',email:'staff@example.com'}):{...principal(state,owner),role};return {ok:true,json:async()=>projection(state,u,'2026-11')}}requests.push(JSON.parse(opts.body));return {ok:false,status:400,json:async()=>({error:url.startsWith('/api/auth/')?'账号或密码不正确':'可用库存不足'})}};
 for(const script of w.document.querySelectorAll('script[src]'))w.eval(readFileSync(base+'/public'+new URL(script.src).pathname,'utf8'));
 return d;
}
let d=dom(ctx.pages.authPage('login')),w=d.window;await pause();assert.equal(w.document.documentElement.lang,'vi');assert.equal(w.document.querySelector('h1').textContent,'Đăng nhập bàn làm việc');w.document.querySelector('[name=login]').value='001';w.document.querySelector('[name=password]').value='1234';w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();assert.deepEqual(requests.at(-1),{login:'001',password:'1234'});assert.equal(w.document.querySelector('#auth-status').textContent,'Tài khoản hoặc mật khẩu không đúng');d.window.close();
for(const role of ['owner','finance','warehouse','manager','purchasing','employee','replenisher']){
 d=dom(ctx.pages.appHTML,role);w=d.window;await pause();
 assert.equal(w.document.querySelector('#company').value,'全部公司');assert.equal(w.document.querySelector('#company option').textContent,'Tất cả công ty');
 const tabs=[...w.document.querySelectorAll('nav button')].map(b=>b.dataset.id);if(role==='replenisher')assert.equal(tabs.length,3);
 for(const tab of tabs){w.document.querySelector('nav button[data-id="'+tab+'"]').click();await pause();assert(w.document.querySelector('#view').textContent.length>0)}
 if(role==='owner'){
 w.document.querySelector('nav button[data-id=warehouse]').click();await pause();w.document.querySelector('[data-action=wui-tab][data-id=products]').click();await pause();assert(w.document.querySelector('#view').textContent.includes('商品名称 原文保留'));
 w.document.querySelector('[data-action=cat-product]:not([data-id=""])').click();await pause();assert.equal(w.document.querySelector('[name=name]').value,'商品名称 原文保留');w.document.querySelector('[name=name]').value='自定义商品名称';w.financeI18n.setLanguage('zh');assert.equal(w.document.querySelector('[name=name]').value,'自定义商品名称');w.financeI18n.setLanguage('vi');assert.equal(w.document.querySelector('[name=name]').value,'自定义商品名称');w.document.querySelector('[data-action=dismiss]').click();
 w.document.querySelector('[data-action=wui-tab][data-id=orders]').click();await pause();w.document.querySelector('[data-action=wui-order]').click();await pause();w.document.querySelector('[data-w=product]').value=state.products[0].id;w.document.querySelector('[data-w=measure]').value='箱';w.document.querySelector('[name=note]').value='备注原文 商品名称';w.document.querySelector('#entry').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();assert.equal(requests.at(-1).payload.lines[0].measure,'箱');assert.equal(requests.at(-1).payload.note,'备注原文 商品名称');assert(w.document.querySelector('#modal').textContent.includes('Tồn kho khả dụng không đủ'));
 }
 console.log('PASS',role,tabs.length,'tabs');d.window.close();
}
console.log('DOM integration passed: login, errors, all roles, raw names, unsaved edits, canonical form values.');
