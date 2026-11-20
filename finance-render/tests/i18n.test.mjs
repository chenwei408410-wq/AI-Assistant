import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/i18n.js',import.meta.url),'utf8');
function setup(saved='zh',blocked=false){
 const writes=[],document={readyState:'loading',documentElement:{},addEventListener(){},querySelectorAll:()=>[],createTreeWalker:()=>({nextNode:()=>false})};
 const context={window:{},document,NodeFilter:{SHOW_TEXT:4},localStorage:{getItem(){if(blocked)throw Error('disabled');return saved},setItem(k,v){if(blocked)throw Error('disabled');writes.push([k,v])}}};
 vm.runInNewContext(source,context);return {i18n:context.window.financeI18n,document,writes};
}
test('Chinese remains the default; Vietnamese preference persists without an external service',()=>{
 const {i18n,document,writes}=setup();assert.equal(i18n.t('出库单'),'出库单');i18n.setLanguage('vi');assert.equal(i18n.t('出库单'),'Phiếu xuất kho');assert.equal(document.documentElement.lang,'vi');assert.deepEqual(writes,[['finance.ui.language','vi']]);i18n.setLanguage('zh');assert.equal(i18n.t('出库单'),'出库单');assert.equal(setup('vi').i18n.language,'vi');assert.equal(setup('arbitrary').i18n.language,'zh');
});
test('language selection works when browser storage is unavailable',()=>{const {i18n}=setup('vi',true);assert.equal(i18n.language,'zh');i18n.setLanguage('vi');assert.equal(i18n.t('账号或密码不正确'),'Tài khoản hoặc mật khẩu không đúng')});
test('dynamic group, approval stages, CSV row errors and amounts retain their numbers',()=>{
 const {i18n}=setup('vi');assert.equal(i18n.t('第4组'),'Nhóm 4');assert.equal(i18n.t('第2级审批人'),'Người duyệt cấp 2');assert.equal(i18n.t('第15行：商品编码重复 ABC'),'Dòng 15：Trùng mã hàng ABC');assert.equal(i18n.t('核对到账 / 现金交款：1,500,000 ₫'),'Đối soát tiền nhận / nộp tiền mặt:1,500,000 ₫');
});
test('i18n is served before authentication and all application modules; translation has no remote calls',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');assert(app.includes("'finance.css','i18n.js','finance.js'"));assert(app.includes('<script src="/i18n.js" defer></script><script src="/auth.js" defer>'));assert(app.includes("['i18n.js','finance-ledger-ui.js','scanner.js'"));assert(!/\bfetch\s*\(/.test(source));assert(!/\.innerHTML\s*=/.test(source));
});
