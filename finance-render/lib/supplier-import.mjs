// Shared validation for supplier imports. Browser copy is generated into catalog-ui.js.
export const supplierHeaders={zh:['供应商名称','供应商分类','联系人','电话','地址','税号','结算条件','期初日期','期初欠款','状态'],vi:['Tên nhà cung cấp','Nhóm nhà cung cấp','Người liên hệ','Điện thoại','Địa chỉ','Mã số thuế','Điều kiện thanh toán','Ngày đầu kỳ','Công nợ đầu kỳ','Trạng thái']};
export function parseSupplierCSV(input){
 const fail=(zh,vi)=>{throw Error(zh+' / '+vi)};
 if(typeof input!=='string'||input.length>300000)fail('CSV文件过大，限300KB文本','CSV tối đa 300KB');
 if(input.includes('\uFFFD')||input.includes('\0'))fail('文件编码异常，请另存为CSV UTF-8','Lỗi mã hóa, hãy lưu lại dưới dạng CSV UTF-8');
 const text=input.replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false,after=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;after=true}}else cell+=c;continue}
  if(c==='"'){if(cell||after)fail('CSV引号位置无效','Dấu ngoặc kép CSV không hợp lệ');quoted=true;continue}
  if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';after=false;if(c!==','){if(row.some(v=>v.trim()!==''))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++}continue}
  if(after)fail('CSV引号后有多余字符','Có ký tự thừa sau dấu ngoặc kép CSV');cell+=c;
 }
 if(quoted)fail('CSV引号没有闭合','Dấu ngoặc kép CSV chưa đóng');
 if(cell||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row)}
 if(!rows.length||!Object.values(supplierHeaders).some(h=>rows[0].length===h.length&&h.every((v,i)=>rows[0][i].trim()===v)))fail('表头须与供应商模板一致','Tiêu đề cột phải giống mẫu nhà cung cấp');
 if(rows.length<2||rows.length>501)fail('每次请导入1至500条供应商','Mỗi lần nhập 1–500 nhà cung cấp');
 const keys=['name','categoryName','contact','phone','address','taxCode','terms','openingDate','opening','active'];
 return rows.slice(1).map((r,i)=>{if(r.length!==keys.length)fail('第'+(i+2)+'行列数不符','Dòng '+(i+2)+' sai số cột');return Object.fromEntries(keys.map((k,j)=>[k,r[j]]))});
}
export function validateSupplierImport(s,rows,company,ErrorType=Error){
 const fail=(zh,vi)=>{throw new ErrorType(zh+' / '+vi)};
 if(!Array.isArray(rows)||rows.length<1||rows.length>500)fail('每次导入限1至500条供应商','Mỗi lần nhập 1–500 nhà cung cấp');
 const norm=x=>String(x||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(),tax=x=>norm(x).replace(/[\s-]/g,'');
 const names=new Set((s.suppliers||[]).filter(x=>x.company===company).map(x=>norm(x.name))),taxes=new Set((s.suppliers||[]).filter(x=>x.company===company&&x.taxCode).map(x=>tax(x.taxCode)));
 const errors=[],checked=[];
 for(let i=0;i<rows.length;i++)try{
  const r=rows[i],bad=(zh,vi)=>{throw Error(zh+' / '+vi)};
  if(!r||typeof r!=='object'||Array.isArray(r))bad('供应商行无效','Dòng nhà cung cấp không hợp lệ');
  const t=(v,zh,vi,max,required=false)=>{if(v==null&&!required)return '';if(typeof v!=='string'||v.length>max||required&&!v.trim()||typeof v==='string'&&/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(v))bad(zh+'无效或过长',vi+' không hợp lệ hoặc quá dài');return v.trim()};
  if(r.company&&r.company!==company)bad('供应商公司与所选公司不一致','Công ty nhà cung cấp khác công ty đã chọn');
  const name=t(r.name,'供应商名称','Tên nhà cung cấp',160,true),key=norm(name);
  if(names.has(key))bad('同公司供应商名称重复：'+name,'Tên nhà cung cấp trùng trong công ty: '+name);
  const catName=t(r.categoryName,'供应商分类','Nhóm nhà cung cấp',60);let category='';
  if(catName){const c=(s.categories||[]).find(x=>x.kind==='supplier'&&x.active&&x.name===catName);if(!c)bad('请先建立并启用供应商分类：'+catName,'Hãy tạo và bật nhóm nhà cung cấp trước: '+catName);category=c.id}
  const contact=t(r.contact,'联系人','Người liên hệ',60),phone=t(r.phone,'电话','Điện thoại',60),address=t(r.address,'地址','Địa chỉ',300),taxCode=t(r.taxCode,'税号','Mã số thuế',60),terms=t(r.terms,'结算条件','Điều kiện thanh toán',160);
  for(const [v,zh,vi]of [[phone,'电话','Điện thoại'],[taxCode,'税号','Mã số thuế']])if(v&&/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(v))bad(zh+'须按文本填写，不能使用科学计数法',vi+' phải là văn bản, không dùng ký hiệu khoa học');
  if(taxCode&&taxes.has(tax(taxCode)))bad('同公司税号重复：'+taxCode,'Mã số thuế trùng trong công ty: '+taxCode);
  const openingDate=t(r.openingDate,'期初日期','Ngày đầu kỳ',10,true);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(openingDate)||!Number.isFinite(Date.parse(openingDate))||new Date(openingDate).toISOString().slice(0,10)!==openingDate)bad('期初日期须为有效的YYYY-MM-DD','Ngày đầu kỳ phải hợp lệ, định dạng YYYY-MM-DD');
  if((s.locks||[]).some(x=>x.company===company&&x.month===openingDate.slice(0,7)))bad('期初月份已结账','Tháng đầu kỳ đã khóa sổ');
  const raw=typeof r.opening==='number'?String(r.opening):t(r.opening,'期初欠款','Công nợ đầu kỳ',16)||'0';
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>1e14)bad('期初欠款须为非负越南盾整数，不加逗号','Công nợ đầu kỳ phải là số nguyên VND không âm, không có dấu phẩy');
  const state=r.active==null?'':String(r.active).trim(),states={'':true,'启用':true,'停用':false,'Hoạt động':true,'Ngừng hoạt động':false,'true':true,'false':false};
  if(!Object.hasOwn(states,state))bad('状态须为启用或停用','Trạng thái phải là Hoạt động hoặc Ngừng hoạt động');
  names.add(key);if(taxCode)taxes.add(tax(taxCode));checked.push({company,name,category,contact,phone,address,taxCode,terms,openingDate,opening:Number(raw),active:states[state]});
 }catch(e){errors.push('第'+(i+2)+'行 / Dòng '+(i+2)+': '+e.message)}
 if(errors.length)throw new ErrorType(errors.slice(0,20).join('\n')+(errors.length>20?'\n另有错误行 / Còn dòng lỗi: '+(errors.length-20):''));
 return checked;
}
