// MIDP BIM Platform - app.js v3.0 — Campos completamente configurables
var SUPA_URL='https://rrzlwvqlzhmzyrramjcw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyemx3dnFsemhtenlycmFtamN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODIyMzYsImV4cCI6MjA5MDE1ODIzNn0.IeZlvcT1GaqQybZRbxyjgoEFfJ6Z6BVxbZRgLPzi2Fw';
var H={'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Prefer':'return=representation'};
function sbGet(t,p){return fetch(SUPA_URL+'/rest/v1/'+t+(p||''),{headers:H}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPost(t,b){return fetch(SUPA_URL+'/rest/v1/'+t,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPatch(t,f,b){return fetch(SUPA_URL+'/rest/v1/'+t+'?'+f,{method:'PATCH',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbRpc(fn,b){return fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}

var APP={user:null,project:null,schemas:[],users:[],search:'',statusFilter:'',fieldFilters:{}};
var DEFAULT_PERMS={can_create_deliverables:false,can_edit_deliverables:false,can_delete_deliverables:false,can_change_status:false,can_register_progress:false};
function can(a){if(!APP.user)return false;if(APP.user.role==='admin')return true;return !!(APP.user.permissions||DEFAULT_PERMS)[a];}

// Grupos de fases RIBA — fijos, siempre los mismos 3
var PHASE_GROUPS=[
  {key:'riba2',label:'RIBA 2',sub:'Presentacion 0',color:'#06b6d4'},
  {key:'riba3',label:'RIBA 3',sub:'Presentacion 1',color:'#3b82f6'},
  {key:'riba4',label:'RIBA 4',sub:'Presentacion 2',color:'#8b5cf6'}
];

var PERM_CONFIG=[
  {key:'can_create_deliverables',label:'Crear entregables'},
  {key:'can_edit_deliverables',label:'Editar entregables'},
  {key:'can_delete_deliverables',label:'Eliminar entregables'},
  {key:'can_change_status',label:'Cambiar estado'},
  {key:'can_register_progress',label:'Registrar avance'}
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
var FILTER_FIELDS=['originador','area_funcional','fase_proyecto','volumen','nivel','disciplina','tipo_documento'];

// ── HELPERS ──
function statusBadge(s){var c=STATUS_CFG[s]||STATUS_CFG.pending;return '<span class="badge '+c.cls+'">'+c.label+'</span>';}
function statusLabel(s){return (STATUS_CFG[s]||STATUS_CFG.pending).label;}
function roleBadge(r){var c=ROLE_CFG[r]||ROLE_CFG.specialist;return '<span class="badge '+c.cls+'">'+c.label+'</span>';}
function fmtDateShort(d){return d?new Date(d).toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'2-digit'}):'--';}
function progColor(p){return p>=80?'var(--green)':p>=50?'var(--brand)':'var(--amber)';}
function initials(n){return(n||'?').split(' ').slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();}
function loading(){return '<div class="loading"><div class="spinner"></div>Cargando desde Supabase...</div>';}
function toast(msg,type){var t=document.getElementById('toast');t.textContent=msg;t.className='toast '+(type||'success')+' show';setTimeout(function(){t.className='toast';},3500);}
function closeModal(id){var el=document.getElementById(id);if(el)el.remove();}
function kpiCard(label,bg,color,val,sub){return '<div class="kpi"><div class="kpi-icon" style="background:'+bg+'"><svg viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg></div><div><div class="kpi-label">'+label+'</div><div class="kpi-value" style="color:'+color+'">'+val+'</div><div class="kpi-sub">'+sub+'</div></div></div>';}
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.getElementById('modal-container').innerHTML='';});

// Helpers para schemas por grupo
function codeSchemas(){return APP.schemas.filter(function(s){return s.field_group==='code'&&s.is_active;}).sort(function(a,b){return a.code_order-b.code_order;});}
function generalSchemas(){return APP.schemas.filter(function(s){return s.field_group==='general'&&s.is_active;}).sort(function(a,b){return a.field_order-b.field_order;});}
function phaseSchemas(ph){return APP.schemas.filter(function(s){return s.field_group===ph&&s.is_active;}).sort(function(a,b){return a.field_order-b.field_order;});}
function visibleGeneralSchemas(){return generalSchemas().filter(function(s){return s.is_visible;});}
function visiblePhaseSchemas(ph){return phaseSchemas(ph).filter(function(s){return s.is_visible;});}

function buildCode(fields){
  var parts=codeSchemas();
  var code='';
  for(var i=0;i<parts.length;i++){
    var s=parts[i];var v=fields[s.key];
    if(!v)continue;
    code+=String(v).substring(0,s.max_length);
    if(i<parts.length-1&&s.separator)code+=s.separator;
  }
  return code;
}

// Leer valor de entregable según grupo
function getFieldVal(d,s){
  if(s.field_group==='code')return d.field_values&&d.field_values[s.key]||'';
  if(s.field_group==='general'){
    var map={nombre:'name',descripcion:'description',paquete:'work_package',formato:'file_format',tamano_lamina:'sheet_size',escala:'scale',estado:'status',responsable:'assigned_to',predecesores:'predecessors'};
    var col=map[s.key];
    if(col==='assigned_to'){var u=APP.users.find(function(u){return u.id===d[col];});return u?u.full_name:'';}
    return col?d[col]||'':'';
  }
  // phase field — direct column on deliverable
  return d[s.key]||'';
}

// ── AUTH ──
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
          return loadAppData().then(function(){
            try{localStorage.setItem('midp_session',JSON.stringify({userId:user.id,savedAt:Date.now()}));}catch(e){}
            showApp(user);
          });
        });
    }).catch(function(e){showErr('Error: '+e.message);});
}

function loadAppData(){
  return sbGet('projects','?is_active=eq.true&order=created_at.asc&limit=1')
    .then(function(ps){
      APP.project=ps[0]||null;
      var p2=APP.project?sbGet('field_schemas','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=field_order.asc,code_order.asc'):Promise.resolve([]);
      return Promise.all([p2,sbGet('users','?select=*&order=full_name.asc')]);
    })
    .then(function(r){APP.schemas=r[0];APP.users=r[1];});
}

function showApp(user){
  document.getElementById('login-page').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('sb-avatar').textContent=initials(user.full_name);
  document.getElementById('sb-uname').textContent=user.full_name;
  var rc=ROLE_CFG[user.role]||ROLE_CFG.specialist;
  document.getElementById('sb-role-badge').className='badge '+rc.cls;
  document.getElementById('sb-role-badge').textContent=rc.label;
  if(APP.project){
    document.getElementById('sb-proj-code').textContent=APP.project.code;
    document.getElementById('sb-proj-name').textContent=APP.project.name;
  }
  nav('deliverables',document.querySelector('.sb-item'));
}

function doLogout(){
  APP.user=null;APP.project=null;APP.schemas=[];APP.fieldFilters={};
  try{localStorage.removeItem('midp_session');}catch(e){}
  document.getElementById('app').style.display='none';
  document.getElementById('login-page').style.display='flex';
  document.getElementById('login-email').value='';
  document.getElementById('login-pass').value='';
}

function restoreSession(userId){
  sbGet('users','?id=eq.'+userId+'&is_active=eq.true&select=*')
    .then(function(users){
      if(!users||!users.length){localStorage.removeItem('midp_session');return;}
      APP.user=users[0];
      return loadAppData().then(function(){
        try{localStorage.setItem('midp_session',JSON.stringify({userId:APP.user.id,savedAt:Date.now()}));}catch(e){}
        showApp(APP.user);
      });
    }).catch(function(){localStorage.removeItem('midp_session');});
}

