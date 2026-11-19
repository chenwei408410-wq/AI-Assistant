// A shared profile links existing company ledgers; ledger IDs and financial history never move.
const sharedFields=['name','category','contact','phone','address','taxCode','terms','active'];
const norm=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const tax=v=>norm(v).replace(/[\s-]/g,'');
const access=(u,c)=>u.role==='owner'||u.companies.includes(c);
export function upgradeSupplierCompanies(s){
 for(const v of s.suppliers||[]){v.profileId??=v.id;v.supplyEnabled??=true}
 return s;
}
export function saveSharedSupplier(s,u,old,row,ErrorType){
 const peers=s.suppliers.filter(v=>v.profileId===old.profileId);
 const changed=sharedFields.some(k=>(old[k]??'')!==(row[k]??''));
 if(changed&&peers.some(v=>!access(u,v.company)))throw new ErrorType('共用资料涉及其他公司，请由有全部关联公司权限的管理员修改 / Hãy nhờ quản trị viên có quyền tại mọi công ty liên kết sửa thông tin chung',403);
 for(const peer of peers){
  if(s.suppliers.some(v=>v.profileId!==old.profileId&&v.company===peer.company&&(norm(v.name)===norm(row.name)||row.taxCode&&tax(v.taxCode)===tax(row.taxCode))))throw new ErrorType('关联公司已有同名或同税号供应商，不能覆盖 / Công ty liên kết đã có nhà cung cấp trùng tên hoặc mã số thuế');
 }
 for(const peer of peers)for(const k of sharedFields)peer[k]=row[k];
}
export function setSupplierCompanies(s,u,p,id,clock,ErrorType){
 const fail=(zh,vi,status=400)=>{throw new ErrorType(zh+' / '+vi,status)};
 const source=s.suppliers.find(v=>v.id===p.id);
 if(!source||!access(u,source.company))fail('无权设置该供应商','Không có quyền cài đặt nhà cung cấp này',403);
 if(!Array.isArray(p.companies)||p.companies.length>s.companies.length||new Set(p.companies).size!==p.companies.length||p.companies.some(c=>typeof c!=='string'||!s.companies.includes(c)||!access(u,c)))fail('供货公司超出权限或无效','Công ty được cung cấp không hợp lệ hoặc ngoài phạm vi quyền',403);
 const peers=s.suppliers.filter(v=>v.profileId===source.profileId);
 const hiddenEnabled=peers.some(v=>!access(u,v.company)&&v.supplyEnabled!==false);
 if(!p.companies.length&&!hiddenEnabled)fail('请至少勾选一家供货公司','Vui lòng chọn ít nhất một công ty được cung cấp');
 // Validate every target before changing anything. Existing unrelated suppliers are never merged.
 for(const c of p.companies){
  if(peers.some(v=>v.company===c))continue;
  if(s.suppliers.some(v=>v.company===c&&(norm(v.name)===norm(source.name)||source.taxCode&&tax(v.taxCode)===tax(source.taxCode))))fail('所选公司已有同名或同税号供应商，请先核对，系统不会自动合并账目','Công ty đã chọn có nhà cung cấp trùng tên hoặc mã số thuế; hãy kiểm tra, hệ thống không tự gộp sổ');
 }
 const added=[];
 for(const c of p.companies){
  if(peers.some(v=>v.company===c))continue;
  const row={id:id+'-'+added.length,profileId:source.profileId,company:c,supplyEnabled:true,opening:0,openingDate:clock.slice(0,10)};
  for(const k of sharedFields)row[k]=source[k];
  // Automatic settlement rules remain company-specific and are configured separately.
  added.push(row);
 }
 for(const peer of peers)if(access(u,peer.company))peer.supplyEnabled=p.companies.includes(peer.company);
 s.suppliers.push(...added);
 const touched=new Set([...peers.filter(v=>access(u,v.company)).map(v=>v.company),...p.companies]);
 for(const c of touched)s.audit.push({id:id+'-audit-'+s.audit.length,at:clock,actor:u.name,actorId:u.id,action:'w.supplier.companies',company:c,detail:'供应商供货范围 / Phạm vi cung cấp: '+source.name+' / '+(p.companies.includes(c)?'启用 / Bật':'停供 / Ngừng cung cấp')});
 if(new TextEncoder().encode(JSON.stringify(s)).length>1000000)fail('数据量过大，请先归档','Dữ liệu quá lớn, hãy lưu trữ trước');
 return {state:s,result:{id:source.id}};
}
