export const CURRENCIES=['CNY','VND'];
export const knownCurrency=v=>CURRENCIES.includes(v)?v:null;
export function currencyOf(s,r){
  if(!r)return null;if(knownCurrency(r.currency))return r.currency;
  if(r.account)return knownCurrency(s.accounts.find(a=>a.id===r.account)?.currency);
  const po=s.purchases.find(p=>p.id===r.wmsSource||p.id===r.purchase||p.id===r.document||p.id===r.source||(p.batches||[]).some(b=>b.id===r.source));
  return knownCurrency(po?.currency);
}
export function moneyText(n,c){return n==null?'待核实':c==='CNY'?(n/100).toFixed(2):String(n)}
export function stockLayers(s,location,product){const groups=new Map();for(const m of s.stockMoves.filter(x=>x.location===location&&x.product===product)){const currency=currencyOf(s,m),key=currency||'UNKNOWN',g=groups.get(key)||{currency,qty:0,value:0};g.qty+=m.qty;g.value+=m.value;groups.set(key,g)}return [...groups.values()].filter(g=>g.qty||g.value)}
export function allocateLayers(layers,qty){let remaining=qty;const result=[];for(const l of layers){if(!remaining)break;if(l.qty<=0)continue;const q=Math.min(l.qty,remaining),v=Number(BigInt(l.value)*BigInt(q)/BigInt(l.qty));result.push({currency:l.currency,qty:q,value:v});remaining-=q}if(remaining)throw Error('库存数量不足');return result}
export function supplierDues(s,supplier){
  const invs=s.invoices.filter(i=>i.supplier===supplier.id),currencies=new Set([knownCurrency(supplier.openingCurrency),...invs.map(i=>currencyOf(s,i)),...s.banks.filter(b=>b.sourceType==='supplier'&&b.sourceId===supplier.id).map(b=>currencyOf(s,b))]);const output=[];
  for(const currency of currencies){const rows=invs.filter(i=>currencyOf(s,i)===currency),purchases=rows.filter(i=>i.kind==='采购');
    const opening=knownCurrency(supplier.openingCurrency)===currency?supplier.opening:0;
    const oldOpeningPaid=(s.supplierPayments||[]).filter(r=>r.supplier===supplier.id&&(currencyOf(s,r)===currency)).flatMap(r=>r.allocations||[]).filter(a=>a.invoice==='opening').reduce((n,a)=>n+(a.paid||0),0);
    const newOpeningPaid=(s.ledgerPayments||[]).filter(r=>r.supplier===supplier.id&&r.currency===currency).flatMap(r=>r.history||[]).flatMap(h=>h.allocations||[]).filter(a=>a.invoice==='opening:'+supplier.id).reduce((n,a)=>n+a.amount,0);
    const paidBank=s.banks.filter(b=>b.sourceType==='supplier'&&b.sourceId===supplier.id&&b.direction==='支出'&&currencyOf(s,b)===currency).reduce((n,b)=>n+b.amount,0);
    let loosePaid=Math.max(0,paidBank-oldOpeningPaid-newOpeningPaid-purchases.reduce((n,i)=>n+(i.paid||0),0));
    let looseCredit=Math.max(0,rows.filter(i=>i.kind!=='采购').reduce((n,i)=>n+i.amount,0)-purchases.reduce((n,i)=>n+(i.credited||0)+(i.prepaidApplied||0),0));
    const all=[{id:'opening:'+supplier.id,source:'期初应付',date:supplier.openingDate,amount:opening,paid:oldOpeningPaid+newOpeningPaid,credited:0},...purchases];
    for(const i of all){let due=Math.max(0,i.amount-(i.paid||0)-(i.credited||0)-(i.prepaidApplied||0));const paid=Math.min(due,loosePaid);loosePaid-=paid;due-=paid;const credit=Math.min(due,looseCredit);looseCredit-=credit;due-=credit;const reserved=(s.ledgerPayments||[]).filter(r=>r.supplier===supplier.id&&r.currency===currency&&['待审批','待付款'].includes(r.status)).flatMap(r=>r.allocations||[]).filter(a=>a.invoice===i.id).reduce((n,a)=>n+a.amount-(a.paid||0),0)+(s.supplierPayments||[]).filter(r=>r.supplier===supplier.id&&currencyOf(s,r)===currency&&['待审批','待付款'].includes(r.status)).flatMap(r=>r.allocations||[]).filter(a=>a.invoice===i.id||a.invoice==='opening'&&i.id.startsWith('opening:')).reduce((n,a)=>n+a.amount-(a.paid||0),0);
      if(i.amount||due)output.push({id:i.id,supplier:supplier.id,company:supplier.company,currency,source:i.source,date:i.date,due:i.due||'',amount:i.amount,paid:(i.paid||0)+paid,credited:(i.credited||0)+(i.prepaidApplied||0)+credit,remaining:due,reserved,available:Math.max(0,due-reserved),purchase:i.wmsSource||i.purchase||''});
    }
  }
  return output;
}
export function applyAdvances(s,po,clock,actor,command){
  for(const inv of s.invoices.filter(i=>i.wmsSource===po.id&&i.kind==='采购')){
    let due=Math.max(0,inv.amount-(inv.paid||0)-(inv.credited||0)-(inv.prepaidApplied||0));
    for(const advance of (s.supplierAdvances||[]).filter(a=>a.purchase===po.id&&a.supplier===po.supplier&&a.currency===po.currency)){
      const n=Math.min(due,advance.amount-(advance.applied||0)-(advance.refunded||0));if(!n)continue;
      advance.applied=(advance.applied||0)+n;advance.history??=[];advance.history.push({invoice:inv.id,amount:n,at:clock,by:actor});inv.prepaidApplied=(inv.prepaidApplied||0)+n;due-=n;
      s.invoices.push({id:command+'-ADV-'+s.invoices.length,company:po.company,supplier:po.supplier,currency:po.currency,date:clock.slice(0,10),kind:'预付款抵扣',amount:n,source:'ADV:'+advance.id+':'+inv.id,invoice:inv.id,purchase:po.id,advance:advance.id,createdBy:actor});
    }
  }
}
