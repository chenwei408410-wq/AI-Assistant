/* Read-only warehouse reporting. Quantities remain separated by product and unit. */
window.warehouseReportData = function(data, filters = {}) {
  const warehouses = new Map((data.warehouses || []).map(w => [w.id, w]));
  const suppliers = data.opsSuppliers || data.suppliers || [];
  const records = new Map();
  const add = (key, detail) => { if (key) records.set(key, detail); };
  for (const p of data.purchases || []) {
    const detail = {kind:'采购入库', supplier:p.supplier, reference:p.source || p.id};
    add(p.id, detail);
    for (const batch of p.batches || []) add(batch.id, detail);
  }
  for (const s of data.shipments || []) add(s.id, {kind:'配送出库', reference:s.id, unit:s.unit});
  for (const r of data.stockReturns || []) add(r.id, {kind:'门店退仓', reference:r.source || r.id, unit:r.unit});
  for (const r of data.supplierReturns || []) add(r.id, {kind:'供应商退货', supplier:r.supplier, reference:r.id});
  for (const c of data.counts || []) add(c.id, {kind:'盘点调整', reference:c.id});
  const moves = (data.warehouseHistory || data.stockMoves || []).filter(m => m.location.startsWith('wh:') && warehouses.has(m.location.slice(3))).map((m, index) => {
    const info = records.get(m.document || m.source) || records.get(m.source) || {kind:m.qty >= 0 ? '其他入库 / 期初' : '其他出库', reference:m.source};
    return {...m, ...info, index, warehouse:m.location.slice(3)};
  });
  const related = new Set((data.purchases || []).filter(p => p.supplier === filters.supplier && (!filters.warehouse || p.warehouse === filters.warehouse)).flatMap(p => p.lines.map(l => l.product)));
  const products = (data.products || []).filter(p => (!filters.product || p.id === filters.product) && (!filters.supplier || related.has(p.id)) && (!filters.q || [p.sku,p.name,p.barcode,p.spec].some(v => String(v || '').toLocaleLowerCase().includes(filters.q.toLocaleLowerCase()))));
  const ids = new Set(products.map(p => p.id));
  const stock = (data.stocks || []).filter(s => s.location.startsWith('wh:') && warehouses.has(s.location.slice(3)) && (!filters.warehouse || s.location === 'wh:' + filters.warehouse) && ids.has(s.product));
  const selected = moves.filter(m => (!filters.warehouse || m.warehouse === filters.warehouse) && ids.has(m.product));
  const inPeriod = m => (!filters.from || m.date >= filters.from) && (!filters.to || m.date <= filters.to);
  const balances = new Map(stock.map(s => [s.location+'|'+s.product, {qty:s.qty,value:s.value || 0}]));
  const rows = stock.map(s => {
    const ms = selected.filter(m => m.location === s.location && m.product === s.product);
    const period = ms.filter(inPeriod);
    const ending = s.qty - ms.filter(m => filters.to && m.date > filters.to).reduce((n,m) => n+m.qty,0);
    const incoming = period.filter(m => m.qty > 0).reduce((n,m) => n+m.qty,0);
    const outgoing = -period.filter(m => m.qty < 0).reduce((n,m) => n+m.qty,0);
    const value = (s.value || 0) - ms.filter(m => filters.to && m.date > filters.to).reduce((n,m) => n+(m.value || 0),0);
    return {...s, opening:ending-incoming+outgoing, incoming, outgoing, ending, value};
  });
  const ledger = [];
  for (const m of [...selected].sort((a,b) => b.date.localeCompare(a.date) || b.index-a.index)) {
    const key = m.location+'|'+m.product, balance = balances.get(key) || {qty:0,value:0};
    if (inPeriod(m) && (!filters.supplier || m.supplier === filters.supplier)) ledger.push({...m, balance:balance.qty});
    balance.qty -= m.qty; balance.value -= m.value || 0; balances.set(key,balance);
  }
  return {products, rows, ledger, suppliers, related};
};

