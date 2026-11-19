import {stockAt} from './warehouse.mjs';
import {operationsMutation} from './operations.mjs';
import {createHash} from 'node:crypto';

const signature=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function replayFlow(s,u,a,p,E) {
  if(!p._requestId)return null;
  if(typeof p._requestId!=='string'||!/^[A-Za-z0-9-]{8,100}$/.test(p._requestId))throw new E('确认标识无效');
  const command=(s.flowCommands||[]).find(x=>x.key===p._requestId);
  if(!command)return null;
  if(command.by!==u.id||command.action!==a||command.signature!==signature(p))throw new E('确认标识已经用于其他操作',409);
  return {...command.result,duplicate:true};
}
export function runWarehouseFlow(s,u,a,p,id,clock,E) {
  const replay=replayFlow(s,u,a,p,E);if(replay)return {state:s,result:replay};
  const out=warehouseFlowMutation(s,u,a,p,id,clock,E);
  if(p._requestId){s.flowCommands??=[];s.flowCommands.push({key:p._requestId,by:u.id,action:a,signature:signature(p),result:out.result,at:clock})}
  if(new TextEncoder().encode(JSON.stringify(s)).length>5000000)throw new E('业务数据超过当前容量，请先归档升级',507);
  return out;
}

const warehouseRoles=['owner','admin','warehouse','purchasing'];
const storeRoles=['owner','manager'];
const sum=(xs,f)=>xs.reduce((n,x)=>n+f(x),0);
function normalizeOrder(s,r){
  for(const sh of s.shipments.filter(x=>x.order===r.id))for(const l of sh.lines){if(l.returnedQty===undefined&&l.effectiveQty!==undefined)l.returnedQty=Math.max(0,l.qty-l.effectiveQty)}
  for(const l of r.lines){l.requestedQty??=l.qty;l.closedQty??=l.cancelled||0;}
}
export function flowOrderStatus(s,r) {
  const shipments=s.shipments.filter(x=>x.order===r.id);
  if(shipments.some(x=>['差异待处理'].includes(x.status)))return '差异待处理';
  if(shipments.some(x=>x.lines.some(l=>l.qty-(l.actual||0)-(l.returnedQty||0)-(l.lossQty||0)>0)))return '配送中';
  if(r.lines.every(l=>(l.receivedQty||0)+(l.closedQty||0)>=(l.confirmedQty??l.qty))&&r.warehouseConfirmedAt)return '已完成';
  return shipments.length?'待补送':r.warehouseConfirmedAt?'待配送':'待仓库确认';
}
export function warehouseFlowProjection(s,u,w) {
  const allowed=new Set(w.purchases.map(x=>x.id));
  const receipts=s.purchases.filter(p=>allowed.has(p.id)).flatMap(p=>(p.batches||[]).map((b,i)=>({
    id:b.id,number:b.number||'GRN-'+b.id,purchase:p.id,purchaseNumber:p.source,company:p.company,warehouse:p.warehouse,supplier:p.supplier,
    date:b.date,at:b.at||'',by:b.by,name:b.name||s.users.find(x=>x.id===b.by)?.name||b.by,amount:b.amount,note:b.note,
    lines:(b.linesSnapshot||p.lines.map((l,j)=>({product:l.product,qty:b.actual[j]||0,ordered:l.qty,unit:s.products.find(x=>x.id===l.product)?.baseUnit||''}))).filter(l=>l.qty),batch:i+1
  })));
  return {warehouseFlowVersion:8,purchaseReceipts:receipts};
}