document.addEventListener('DOMContentLoaded',function(){
  var lp=document.getElementById('login-pass');
  if(lp)lp.addEventListener('keydown',function(e){if(e.key==='Enter')handleLogin();});
  try{
    var saved=localStorage.getItem('midp_session');
    if(saved){
      var session=JSON.parse(saved);
      if(session.userId&&(Date.now()-session.savedAt)<8*60*60*1000){
        restoreSession(session.userId);return;
      }else{localStorage.removeItem('midp_session');}
    }
  }catch(e){}
});

// ── NAV ──
var BREAD={deliverables:'Entregables MIDP',progress:'Control de avance',schemas:'Config. de campos',users:'Usuarios y permisos'};
function nav(view,el){
  document.querySelectorAll('.sb-item').forEach(function(i){i.classList.remove('active');});
  if(el)el.classList.add('active');
  document.getElementById('bread-title').textContent=BREAD[view]||view;
  ({deliverables:renderDeliverables,progress:renderProgress,schemas:renderSchemas,users:renderUsers})[view]&&
  ({deliverables:renderDeliverables,progress:renderProgress,schemas:renderSchemas,users:renderUsers})[view]();
}

// ── DELIVERABLES ──
function renderDeliverables(){
  var canCreate=can('can_create_deliverables');
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-sm" onclick="exportCSV()">&#8595; CSV</button>'+
    '<button class="btn btn-sm" onclick="exportMIDP()">&#8595; MIDP</button>'+
    (canCreate?'<button class="btn btn-primary btn-sm" onclick="openDeliverableModal()">+ Nuevo entregable</button>':'');

  // Filtros por campo de codificacion
  var schemaFilters=codeSchemas()
    .filter(function(s){return FILTER_FIELDS.indexOf(s.key)>=0;})
    .map(function(s){
      var cur=APP.fieldFilters[s.key]||'';
      var opts='<option value="">'+s.name+'</option>';
      if(s.allowed_values)opts+=s.allowed_values.map(function(v){return '<option value="'+v.value+'"'+(cur===v.value?' selected':'')+'>'+v.value+' - '+v.label+'</option>';}).join('');
      return '<select class="input" style="width:110px;font-size:11px" onchange="setFieldFilter(\''+s.key+'\',this.value)">'+opts+'</select>';
    }).join('');

  document.getElementById('content').innerHTML=
    '<div class="page-header"><div><h1 class="page-title">Entregables MIDP</h1>'+
    '<p class="page-sub">'+(APP.project?APP.project.name:'')+'</p></div></div>'+
    '<div class="kpi-grid" id="kpi-area"><div class="loading"><div class="spinner"></div></div></div>'+
    '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">'+
    '<div class="search-wrap" style="max-width:180px">'+
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'+
    '<input class="input" placeholder="Buscar codigo..." oninput="APP.search=this.value;loadDeliverables()"></div>'+
    '<select class="input" style="width:115px;font-size:11px" onchange="APP.statusFilter=this.value;loadDeliverables()">'+
    '<option value="">Todos estados</option>'+
    Object.entries(STATUS_CFG).map(function(e){return '<option value="'+e[0]+'">'+e[1].label+'</option>';}).join('')+
    '</select>'+schemaFilters+
    '<button class="btn btn-sm" onclick="clearFilters()">x Limpiar</button>'+
    '<button class="btn btn-sm" onclick="loadDeliverables()">&#8635;</button></div>'+
    '<div id="del-table">'+loading()+'</div>';
  loadDeliverables();
}

function setFieldFilter(key,val){APP.fieldFilters[key]=val;loadDeliverables();}
function clearFilters(){APP.fieldFilters={};APP.search='';APP.statusFilter='';renderDeliverables();}