window.warehouseReports = function(ctx) {
  const {esc,fmt,panel,table,button} = ctx, root = document.getElementById('finance-root');
  let filters = {q:'',warehouse:'',supplier:'',product:'',from:'',to:''}, selectedMonth = '', mode = 'stock';
  const labels = {q:'商品名称 / 编码 / 条码',warehouse:'仓库',supplier:'供应商',product:'商品',from:'开始日期',to:'结束日期'};
  const quantity = (n,p) => {
    const unit = p?.baseUnit || '', rate = Number(p?.packRate);
    const box = rate > 1 && !/箱|th[uù]ng/i.test(unit) && n >= rate ? '<small>'+fmt(Math.floor(n/rate))+' 箱 + '+fmt(n%rate)+' '+esc(unit)+'</small>' : '';
    return fmt(n)+' '+esc(unit)+box;
  };
  function scoped() { const d=ctx.data(); return {...d,warehouses:ctx.filter(d.warehouses || []),opsSuppliers:ctx.filter(d.opsSuppliers || [])}; }
  function syncMonth() {
    const month = document.getElementById('month')?.value || ctx.today.slice(0,7);
    if (month !== selectedMonth) { selectedMonth=month; filters.from=month+'-01'; filters.to=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10); }
  }
  function controls(data) {
    const options = (items,name) => '<option value="">'+esc('全部')+'</option>'+items.map(x=>'<option value="'+esc(x.id)+'" '+(filters[name]===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('');
    return '<form id="warehouse-query" class="warehouse-query">'+Object.keys(labels).map(name=>'<label>'+esc(labels[name])+(name==='q'?'<input name="q" value="'+esc(filters.q)+'" placeholder="输入商品名称、编码或条码">':['from','to'].includes(name)?'<input type="date" name="'+name+'" value="'+esc(filters[name])+'">':'<select name="'+name+'">'+options(name==='warehouse'?data.warehouses:name==='supplier'?data.opsSuppliers:data.products,name)+'</select>')+'</label>').join('')+'<div class="warehouse-query-actions"><button type="submit" class="primary">查询</button>'+button('重置','wr-reset')+'</div></form>';
  }
  const P = id => ctx.data().products.find(p=>p.id===id);
  const W = id => ctx.data().warehouses.find(w=>w.id===id)?.name || id;
  function view(nextMode='stock') {
    mode=nextMode; syncMonth(); const data=scoped();
    if (filters.warehouse && !data.warehouses.some(w=>w.id===filters.warehouse)) filters.warehouse='';
    if (filters.supplier && !data.opsSuppliers.some(s=>s.id===filters.supplier)) filters.supplier='';
    const report=window.warehouseReportData(data,filters);
    const pending=ctx.filter(data.purchases || []).filter(p=>(!filters.warehouse||p.warehouse===filters.warehouse)&&(!filters.supplier||p.supplier===filters.supplier)&&p.lines.some(l=>report.products.some(v=>v.id===l.product))&&['待验收','待到货','部分到货'].includes(p.status));
    const cards=[['有库存商品',new Set(report.rows.filter(r=>r.ending>0).map(r=>r.product)).size],['本期入库记录',report.ledger.filter(m=>m.qty>0).length],['本期出库记录',report.ledger.filter(m=>m.qty<0).length],['待到货采购单',pending.length]];
    let html=controls(data)+'<div class="cards warehouse-cards">'+cards.map(([label,value])=>'<div class="card"><label>'+esc(label)+'</label><div class="value">'+fmt(value)+'</div></div>').join('')+'<p class="muted">'+esc('期初 + 本期入库 − 本期出库 = 期末结存；入出库含退货及盘点调整。仓库出库为配送数量，不代表零售销量。')+'</p>';
    if (filters.supplier) html+='<div class="notice">'+esc('供应商筛选：库存显示该供应商供过的商品在本仓的全部结存；流水仅显示该供应商的采购入库与退货，不能认定结存全部来自该供应商。')+'</div>';
    if (mode==='ledger') {
      html+=panel('商品进出库流水',report.ledger.length?table(['日期','业务 / 单号','仓库','商品','供应商 / 门店','入库','出库','变动后结存'],report.ledger.map(m=>[esc(m.date),esc(m.kind)+'<small>'+esc(m.reference)+'</small>',esc(W(m.warehouse)),esc(P(m.product)?.name||m.product),esc(report.suppliers.find(s=>s.id===m.supplier)?.name || (m.unit?ctx.names(m.unit):'—')),m.qty>0?quantity(m.qty,P(m.product)):'—',m.qty<0?quantity(-m.qty,P(m.product)):'—',quantity(m.balance,P(m.product))])):'<p class="empty">没有符合条件的库存流水</p>',button('返回进销存总览','wr-stock'));
    } else if (mode==='supplier') {
      const suppliers=report.suppliers.filter(s=>!filters.supplier||s.id===filters.supplier);
      html+=panel('供应商供货查询',suppliers.length?table(['供应商','公司','供货商品数','本期到货记录','操作'],suppliers.map(s=>[esc(s.name),esc(s.company),fmt(new Set((data.purchases||[]).filter(p=>p.supplier===s.id&&(!filters.warehouse||p.warehouse===filters.warehouse)).flatMap(p=>p.lines.map(l=>l.product))).size),fmt(report.ledger.filter(m=>m.supplier===s.id&&m.kind==='采购入库').length),button('查看供货与流水','wr-supplier',s.id)])):'<p class="empty">没有符合条件的供应商</p>');
      if(filters.supplier) html+=ledgerPreview(report);
    } else {
      html+=panel('商品进销存明细',report.rows.length?table(['仓库','商品 / 编码','期初数量','本期入库','本期出库','期末结存',...(data.costAccess?['期末库存金额 ₫']:[]),'操作'],report.rows.map(r=>[esc(W(r.location.slice(3))),'<strong>'+esc(P(r.product)?.name||r.product)+'</strong><small>'+esc(P(r.product)?.sku||'')+'</small>',quantity(r.opening,P(r.product)),quantity(r.incoming,P(r.product)),quantity(r.outgoing,P(r.product)),'<strong>'+quantity(r.ending,P(r.product))+'</strong>',...(data.costAccess?[fmt(r.value)]:[]),button('查看流水','wr-product',r.product+'|'+r.location.slice(3))])):'<p class="empty">没有符合条件的库存，请调整筛选条件</p>',button('查看全部流水','wr-ledger'));
    }
    return '<div class="warehouse-report">'+html+'</div>';
  }
  function ledgerPreview(report) { return panel('供应商到货与退货明细',report.ledger.length?table(['日期','业务 / 单号','商品','数量','仓库'],report.ledger.map(m=>[esc(m.date),esc(m.kind)+'<small>'+esc(m.reference)+'</small>',esc(P(m.product)?.name||m.product),quantity(Math.abs(m.qty),P(m.product)),esc(W(m.warehouse))])):'<p class="empty">该期间没有到货或退货记录</p>'); }
  root.addEventListener('submit',event=>{
    if(event.target.id!=='warehouse-query')return;
    event.preventDefault();event.stopImmediatePropagation();
    const next=Object.fromEntries(new FormData(event.target));
    if(next.from&&next.to&&next.from>next.to){ctx.toast('开始日期不能晚于结束日期');return;}
    filters=next;ctx.render();
  },true);
  root.addEventListener('click',event=>{
    const b=event.target.closest('button[data-action]');if(!b?.dataset.action.startsWith('wr-'))return;
    const action=b.dataset.action.slice(3);
    if(action==='reset'){filters={q:'',warehouse:'',supplier:'',product:'',from:'',to:''};selectedMonth='';}
    if(action==='product'){const [product,warehouse]=b.dataset.id.split('|');filters.product=product;filters.warehouse=warehouse;ctx.select('ledger');}
    if(action==='supplier'){filters.supplier=b.dataset.id;filters.product='';filters.q='';}
    if(action==='ledger'||action==='stock')ctx.select(action);
    ctx.render();
  });
  return {view};
};
