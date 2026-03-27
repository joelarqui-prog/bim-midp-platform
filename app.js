// MIDP BIM Platform - app.js v2.0
// Estructura completa ISO 19650 con fases RIBA
var SUPA_URL = 'https://rrzlwvqlzhmzyrramjcw.supabase.co';
var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyemx3dnFsemhtenlycmFtamN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODIyMzYsImV4cCI6MjA5MDE1ODIzNn0.IeZlvcT1GaqQybZRbxyjgoEFfJ6Z6BVxbZRgLPzi2Fw';
var H = {'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Prefer':'return=representation'};

function sbGet(t,p){return fetch(SUPA_URL+'/rest/v1/'+t+(p||''),{headers:H}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPost(t,b){return fetch(SUPA_URL+'/rest/v1/'+t,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPatch(t,f,b){return fetch(SUPA_URL+'/rest/v1/'+t+'?'+f,{method:'PATCH',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbRpc(fn,b){return fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}

var APP={user:null,project:null,schemas:[],users:[],search:'',statusFilter:'',phaseFilter:''};
var DEFAULT_PERMS={can_create_deliverables:false,can_edit_deliverables:false,can_delete_deliverables:false,can_change_status:false,can_register_progress:false};

function can(a){if(!APP.user)return false;if(APP.user.role==='admin')return true;return !!(APP.user.permissions||DEFAULT_PERMS)[a];}

var PHASES=[
  {key:'riba3', label:'RIBA 3', sub:'Presentación 1', color:'#3b82f6'},
  {key:'riba4', label:'RIBA 4', sub:'Presentación 2', color:'#8b5cf6'},
  {key:'const', label:'Construcción', sub:'Presentación 3', color:'#f59e0b'},
  {key:'pm',    label:'Puesta en Marcha', sub:'', color:'#10b981'}
];
var PERM_CONFIG=[
  {key:'can_create_deliverables',label:'Crear entregables'},
  {key:'can_edit_deliverables',label:'Editar entregables'},
  {key:'can_delete_deliverables',label:'Eliminar entregables'},
  {key:'can_change_status',label:'Cambiar estado'},
  {key:'can_register_progress',label:'Registrar avance'},
];
var STATUS_CFG={
  pending:{label:'Pendiente',cls:'b-pending'},
  in_progress:{label:'En progreso',cls:'b-progress'},
  for_review:{label:'En revision',cls:'b-review'},
  approved:{label:'Aprobado',cls:'b-approved'},
  issued:{label:'Emitido',cls:'b-issued'},
  rejected:{label:'Rechazado',cls:'b-rejected'}
};
var ROLE_CFG={admin:{label:'Administrador',cls:'b-admin'},bim_manager:{label:'BIM Manager',cls:'b-bim'},specialist:{label:'Especialista',cls:'b-spec'}};
var FILE_FORMATS=['RVT','IFC','DWG','DXF','PDF','XLSX','DOCX','PNG','JPG','NWD','NWC','SKP','OBJ','3DM','CSV'];
var SHEET_SIZES=['A0','A1','A2','A3','A4','Sin lamina'];
var SCALES=['1:1','1:5','1:10','1:20','1:25','1:50','1:100','1:200','1:500','1:1000','Sin escala'];
var LOD_VALUES=['100','200','300','350','400','500','ND'];
var LOI_VALUES=['1','2','3','4','5','ND'];

function statusBadge(s){var c=STATUS_CFG[s]||STATUS_CFG.pending;return '<span class="badge '+c.cls+'">'+c.label+'</span>';}
function roleBadge(r){var c=ROLE_CFG[r]||ROLE_CFG.specialist;return '<span class="badge '+c.cls+'">'+c.label+'</span>';}
function fmtDate(d){return d?new Date(d).toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'}):'--';}
function fmtDateShort(d){return d?new Date(d).toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'2-digit'}):'--';}
function progColor(p){return p>=80?'var(--green)':p>=50?'var(--brand)':'var(--amber)';}
function initials(n){return(n||'?').split(' ').slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();}
function loading(){return '<div class="loading"><div class="spinner"></div>Cargando desde Supabase...</div>';}
function selOpts(arr,val){return arr.map(function(v){return '<option value="'+v+'"'+(val===v?' selected':'')+'>'+v+'</option>';}).join('');}
function toast(msg,type){var t=document.getElementById('toast');t.textContent=msg;t.className='toast '+(type||'success')+' show';setTimeout(function(){t.className='toast';},3500);}
function closeModal(id){var el=document.getElementById(id);if(el)el.remove();}
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.getElementById('modal-container').innerHTML='';});

function buildCode(fields){
  var parts=APP.schemas.filter(function(s){return s.is_part_of_code&&s.is_active;}).sort(function(a,b){return a.code_order-b.code_order;});
  var code='';
  for(var i=0;i<parts.length;i++){
    var s=parts[i];var v=fields[s.key];
    if(!v)continue;
    code+=String(v).substring(0,s.max_length);
    if(i<parts.length-1&&s.separator)code+=s.separator;
  }
  return code;
}

// ── AUTH ──────────────────────────────────────────
function handleLogin(){
  var email=document.getElementById('login-email').value.trim();
  var pass=document.getElementById('login-pass').value;
  var errEl=document.getElementById('login-error');
  var btn=document.getElementById('login-btn');
  function showErr(m){errEl.textContent=m;errEl.style.display='block';btn.disabled=false;btn.textContent='Iniciar sesion';}
  if(!email){showErr('Ingresa tu correo.');return;}
  if(!pass){showErr('Ingresa tu contrasena.');return;}
  errEl.style.display='none';btn.disabled=true;btn.textContent='Verificando...';
  sbGet('users','?email=eq.'+encodeURIComponent(email)+'&is_active=eq.true&select=*')
    .then(function(users){
      if(!users||!users.length){showErr('Correo o contrasena incorrectos.');return;}
      var user=users[0];
      return sbRpc('verify_password',{input_password:pass,stored_hash:user.password_hash})
        .then(function(ok){
          if(!ok){showErr('Correo o contrasena incorrectos.');return;}
          btn.textContent='Cargando...';
          sbPatch('users','id=eq.'+user.id,{last_login_at:new Date().toISOString()}).catch(function(){});
          APP.user=user;
          return sbGet('projects','?is_active=eq.true&order=created_at.asc&limit=1')
            .then(function(ps){
              APP.project=ps[0]||null;
              var p2=APP.project?sbGet('field_schemas','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code_order.asc'):Promise.resolve([]);
              return Promise.all([p2,sbGet('users','?select=*&order=full_name.asc')]);
            })
            .then(function(r){
              APP.schemas=r[0];APP.users=r[1];
              document.getElementById('login-page').style.display='none';
              document.getElementById('app').style.display='flex';
              document.getElementById('sb-avatar').textContent=initials(user.full_name);
              document.getElementById('sb-uname').textContent=user.full_name;
              var rc=ROLE_CFG[user.role]||ROLE_CFG.specialist;
              document.getElementById('sb-role-badge').className='badge '+rc.cls;
              document.getElementById('sb-role-badge').textContent=rc.label;
              if(APP.project){document.getElementById('sb-proj-code').textContent=APP.project.code;document.getElementById('sb-proj-name').textContent=APP.project.name;}
              nav('deliverables',document.querySelector('.sb-item'));
            });
        });
    }).catch(function(e){showErr('Error: '+e.message);});
}
function doLogout(){
  APP.user=null;APP.project=null;APP.schemas=[];
  document.getElementById('app').style.display='none';
  document.getElementById('login-page').style.display='flex';
  document.getElementById('login-email').value='';
  document.getElementById('login-pass').value='';
}
document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('login-pass').addEventListener('keydown',function(e){if(e.key==='Enter')handleLogin();});
});

// ── NAV ───────────────────────────────────────────
var BREAD={deliverables:'Entregables MIDP',progress:'Control de avance',schemas:'Config. de campos',users:'Usuarios y permisos'};
function nav(view,el){
  document.querySelectorAll('.sb-item').forEach(function(i){i.classList.remove('active');});
  if(el)el.classList.add('active');
  document.getElementById('bread-title').textContent=BREAD[view]||view;
  ({deliverables:renderDeliverables,progress:renderProgress,schemas:renderSchemas,users:renderUsers})[view]&&({deliverables:renderDeliverables,progress:renderProgress,schemas:renderSchemas,users:renderUsers})[view]();
}

// ── DELIVERABLES — Vista MIDP con fases ──────────
function renderDeliverables(){
  document.getElementById('topbar-actions').innerHTML=
    can('can_create_deliverables')
      ?'<button class="btn btn-primary btn-sm" onclick="openDeliverableModal()">+ Nuevo entregable</button>'
      :'<span style="font-size:11px;color:var(--text3)">Sin permiso para crear</span>';

  document.getElementById('content').innerHTML=
    '<div class="page-header">'+
    '<div><h1 class="page-title">Entregables MIDP</h1><p class="page-sub">'+(APP.project?APP.project.name:'')+'</p></div>'+
    '<div style="display:flex;gap:8px">'+
    '<button class="btn btn-sm" onclick="exportCSV()">Exportar CSV</button>'+
    '<button class="btn btn-sm" onclick="exportMIDP()">Exportar MIDP Excel</button>'+
    '</div></div>'+
    '<div class="kpi-grid" id="kpi-area"><div class="loading"><div class="spinner"></div></div></div>'+
    '<div class="filters">'+
    '<div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'+
    '<input class="input" placeholder="Buscar codigo o nombre..." oninput="APP.search=this.value;loadDeliverables()"></div>'+
    '<select class="input" style="width:150px" onchange="APP.statusFilter=this.value;loadDeliverables()">'+
    '<option value="">Todos los estados</option>'+
    Object.entries(STATUS_CFG).map(function(e){return '<option value="'+e[0]+'">'+e[1].label+'</option>';}).join('')+
    '</select>'+
    '<button class="btn btn-sm" onclick="loadDeliverables()">Actualizar</button></div>'+
    '<div id="del-table">'+loading()+'</div>';
  loadDeliverables();
}

function loadDeliverables(){
  if(!APP.project)return;
  var params='?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=created_at.desc';
  if(APP.statusFilter)params+='&status=eq.'+APP.statusFilter;
  if(APP.search)params+='&or=(code.ilike.*'+APP.search+'*,name.ilike.*'+APP.search+'*)';

  Promise.all([
    sbGet('deliverables',params),
    sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&select=status'),
    sbGet('production_units','?select=deliverable_id,planned_qty,consumed_qty').catch(function(){return[];})
  ]).then(function(res){
    var items=res[0];var allSt=res[1];var prod=res[2];
    var total=allSt.length;
    var completed=allSt.filter(function(d){return d.status==='approved'||d.status==='issued';}).length;
    var inprog=allSt.filter(function(d){return d.status==='in_progress';}).length;
    var pending=allSt.filter(function(d){return d.status==='pending';}).length;

    document.getElementById('kpi-area').innerHTML=
      kpiCard('Total','var(--brand-light)','var(--brand)',total,'registrados')+
      kpiCard('Completados','var(--green-light)','var(--green)',completed,(total?Math.round(completed/total*100):0)+'%')+
      kpiCard('En proceso','var(--brand-light)','var(--brand)',inprog,'en progreso')+
      kpiCard('Pendientes','#f1f5f9','var(--slate)',pending,'sin iniciar');

    var prodMap={};
    prod.forEach(function(p){if(!prodMap[p.deliverable_id])prodMap[p.deliverable_id]={plan:0,cons:0};prodMap[p.deliverable_id].plan+=Number(p.planned_qty);prodMap[p.deliverable_id].cons+=Number(p.consumed_qty);});
    var userMap={};APP.users.forEach(function(u){userMap[u.id]=u;});
    var canEdit=can('can_edit_deliverables');var canDel=can('can_delete_deliverables');var canStatus=can('can_change_status');

    if(items.length===0){
      document.getElementById('del-table').innerHTML='<div class="card"><div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div><div class="empty-title">Sin entregables</div><div class="empty-desc">Crea el primero con el boton + Nuevo entregable.</div></div></div>';
      return;
    }

    // MIDP phase view
    var html='<div style="overflow-x:auto;border-radius:var(--rl);border:1px solid var(--border);background:var(--surface)">'+
      '<table class="tbl" style="min-width:1400px">'+
      '<thead>'+
      '<tr>'+
      '<th rowspan="2" style="min-width:180px">Codigo</th>'+
      '<th rowspan="2" style="min-width:220px">Nombre / Descripcion</th>'+
      '<th rowspan="2">Estado</th>'+
      '<th rowspan="2">Formato</th>'+
      '<th rowspan="2">Modelo BIM</th>'+
      PHASES.map(function(ph){return '<th colspan="4" style="text-align:center;background:'+ph.color+'18;color:'+ph.color+';border-left:2px solid '+ph.color+'40">'+ph.label+(ph.sub?' · '+ph.sub:'')+'</th>';}).join('')+
      (canEdit||canDel?'<th rowspan="2" style="text-align:right">Acc.</th>':'')+
      '</tr>'+
      '<tr>'+
      PHASES.map(function(ph){
        return ['LOD','LOI','Fecha','Resp.'].map(function(h){
          return '<th style="font-size:9px;background:'+ph.color+'10;border-left:'+(h==='LOD'?'2px solid '+ph.color+'40':'none')+'">'+h+'</th>';
        }).join('');
      }).join('')+
      '</tr>'+
      '</thead><tbody>'+
      items.map(function(d){
        var u=userMap[d.assigned_to];
        var statusCell=canStatus
          ?'<select class="input" style="width:110px;font-size:10px;padding:2px 20px 2px 6px" onchange="changeStatus(\''+d.id+'\',this.value)">'+
            Object.entries(STATUS_CFG).map(function(e){return '<option value="'+e[0]+'"'+(d.status===e[0]?' selected':'')+'>'+e[1].label+'</option>';}).join('')+'</select>'
          :statusBadge(d.status);
        var phaseCells=PHASES.map(function(ph){
          var lod=d[ph.key+'_lod']||'--';
          var loi=d[ph.key+'_loi']||'--';
          var dt=fmtDateShort(d[ph.key+'_delivery_date']);
          var resp=d[ph.key+'_responsible']||'--';
          var bl='border-left:2px solid '+ph.color+'30';
          return '<td style="'+bl+';font-size:10px;font-weight:600;color:'+ph.color+'">'+lod+'</td>'+
            '<td style="font-size:10px;color:var(--text2)">'+loi+'</td>'+
            '<td style="font-size:10px;color:var(--text3)">'+dt+'</td>'+
            '<td style="font-size:10px;color:var(--text3);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+resp+'">'+resp+'</td>';
        }).join('');
        return '<tr>'+
          '<td><span class="code-chip" style="font-size:9px">'+d.code+'</span></td>'+
          '<td><div style="max-width:220px"><div style="font-weight:600;color:var(--text);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+d.name+'</div>'+
          (d.work_package?'<div style="font-size:9px;color:var(--text3)">Pkg: '+d.work_package+'</div>':'')+
          (d.description?'<div style="font-size:9px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+d.description+'</div>':'')+
          '</div></td>'+
          '<td>'+statusCell+'</td>'+
          '<td style="font-size:10px;font-family:\'JetBrains Mono\',monospace;color:var(--text2)">'+(d.file_format||'--')+'<br><span style="color:var(--text3)">'+(d.sheet_size||'')+(d.scale?' · '+d.scale:'')+'</span></td>'+
          '<td style="font-size:10px;color:var(--brand-d);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+(d.bim_model_ref||'')+'">'+
          (d.bim_model_ref?'<span style="background:var(--brand-light);padding:1px 5px;border-radius:3px;border:1px solid var(--brand-border)">'+d.bim_model_ref+'</span>':'<span style="color:var(--text3)">--</span>')+
          '</td>'+
          phaseCells+
          (canEdit||canDel?'<td><div style="display:flex;gap:3px;justify-content:flex-end">'+
            (canEdit?'<button class="btn btn-ghost btn-sm" onclick="openDeliverableModal(\''+d.id+'\')" title="Editar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'')+
            (canDel?'<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDelete(\''+d.id+'\',\''+d.code+'\')" title="Eliminar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>':'')+
            '</div></td>':'')+
          '</tr>';
      }).join('')+
      '</tbody></table>'+
      '<div style="padding:8px 14px;background:var(--bg);font-size:10px;color:var(--text3);border-top:1px solid var(--border2)">'+
      items.length+' entregable(s) · Supabase en tiempo real</div></div>';
    document.getElementById('del-table').innerHTML=html;
  }).catch(function(e){
    document.getElementById('del-table').innerHTML='<div class="card"><div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div></div>';
  });
}

function kpiCard(label,bg,color,val,sub){
  return '<div class="kpi"><div class="kpi-icon" style="background:'+bg+'"><svg viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg></div>'+
    '<div><div class="kpi-label">'+label+'</div><div class="kpi-value" style="color:'+color+'">'+val+'</div><div class="kpi-sub">'+sub+'</div></div></div>';
}

function changeStatus(id,s){
  if(!can('can_change_status')){toast('Sin permiso.','error');return;}
  sbPatch('deliverables','id=eq.'+id,{status:s}).then(function(){toast('Estado actualizado.');}).catch(function(e){toast(e.message,'error');});
}

// ── DELIVERABLE MODAL (formulario completo MIDP) ──
function openDeliverableModal(id){
  if(id&&!can('can_edit_deliverables')){toast('Sin permiso para editar.','error');return;}
  if(!id&&!can('can_create_deliverables')){toast('Sin permiso para crear.','error');return;}
  var getD=id?sbGet('deliverables','?id=eq.'+id+'&limit=1').then(function(r){return r[0];}):Promise.resolve(null);
  getD.then(function(d){
    var fv=d?d.field_values||{}:{};
    var fieldInputs=APP.schemas.sort(function(a,b){return a.code_order-b.code_order;}).map(function(s){
      var val=fv[s.key]||'';
      if(s.field_type==='dropdown'&&s.allowed_values){
        return '<div class="form-group"><label class="label">'+s.name+(s.is_required?' *':'')+'<span class="code-seg" style="margin-left:4px">cod.#'+s.code_order+'</span></label>'+
          '<select class="input schema-field" data-key="'+s.key+'" onchange="updateCodePreview()">'+
          '<option value="">Seleccionar</option>'+
          s.allowed_values.map(function(v){return '<option value="'+v.value+'"'+(val===v.value?' selected':'')+'>'+v.value+' - '+v.label+'</option>';}).join('')+
          '</select></div>';
      }
      return '<div class="form-group"><label class="label">'+s.name+(s.is_required?' *':'')+(s.is_part_of_code?'<span class="code-seg" style="margin-left:4px">cod.#'+s.code_order+'</span>':'')+'</label>'+
        '<input type="text" class="input schema-field" data-key="'+s.key+'" maxlength="'+s.max_length+'" value="'+val+'" oninput="updateCodePreview()"></div>';
    }).join('');
    var usersOpts=APP.users.filter(function(u){return u.is_active;}).map(function(u){return '<option value="'+u.id+'"'+(d&&d.assigned_to===u.id?' selected':'')+'>'+u.full_name+(u.specialty?' ('+u.specialty+')':'')+'</option>';}).join('');
    var phaseBlocks=PHASES.map(function(ph){
      return '<div style="border:1px solid '+ph.color+'30;border-radius:var(--r);padding:14px;background:'+ph.color+'08;margin-bottom:10px">'+
        '<div style="font-size:11px;font-weight:700;color:'+ph.color+';text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">'+ph.label+(ph.sub?' — '+ph.sub:'')+'</div>'+
        '<div class="form-grid">'+
        '<div class="form-group full"><label class="label">Parte responsable</label>'+
        '<input type="text" class="input" id="'+ph.key+'_responsible" value="'+(d&&d[ph.key+'_responsible']||'')+'" placeholder="Nombre del responsable"></div>'+
        '<div class="form-group"><label class="label">LOD</label>'+
        '<select class="input" id="'+ph.key+'_lod"><option value="">--</option>'+selOpts(LOD_VALUES,d&&d[ph.key+'_lod']||'')+'</select></div>'+
        '<div class="form-group"><label class="label">LOI</label>'+
        '<select class="input" id="'+ph.key+'_loi"><option value="">--</option>'+selOpts(LOI_VALUES,d&&d[ph.key+'_loi']||'')+'</select></div>'+
        '<div class="form-group"><label class="label">Tiempo de produccion</label>'+
        '<input type="text" class="input" id="'+ph.key+'_prod_time" value="'+(d&&d[ph.key+'_prod_time']||'')+'" placeholder="Ej: 15 dias"></div>'+
        '<div class="form-group"><label class="label">Fecha de entrega</label>'+
        '<input type="date" class="input" id="'+ph.key+'_delivery_date" value="'+(d&&d[ph.key+'_delivery_date']||'')+'"></div>'+
        '<div class="form-group full"><label class="label">Documentacion asociada</label>'+
        '<input type="text" class="input" id="'+ph.key+'_doc_assoc" value="'+(d&&d[ph.key+'_doc_assoc']||'')+'" placeholder="Documentos relacionados"></div>'+
        '</div></div>';
    }).join('');

    document.getElementById('modal-container').innerHTML=
      '<div class="modal-overlay" id="del-modal">'+
      '<div class="modal modal-lg" style="max-width:820px">'+
      '<div class="modal-header">'+
      '<div class="modal-title">'+(d?'Editar: '+d.code:'Nuevo entregable MIDP')+'</div>'+
      '<button class="btn btn-ghost btn-sm" onclick="closeModal(\'del-modal\')">X</button></div>'+
      '<div class="modal-body">'+

      // Code preview
      '<div class="code-preview">'+
      '<div class="cp-label"><span>Codigo del contenedor de informacion</span><span id="code-status"></span></div>'+
      '<div class="cp-code" id="code-preview-val">'+(d?d.code:'Complete los campos de codigo...')+'</div></div>'+

      // Seccion 1: Campos de codigo
      '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">1. Campos de codificacion</div>'+
      '<div class="form-grid" style="margin-bottom:18px">'+fieldInputs+'</div>'+

      // Seccion 2: Info general
      '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">2. Informacion del contenedor</div>'+
      '<div class="form-grid" style="margin-bottom:18px">'+
      '<div class="form-group full"><label class="label">Titulo del contenedor *</label>'+
      '<input type="text" class="input" id="del-name" value="'+(d?d.name:'')+'" placeholder="Ej: Plano de Arquitectura - Planta General"></div>'+
      '<div class="form-group full"><label class="label">Descripcion del contenedor</label>'+
      '<textarea class="input" id="del-desc" rows="2">'+(d?d.description||'':'')+'</textarea></div>'+
      '<div class="form-group"><label class="label">Paquete de trabajo</label>'+
      '<input type="text" class="input" id="del-workpkg" value="'+(d?d.work_package||'':'')+'" placeholder="Ej: Paquete Arquitectura"></div>'+
      '<div class="form-group"><label class="label">Formato / Extension</label>'+
      '<select class="input" id="del-format"><option value="">Sin formato</option>'+selOpts(FILE_FORMATS,d?d.file_format||'':'')+'</select></div>'+
      '<div class="form-group"><label class="label">Tamano de lamina</label>'+
      '<select class="input" id="del-sheetsize"><option value="">--</option>'+selOpts(SHEET_SIZES,d?d.sheet_size||'':'')+'</select></div>'+
      '<div class="form-group"><label class="label">Escala</label>'+
      '<select class="input" id="del-scale"><option value="">--</option>'+selOpts(SCALES,d?d.scale||'':'')+'</select></div>'+
      '<div class="form-group"><label class="label">Estado</label>'+
      '<select class="input" id="del-status">'+
      Object.entries(STATUS_CFG).map(function(e){return '<option value="'+e[0]+'"'+(d&&d.status===e[0]?' selected':'')+'>'+e[1].label+'</option>';}).join('')+
      '</select></div>'+
      '<div class="form-group"><label class="label">Responsable general</label>'+
      '<select class="input" id="del-assigned"><option value="">Sin asignar</option>'+usersOpts+'</select></div>'+
      '<div class="form-group"><label class="label">Predecesores / dependencias</label>'+
      '<input type="text" class="input" id="del-predecessors" value="'+(d?d.predecessors||'':'')+'" placeholder="Ej: 11010-CST-F04-DS-R3-001-01-ES-ETC-00001"></div>'+
      '</div>'+

      // Seccion 3: Modelo BIM
      '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">3. Vinculo con modelo BIM</div>'+
      '<div style="margin-bottom:18px">'+
      '<label class="label">Referencia al modelo BIM</label>'+
      '<input type="text" class="input" id="del-bimref" value="'+(d?d.bim_model_ref||'':'')+'" placeholder="Ej: 11010-CST-F04-DS-R3-001-01-AR-MOD-00001 o ruta ACC/Revizto"></div>'+

      // Seccion 4: Fases MIDP
      '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">4. Informacion por fase</div>'+
      phaseBlocks+

      '</div>'+// end modal-body
      '<div class="modal-footer">'+
      '<button class="btn" onclick="closeModal(\'del-modal\')">Cancelar</button>'+
      '<button class="btn btn-primary" id="del-save-btn" onclick="saveDeliverable(\''+(id||'')+'\')">'+
      (d?'Actualizar entregable':'Crear entregable')+'</button></div></div></div>';

    if(d)updateCodePreview(id);
  });
}

function updateCodePreview(excludeId){
  var fields={};
  document.querySelectorAll('.schema-field').forEach(function(el){fields[el.dataset.key]=el.value;});
  var code=buildCode(fields);
  var preview=document.getElementById('code-preview-val');
  var status=document.getElementById('code-status');
  if(!preview)return;
  if(!code||code.length<4){preview.textContent='Complete los campos...';preview.style.color='var(--text3)';if(status)status.innerHTML='';return;}
  preview.textContent=code;preview.style.color='var(--brand)';
  if(status)status.innerHTML='<span style="color:var(--text3);font-size:10px">Verificando...</span>';
  clearTimeout(window._ct);
  window._ct=setTimeout(function(){
    var q='?project_id=eq.'+APP.project.id+'&code=eq.'+encodeURIComponent(code)+'&is_active=eq.true';
    if(excludeId)q+='&id=neq.'+excludeId;
    sbGet('deliverables',q).then(function(r){
      var dup=r.length>0;
      if(preview)preview.style.color=dup?'var(--red)':'var(--brand)';
      if(status)status.innerHTML=dup?'<span class="cp-dup">Codigo duplicado</span>':'<span class="cp-ok">Disponible</span>';
    }).catch(function(){});
  },600);
}

function saveDeliverable(id){
  var btn=document.getElementById('del-save-btn');
  var fields={};
  document.querySelectorAll('.schema-field').forEach(function(el){fields[el.dataset.key]=el.value;});
  var name=document.getElementById('del-name').value.trim();
  if(!name){toast('El titulo es obligatorio.','error');return;}
  var code=buildCode(fields);
  if(!code){toast('Completa los campos de codigo.','error');return;}
  btn.disabled=true;btn.textContent='Guardando...';

  var dupQ='?project_id=eq.'+APP.project.id+'&code=eq.'+encodeURIComponent(code)+'&is_active=eq.true';
  if(id)dupQ+='&id=neq.'+id;
  sbGet('deliverables',dupQ).then(function(dup){
    if(dup.length>0){toast('Codigo duplicado.','error');btn.disabled=false;btn.textContent=id?'Actualizar':'Crear entregable';return;}

    var payload={
      project_id:APP.project.id,code:code,name:name,
      description:document.getElementById('del-desc').value||null,
      status:document.getElementById('del-status').value,
      assigned_to:document.getElementById('del-assigned').value||null,
      field_values:fields,created_by:APP.user.id,
      work_package:document.getElementById('del-workpkg').value||null,
      file_format:document.getElementById('del-format').value||null,
      sheet_size:document.getElementById('del-sheetsize').value||null,
      scale:document.getElementById('del-scale').value||null,
      bim_model_ref:document.getElementById('del-bimref').value||null,
      predecessors:document.getElementById('del-predecessors').value||null,
    };
    // Phase fields
    PHASES.forEach(function(ph){
      payload[ph.key+'_responsible']=document.getElementById(ph.key+'_responsible').value||null;
      payload[ph.key+'_lod']=document.getElementById(ph.key+'_lod').value||null;
      payload[ph.key+'_loi']=document.getElementById(ph.key+'_loi').value||null;
      payload[ph.key+'_prod_time']=document.getElementById(ph.key+'_prod_time').value||null;
      payload[ph.key+'_delivery_date']=document.getElementById(ph.key+'_delivery_date').value||null;
      payload[ph.key+'_doc_assoc']=document.getElementById(ph.key+'_doc_assoc').value||null;
    });

    var p=id
      ?sbGet('deliverables','?id=eq.'+id+'&select=version').then(function(r){payload.version=((r[0]?r[0].version:1)||1)+1;return sbPatch('deliverables','id=eq.'+id,payload);})
      :sbPost('deliverables',payload);
    return p.then(function(){
      toast(id?'Entregable actualizado.':'Entregable creado.');
      closeModal('del-modal');loadDeliverables();
    });
  }).catch(function(e){toast(e.message,'error');btn.disabled=false;btn.textContent=id?'Actualizar':'Crear entregable';});
}

function confirmDelete(id,code){
  document.getElementById('modal-container').innerHTML=
    '<div class="modal-overlay" id="confirm-modal"><div class="modal" style="max-width:400px">'+
    '<div class="modal-header"><div class="modal-title">Eliminar entregable?</div><button class="btn btn-ghost btn-sm" onclick="closeModal(\'confirm-modal\')">X</button></div>'+
    '<div class="modal-body"><p style="color:var(--text2);margin-bottom:10px">Se eliminara:</p>'+
    '<div style="background:var(--bg);padding:10px;border-radius:var(--r);border:1px solid var(--border)"><span class="code-chip">'+code+'</span></div>'+
    '<p style="color:var(--red);font-size:12px;margin-top:10px">Esta accion es permanente.</p></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'confirm-modal\')">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="deleteDeliverable(\''+id+'\')">Eliminar</button></div></div></div>';
}
function deleteDeliverable(id){
  sbPatch('deliverables','id=eq.'+id,{is_active:false}).then(function(){closeModal('confirm-modal');toast('Eliminado.');loadDeliverables();}).catch(function(e){toast(e.message,'error');});
}

// ── EXPORTS ───────────────────────────────────────
function exportCSV(){
  sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc').then(function(items){
    var headers=['Codigo','Nombre','Estado','Formato','Escala','Modelo BIM','Paquete',
      'RIBA3 LOD','RIBA3 LOI','RIBA3 Fecha','RIBA4 LOD','RIBA4 LOI','RIBA4 Fecha',
      'Const LOD','Const LOI','Const Fecha','PM LOD','PM LOI','PM Fecha'];
    var rows=items.map(function(d){return [
      d.code,'"'+d.name+'"',d.status,d.file_format||'',d.scale||'',d.bim_model_ref||'',d.work_package||'',
      d.riba3_lod||'',d.riba3_loi||'',d.riba3_delivery_date||'',
      d.riba4_lod||'',d.riba4_loi||'',d.riba4_delivery_date||'',
      d.const_lod||'',d.const_loi||'',d.const_delivery_date||'',
      d.pm_lod||'',d.pm_loi||'',d.pm_delivery_date||''
    ];});
    var csv='\uFEFF'+[headers].concat(rows).map(function(r){return r.join(',');}).join('\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='MIDP_'+APP.project.code+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    toast('CSV exportado.');
  }).catch(function(e){toast(e.message,'error');});
}

function exportMIDP(){
  toast('Preparando exportacion MIDP...');
  sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc').then(function(items){
    // Build MIDP-format CSV matching the Excel template structure
    var headers=[
      'N° Referencia','Titulo del Contenedor','Descripcion','Paquete de Trabajo',
      'Formato','Tamano Lamina','Escala','Modelo BIM Ref','Predecesores',
      'Codigo Proyecto','Originador','Fase Programa','Area Funcional','Fase Proyecto',
      'Volumen','Nivel','Disciplina','Tipo Documento','N Secuencial','Codigo Completo','Estado',
      'RIBA3 - Responsable','RIBA3 - LOD','RIBA3 - LOI','RIBA3 - Doc Asoc','RIBA3 - T.Produccion','RIBA3 - Fecha Entrega',
      'RIBA4 - Responsable','RIBA4 - LOD','RIBA4 - LOI','RIBA4 - Doc Asoc','RIBA4 - T.Produccion','RIBA4 - Fecha Entrega',
      'CONST - Responsable','CONST - LOD','CONST - LOI','CONST - Doc Asoc','CONST - T.Produccion','CONST - Fecha Entrega',
      'PM - Responsable','PM - LOD','PM - LOI','PM - Doc Asoc','PM - T.Produccion','PM - Fecha Entrega'
    ];
    var rows=items.map(function(d,i){
      var fv=d.field_values||{};
      return [
        i+1,'"'+(d.name||'')+'"','"'+(d.description||'')+'"',d.work_package||'',
        d.file_format||'',d.sheet_size||'',d.scale||'',d.bim_model_ref||'',d.predecessors||'',
        fv.proyecto||'',fv.originador||'',fv.fase_programa||'',fv.area_funcional||'',
        fv.fase_proyecto||'',fv.volumen||'',fv.nivel||'',fv.disciplina||'',
        fv.tipo_documento||'',fv.secuencial||'',d.code,d.status,
        d.riba3_responsible||'',d.riba3_lod||'',d.riba3_loi||'',d.riba3_doc_assoc||'',d.riba3_prod_time||'',d.riba3_delivery_date||'',
        d.riba4_responsible||'',d.riba4_lod||'',d.riba4_loi||'',d.riba4_doc_assoc||'',d.riba4_prod_time||'',d.riba4_delivery_date||'',
        d.const_responsible||'',d.const_lod||'',d.const_loi||'',d.const_doc_assoc||'',d.const_prod_time||'',d.const_delivery_date||'',
        d.pm_responsible||'',d.pm_lod||'',d.pm_loi||'',d.pm_doc_assoc||'',d.pm_prod_time||'',d.pm_delivery_date||''
      ];
    });
    var csv='\uFEFF'+[headers].concat(rows).map(function(r){return r.join(',');}).join('\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='MIDP_Completo_'+APP.project.code+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    toast('MIDP exportado correctamente.');
  }).catch(function(e){toast(e.message,'error');});
}

// ── PROGRESS ──────────────────────────────────────
function renderProgress(){
  document.getElementById('topbar-actions').innerHTML='';
  document.getElementById('content').innerHTML='<div class="page-header"><div><h1 class="page-title">Control de avance</h1><p class="page-sub">Unidades productivas en Supabase</p></div></div>'+loading();
  Promise.all([
    sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc'),
    sbGet('production_units','?select=*').catch(function(){return[];})
  ]).then(function(res){
    var deliverables=res[0];var prod=res[1];
    var prodMap={};
    prod.forEach(function(p){if(!prodMap[p.deliverable_id])prodMap[p.deliverable_id]={plan:0,cons:0};prodMap[p.deliverable_id].plan+=Number(p.planned_qty);prodMap[p.deliverable_id].cons+=Number(p.consumed_qty);});
    var totalPlan=0,totalCons=0;
    deliverables.forEach(function(d){var p=prodMap[d.id]||{plan:0,cons:0};totalPlan+=p.plan;totalCons+=p.cons;});
    var pctGen=totalPlan>0?Math.round(totalCons/totalPlan*100):0;
    var ratio=totalPlan>0?(totalCons/totalPlan).toFixed(2):'--';
    var byDisc={};
    deliverables.forEach(function(d){
      var disc=(d.field_values&&d.field_values.disciplina)||'--';
      if(!byDisc[disc])byDisc[disc]={plan:0,cons:0};
      var p=prodMap[d.id]||{plan:0,cons:0};byDisc[disc].plan+=p.plan;byDisc[disc].cons+=p.cons;
    });
    var canProg=can('can_register_progress');
    document.getElementById('content').innerHTML=
      '<div class="page-header"><div><h1 class="page-title">Control de avance</h1><p class="page-sub">'+APP.project.name+'</p></div></div>'+
      '<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">'+
      kpiCard('Planificadas','var(--brand-light)','var(--brand)',totalPlan,'unidades')+
      kpiCard('Consumidas','var(--green-light)','var(--green)',totalCons,pctGen+'% avance')+
      '<div class="kpi"><div class="kpi-icon" style="background:var(--amber-light)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" width="18" height="18"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg></div>'+
      '<div><div class="kpi-label">Ratio</div><div class="kpi-value" style="color:var(--amber)">'+ratio+'</div></div></div></div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">'+
      '<div class="card" style="padding:18px"><div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">Avance por disciplina</div>'+
      Object.entries(byDisc).map(function(e){var pct=e[1].plan>0?Math.round(e[1].cons/e[1].plan*100):0;return '<div class="prog-row"><div class="prog-label">'+e[0]+'</div><div class="prog-bar-wrap"><div class="prog-track"><div class="prog-fill" style="width:'+pct+'%;background:'+progColor(pct)+'"></div></div></div><div class="prog-pct">'+pct+'%</div></div>';}).join('')||'<p style="color:var(--text3);font-size:12px">Sin datos.</p>'+
      '</div>'+
      '<div class="card" style="padding:18px"><div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">Por estado</div>'+
      Object.entries(STATUS_CFG).map(function(e){var cnt=deliverables.filter(function(d){return d.status===e[0];}).length;var pct=deliverables.length?Math.round(cnt/deliverables.length*100):0;var colors={approved:'var(--green)',issued:'var(--violet)',in_progress:'var(--brand)',for_review:'var(--amber)',pending:'var(--slate)',rejected:'var(--red)'};return '<div class="stat-bar-row"><div class="stat-bar-label">'+e[1].label+'</div><div class="stat-bar-track"><div class="stat-bar-fill" style="width:'+pct+'%;background:'+colors[e[0]]+'"></div></div><div class="stat-bar-count">'+cnt+'</div></div>';}).join('')+
      '</div></div>'+
      '<div class="card" style="overflow:hidden"><table class="tbl"><thead><tr>'+
      '<th>Entregable</th><th>Disciplina</th><th>Planif.</th><th>Consumido</th><th>Avance</th><th>Estado</th>'+
      (canProg?'<th>Registrar</th>':'')+
      '</tr></thead><tbody>'+
      deliverables.map(function(d){var p=prodMap[d.id]||{plan:0,cons:0};var pct=p.plan>0?Math.round(p.cons/p.plan*100):0;
        return '<tr><td><span class="code-chip" style="font-size:9px">'+d.code+'</span><div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">'+d.name+'</div></td>'+
          '<td><span class="badge b-progress" style="font-size:10px">'+((d.field_values&&d.field_values.disciplina)||'--')+'</span></td>'+
          '<td style="font-weight:600">'+p.plan+'</td><td style="font-weight:600;color:'+progColor(pct)+'">'+p.cons+'</td>'+
          '<td><div style="display:flex;align-items:center;gap:6px"><div class="prog-track" style="width:60px"><div class="prog-fill" style="width:'+pct+'%;background:'+progColor(pct)+'"></div></div><span style="font-size:10px;color:var(--text3)">'+pct+'%</span></div></td>'+
          '<td>'+statusBadge(d.status)+'</td>'+
          (canProg?'<td style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="openProgressModal(\''+d.id+'\',\''+d.code+'\','+p.plan+','+p.cons+')">Registrar</button></td>':'')+
          '</tr>';}).join('')+
      '</tbody></table></div>';
  }).catch(function(e){document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';});
}

function openProgressModal(delId,code,plan,cons){
  if(!can('can_register_progress')){toast('Sin permiso.','error');return;}
  document.getElementById('modal-container').innerHTML=
    '<div class="modal-overlay" id="prog-modal"><div class="modal" style="max-width:420px">'+
    '<div class="modal-header"><div class="modal-title">Registrar avance</div><button class="btn btn-ghost btn-sm" onclick="closeModal(\'prog-modal\')">X</button></div>'+
    '<div class="modal-body"><div style="background:var(--bg);border-radius:var(--r);padding:10px;margin-bottom:14px;border:1px solid var(--border)"><span class="code-chip" style="font-size:9px">'+code+'</span></div>'+
    '<div class="form-grid"><div class="form-group"><label class="label">Unidades planificadas</label><input type="number" class="input" id="prog-plan" value="'+plan+'" min="0"></div>'+
    '<div class="form-group"><label class="label">Unidades consumidas</label><input type="number" class="input" id="prog-cons" value="'+cons+'" min="0"></div></div></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'prog-modal\')">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="saveProgress(\''+delId+'\')">Guardar</button></div></div></div>';
}
function saveProgress(delId){
  var plan=parseInt(document.getElementById('prog-plan').value)||0;
  var cons=parseInt(document.getElementById('prog-cons').value)||0;
  if(cons>plan){toast('Consumidas no puede superar planificadas.','error');return;}
  sbGet('production_units','?deliverable_id=eq.'+delId+'&limit=1').then(function(ex){
    return ex.length?sbPatch('production_units','deliverable_id=eq.'+delId,{planned_qty:plan,consumed_qty:cons}):sbPost('production_units',{deliverable_id:delId,planned_qty:plan,consumed_qty:cons,unit_label:'und'});
  }).then(function(){closeModal('prog-modal');toast('Avance guardado.');renderProgress();}).catch(function(e){toast(e.message,'error');});
}

// ── SCHEMAS ───────────────────────────────────────
function renderSchemas(){
  if(APP.user&&APP.user.role!=='admin'){document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Acceso restringido</div></div>';return;}
  document.getElementById('topbar-actions').innerHTML='<button class="btn btn-primary btn-sm" onclick="openSchemaModal()">+ Nuevo campo</button>';
  document.getElementById('content').innerHTML=loading();
  sbGet('field_schemas','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code_order.asc').then(function(schemas){
    APP.schemas=schemas;
    var codeEx=buildCode({proyecto:'11010',originador:'CST',fase_programa:'F04',area_funcional:'DS',fase_proyecto:'R3',volumen:'001',nivel:'01',disciplina:'ES',tipo_documento:'ETC',secuencial:'00001'});
    document.getElementById('content').innerHTML=
      '<div class="page-header"><div><h1 class="page-title">Configuracion de campos</h1><p class="page-sub">Estructura de codificacion UKHA · '+schemas.length+' campos activos</p></div></div>'+
      '<div class="card" style="padding:14px 16px;margin-bottom:16px;background:var(--brand-light);border-color:var(--brand-border)">'+
      '<div style="font-size:9px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Ejemplo de codigo resultante</div>'+
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:18px;font-weight:600;color:var(--brand)">'+codeEx+'</div></div>'+
      '<div>'+schemas.map(function(s){
        return '<div class="schema-item">'+
          '<div class="schema-order">'+(s.is_part_of_code?s.code_order:'--')+'</div>'+
          '<div class="schema-info"><div class="schema-name">'+s.name+'</div>'+
          '<div class="schema-meta"><span class="schema-key">.'+s.key+'</span>'+
          '<span class="schema-type-badge">'+(s.field_type==='dropdown'?'lista':s.field_type)+'</span>'+
          (s.is_required?'<span style="font-size:9px;color:var(--red);font-weight:600">oblig.</span>':'')+
          (s.is_part_of_code?'<span class="code-seg">cod.#'+s.code_order+(s.separator?' + "'+s.separator+'"':'')+'</span>':'')+
          '<span style="font-size:9px;color:var(--text3)">max.'+s.max_length+'</span></div>'+
          (s.allowed_values?'<div class="schema-vals">'+s.allowed_values.map(function(v){return '<span class="val-pill">'+v.value+'</span>';}).join('')+'</div>':'')+
          '</div>'+
          '<div style="display:flex;gap:4px">'+
          '<button class="btn btn-ghost btn-sm" onclick="openSchemaModal(\''+s.id+'\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
          '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDeleteSchema(\''+s.id+'\',\''+s.name+'\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>'+
          '</div></div>';
      }).join('')+'</div>';
  }).catch(function(e){document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';});
}

function openSchemaModal(id){
  var s=id?APP.schemas.find(function(x){return x.id===id;}):null;
  document.getElementById('modal-container').innerHTML=
    '<div class="modal-overlay" id="sch-modal"><div class="modal">'+
    '<div class="modal-header"><div class="modal-title">'+(s?'Editar: '+s.name:'Nuevo campo')+'</div><button class="btn btn-ghost btn-sm" onclick="closeModal(\'sch-modal\')">X</button></div>'+
    '<div class="modal-body"><div class="form-grid">'+
    '<div class="form-group full"><label class="label">Nombre *</label><input type="text" class="input" id="sch-name" value="'+(s?s.name:'')+'" placeholder="Ej: Disciplina"></div>'+
    '<div class="form-group"><label class="label">Tipo *</label><select class="input" id="sch-type" onchange="document.getElementById(\'sch-vals-wrap\').style.display=this.value===\'dropdown\'?\'\':\' none\'">'+
    '<option value="text"'+(s&&s.field_type==='text'?' selected':'')+'>Texto</option>'+
    '<option value="dropdown"'+(s&&s.field_type==='dropdown'?' selected':'')+'>Lista</option>'+
    '<option value="number"'+(s&&s.field_type==='number'?' selected':'')+'>Numero</option>'+
    '<option value="date"'+(s&&s.field_type==='date'?' selected':'')+'>Fecha</option></select></div>'+
    '<div class="form-group"><label class="label">Long. max.</label><input type="number" class="input" id="sch-maxlen" value="'+(s?s.max_length:10)+'" min="1" max="50"></div>'+
    '<div class="form-group"><label class="label">Posicion en codigo</label><input type="number" class="input" id="sch-order" value="'+(s?s.code_order:APP.schemas.length+1)+'" min="1" max="20"></div>'+
    '<div class="form-group"><label class="label">Separador</label><input type="text" class="input" id="sch-sep" value="'+(s?s.separator||'':'-')+'" maxlength="5"></div>'+
    '<div class="form-group" style="flex-direction:row;align-items:center;gap:16px;padding-top:20px">'+
    '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px"><input type="checkbox" id="sch-req"'+(!s||s.is_required?' checked':'')+'>Obligatorio</label>'+
    '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px"><input type="checkbox" id="sch-code"'+(!s||s.is_part_of_code?' checked':'')+'>En codigo</label></div>'+
    '<div class="form-group full" id="sch-vals-wrap" style="'+(s&&s.field_type==='dropdown'||!s?'':'display:none')+'">'+
    '<label class="label">Valores (VALOR|Etiqueta por linea)</label>'+
    '<textarea class="input" id="sch-vals" rows="5" style="font-family:\'JetBrains Mono\',monospace;font-size:11px">'+
    (s&&s.allowed_values?s.allowed_values.map(function(v){return v.value+'|'+v.label;}).join('\n'):'')+
    '</textarea></div></div></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'sch-modal\')">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="saveSchema(\''+(id||'')+'\')">'+
    (s?'Actualizar':'Crear campo')+'</button></div></div></div>';
}
function saveSchema(id){
  var name=document.getElementById('sch-name').value.trim();
  if(!name){toast('Nombre obligatorio.','error');return;}
  var type=document.getElementById('sch-type').value;
  var valsRaw=document.getElementById('sch-vals').value||'';
  var vals=type==='dropdown'&&valsRaw.trim()?valsRaw.split('\n').filter(Boolean).map(function(l){var p=l.split('|');return{value:p[0].trim(),label:(p.slice(1).join('|')||p[0]).trim();};}):null;
  var key=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  var payload={name:name,key:key,field_type:type,is_required:document.getElementById('sch-req').checked,is_part_of_code:document.getElementById('sch-code').checked,code_order:parseInt(document.getElementById('sch-order').value)||1,separator:document.getElementById('sch-sep').value,max_length:parseInt(document.getElementById('sch-maxlen').value)||10,allowed_values:vals,project_id:APP.project.id};
  var p=id?sbPatch('field_schemas','id=eq.'+id,payload):sbPost('field_schemas',payload);
  p.then(function(){toast(id?'Campo actualizado.':'Campo creado.');closeModal('sch-modal');renderSchemas();}).catch(function(e){toast(e.message,'error');});
}
function confirmDeleteSchema(id,name){
  document.getElementById('modal-container').innerHTML=
    '<div class="modal-overlay" id="sch-confirm"><div class="modal" style="max-width:380px">'+
    '<div class="modal-header"><div class="modal-title">Eliminar campo?</div><button class="btn btn-ghost btn-sm" onclick="closeModal(\'sch-confirm\')">X</button></div>'+
    '<div class="modal-body"><p style="font-size:13px;color:var(--text2)">Eliminar el campo <strong>'+name+'</strong>?</p></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'sch-confirm\')">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="deleteSchema(\''+id+'\')">Eliminar</button></div></div></div>';
}
function deleteSchema(id){
  sbPatch('field_schemas','id=eq.'+id,{is_active:false}).then(function(){closeModal('sch-confirm');toast('Campo eliminado.');renderSchemas();}).catch(function(e){toast(e.message,'error');});
}

// ── USERS ─────────────────────────────────────────
function renderUsers(){
  var isAdmin=APP.user&&APP.user.role==='admin';
  document.getElementById('topbar-actions').innerHTML=isAdmin?'<button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Nuevo usuario</button>':'';
  document.getElementById('content').innerHTML=loading();
  sbGet('users','?select=*&order=full_name.asc').then(function(users){
    APP.users=users;
    document.getElementById('content').innerHTML=
      '<div class="page-header"><div><h1 class="page-title">Usuarios y permisos</h1><p class="page-sub">'+users.length+' usuarios registrados</p></div>'+
      (isAdmin?'<button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Nuevo usuario</button>':'')+
      '</div>'+
      users.map(function(u){
        var perms=u.permissions||DEFAULT_PERMS;
        var isAdminUser=u.role==='admin';
        return '<div class="perm-card">'+
          '<div class="perm-card-header">'+
          '<div class="perm-avatar">'+initials(u.full_name)+'</div>'+
          '<div class="perm-user-info"><div class="perm-name">'+u.full_name+'</div><div class="perm-email">'+u.email+' · '+(u.specialty||u.role)+'</div></div>'+
          '<div style="display:flex;align-items:center;gap:8px;margin-left:auto">'+
          roleBadge(u.role)+
          (u.is_active?'<span class="badge b-approved" style="font-size:9px">Activo</span>':'<span class="badge b-rejected" style="font-size:9px">Inactivo</span>')+
          (isAdmin?'<button class="btn btn-ghost btn-sm" onclick="openUserModal(\''+u.id+'\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'')+
          '</div></div>'+
          '<div class="perm-body">'+
          PERM_CONFIG.map(function(p){
            var isActive=isAdminUser?true:!!perms[p.key];
            return '<div class="perm-item"><div class="perm-item-label">'+p.label+'</div>'+
              (isAdminUser?'<span style="font-size:10px;color:var(--green);font-weight:600">Siempre</span>':
              (isAdmin?'<label class="toggle"><input type="checkbox"'+(isActive?' checked':'')+' onchange="togglePerm(\''+u.id+'\',\''+p.key+'\',this.checked)"><span class="toggle-slider"></span></label>':
              '<span style="font-size:10px;font-weight:600;color:'+(isActive?'var(--green)':'var(--text3)')+'">'+( isActive?'Si':'No')+'</span>'
              ))+'</div>';
          }).join('')+
          '</div></div>';
      }).join('');
  }).catch(function(e){document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';});
}

function togglePerm(userId,permKey,value){
  var user=APP.users.find(function(u){return u.id===userId;});
  var cp=Object.assign({},DEFAULT_PERMS,user?user.permissions:{});
  cp[permKey]=value;
  sbPatch('users','id=eq.'+userId,{permissions:cp}).then(function(){
    var idx=APP.users.findIndex(function(u){return u.id===userId;});
    if(idx>=0)APP.users[idx].permissions=cp;
    if(userId===APP.user.id)APP.user.permissions=cp;
    toast('Permiso '+(value?'activado':'desactivado')+'.');
  }).catch(function(e){toast(e.message,'error');});
}

function openUserModal(id){
  var u=id?APP.users.find(function(x){return x.id===id;}):null;
  document.getElementById('modal-container').innerHTML=
    '<div class="modal-overlay" id="user-modal"><div class="modal">'+
    '<div class="modal-header"><div class="modal-title">'+(u?'Editar: '+u.full_name:'Nuevo usuario')+'</div><button class="btn btn-ghost btn-sm" onclick="closeModal(\'user-modal\')">X</button></div>'+
    '<div class="modal-body"><div class="form-grid">'+
    '<div class="form-group full"><label class="label">Nombre completo *</label><input type="text" class="input" id="u-name" value="'+(u?u.full_name:'')+'" placeholder="Juan Perez Lopez"></div>'+
    '<div class="form-group full"><label class="label">Correo electronico *</label><input type="email" class="input" id="u-email" value="'+(u?u.email:'')+'" placeholder="juan@empresa.com"'+(u?' disabled':'')+' autocomplete="off"></div>'+
    (!u?'<div class="form-group full"><label class="label">Contrasena temporal *</label><input type="password" class="input" id="u-pass" placeholder="Minimo 8 caracteres" autocomplete="new-password"></div>':'')+
    '<div class="form-group"><label class="label">Rol</label><select class="input" id="u-role">'+
    '<option value="specialist"'+(u&&u.role==='specialist'?' selected':'')+'>Especialista</option>'+
    '<option value="bim_manager"'+(u&&u.role==='bim_manager'?' selected':'')+'>BIM Manager</option>'+
    '<option value="admin"'+(u&&u.role==='admin'?' selected':'')+'>Administrador</option></select></div>'+
    '<div class="form-group"><label class="label">Especialidad</label><input type="text" class="input" id="u-spec" value="'+(u?u.specialty||'':'')+'" placeholder="Arquitectura, MEP..."></div>'+
    '<div class="form-group"><label class="label">Empresa</label><input type="text" class="input" id="u-comp" value="'+(u?u.company||'':'')+'" placeholder="Consorcio SDD"></div>'+
    '<div class="form-group"><label class="label">Telefono</label><input type="text" class="input" id="u-phone" value="'+(u?u.phone||'':'')+'" placeholder="+51 999 000 000"></div>'+
    '</div></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'user-modal\')">Cancelar</button>'+
    '<button class="btn btn-primary" id="u-save-btn" onclick="saveUser(\''+(id||'')+'\')">'+
    (u?'Actualizar usuario':'Crear usuario')+'</button></div></div></div>';
}
function saveUser(id){
  var btn=document.getElementById('u-save-btn');
  var name=document.getElementById('u-name').value.trim();
  if(!name){toast('Nombre obligatorio.','error');return;}
  btn.disabled=true;btn.textContent='Guardando...';
  var payload={full_name:name,role:document.getElementById('u-role').value,specialty:document.getElementById('u-spec').value||null,company:document.getElementById('u-comp').value||null,phone:document.getElementById('u-phone').value||null};
  var p=id?sbPatch('users','id=eq.'+id,payload):sbRpc('hash_password',{input_password:document.getElementById('u-pass').value}).then(function(hash){
    var email=document.getElementById('u-email').value.trim();
    if(!email||!hash){toast('Correo y contrasena obligatorios.','error');throw new Error('missing');}
    return sbPost('users',Object.assign({},payload,{email:email,password_hash:hash,is_active:true,permissions:Object.assign({},DEFAULT_PERMS)}));
  });
  p.then(function(){toast(id?'Usuario actualizado.':'Usuario creado.');closeModal('user-modal');renderUsers();}).catch(function(e){if(e.message!=='missing')toast(e.message,'error');btn.disabled=false;btn.textContent=id?'Actualizar':'Crear usuario';});
}