function loadDeliverables(){
  if(!APP.project)return;
  var params='?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=created_at.desc';
  if(APP.statusFilter)params+='&status=eq.'+APP.statusFilter;
  if(APP.search)params+='&or=(code.ilike.*'+APP.search+'*,name.ilike.*'+APP.search+'*)';
  Object.keys(APP.fieldFilters).forEach(function(k){
    var v=APP.fieldFilters[k];
    if(v)params+='&field_values->>'+k+'=eq.'+encodeURIComponent(v);
  });

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
    prod.forEach(function(p){
      if(!prodMap[p.deliverable_id])prodMap[p.deliverable_id]={plan:0,cons:0};
      prodMap[p.deliverable_id].plan+=Number(p.planned_qty);
      prodMap[p.deliverable_id].cons+=Number(p.consumed_qty);
    });
    var canEdit=can('can_edit_deliverables');
    var canDel=can('can_delete_deliverables');
    var canStatus=can('can_change_status');

    if(items.length===0){
      document.getElementById('del-table').innerHTML=
        '<div class="card"><div class="empty">'+
        '<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>'+
        '<div class="empty-title">Sin entregables</div>'+
        '<div class="empty-desc">No hay resultados para los filtros actuales.</div></div></div>';
      return;
    }

    // Campos generales visibles (excluyendo estado que tiene columna propia con select)
    var visGeneral=visibleGeneralSchemas().filter(function(s){return s.key!=='estado'&&s.key!=='responsable';});
    // Campos de fase visibles — LOD, LOI y fecha solo (siempre los mismos 3 para la vista)
    var phaseColKeys=['lod','loi','delivery_date'];

    // Calcular anchos dinamicamente
    var totalCols=3+visGeneral.length+(PHASE_GROUPS.length*3)+(canEdit||canDel?1:0);

    var html='<div style="border-radius:var(--rl);border:1px solid var(--border);background:var(--surface);overflow:hidden">'+
      '<table class="tbl" style="width:100%;table-layout:fixed"><thead><tr>'+
      '<th style="width:18%;min-width:140px">Codigo</th>'+
      '<th style="width:14%;min-width:120px">Nombre</th>'+
      '<th style="width:8%;min-width:80px">Estado</th>'+
      visGeneral.map(function(s){
        return '<th style="width:7%;min-width:60px;font-size:10px">'+s.name+'</th>';
      }).join('')+
      PHASE_GROUPS.map(function(ph){
        var vis=visiblePhaseSchemas(ph.key);
        var hasLOD=vis.some(function(s){return s.key===ph.key+'_lod';});
        var hasLOI=vis.some(function(s){return s.key===ph.key+'_loi';});
        var hasFecha=vis.some(function(s){return s.key===ph.key+'_delivery_date';});
        var span=(hasLOD?1:0)+(hasLOI?1:0)+(hasFecha?1:0);
        if(!span)return '';
        return '<th colspan="'+span+'" style="text-align:center;background:'+ph.color+'15;color:'+ph.color+';border-left:2px solid '+ph.color+'40;font-size:10px">'+ph.label+' · '+ph.sub+'</th>';
      }).join('')+
      (canEdit||canDel?'<th style="width:5%">Acc.</th>':'')+
      '</tr><tr>'+
      '<th colspan="'+(2+visGeneral.length+1)+'" style="background:var(--bg)"></th>'+
      PHASE_GROUPS.map(function(ph){
        var vis=visiblePhaseSchemas(ph.key);
        var cells='';
        if(vis.some(function(s){return s.key===ph.key+'_lod';}))
          cells+='<th style="font-size:9px;background:'+ph.color+'08;border-left:2px solid '+ph.color+'30">LOD</th>';
        if(vis.some(function(s){return s.key===ph.key+'_loi';}))
          cells+='<th style="font-size:9px;background:'+ph.color+'08">LOI</th>';
        if(vis.some(function(s){return s.key===ph.key+'_delivery_date';}))
          cells+='<th style="font-size:9px;background:'+ph.color+'08">Fecha</th>';
        return cells;
      }).join('')+
      (canEdit||canDel?'<th style="background:var(--bg)"></th>':'')+
      '</tr></thead><tbody>'+
      items.map(function(d){
        var statusCell=canStatus
          ?'<select class="input" style="width:100%;font-size:10px;padding:2px 18px 2px 5px" onchange="changeStatus(\''+d.id+'\',this.value)">'+
            Object.entries(STATUS_CFG).map(function(e){return '<option value="'+e[0]+'"'+(d.status===e[0]?' selected':'')+'>'+e[1].label+'</option>';}).join('')+'</select>'
          :statusBadge(d.status);

        var generalCells=visGeneral.map(function(s){
          var val=getFieldVal(d,s);
          return '<td style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+val+'">'+
            (val||'<span style="color:var(--text3)">--</span>')+'</td>';
        }).join('');

        var phaseCells=PHASE_GROUPS.map(function(ph){
          var vis=visiblePhaseSchemas(ph.key);
          var cells='';
          if(vis.some(function(s){return s.key===ph.key+'_lod';})){
            var lod=d[ph.key+'_lod']||'--';
            cells+='<td style="border-left:2px solid '+ph.color+'30;font-size:10px;font-weight:600;color:'+ph.color+';text-align:center">'+lod+'</td>';
          }
          if(vis.some(function(s){return s.key===ph.key+'_loi';})){
            var loi=d[ph.key+'_loi']||'--';
            cells+='<td style="font-size:10px;text-align:center;color:var(--text2)">'+loi+'</td>';
          }
          if(vis.some(function(s){return s.key===ph.key+'_delivery_date';})){
            var dt=d[ph.key+'_delivery_date'];
            var isOverdue=dt&&new Date(dt)<new Date()&&d.status!=='approved'&&d.status!=='issued';
            cells+='<td style="font-size:9px;'+(isOverdue?'color:var(--red);font-weight:600':'color:var(--text3)')+'">'+
              fmtDateShort(dt)+(isOverdue?' ⚠':'')+'</td>';
          }
          return cells;
        }).join('');

        return '<tr>'+
          '<td style="overflow:hidden">'+
          '<span class="code-chip" style="font-size:8px;word-break:break-all;white-space:normal;line-height:1.4">'+d.code+'</span>'+
          (d.work_package?'<div style="font-size:9px;color:var(--text3);margin-top:1px">'+d.work_package+'</div>':'')+
          '</td>'+
          '<td><div style="font-weight:600;color:var(--text);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+d.name+'</div>'+
          (d.description?'<div style="font-size:9px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+d.description+'</div>':'')+
          '</td>'+
          '<td>'+statusCell+'</td>'+
          generalCells+phaseCells+
          (canEdit||canDel?'<td><div style="display:flex;gap:2px;justify-content:center">'+
            (canEdit?'<button class="btn btn-ghost btn-sm" onclick="openDeliverableModal(\''+d.id+'\')" title="Editar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'')+
            (canDel?'<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDelete(\''+d.id+'\',\''+d.code+'\')" title="Eliminar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>':'')+
            '</div></td>':'')+
          '</tr>';
      }).join('')+
      '</tbody></table>'+
      '<div style="padding:8px 14px;background:var(--bg);font-size:10px;color:var(--text3);border-top:1px solid var(--border2);border-radius:0 0 var(--rl) var(--rl)">'+
      items.length+' entregable(s) mostrado(s) de '+total+' totales · Supabase</div></div>';
    document.getElementById('del-table').innerHTML=html;
  }).catch(function(e){
    document.getElementById('del-table').innerHTML='<div class="card"><div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div></div>';
  });
}

function changeStatus(id,s){
  if(!can('can_change_status')){toast('Sin permiso.','error');return;}
  sbPatch('deliverables','id=eq.'+id,{status:s}).then(function(){toast('Estado actualizado.');}).catch(function(e){toast(e.message,'error');});
}