export function warehouseFlowMutation(s,u,a,p,id,clock,E) {
  const fail=(m,status=400)=>{throw new E(m,status)};
  const requireRole=roles=>{if(!roles.includes(u.role))fail('当前岗位无此确认权限',403)};
  const find=(key,x)=>s[key].find(r=>r.id===x)||fail('记录不存在',404);
  const integer=(x,name,zero=true)=>Number.isSafeInteger(x)&&x>=(zero?0:1)&&x<=1e9?x:fail(name+'须为有效整数');
  const text=(x,name)=>typeof x==='string'&&x.trim()&&x.length<=2000?x.trim():fail('请填写'+name);
  const day=p.date||clock.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)fail('日期无效');
  const company=r=>u.role==='owner'||u.companies.includes(r.company);
  const check=r=>{if(!company(r))fail('超出公司权限',403);if(s.locks.some(l=>l.company===r.company&&l.month===day.slice(0,7)))fail('该月份已结账');if(r.date&&day<r.date)fail('操作日期早于原单');};
  const warehouse=x=>{requireRole(warehouseRoles);const w=find('warehouses',x);check(w);if(u.role!=='owner'&&u.warehouses?.length&&!u.warehouses.includes(w.id))fail('超出仓库权限',403);return w};
  const store=r=>{requireRole(storeRoles);check(r);if(u.role!=='owner'&&u.units.length&&!u.units.includes(r.unit||r.id))fail('超出门店权限',403)};
  const quantity=(x,product)=>{const prod=find('products',product),factor=x.measure==='箱'&&!/箱|th[uù]ng/i.test(prod.baseUnit)?prod.packRate:1;return integer(integer(Number(x.qty),'数量')*integer(factor,'箱规',false)+integer(Number(x.loose||0),'散件数量'),'换算数量')};
  const inputLines=(ls,priced=false,existing=false)=>{if(!Array.isArray(ls)||!ls.length||ls.length>100)fail('请填写1至100行商品');const seen=new Set();return ls.map(l=>{const product=find('products',l.product);if(!existing&&product.active===false||seen.has(l.product))fail('商品重复或已停用');seen.add(l.product);return {product:l.product,qty:quantity(l,l.product),...(priced?{unitCost:integer(Number(l.unitCost),'每基本单位单价')}: {})}})};
  const history=(r,action,extra={})=>{r.flowHistory??=[];r.flowHistory.push({action,by:u.id,name:u.name,at:clock,date:day,note:String(p.note||''),...extra})};
  const move=(c,location,product,qty,value,document)=>{const cur=stockAt(s,location,product);if(!Number.isSafeInteger(qty)||!Number.isSafeInteger(value)||cur.qty+qty<0||cur.value+value<0)fail('库存数量或成本不足');if(s.stockMoves.some(m=>m.location===location&&m.product===product&&m.date>day))fail('不能倒填早于库存流水的日期');s.stockMoves.push({id:id+'-'+s.stockMoves.length,company:c,location,product,qty,value,date:day,source:id,document,actor:u.id,at:clock})};
  const finishOrder=r=>{normalizeOrder(s,r);r.lines.forEach(l=>{l.receivedQty=sum(s.shipments.filter(sh=>sh.order===r.id).flatMap(sh=>sh.lines).filter(v=>v.product===l.product),v=>v.actual||0)});r.status=flowOrderStatus(s,r)};
  const ensureConfirmed=r=>{if(!r.warehouseConfirmedAt){r.lines.forEach(l=>{l.requestedQty??=l.qty;l.confirmedQty??=l.qty});r.warehouseConfirmedAt=clock;r.warehouseConfirmedBy=u.id;}};
  let record,companyName='',result={id};
  switch(a) {
    case 'f.order': {
      const unit=find('units',p.unit);store({...unit,unit:unit.id});const wh=find('warehouses',p.warehouse);if(wh.company!==unit.company||!wh.targets.includes(unit.id))fail('供货仓库不匹配');
      const requests=[...new Set(p.requests||[])].map(x=>find('replenishmentRequests',x));if(requests.some(r=>r.unit!==unit.id||r.warehouse!==wh.id||r.date!==day||r.status!=='待店长确认'))fail('请选择同一门店当天未处理的参考申请');
      const lines=inputLines(p.lines);if(lines.some(l=>!l.qty))fail('申请数量须大于零');
      record={id,flowVersion:8,company:unit.company,unit:unit.id,warehouse:wh.id,date:day,lines:lines.map(l=>({...l,requestedQty:l.qty,receivedQty:0})),requests:requests.map(x=>x.id),originalRequests:requests.map(r=>({id:r.id,by:r.createdByName,lines:structuredClone(r.lines)})),note:String(p.note||''),status:'待仓库确认',createdBy:u.id,confirmedBy:u.id,confirmedAt:clock};s.orders.push(record);
      for(const r of requests){r.status='已生成订单';r.order=id;r.reviewBy=u.id;r.reviewAt=clock}break;
    }
    case 'f.order.confirm': {
      record=find('orders',p.id);warehouse(record.warehouse);check(record);if(['已完成','已取消'].includes(record.status))fail('订单已结束');normalizeOrder(s,record);
      const ls=inputLines(p.lines);if(ls.length!==record.lines.length||ls.some(l=>!record.lines.some(x=>x.product===l.product)))fail('请逐项确认原订单商品');
      text(p.note,'确认或调整原因');const before=structuredClone(record.lines);
      for(const l of record.lines){const q=ls.find(x=>x.product===l.product).qty,sent=sum(s.shipments.filter(sh=>sh.order===record.id).flatMap(sh=>sh.lines).filter(x=>x.product===l.product),x=>x.qty-(x.returnedQty||0));if(q<sent+(l.closedQty||0))fail('确认数量不能少于已发货及已关闭数量');l.requestedQty??=l.qty;l.confirmedQty=q}
      record.flowVersion=8;record.warehouseConfirmedBy=u.id;record.warehouseConfirmedName=u.name;record.warehouseConfirmedAt=clock;history(record,'仓库确认配送数量',{before,after:structuredClone(record.lines)});finishOrder(record);break;
    }
    case 'f.purchase': {
      warehouse(p.warehouse);const ls=inputLines(p.lines,true);if(ls.some(l=>!l.qty))fail('采购数量须大于零');const orders=[...new Set(p.orders||[])];
      if(p.origin==='store'&&!orders.length)fail('门店需求采购须关联门店订单');for(const oid of orders){const order=find('orders',oid);if(order.warehouse!==p.warehouse||['已完成','已取消'].includes(order.status))fail('门店需求与供货仓库不匹配')}
      const out=operationsMutation(s,u,'o.purchase',{...p,lines:ls,orders},id,clock,E);record=s.purchases.find(x=>x.id===out.result.id);record.flowVersion=8;record.origin=orders.length?'store':'warehouse';record.createdAt=clock;record.createdName=u.name;record.note=String(p.note||'');break;
    }
    case 'f.purchase.sent': {
      record=find('purchases',p.id);warehouse(record.warehouse);check(record);operationsMutation(s,u,'o.purchase.sent',{...p,note:p.note||'核对采购明细后确认下单'},id,clock,E);record.confirmedBy=u.id;record.confirmedName=u.name;record.confirmedAt=clock;break;
    }
    case 'f.purchase.revise': {
      record=find('purchases',p.id);warehouse(record.warehouse);check(record);if(record.batches?.length||['已入库','未收部分已关闭'].includes(record.status))fail('已到货采购单不能修改，请另建采购或调整单');text(p.note,'修改原因');
      const ls=p.lines?inputLines(p.lines,true):record.lines.map((l,i)=>({...l,unitCost:integer(Number(p.costs?.[i]),'单价')}));if(ls.some(l=>!l.qty))fail('采购数量须大于零');
      record.revisions??=[];record.revisions.push({revision:record.revision||1,lines:structuredClone(record.lines),at:clock,by:u.id,name:u.name,note:p.note});record.lines=ls;record.revision=(record.revision||1)+1;record.status='草稿待发送';delete record.sentAt;delete record.confirmedAt;break;
    }
    case 'f.purchase.receive': {
      requireRole(['owner','admin','warehouse']);record=find('purchases',p.id);warehouse(record.warehouse);check(record);
      const actual=p.lines?inputLines(p.lines,false,true):null;
      if(actual&&(actual.length!==record.lines.length||actual.some(l=>!record.lines.some(x=>x.product===l.product))))fail('请按原采购单逐项收货');
      const ns=record.lines.map((l,i)=>actual?actual.find(x=>x.product===l.product).qty:integer(p.actual?.[i],'本次实收'));
      if(ns.some((n,i)=>n>record.lines[i].qty-(record.lines[i].actual||0)-(record.lines[i].closedQty||0)))fail('超过未到货数量');
      if(!p._requestId)fail('缺少本次入库确认标识，请重新打开入库单');
      operationsMutation(s,u,'o.purchase.receive',{...p,actual:ns},id,clock,E);
      const batch=record.batches.at(-1);Object.assign(batch,{number:'GRN-'+id,at:clock,name:u.name,requestId:p._requestId,linesSnapshot:record.lines.map((l,i)=>{const product=find('products',l.product);return {product:l.product,productName:product.name,sku:product.sku,spec:product.spec,unit:product.baseUnit,packRate:product.packRate,ordered:l.qty,qty:ns[i]}})});record.status=record.lines.every(l=>(l.actual||0)+(l.closedQty||0)===l.qty)?'已入库':'部分到货';result.receipt=batch.number;break;
    }
    case 'f.purchase.close': {
      record=find('purchases',p.id);warehouse(record.warehouse);check(record);if(!['待到货','部分到货','待验收'].includes(record.status))fail('采购单没有可关闭的待收部分');text(p.note,'不再供货原因');record.lines.forEach(l=>l.closedQty=l.qty-(l.actual||0));record.status='未收部分已关闭';record.closedBy=u.id;record.closedAt=clock;record.closeReason=p.note;break;
    }
    case 'f.dispatch': {
      requireRole(['owner','admin','warehouse']);record=find('orders',p.id);warehouse(record.warehouse);check(record);if(!record.warehouseConfirmedAt)fail('请先确认仓库配送数量');if(['已完成','已取消'].includes(record.status))fail('订单已结束');
      const ls=inputLines(p.lines).filter(l=>l.qty);if(!ls.length)fail('本批发货数量须大于零');const wh=find('warehouses',record.warehouse);if(!wh.targets.includes(record.unit))fail('配送范围已调整');
      for(const l of ls){const line=record.lines.find(x=>x.product===l.product);const sent=sum(s.shipments.filter(sh=>sh.order===record.id).flatMap(sh=>sh.lines).filter(x=>x.product===l.product),x=>x.qty-(x.returnedQty||0));if(!line||l.qty>(line.confirmedQty??line.qty)-(line.closedQty||0)-sent)fail('发货数量超过仓库确认的待发数量');const st=stockAt(s,'wh:'+record.warehouse,l.product);if(st.qty<l.qty)fail('库存不足');l.value=Number(BigInt(st.value)*BigInt(l.qty)/BigInt(st.qty));move(record.company,'wh:'+record.warehouse,l.product,-l.qty,-l.value,record.id);move(record.company,'transit:'+id,l.product,l.qty,l.value,record.id)}
      s.shipments.push({id,number:'OUT-'+id,flowVersion:8,company:record.company,unit:record.unit,warehouse:record.warehouse,order:record.id,date:day,lines:ls,status:'配送中',createdBy:u.id,createdName:u.name,createdAt:clock,receipts:[],purchaseLinks:s.purchases.filter(po=>po.orders?.includes(record.id)).map(po=>po.id)});finishOrder(record);result.shipment=id;break;
    }
    case 'f.receive': {
      record=find('shipments',p.id);store(record);if(!['配送中','部分收货','差异待处理'].includes(record.status))fail('该配送单已经处理');if(!p._requestId)fail('缺少收货确认标识');
      const ns=p.lines?inputLines(p.lines,false,true):null;if(ns&&(ns.length!==record.lines.length||ns.some(l=>!record.lines.some(x=>x.product===l.product))))fail('请按本批配送商品逐项收货');
      const actual=record.lines.map((l,i)=>ns?ns.find(x=>x.product===l.product).qty:integer(p.actual?.[i],'实收数量'));const final=p.final!==false;
      if(!actual.some(Boolean)&&!final)fail('本次实收不能全部为零');let amount=0;
      record.lines.forEach((l,i)=>{const n=actual[i],remaining=l.qty-(l.actual||0)-(l.returnedQty||0)-(l.lossQty||0);if(n>remaining)fail('实收超过本批待收数量');const before=l.actual||0,value=Number(BigInt(l.value)*BigInt(before+n)/BigInt(l.qty))-Number(BigInt(l.value)*BigInt(before)/BigInt(l.qty));if(n){move(record.company,'transit:'+record.id,l.product,-n,-value,record.id);move(record.company,'shop:'+record.unit,l.product,n,value,record.id)}l.actual=before+n;l.receivedValue=(l.receivedValue||0)+value;amount+=value});
      const missing=record.lines.some(l=>l.qty-(l.actual||0)-(l.returnedQty||0)-(l.lossQty||0)>0);if(final&&missing)text(p.note,'少收或破损说明');
      record.receipts??=[];record.receipts.push({id,number:'RCV-'+id,date:day,at:clock,actual,by:u.id,name:u.name,note:String(p.note||''),amount,requestId:p._requestId});record.status=missing?(final?'差异待处理':'部分收货'):'已收货';record.receivedDate=day;record.confirmBy=u.id;record.confirmName=u.name;record.confirmAt=clock;record.response=String(p.note||'');record.counted={actual:record.lines.map(l=>l.actual),by:u.id,name:u.name,at:clock};
      if(amount)s.receipts.push({id:id+'-receipt',company:record.company,unit:record.unit,date:day,source:'WMS:'+id,warehouse:find('warehouses',record.warehouse).name,amount,returned:0,note:'店长确认本批实际收货自动入账',status:'已确认',createdBy:u.id,wmsSource:record.id});const order=s.orders.find(o=>o.id===record.order);if(order){ensureConfirmed(order);finishOrder(order)}break;
    }
    case 'f.resolve': {
      requireRole(['owner','admin','warehouse']);record=find('shipments',p.id);warehouse(record.warehouse);check(record);if(record.status!=='差异待处理')fail('没有待处理收货差异');text(p.note,'差异处理依据');if(!['return','loss'].includes(p.method))fail('请选择实物退回或确认运输损失');
      for(const l of record.lines){const q=l.qty-(l.actual||0)-(l.returnedQty||0)-(l.lossQty||0);if(!q)continue;const transit=stockAt(s,'transit:'+record.id,l.product),value=transit.value;move(record.company,'transit:'+record.id,l.product,-q,-value,record.id);if(p.method==='return'){move(record.company,'wh:'+record.warehouse,l.product,q,value,record.id);l.returnedQty=(l.returnedQty||0)+q;l.effectiveQty=l.qty-l.returnedQty}else{l.lossQty=(l.lossQty||0)+q;s.transportLosses??=[];s.transportLosses.push({id:id+'-'+l.product,company:record.company,shipment:record.id,order:record.order,product:l.product,qty:q,value,date:day,by:u.id,at:clock,note:p.note})}}
      record.status=p.method==='return'?'差异已退回仓库':'差异已确认损失';record.resolution=p.note;record.resolvedBy=u.id;record.resolvedAt=clock;const order=s.orders.find(o=>o.id===record.order);if(order){ensureConfirmed(order);finishOrder(order)}break;
    }
    case 'f.order.close': {
      record=find('orders',p.id);store(record);if(['已完成','已取消'].includes(record.status))fail('订单已结束');normalizeOrder(s,record);if(s.shipments.filter(sh=>sh.order===record.id).some(sh=>sh.lines.some(l=>l.qty-(l.actual||0)-(l.returnedQty||0)-(l.lossQty||0)>0)))fail('请先处理在途货物或收货差异');text(p.note,'关闭未收部分原因');ensureConfirmed(record);finishOrder(record);record.lines.forEach(l=>{l.closedQty=Math.max(0,(l.confirmedQty??l.qty)-(l.receivedQty||0))});record.closeReason=p.note;record.closedAt=clock;record.closedBy=u.id;finishOrder(record);break;
    }
    default:fail('流程操作不存在',404);
  }
  companyName=record.company;history(record,a);if(s.audit.at(-1)?.id===id&&s.audit.at(-1).action!==a)s.audit.pop();s.audit.push({id,at:clock,actor:u.name,actorId:u.id,action:a,company:companyName,detail:String(p.note||p.id||'').slice(0,500)});
  return {state:s,result};
}
