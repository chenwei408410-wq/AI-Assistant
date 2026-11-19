const normalized=v=>String(v).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
// Organization edits keep all existing ledger IDs, financial data and explicit user scopes.
export function organizationMutation(s,u,action,p,id,ErrorType){
 const fail=(zh,vi,status=400)=>{throw new ErrorType(zh+' / '+vi,status)};
 if(u.role!=='owner')fail('仅总管理员可以新增门店、仓库或修改仓库名称','Chỉ quản trị viên chính có thể thêm cửa hàng, kho hoặc đổi tên kho',403);
 const old=action==='warehouse.rename'?s.warehouses.find(w=>w.id===p.id):null;
 if(action==='warehouse.rename'&&!old)fail('仓库不存在','Kho không tồn tại',404);
 const company=old?.company||p.company;
 if(!s.companies.includes(company))fail('所属公司无效','Công ty không hợp lệ');
 if(old&&p.company&&p.company!==old.company)fail('仓库所属公司不能更改','Không thể đổi công ty sở hữu kho');
 if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100||/[\u0000-\u001f\u007f]/.test(p.name))fail('名称须为1至100个有效字符','Tên phải có từ 1 đến 100 ký tự hợp lệ');
 const name=p.name.trim(),isUnit=action==='unit.add',list=isUnit?s.units:s.warehouses;
 if(list.some(v=>v.id!==old?.id&&v.company===company&&normalized(v.name)===normalized(name)))fail('同公司下名称已存在，请使用其他名称','Tên đã tồn tại trong công ty, hãy dùng tên khác');
 if(action==='warehouse.rename'){old.name=name;return {company,detail:'修改仓库名称 / Đổi tên kho: '+name}}
 if(list.length>=(isUnit?200:100))fail('门店或仓库数量已达上限','Đã đạt giới hạn số cửa hàng hoặc kho');
 if(list.some(v=>v.id===id))fail('记录已创建，请刷新后查看','Bản ghi đã được tạo, hãy tải lại để xem');
 const selected=isUnit?p.warehouses??[]:p.targets??[];
 if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(v=>typeof v!=='string'))fail('配送范围格式无效','Phạm vi giao hàng không hợp lệ');
 if(isUnit){
  if(!['超市','咖啡店','售货机'].includes(p.type))fail('业务类型无效','Loại hình kinh doanh không hợp lệ');
  const sources=selected.map(wid=>s.warehouses.find(w=>w.id===wid&&w.company===company));
  if(sources.some(w=>!w))fail('供货仓库必须属于所选公司','Kho cung cấp phải thuộc công ty đã chọn');
  if(sources.some(w=>w.independent))fail('独立库存点不能扩展到新门店，请选择其他仓库','Điểm tồn kho độc lập không thể mở rộng sang cửa hàng mới, hãy chọn kho khác');
  s.units.push({id,company,name,type:p.type});
  for(const w of sources)w.targets.push(id);
  return {company,detail:'新增门店 / Thêm cửa hàng: '+name+'; 供货仓库 / Kho cung cấp: '+selected.length};
 }
 if(action!=='warehouse.add')fail('组织设置操作无效','Thao tác tổ chức không hợp lệ');
 if(selected.some(uid=>!s.units.some(v=>v.id===uid&&v.company===company)))fail('配送门店必须属于所选公司','Cửa hàng được giao hàng phải thuộc công ty đã chọn');
 s.warehouses.push({id,company,name,targets:[...selected],independent:false});
 return {company,detail:'新增仓库 / Thêm kho: '+name+'; 配送门店 / Cửa hàng nhận: '+selected.length};
}