// ── DELIVERABLE MODAL — campos dinámicos ──
function openDeliverableModal(id){
  if(id&&!can('can_edit_deliverables')){toast('Sin permiso para editar.','error');return;}
  if(!id&&!can('can_create_deliverables')){toast('Sin permiso para crear.','error');return;}
  var getD=id?sbGet('deliverables','?id=eq.'+id+'&limit=1').then(function(r){return r[0];}):Promise.resolve(null);
  getD.then(function(d){
    var fv=d?d.field_values||{}:{};

    // Seccion 1: Campos de codigo
    var codeInputs=codeSchemas().map(function(s){
      var val=fv[s.key]||'';
      if(s.field_type==='dropdown'&&s.allowed_values){
        return '<div class="form-group"><label class="label">'+s.name+(s.is_required?' *':'')+
          '<span class="code-seg" style="margin-left:4px;font-size:8px">cod.#'+s.code_order+'</span></label>'+
          '<select class="input schema-field" data-key="'+s.key+'" onchange="updateCodePreview()">'+
          '<option value="">Seleccionar</option>'+
          s.allowed_values.map(function(v){return '<option value="'+v.value+'"'+(val===v.value?' selected':'')+'>'+v.value+' - '+v.label+'</option>';}).join('')+
          '</select></div>';
      }
      return '<div class="form-group"><label class="label">'+s.name+(s.is_required?' *':'')+
        '<span class="code-seg" style="margin-left:4px;font-size:8px">cod.#'+s.code_order+'</span></label>'+
        '<input type="text" class="input schema-field" data-key="'+s.key+'" maxlength="'+s.max_length+'" value="'+val+'" oninput="updateCodePreview()"></div>';
    }).join('');

    // Seccion 2: Campos generales dinamicos
    var usersOpts=APP.users.filter(function(u){return u.is_active;}).map(function(u){
      return '<option value="'+u.id+'"'+(d&&d.assigned_to===u.id?' selected':'')+'>'+u.full_name+(u.specialty?' ('+u.specialty+')':'')+'</option>';
    }).join('');

    var generalInputs=generalSchemas().map(function(s){
      var colMap={nombre:'name',descripcion:'description',paquete:'work_package',formato:'file_format',tamano_lamina:'sheet_size',escala:'scale',estado:'status',responsable:'assigned_to',predecesores:'predecessors'};
      var col=colMap[s.key];
      var val=d&&col?d[col]||'':'';

      if(s.key==='estado'){
        return '<div class="form-group"><label class="label">'+s.name+'</label>'+
          '<select class="input" id="gen_estado">'+
          Object.entries(STATUS_CFG).map(function(e){return '<option value="'+e[0]+'"'+(d&&d.status===e[0]?' selected':'')+'>'+e[1].label+'</option>';}).join('')+
          '</select></div>';
      }
      if(s.key==='responsable'){
        return '<div class="form-group"><label class="label">'+s.name+'</label>'+
          '<select class="input" id="gen_responsable"><option value="">Sin asignar</option>'+usersOpts+'</select></div>';
      }
      if(s.field_type==='dropdown'&&s.options){
        var opts=JSON.parse(typeof s.options==='string'?s.options:JSON.stringify(s.options));
        return '<div class="form-group"><label class="label">'+s.name+(s.is_required?' *':'')+'</label>'+
          '<select class="input" id="gen_'+s.key+'"><option value="">--</option>'+
          opts.map(function(v){return '<option value="'+v+'"'+(val===v?' selected':'')+'>'+v+'</option>';}).join('')+
          '</select></div>';
      }
      if(s.key==='descripcion'){
        return '<div class="form-group full"><label class="label">'+s.name+'</label>'+
          '<textarea class="input" id="gen_'+s.key+'" rows="2" placeholder="'+(s.placeholder||'')+'">'+val+'</textarea></div>';
      }
      return '<div class="form-group'+(s.key==='nombre'?' full':'')+'"><label class="label">'+s.name+(s.is_required?' *':'')+'</label>'+
        '<input type="text" class="input" id="gen_'+s.key+'" value="'+val+'" placeholder="'+(s.placeholder||'')+'"></div>';
    }).join('');

    // Seccion 3: Fases RIBA — dinamicas
    var phaseBlocks=PHASE_GROUPS.map(function(ph){
      var fields=phaseSchemas(ph.key);
      if(!fields.length)return '';
      var inputs=fields.map(function(s){
        var val=d&&d[s.key]||'';
        var isFull=s.key===ph.key+'_doc_assoc';
        var inp='';
        if(s.field_type==='dropdown'&&s.options){
          var opts=JSON.parse(typeof s.options==='string'?s.options:JSON.stringify(s.options));
          inp='<select class="input" id="ph_'+s.key+'"><option value="">--</option>'+
            opts.map(function(v){return '<option value="'+v+'"'+(val===v?' selected':'')+'>'+v+'</option>';}).join('')+'</select>';
        }else if(s.field_type==='date'){
          inp='<input type="date" class="input" id="ph_'+s.key+'" value="'+val+'">';
        }else{
          inp='<input type="text" class="input" id="ph_'+s.key+'" value="'+val+'" placeholder="'+(s.placeholder||'')+'">';
        }
        return '<div class="form-group'+(isFull?' full':'')+'"><label class="label">'+
          s.name.replace(ph.label+' - ','')+'</label>'+inp+'</div>';
      }).join('');

      return '<div style="border:1px solid '+ph.color+'40;border-radius:var(--r);padding:14px;background:'+ph.color+'06;margin-bottom:10px">'+
        '<div style="font-size:11px;font-weight:700;color:'+ph.color+';text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">'+
        ph.label+' — '+ph.sub+'</div>'+
        '<div class="form-grid">'+inputs+'</div></div>';
    }).join('');

    document.getElementById('modal-container').innerHTML=
      '<div class="modal-overlay" id="del-modal">'+
      '<div class="modal modal-lg" style="max-width:820px">'+
      '<div class="modal-header"><div class="modal-title">'+(d?'Editar: '+d.code:'Nuevo entregable MIDP')+'</div>'+
      '<button class="btn btn-ghost btn-sm" onclick="closeModal(\'del-modal\')">X</button></div>'+
      '<div class="modal-body">'+

      '<div class="code-preview"><div class="cp-label"><span>Codigo del contenedor</span><span id="code-status"></span></div>'+
      '<div class="cp-code" id="code-preview-val">'+(d?d.code:'Complete los campos...')+'</div></div>'+

      '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">1. Campos de codificacion</div>'+
      '<div class="form-grid" style="margin-bottom:16px">'+codeInputs+'</div>'+

      '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">2. Informacion del contenedor</div>'+
      '<div class="form-grid" style="margin-bottom:16px">'+generalInputs+'</div>'+

      '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">3. Informacion por fase RIBA</div>'+
      phaseBlocks+

      '</div>'+
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
      if(preview)preview.style.color=r.length>0?'var(--red)':'var(--brand)';
      if(status)status.innerHTML=r.length>0?'<span class="cp-dup">Codigo duplicado</span>':'<span class="cp-ok">Disponible</span>';
    }).catch(function(){});
  },600);
}

function saveDeliverable(id){
  var btn=document.getElementById('del-save-btn');
  var fields={};
  document.querySelectorAll('.schema-field').forEach(function(el){fields[el.dataset.key]=el.value;});
  var code=buildCode(fields);
  if(!code){toast('Completa los campos de codigo.','error');return;}

  // Leer campos generales dinamicamente
  var nameEl=document.getElementById('gen_nombre');
  var name=nameEl?nameEl.value.trim():'';
  if(!name){toast('El titulo es obligatorio.','error');return;}

  btn.disabled=true;btn.textContent='Guardando...';
  var dupQ='?project_id=eq.'+APP.project.id+'&code=eq.'+encodeURIComponent(code)+'&is_active=eq.true';
  if(id)dupQ+='&id=neq.'+id;

  sbGet('deliverables',dupQ).then(function(dup){
    if(dup.length>0){toast('Codigo duplicado.','error');btn.disabled=false;btn.textContent=id?'Actualizar':'Crear entregable';return;}

    function gv(key){var el=document.getElementById('gen_'+key);return el?el.value||null:null;}

    var payload={
      project_id:APP.project.id,code:code,name:name,field_values:fields,created_by:APP.user.id,
      description:gv('descripcion'),
      work_package:gv('paquete'),
      file_format:gv('formato'),
      sheet_size:gv('tamano_lamina'),
      scale:gv('escala'),
      status:gv('estado')||'pending',
      assigned_to:gv('responsable'),
      predecessors:gv('predecesores')
    };

    // Campos de fase — leer todos los schemas de fase
    PHASE_GROUPS.forEach(function(ph){
      phaseSchemas(ph.key).forEach(function(s){
        var el=document.getElementById('ph_'+s.key);
        payload[s.key]=el?el.value||null:null;
      });
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
    '<div class="modal-header"><div class="modal-title">Eliminar entregable?</div>'+
    '<button class="btn btn-ghost btn-sm" onclick="closeModal(\'confirm-modal\')">X</button></div>'+
    '<div class="modal-body"><p style="color:var(--text2);margin-bottom:10px">Se eliminara permanentemente:</p>'+
    '<div style="background:var(--bg);padding:10px;border-radius:var(--r);border:1px solid var(--border)"><span class="code-chip" style="font-size:9px">'+code+'</span></div>'+
    '<p style="color:var(--red);font-size:12px;margin-top:10px">Esta accion no se puede deshacer.</p></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'confirm-modal\')">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="deleteDeliverable(\''+id+'\')">Eliminar</button></div></div></div>';
}
function deleteDeliverable(id){
  sbPatch('deliverables','id=eq.'+id,{is_active:false})
    .then(function(){closeModal('confirm-modal');toast('Eliminado.');loadDeliverables();})
    .catch(function(e){toast(e.message,'error');});
}

// ── EXPORTS ──
function exportCSV(){
  sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc').then(function(items){
    var headers=['Codigo','Nombre','Estado','Formato','Escala','Paquete',
      'RIBA2 LOD','RIBA2 LOI','RIBA2 Fecha',
      'RIBA3 LOD','RIBA3 LOI','RIBA3 Fecha',
      'RIBA4 LOD','RIBA4 LOI','RIBA4 Fecha'];
    var rows=items.map(function(d){return [
      d.code,'"'+(d.name||'')+'"',d.status,d.file_format||'',d.scale||'',d.work_package||'',
      d.riba2_lod||'',d.riba2_loi||'',d.riba2_delivery_date||'',
      d.riba3_lod||'',d.riba3_loi||'',d.riba3_delivery_date||'',
      d.riba4_lod||'',d.riba4_loi||'',d.riba4_delivery_date||''
    ];});
    var csv='\uFEFF'+[headers].concat(rows).map(function(r){return r.join(',');}).join('\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='MIDP_'+APP.project.code+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    toast('CSV exportado.');
  }).catch(function(e){toast(e.message,'error');});
}

function exportMIDP(){
  sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc').then(function(items){
    var headers=[
      'N Ref','Titulo','Descripcion','Paquete','Formato','Tamano','Escala','Predecesores',
      'Proyecto','Originador','Fase Programa','Area Funcional','Fase Proyecto',
      'Volumen','Nivel','Disciplina','Tipo','Secuencial','Codigo','Estado',
      'RIBA2 Resp','RIBA2 LOD','RIBA2 LOI','RIBA2 Doc','RIBA2 T.Prod','RIBA2 Fecha',
      'RIBA3 Resp','RIBA3 LOD','RIBA3 LOI','RIBA3 Doc','RIBA3 T.Prod','RIBA3 Fecha',
      'RIBA4 Resp','RIBA4 LOD','RIBA4 LOI','RIBA4 Doc','RIBA4 T.Prod','RIBA4 Fecha'
    ];
    var rows=items.map(function(d,i){
      var fv=d.field_values||{};
      return [
        i+1,'"'+(d.name||'')+'"','"'+(d.description||'')+'"',d.work_package||'',
        d.file_format||'',d.sheet_size||'',d.scale||'',d.predecessors||'',
        fv.proyecto||'',fv.originador||'',fv.fase_programa||'',fv.area_funcional||'',
        fv.fase_proyecto||'',fv.volumen||'',fv.nivel||'',fv.disciplina||'',
        fv.tipo_documento||'',fv.secuencial||'',d.code,d.status,
        d.riba2_responsible||'',d.riba2_lod||'',d.riba2_loi||'',d.riba2_doc_assoc||'',d.riba2_prod_time||'',d.riba2_delivery_date||'',
        d.riba3_responsible||'',d.riba3_lod||'',d.riba3_loi||'',d.riba3_doc_assoc||'',d.riba3_prod_time||'',d.riba3_delivery_date||'',
        d.riba4_responsible||'',d.riba4_lod||'',d.riba4_loi||'',d.riba4_doc_assoc||'',d.riba4_prod_time||'',d.riba4_delivery_date||''
      ];
    });
    var csv='\uFEFF'+[headers].concat(rows).map(function(r){return r.join(',');}).join('\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='MIDP_Completo_'+APP.project.code+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    toast('MIDP exportado.');
  }).catch(function(e){toast(e.message,'error');});
}

// ── PROGRESS ──
function renderProgress(){
  document.getElementById('topbar-actions').innerHTML='';
  document.getElementById('content').innerHTML=
    '<div class="page-header"><div><h1 class="page-title">Control de avance</h1>'+
    '<p class="page-sub">Avance por fase RIBA</p></div></div>'+loading();

  Promise.all([
    sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc'),
    sbGet('production_units','?select=*').catch(function(){return[];})
  ]).then(function(res){
    var deliverables=res[0];var prod=res[1];
    var prodMap={};
    prod.forEach(function(p){
      if(!prodMap[p.deliverable_id])prodMap[p.deliverable_id]={plan:0,cons:0};
      prodMap[p.deliverable_id].plan+=Number(p.planned_qty);
      prodMap[p.deliverable_id].cons+=Number(p.consumed_qty);
    });
    var totalPlan=0,totalCons=0;
    deliverables.forEach(function(d){var p=prodMap[d.id]||{plan:0,cons:0};totalPlan+=p.plan;totalCons+=p.cons;});
    var pctGen=totalPlan>0?Math.round(totalCons/totalPlan*100):0;
    var totalDels=deliverables.length;
    var completedDels=deliverables.filter(function(d){return d.status==='approved'||d.status==='issued';}).length;
    var canProg=can('can_register_progress');

    var byDisc={};
    deliverables.forEach(function(d){
      var disc=(d.field_values&&d.field_values.disciplina)||'--';
      if(!byDisc[disc])byDisc[disc]={plan:0,cons:0,total:0,comp:0};
      var p=prodMap[d.id]||{plan:0,cons:0};
      byDisc[disc].plan+=p.plan;byDisc[disc].cons+=p.cons;byDisc[disc].total++;
      if(d.status==='approved'||d.status==='issued')byDisc[disc].comp++;
    });

    var phaseStats=PHASE_GROUPS.map(function(ph){
      var withDate=deliverables.filter(function(d){return !!d[ph.key+'_delivery_date'];}).length;
      var comp=deliverables.filter(function(d){return d[ph.key+'_delivery_date']&&(d.status==='approved'||d.status==='issued');}).length;
      var overdue=deliverables.filter(function(d){
        return d[ph.key+'_delivery_date']&&new Date(d[ph.key+'_delivery_date'])<new Date()&&d.status!=='approved'&&d.status!=='issued';
      }).length;
      return {ph:ph,withDate:withDate,comp:comp,overdue:overdue};
    });

    document.getElementById('content').innerHTML=
      '<div class="page-header"><div><h1 class="page-title">Control de avance</h1><p class="page-sub">'+APP.project.name+'</p></div></div>'+
      '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">'+
      kpiCard('Entregables','var(--brand-light)','var(--brand)',totalDels,'registrados')+
      kpiCard('Completados','var(--green-light)','var(--green)',completedDels,(totalDels?Math.round(completedDels/totalDels*100):0)+'%')+
      kpiCard('Unid. planificadas','#eff6ff','var(--brand)',totalPlan,'unidades')+
      kpiCard('Unid. consumidas','var(--green-light)','var(--green)',totalCons,pctGen+'% avance')+
      '</div>'+

      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">'+
      phaseStats.map(function(ps){
        var pct=ps.withDate>0?Math.round(ps.comp/ps.withDate*100):0;
        return '<div class="card" style="padding:14px;border-top:3px solid '+ps.ph.color+'">'+
          '<div style="font-size:10px;font-weight:700;color:'+ps.ph.color+';text-transform:uppercase;margin-bottom:8px">'+ps.ph.label+' · '+ps.ph.sub+'</div>'+
          '<div style="font-size:26px;font-weight:700;font-family:\'Space Grotesk\',sans-serif;color:var(--text)">'+pct+'%</div>'+
          '<div style="font-size:10px;color:var(--text3);margin-top:2px">'+ps.comp+' de '+ps.withDate+' completados</div>'+
          '<div class="prog-track" style="margin-top:8px"><div class="prog-fill" style="width:'+pct+'%;background:'+ps.ph.color+'"></div></div>'+
          (ps.overdue>0?'<div style="font-size:9px;color:var(--red);margin-top:6px;font-weight:600">'+ps.overdue+' vencido(s) ⚠</div>':
          '<div style="font-size:9px;color:var(--green);margin-top:6px">Al dia</div>')+
          '</div>';
      }).join('')+
      '</div>'+

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">'+
      '<div class="card" style="padding:18px">'+
      '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">Avance por disciplina</div>'+
      (Object.keys(byDisc).length?Object.entries(byDisc).map(function(e){
        var pct=e[1].plan>0?Math.round(e[1].cons/e[1].plan*100):0;
        return '<div class="prog-row">'+
          '<div class="prog-label" style="font-size:10px;font-weight:600">'+e[0]+'</div>'+
          '<div class="prog-bar-wrap"><div class="prog-track"><div class="prog-fill" style="width:'+pct+'%;background:'+progColor(pct)+'"></div></div>'+
          '<div style="font-size:9px;color:var(--text3)">'+e[1].comp+'/'+e[1].total+' ent.</div></div>'+
          '<div class="prog-pct">'+pct+'%</div></div>';
      }).join(''):'<p style="color:var(--text3);font-size:12px">Sin datos.</p>')+
      '</div>'+
      '<div class="card" style="padding:18px">'+
      '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">Por estado</div>'+
      Object.entries(STATUS_CFG).map(function(e){
        var cnt=deliverables.filter(function(d){return d.status===e[0];}).length;
        var pct=totalDels?Math.round(cnt/totalDels*100):0;
        var colors={approved:'var(--green)',issued:'var(--violet)',in_progress:'var(--brand)',for_review:'var(--amber)',pending:'var(--slate)',rejected:'var(--red)'};
        return '<div class="stat-bar-row"><div class="stat-bar-label">'+e[1].label+'</div>'+
          '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:'+pct+'%;background:'+colors[e[0]]+'"></div></div>'+
          '<div class="stat-bar-count">'+cnt+'</div></div>';
      }).join('')+
      '</div></div>'+

      '<div class="card" style="overflow:hidden">'+
      '<table class="tbl"><thead><tr>'+
      '<th>Entregable</th><th>Disciplina</th>'+
      '<th>Plan.</th><th>Cons.</th><th>Avance</th>'+
      PHASE_GROUPS.map(function(ph){return '<th style="color:'+ph.color+';font-size:9px">'+ph.label+' Fecha</th>';}).join('')+
      '<th>Estado</th>'+(canProg?'<th>Registrar</th>':'')+
      '</tr></thead><tbody>'+
      deliverables.map(function(d){
        var p=prodMap[d.id]||{plan:0,cons:0};
        var pct=p.plan>0?Math.round(p.cons/p.plan*100):0;
        var today=new Date();
        var phaseDates=PHASE_GROUPS.map(function(ph){
          var dt=d[ph.key+'_delivery_date'];
          if(!dt)return '<td style="font-size:10px;color:var(--text3)">--</td>';
          var overdue=new Date(dt)<today&&d.status!=='approved'&&d.status!=='issued';
          return '<td style="font-size:10px;'+(overdue?'color:var(--red);font-weight:600':'color:var(--text2)')+'">'+fmtDateShort(dt)+(overdue?' ⚠':'')+'</td>';
        }).join('');
        return '<tr>'+
          '<td><span class="code-chip" style="font-size:9px">'+d.code+'</span>'+
          '<div style="font-size:9px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+d.name+'</div></td>'+
          '<td><span class="badge b-progress" style="font-size:9px">'+((d.field_values&&d.field_values.disciplina)||'--')+'</span></td>'+
          '<td style="font-weight:600;text-align:center">'+p.plan+'</td>'+
          '<td style="font-weight:600;color:'+progColor(pct)+';text-align:center">'+p.cons+'</td>'+
          '<td><div style="display:flex;align-items:center;gap:5px">'+
          '<div class="prog-track" style="width:50px"><div class="prog-fill" style="width:'+pct+'%;background:'+progColor(pct)+'"></div></div>'+
          '<span style="font-size:10px;color:var(--text3)">'+pct+'%</span></div></td>'+
          phaseDates+
          '<td>'+statusBadge(d.status)+'</td>'+
          (canProg?'<td><button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="openProgressModal(\''+d.id+'\',\''+d.code+'\','+p.plan+','+p.cons+')">Registrar</button></td>':'')+
          '</tr>';
      }).join('')+
      '</tbody></table></div>';
  }).catch(function(e){document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';});
}

function openProgressModal(delId,code,plan,cons){
  if(!can('can_register_progress')){toast('Sin permiso.','error');return;}
  document.getElementById('modal-container').innerHTML=
    '<div class="modal-overlay" id="prog-modal"><div class="modal" style="max-width:420px">'+
    '<div class="modal-header"><div class="modal-title">Registrar avance</div>'+
    '<button class="btn btn-ghost btn-sm" onclick="closeModal(\'prog-modal\')">X</button></div>'+
    '<div class="modal-body"><div style="background:var(--bg);border-radius:var(--r);padding:10px;margin-bottom:14px;border:1px solid var(--border)">'+
    '<span class="code-chip" style="font-size:9px">'+code+'</span></div>'+
    '<div class="form-grid">'+
    '<div class="form-group"><label class="label">Unidades planificadas</label><input type="number" class="input" id="prog-plan" value="'+plan+'" min="0"></div>'+
    '<div class="form-group"><label class="label">Unidades consumidas</label><input type="number" class="input" id="prog-cons" value="'+cons+'" min="0"></div>'+
    '</div></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'prog-modal\')">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="saveProgress(\''+delId+'\')">Guardar</button></div></div></div>';
}
function saveProgress(delId){
  var plan=parseInt(document.getElementById('prog-plan').value)||0;
  var cons=parseInt(document.getElementById('prog-cons').value)||0;
  if(cons>plan){toast('Consumidas no puede superar planificadas.','error');return;}
  sbGet('production_units','?deliverable_id=eq.'+delId+'&limit=1').then(function(ex){
    return ex.length
      ?sbPatch('production_units','deliverable_id=eq.'+delId,{planned_qty:plan,consumed_qty:cons})
      :sbPost('production_units',{deliverable_id:delId,planned_qty:plan,consumed_qty:cons,unit_label:'und'});
  }).then(function(){closeModal('prog-modal');toast('Avance guardado.');renderProgress();}).catch(function(e){toast(e.message,'error');});
}

// ── SCHEMAS — Config. de campos ──
function renderSchemas(){
  if(APP.user&&APP.user.role!=='admin'){
    document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Acceso restringido</div><div class="empty-desc">Solo el administrador puede configurar campos.</div></div>';
    return;
  }
  document.getElementById('topbar-actions').innerHTML='';
  document.getElementById('content').innerHTML=loading();

  sbGet('field_schemas','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=field_order.asc,code_order.asc').then(function(schemas){
    APP.schemas=schemas;

    var groups=[
      {id:'code',   label:'Codificacion UKHA',     color:'var(--brand)',   desc:'Campos que forman el codigo del entregable'},
      {id:'general',label:'Informacion general',   color:'var(--slate)',   desc:'Campos del contenedor de informacion'},
      {id:'riba2',  label:'RIBA 2 - Presentacion 0',color:'#06b6d4',      desc:'Campos de la fase RIBA 2'},
      {id:'riba3',  label:'RIBA 3 - Presentacion 1',color:'#3b82f6',      desc:'Campos de la fase RIBA 3'},
      {id:'riba4',  label:'RIBA 4 - Presentacion 2',color:'#8b5cf6',      desc:'Campos de la fase RIBA 4'}
    ];

    var html='<div class="page-header"><div><h1 class="page-title">Config. de campos</h1>'+
      '<p class="page-sub">Gestiona que campos aparecen en los entregables y si son visibles en la tabla</p></div></div>';

    groups.forEach(function(g){
      var fields=schemas.filter(function(s){return s.field_group===g.id;}).sort(function(a,b){
        return g.id==='code'?(a.code_order-b.code_order):(a.field_order-b.field_order);
      });
      if(!fields.length)return;

      html+='<div style="margin-bottom:20px">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
        '<div><div style="font-size:12px;font-weight:700;color:'+g.color+'">'+g.label+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+g.desc+'</div></div>'+
        (g.id!=='code'?'<button class="btn btn-sm btn-primary" onclick="openSchemaModal(null,\''+g.id+'\')">+ Agregar campo</button>':'')+
        '</div>'+
        fields.map(function(s){
          var isCode=g.id==='code';
          return '<div class="schema-item" style="margin-bottom:5px">'+
            '<div class="schema-order" style="background:'+g.color+'20;color:'+g.color+'">'+
            (isCode?s.code_order:s.field_order)+'</div>'+
            '<div class="schema-info">'+
            '<div class="schema-name">'+s.name+'</div>'+
            '<div class="schema-meta">'+
            '<span class="schema-key">.'+s.key+'</span>'+
            '<span class="schema-type-badge">'+(s.field_type==='dropdown'?'lista':s.field_type)+'</span>'+
            (s.is_required?'<span style="font-size:9px;color:var(--red);font-weight:600">obligatorio</span>':'')+
            (isCode?'<span class="code-seg">cod.#'+s.code_order+(s.separator?' + "'+s.separator+'"':'')+'</span>':'')+
            '</div>'+
            (s.allowed_values?'<div class="schema-vals">'+s.allowed_values.map(function(v){return '<span class="val-pill">'+v.value+'</span>';}).join('')+'</div>':'')+
            (s.options?'<div class="schema-vals">'+JSON.parse(typeof s.options==='string'?s.options:JSON.stringify(s.options)).map(function(v){return '<span class="val-pill">'+v+'</span>';}).join('')+'</div>':'')+
            '</div>'+
            // Visible toggle (solo para no-code)
            (!isCode?
            '<div style="display:flex;align-items:center;gap:6px;margin-right:8px">'+
            '<span style="font-size:10px;color:var(--text3)">Visible</span>'+
            '<label class="toggle">'+
            '<input type="checkbox"'+(s.is_visible?' checked':'')+' onchange="toggleVisible(\''+s.id+'\',this.checked)">'+
            '<span class="toggle-slider"></span></label></div>':'')+ 
            '<div style="display:flex;gap:4px">'+
            '<button class="btn btn-ghost btn-sm" onclick="openSchemaModal(\''+s.id+'\',\''+g.id+'\')">'+
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
            (!isCode?'<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDeleteSchema(\''+s.id+'\',\''+s.name+'\')">'+
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>':'')+
            '</div></div>';
        }).join('')+
        '</div>';
    });

    document.getElementById('content').innerHTML=html;
  }).catch(function(e){document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';});
}

function toggleVisible(id,value){
  sbPatch('field_schemas','id=eq.'+id,{is_visible:value})
    .then(function(){
      var idx=APP.schemas.findIndex(function(s){return s.id===id;});
      if(idx>=0)APP.schemas[idx].is_visible=value;
      toast('Visibilidad '+(value?'activada':'desactivada')+'.');
    }).catch(function(e){toast(e.message,'error');});
}

function openSchemaModal(id,group){
  var s=id?APP.schemas.find(function(x){return x.id===id;}):null;
  var grp=s?s.field_group:group;
  var isCode=grp==='code';
  var groupLabels={code:'Codificacion',general:'General',riba2:'RIBA 2',riba3:'RIBA 3',riba4:'RIBA 4'};

  document.getElementById('modal-container').innerHTML=
    '<div class="modal-overlay" id="sch-modal"><div class="modal">'+
    '<div class="modal-header"><div class="modal-title">'+(s?'Editar: '+s.name:'Nuevo campo — '+groupLabels[grp])+'</div>'+
    '<button class="btn btn-ghost btn-sm" onclick="closeModal(\'sch-modal\')">X</button></div>'+
    '<div class="modal-body"><div class="form-grid">'+
    '<div class="form-group full"><label class="label">Nombre *</label>'+
    '<input type="text" class="input" id="sch-name" value="'+(s?s.name:'')+'" placeholder="Ej: Observaciones"></div>'+
    '<div class="form-group"><label class="label">Tipo *</label>'+
    '<select class="input" id="sch-type">'+
    '<option value="text"'+(s&&s.field_type==='text'?' selected':'')+'>Texto</option>'+
    '<option value="dropdown"'+(s&&s.field_type==='dropdown'?' selected':'')+'>Lista</option>'+
    '<option value="number"'+(s&&s.field_type==='number'?' selected':'')+'>Numero</option>'+
    '<option value="date"'+(s&&s.field_type==='date'?' selected':'')+'>Fecha</option>'+
    '</select></div>'+
    (isCode?
    '<div class="form-group"><label class="label">Posicion en codigo</label>'+
    '<input type="number" class="input" id="sch-order" value="'+(s?s.code_order:99)+'" min="1" max="20"></div>'+
    '<div class="form-group"><label class="label">Separador</label>'+
    '<input type="text" class="input" id="sch-sep" value="'+(s?s.separator||'':'-')+'" maxlength="5"></div>'+
    '<div class="form-group"><label class="label">Long. max.</label>'+
    '<input type="number" class="input" id="sch-maxlen" value="'+(s?s.max_length:10)+'" min="1" max="255"></div>'
    :
    '<div class="form-group"><label class="label">Orden en formulario</label>'+
    '<input type="number" class="input" id="sch-field-order" value="'+(s?s.field_order:99)+'" min="1"></div>'+
    '<div class="form-group"><label class="label">Placeholder</label>'+
    '<input type="text" class="input" id="sch-placeholder" value="'+(s?s.placeholder||'':'')+'"></div>')+
    '<div class="form-group" style="flex-direction:row;align-items:center;gap:16px;padding-top:20px">'+
    '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">'+
    '<input type="checkbox" id="sch-req"'+(s&&s.is_required?' checked':'')+'>Obligatorio</label>'+
    (!isCode?'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">'+
    '<input type="checkbox" id="sch-visible"'+(s===null||s.is_visible?' checked':'')+'>Visible en tabla</label>':'')+
    '</div>'+
    '<div class="form-group full"><label class="label">Opciones (una por linea, para campos de tipo Lista)</label>'+
    '<textarea class="input" id="sch-opts" rows="4" style="font-family:\'JetBrains Mono\',monospace;font-size:11px" placeholder="RVT&#10;IFC&#10;DWG">'+
    (s&&s.options?JSON.parse(typeof s.options==='string'?s.options:JSON.stringify(s.options)).join('\n'):
    (s&&s.allowed_values?s.allowed_values.map(function(v){return v.value+'|'+v.label;}).join('\n'):'')+
    '')+
    '</textarea></div>'+
    '</div></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'sch-modal\')">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="saveSchema(\''+(id||'')+'\',\''+grp+'\')">'+
    (s?'Actualizar campo':'Crear campo')+'</button></div></div></div>';
}

function saveSchema(id,grp){
  var name=document.getElementById('sch-name').value.trim();
  if(!name){toast('Nombre obligatorio.','error');return;}
  var type=document.getElementById('sch-type').value;
  var isCode=grp==='code';
  var optsRaw=document.getElementById('sch-opts').value.trim();
  var opts=null;var allowedVals=null;

  if(optsRaw){
    if(isCode){
      // codigo usa allowed_values con VALOR|Etiqueta
      allowedVals=optsRaw.split('\n').filter(Boolean).map(function(l){var p=l.split('|');return{value:p[0].trim(),label:(p[1]||p[0]).trim()};});
    }else{
      // no-code usa options como array simple
      opts=JSON.stringify(optsRaw.split('\n').filter(Boolean).map(function(l){return l.trim();}));
    }
  }

  var key=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  var payload={name:name,field_type:type,is_required:!!(document.getElementById('sch-req')&&document.getElementById('sch-req').checked),field_group:grp,project_id:APP.project.id};
  if(isCode){
    payload.key=key;
    payload.is_part_of_code=true;
    payload.code_order=parseInt(document.getElementById('sch-order').value)||99;
    payload.separator=document.getElementById('sch-sep').value;
    payload.max_length=parseInt(document.getElementById('sch-maxlen').value)||10;
    payload.allowed_values=allowedVals;
  }else{
    if(!id)payload.key=key;
    payload.is_part_of_code=false;
    payload.field_order=parseInt(document.getElementById('sch-field-order').value)||99;
    payload.placeholder=document.getElementById('sch-placeholder').value||null;
    payload.is_visible=!!(document.getElementById('sch-visible')&&document.getElementById('sch-visible').checked);
    payload.options=opts?JSON.parse(opts):null;
    payload.max_length=255;payload.code_order=99;payload.separator='';
  }

  var p=id?sbPatch('field_schemas','id=eq.'+id,payload):sbPost('field_schemas',payload);
  p.then(function(){toast(id?'Campo actualizado.':'Campo creado.');closeModal('sch-modal');renderSchemas();})
   .catch(function(e){toast(e.message,'error');});
}

function confirmDeleteSchema(id,name){
  document.getElementById('modal-container').innerHTML=
    '<div class="modal-overlay" id="sch-confirm"><div class="modal" style="max-width:380px">'+
    '<div class="modal-header"><div class="modal-title">Eliminar campo?</div>'+
    '<button class="btn btn-ghost btn-sm" onclick="closeModal(\'sch-confirm\')">X</button></div>'+
    '<div class="modal-body"><p style="font-size:13px;color:var(--text2)">Eliminar el campo <strong>'+name+'</strong>?</p>'+
    '<p style="font-size:11px;color:var(--text3);margin-top:6px">Los datos existentes no se borran de la base de datos.</p></div>'+
    '<div class="modal-footer"><button class="btn" onclick="closeModal(\'sch-confirm\')">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="deleteSchema(\''+id+'\')">Eliminar</button></div></div></div>';
}
function deleteSchema(id){
  sbPatch('field_schemas','id=eq.'+id,{is_active:false})
    .then(function(){closeModal('sch-confirm');toast('Campo eliminado.');renderSchemas();})
    .catch(function(e){toast(e.message,'error');});
}

// ── USERS ──
function renderUsers(){
  var isAdmin=APP.user&&APP.user.role==='admin';
  document.getElementById('topbar-actions').innerHTML=isAdmin?'<button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Nuevo usuario</button>':'';
  document.getElementById('content').innerHTML=loading();
  sbGet('users','?select=*&order=full_name.asc').then(function(users){
    APP.users=users;
    document.getElementById('content').innerHTML=
      '<div class="page-header"><div><h1 class="page-title">Usuarios y permisos</h1>'+
      '<p class="page-sub">'+users.length+' usuarios registrados</p></div>'+
      (isAdmin?'<button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Nuevo usuario</button>':'')+
      '</div>'+
      users.map(function(u){
        var perms=u.permissions||DEFAULT_PERMS;
        var isAdminUser=u.role==='admin';
        return '<div class="perm-card">'+
          '<div class="perm-card-header">'+
          '<div class="perm-avatar">'+initials(u.full_name)+'</div>'+
          '<div class="perm-user-info"><div class="perm-name">'+u.full_name+'</div>'+
          '<div class="perm-email">'+u.email+' - '+(u.specialty||u.role)+'</div></div>'+
          '<div style="display:flex;align-items:center;gap:8px;margin-left:auto">'+
          roleBadge(u.role)+
          (u.is_active?'<span class="badge b-approved" style="font-size:9px">Activo</span>':'<span class="badge b-rejected" style="font-size:9px">Inactivo</span>')+
          (isAdmin?'<button class="btn btn-ghost btn-sm" onclick="openUserModal(\''+u.id+'\')">'+
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'')+
          '</div></div>'+
          '<div class="perm-body">'+
          PERM_CONFIG.map(function(p){
            var isActive=isAdminUser?true:!!perms[p.key];
            return '<div class="perm-item"><div class="perm-item-label">'+p.label+'</div>'+
              (isAdminUser?'<span style="font-size:10px;color:var(--green);font-weight:600">Siempre</span>':
              (isAdmin?'<label class="toggle"><input type="checkbox"'+(isActive?' checked':'')+' onchange="togglePerm(\''+u.id+'\',\''+p.key+'\',this.checked)"><span class="toggle-slider"></span></label>':
              '<span style="font-size:10px;font-weight:600;color:'+(isActive?'var(--green)':'var(--text3)')+'">'+( isActive?'Si':'No')+'</span>'))+'</div>';
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
    '<div class="modal-header"><div class="modal-title">'+(u?'Editar: '+u.full_name:'Nuevo usuario')+'</div>'+
    '<button class="btn btn-ghost btn-sm" onclick="closeModal(\'user-modal\')">X</button></div>'+
    '<div class="modal-body"><div class="form-grid">'+
    '<div class="form-group full"><label class="label">Nombre completo *</label>'+
    '<input type="text" class="input" id="u-name" value="'+(u?u.full_name:'')+'" placeholder="Juan Perez Lopez"></div>'+
    '<div class="form-group full"><label class="label">Correo electronico *</label>'+
    '<input type="email" class="input" id="u-email" value="'+(u?u.email:'')+'" placeholder="juan@empresa.com"'+(u?' disabled':'')+' autocomplete="off"></div>'+
    (!u?'<div class="form-group full"><label class="label">Contrasena temporal *</label>'+
    '<input type="password" class="input" id="u-pass" placeholder="Minimo 8 caracteres" autocomplete="new-password"></div>':'')+
    '<div class="form-group"><label class="label">Rol</label>'+
    '<select class="input" id="u-role">'+
    '<option value="specialist"'+(u&&u.role==='specialist'?' selected':'')+'>Especialista</option>'+
    '<option value="bim_manager"'+(u&&u.role==='bim_manager'?' selected':'')+'>BIM Manager</option>'+
    '<option value="admin"'+(u&&u.role==='admin'?' selected':'')+'>Administrador</option></select></div>'+
    '<div class="form-group"><label class="label">Especialidad</label>'+
    '<input type="text" class="input" id="u-spec" value="'+(u?u.specialty||'':'')+'" placeholder="Arquitectura, MEP..."></div>'+
    '<div class="form-group"><label class="label">Empresa</label>'+
    '<input type="text" class="input" id="u-comp" value="'+(u?u.company||'':'')+'" placeholder="Consorcio SDD"></div>'+
    '<div class="form-group"><label class="label">Telefono</label>'+
    '<input type="text" class="input" id="u-phone" value="'+(u?u.phone||'':'')+'" placeholder="+51 999 000 000"></div>'+
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
  var payload={full_name:name,role:document.getElementById('u-role').value,
    specialty:document.getElementById('u-spec').value||null,
    company:document.getElementById('u-comp').value||null,
    phone:document.getElementById('u-phone').value||null};
  var p=id?sbPatch('users','id=eq.'+id,payload):
    sbRpc('hash_password',{input_password:document.getElementById('u-pass').value}).then(function(hash){
      var email=document.getElementById('u-email').value.trim();
      if(!email||!hash){toast('Correo y contrasena obligatorios.','error');throw new Error('missing');}
      return sbPost('users',Object.assign({},payload,{email:email,password_hash:hash,is_active:true,permissions:Object.assign({},DEFAULT_PERMS)}));
    });
  p.then(function(){toast(id?'Usuario actualizado.':'Usuario creado.');closeModal('user-modal');renderUsers();})
   .catch(function(e){if(e.message!=='missing')toast(e.message,'error');btn.disabled=false;btn.textContent=id?'Actualizar':'Crear usuario';});
}
