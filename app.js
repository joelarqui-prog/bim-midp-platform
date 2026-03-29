// MIDP BIM Platform - app.js v3.0 — Campos completamente configurables
var SUPA_URL='https://rrzlwvqlzhmzyrramjcw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyemx3dnFsemhtenlycmFtamN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODIyMzYsImV4cCI6MjA5MDE1ODIzNn0.IeZlvcT1GaqQybZRbxyjgoEFfJ6Z6BVxbZRgLPzi2Fw';
var H={'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Prefer':'return=representation'};
function sbGet(t,p){return fetch(SUPA_URL+'/rest/v1/'+t+(p||''),{headers:H}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPost(t,b){return fetch(SUPA_URL+'/rest/v1/'+t,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPatch(t,f,b){return fetch(SUPA_URL+'/rest/v1/'+t+'?'+f,{method:'PATCH',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbRpc(fn,b){return fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}

var APP={user:null,project:null,schemas:[],users:[],packages:[],search:'',statusFilter:'',packageFilter:'',fieldFilters:{}};
var DEFAULT_PERMS={can_create_deliverables:false,can_edit_deliverables:false,can_delete_deliverables:false,can_change_status:false,can_register_progress:false};
function can(a){if(!APP.user)return false;if(APP.user.role==='admin')return true;return !!(APP.user.permissions||DEFAULT_PERMS)[a];}

// Grupos de fases RIBA — fijos, siempre los mismos 3
// PHASE_GROUPS is now dynamic — built from schemas
// Use getPhaseGroups() instead of PHASE_GROUPS directly
var PHASE_COLORS=['#06b6d4','#3b82f6','#8b5cf6','#f59e0b','#10b981','#f43f5e','#6366f1'];
var KNOWN_HITO_LABELS={
  riba2:{label:'RIBA 2',sub:'Presentacion 0'},
  riba3:{label:'RIBA 3',sub:'Presentacion 1'},
  riba4:{label:'RIBA 4',sub:'Presentacion 2'}
};

function getPhaseGroups(){
  // Discover all field_groups that are not 'code' or 'general'
  var seen={};var groups=[];
  (APP.schemas||[]).forEach(function(s){
    var g=s.field_group;
    if(!g||g==='code'||g==='general')return;
    if(seen[g])return;
    seen[g]=true;
    var known=KNOWN_HITO_LABELS[g];
    var label=known?known.label:null;
    var sub=known?known.sub:'';
    if(!label){
      // Try to get from description field (hito:Name format)
      var sample=(APP.schemas||[]).find(function(s2){return s2.field_group===g&&s2.description&&s2.description.indexOf('hito:')===0;});
      label=sample?sample.description.replace('hito:','').trim().split(' - ')[0]:
        g.replace(/_/g,' ').replace(/\w/g,function(c){return c.toUpperCase();});
    }
    groups.push({key:g,label:label,sub:sub});
  });
  // Sort: known hitos first by defined order, then custom alphabetically
  var ORDER={riba2:1,riba3:2,riba4:3};
  groups.sort(function(a,b){return (ORDER[a.key]||99+a.key.charCodeAt(0))-(ORDER[b.key]||99+b.key.charCodeAt(0));});
  // Assign colors
  groups.forEach(function(g,i){g.color=PHASE_COLORS[i%PHASE_COLORS.length];});
  return groups;
}

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
var FILTER_FIELDS=['area_funcional','fase_proyecto','volumen','nivel','disciplina','tipo_documento'];

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
          APP.user=user;
          sbPatch('users','id=eq.'+user.id,{last_login_at:new Date().toISOString()}).catch(function(){});
          try{localStorage.setItem('midp_session',JSON.stringify({userId:user.id,savedAt:Date.now()}));}catch(e){}
          showProjectSelector(user);
        });
    }).catch(function(e){showErr('Error: '+e.message);});
}

function showProjectSelector(user){
  document.getElementById('login-page').style.display='none';
  document.getElementById('app').style.display='none';
  document.getElementById('project-selector').style.display='flex';
  document.getElementById('ps-avatar').textContent=initials(user.full_name);
  document.getElementById('ps-name').textContent=user.full_name;
  document.getElementById('ps-email').textContent=user.email;
  loadUserProjects(user);
}

function loadUserProjects(user){
  var psEl=document.getElementById('ps-projects');
  psEl.innerHTML='<div class="loading"><div class="spinner"></div>Cargando proyectos...</div>';

  // Admin ve todos los proyectos; otros solo los que son miembros
  var query=user.role==='admin'
    ?sbGet('projects','?is_active=eq.true&order=created_at.desc')
    :sbGet('project_members','?user_id=eq.'+user.id+'&select=project_id,projects(*)').then(function(r){
        return r.map(function(m){return m.projects;}).filter(function(p){return p&&p.is_active;});
      });

  query.then(function(projects){
    if(!projects||!projects.length){
      psEl.innerHTML='<div style="text-align:center;padding:24px;color:rgba(255,255,255,.4)">No tienes proyectos asignados.<br>Contacta al administrador.</div>';
      return;
    }
    var html=projects.map(function(p){
      return '<div class="proj-item" data-pid="'+p.id+'" style="cursor:pointer">'+
        '<div class="proj-item-icon"><svg viewBox="0 0 24 24" fill="white" width="20" height="20"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>'+
        '<div style="min-width:0;flex:1">'+
        '<div class="proj-item-code">'+p.code+'</div>'+
        '<div class="proj-item-name">'+p.name+'</div>'+
        '<div class="proj-item-meta">'+(p.client||'')+(p.phase?' &middot; '+p.phase:'')+'</div>'+
        '</div>'+
        '<div class="proj-item-arrow">&#8250;</div></div>';
    }).join('');
    if(user.role==='admin'){
      html+='<button class="proj-new-btn" id="ps-new-proj-btn">'+
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'+
        'Nuevo proyecto</button>';
    }
    psEl.innerHTML=html;
    // Attach click events after DOM is ready
    psEl.querySelectorAll('.proj-item[data-pid]').forEach(function(el){
      el.addEventListener('click',function(){
        selectProject(el.dataset.pid);
      });
    });
    // Also attach new project button if present
    var newBtn=psEl.querySelector('.proj-new-btn');
    if(newBtn)newBtn.onclick=openNewProjectModal;
  }).catch(function(e){
    psEl.innerHTML='<div style="color:#fca5a5;font-size:12px;padding:12px">Error: '+e.message+'</div>';
  });
}

function selectProject(projectId){
  var psEl=document.getElementById('ps-projects');
  psEl.innerHTML='<div class="loading"><div class="spinner"></div>Cargando proyecto...</div>';
  sbGet('projects','?id=eq.'+projectId+'&limit=1')
    .then(function(ps){
      APP.project=ps[0]||null;
      var p2=APP.project?sbGet('field_schemas','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=field_order.asc,code_order.asc'):Promise.resolve([]);
      var p3=APP.project?sbGet('packages','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc'):Promise.resolve([]);
      return Promise.all([p2,sbGet('users','?select=*&order=full_name.asc'),p3]);
    })
    .then(function(r){
      APP.schemas=r[0];APP.users=r[1];APP.packages=r[2];
      // Save project selection
      try{
        var s=JSON.parse(localStorage.getItem('midp_session')||'{}');
        s.projectId=APP.project.id;
        localStorage.setItem('midp_session',JSON.stringify(s));
      }catch(e){}
      showApp(APP.user);
    })
    .catch(function(e){
      psEl.innerHTML='<div style="color:#fca5a5;font-size:12px;padding:12px">Error al cargar proyecto: '+e.message+'</div>';
    });
}

function goToProjectSelector(){
  document.getElementById('app').style.display='none';
  document.getElementById('project-selector').style.display='flex';
  loadUserProjects(APP.user);
}

function showApp(user){
  document.getElementById('login-page').style.display='none';
  document.getElementById('project-selector').style.display='none';
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
  var isAdmin=user.role==='admin';
  var pkgBtn=document.getElementById('sb-packages');if(pkgBtn)pkgBtn.style.display=isAdmin?'flex':'none';
  var usrBtn=document.getElementById('sb-users');if(usrBtn)usrBtn.style.display=isAdmin?'flex':'none';
  var prjBtn=document.getElementById('sb-projects');if(prjBtn)prjBtn.style.display=isAdmin?'flex':'none';
  nav('deliverables',document.querySelector('.sb-item'));
}

function doLogout(){
  APP.user=null;APP.project=null;APP.schemas=[];APP.packages=[];APP.fieldFilters={};
  try{localStorage.removeItem('midp_session');}catch(e){}
  document.getElementById('app').style.display='none';
  document.getElementById('project-selector').style.display='none';
  document.getElementById('login-page').style.display='flex';
  document.getElementById('login-email').value='';
  document.getElementById('login-pass').value='';
}

function restoreSession(userId,projectId){
  sbGet('users','?id=eq.'+userId+'&is_active=eq.true&select=*')
    .then(function(users){
      if(!users||!users.length){localStorage.removeItem('midp_session');return;}
      APP.user=users[0];
      if(projectId){
        selectProject(projectId);
      }else{
        showProjectSelector(APP.user);
      }
    }).catch(function(){localStorage.removeItem('midp_session');});
}

// New project modal
function openNewProjectModal(){
  var overlay=document.createElement('div');
  overlay.className='modal-overlay';overlay.id='new-proj-modal';
  overlay.innerHTML=
    '<div class="modal"><div class="modal-header">'+
    '<div class="modal-title">Nuevo proyecto</div>'+
    '<button class="btn btn-ghost btn-sm" id="np-close">X</button></div>'+
    '<div class="modal-body"><div class="form-grid">'+
    '<div class="form-group"><label class="label">Codigo *</label>'+
    '<input type="text" class="input" id="np-code" placeholder="Ej: HRDTRU-2025" style="font-family:monospace"></div>'+
    '<div class="form-group"><label class="label">Nombre *</label>'+
    '<input type="text" class="input" id="np-name" placeholder="Nombre del proyecto"></div>'+
    '<div class="form-group full"><label class="label">Descripcion</label>'+
    '<textarea class="input" id="np-desc" rows="2" placeholder="Descripcion del proyecto"></textarea></div>'+
    '<div class="form-group"><label class="label">Cliente</label>'+
    '<input type="text" class="input" id="np-client" placeholder="Ej: PRONIS"></div>'+
    '<div class="form-group"><label class="label">Ubicacion</label>'+
    '<input type="text" class="input" id="np-location" placeholder="Ej: Trujillo, La Libertad"></div>'+
    '<div class="form-group"><label class="label">Fase</label>'+
    '<input type="text" class="input" id="np-phase" placeholder="Ej: RIBA 2/3/4"></div>'+
    '</div></div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="np-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="np-save">Crear proyecto</button>'+
    '</div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('np-close').onclick=function(){overlay.remove();};
  document.getElementById('np-cancel').onclick=function(){overlay.remove();};
  document.getElementById('np-save').onclick=function(){saveNewProject();};
}

function saveNewProject(){
  var code=document.getElementById('np-code').value.trim().toUpperCase();
  var name=document.getElementById('np-name').value.trim();
  if(!code||!name){toast('Codigo y nombre son obligatorios.','error');return;}
  var btn=document.getElementById('np-save');
  btn.disabled=true;btn.textContent='Creando...';
  sbPost('projects',{
    code:code,name:name,
    description:document.getElementById('np-desc').value||null,
    client:document.getElementById('np-client').value||null,
    location:document.getElementById('np-location').value||null,
    phase:document.getElementById('np-phase').value||null,
    is_active:true,created_by:APP.user.id
  }).then(function(rows){
    var proj=rows[0];
    // Add admin as member
    return sbPost('project_members',{project_id:proj.id,user_id:APP.user.id,role:'admin'})
      .then(function(){
        toast('Proyecto creado.');
        document.getElementById('new-proj-modal').remove();
        loadUserProjects(APP.user);
      });
  }).catch(function(e){toast(e.message,'error');btn.disabled=false;btn.textContent='Crear proyecto';});
}

document.addEventListener('DOMContentLoaded',function(){
  var lp=document.getElementById('login-pass');
  if(lp)lp.addEventListener('keydown',function(e){if(e.key==='Enter')handleLogin();});
  try{
    var saved=localStorage.getItem('midp_session');
    if(saved){
      var session=JSON.parse(saved);
      if(session.userId&&(Date.now()-session.savedAt)<8*60*60*1000){
        restoreSession(session.userId,session.projectId||null);return;
      }else{localStorage.removeItem('midp_session');}
    }
  }catch(e){}
});


// ── NAV ──
var BREAD={deliverables:'Entregables MIDP',packages:'Paquetes de trabajo',progress:'Control de avance',schemas:'Config. de campos',users:'Usuarios y permisos',projects:'Proyectos'};
function nav(view,el){
  document.querySelectorAll('.sb-item').forEach(function(i){i.classList.remove('active');});
  if(el)el.classList.add('active');
  document.getElementById('bread-title').textContent=BREAD[view]||view;
  ({deliverables:renderDeliverables,packages:renderPackages,progress:renderProgress,schemas:renderSchemas,users:renderUsers,projects:renderProjects})[view]&&
  ({deliverables:renderDeliverables,packages:renderPackages,progress:renderProgress,schemas:renderSchemas,users:renderUsers,projects:renderProjects})[view]();
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
    '<div style="position:relative;max-width:180px">'+
    '<input class="input" style="padding-left:30px" placeholder="Buscar codigo..." oninput="APP.search=this.value;loadDeliverables()">'+
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>'+
    '<select class="input" style="width:115px;font-size:11px" onchange="APP.statusFilter=this.value;loadDeliverables()">'+
    '<option value="">Todos estados</option>'+
    Object.entries(STATUS_CFG).map(function(e){return '<option value="'+e[0]+'">'+e[1].label+'</option>';}).join('')+
    '</select>'+schemaFilters+
    '<select class="input" style="width:120px;font-size:11px" onchange="APP.packageFilter=this.value;loadDeliverables()">'+
    '<option value="">Paquete</option>'+
    APP.packages.map(function(p){return '<option value="'+p.code+'"'+(APP.packageFilter===p.code?' selected':'')+'>'+p.code+' - '+p.name+'</option>';}).join('')+
    '</select>'+
    '<button class="btn btn-sm" onclick="clearFilters()">x Limpiar</button>'+
    '<button class="btn btn-sm" onclick="loadDeliverables()">&#8635;</button></div>'+
    '<div id="del-table">'+loading()+'</div>';
  loadDeliverables();
}

function setFieldFilter(key,val){APP.fieldFilters[key]=val;loadDeliverables();}
function clearFilters(){APP.fieldFilters={};APP.search='';APP.statusFilter='';APP.packageFilter='';renderDeliverables();}

function loadDeliverables(){
  if(!APP.project)return;
  var params='?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=created_at.desc';
  if(APP.statusFilter)params+='&status=eq.'+APP.statusFilter;
  if(APP.search)params+='&or=(code.ilike.*'+APP.search+'*,name.ilike.*'+APP.search+'*)';
  Object.keys(APP.fieldFilters).forEach(function(k){
    var v=APP.fieldFilters[k];
    if(v)params+='&field_values->>'+k+'=eq.'+encodeURIComponent(v);
  });
  if(APP.packageFilter)params+='&work_package=eq.'+encodeURIComponent(APP.packageFilter);

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

    // Sticky col widths
    var W={code:170,name:160,status:105,general:90,lod:48,loi:44,fecha:80,acc:56};
    var stickyLeft2=W.code; // where Name starts

    // Calcular min-width de la tabla basado en columnas
    var minW = W.code + W.name + W.status +
      (visGeneral.length * W.general) +
      getPhaseGroups().reduce(function(acc,ph){
        var vis=visiblePhaseSchemas(ph.key);
        vis.forEach(function(s){
          acc+=(s.field_type==='date'?W.fecha:(s.key.indexOf('_lod')>=0||s.key.indexOf('_loi')>=0?W.lod:W.general));
        });
        return acc;
      },0) +
      (canEdit||canDel?W.acc:0);

    var html=
      '<div class="midp-outer">'+
      '<div class="midp-scroll">'+
      '<table class="midp-tbl" style="min-width:'+minW+'px"><thead><tr>'+
      // Sticky col 1: Codigo
      '<th class="scol" style="left:0;min-width:'+W.code+'px;max-width:'+W.code+'px;z-index:4">Codigo</th>'+
      // Sticky col 2: Nombre
      '<th class="scol" style="left:'+stickyLeft2+'px;min-width:'+W.name+'px;max-width:'+W.name+'px;z-index:4">Nombre</th>'+
      '<th style="min-width:'+W.status+'px">Estado</th>'+
      visGeneral.map(function(s){
        return '<th style="min-width:'+W.general+'px;white-space:nowrap;font-size:9px">'+s.name+'</th>';
      }).join('')+
      getPhaseGroups().map(function(ph){
        var vis=visiblePhaseSchemas(ph.key);
        if(!vis.length)return '';
        return '<th colspan="'+vis.length+'" style="text-align:center;background:'+ph.color+'15;color:'+ph.color+';border-left:2px solid '+ph.color+'50;font-size:10px;white-space:nowrap">'+
          ph.label+(ph.sub?' · '+ph.sub:'')+'</th>';
      }).join('')+
      (canEdit||canDel?'<th style="min-width:'+W.acc+'px">Acc.</th>':'')+
      '</tr><tr>'+
      '<th class="scol" style="left:0;background:var(--bg);z-index:4"></th>'+
      '<th class="scol" style="left:'+stickyLeft2+'px;background:var(--bg);z-index:4"></th>'+
      '<th style="background:var(--bg)"></th>'+
      visGeneral.map(function(){return '<th style="background:var(--bg)"></th>';}).join('')+
      getPhaseGroups().map(function(ph){
        var vis=visiblePhaseSchemas(ph.key);
        if(!vis.length)return '';
        return vis.map(function(s,i){
          var shortName=s.name.replace(ph.label+' - ','').replace(ph.label+'-','');
          var minW=s.field_type==='date'?W.fecha:(shortName.length<=3?W.lod:W.general);
          return '<th style="font-size:9px;background:'+ph.color+'10;min-width:'+minW+'px;'+(i===0?'border-left:2px solid '+ph.color+'40':'')+'white-space:nowrap">'+shortName+'</th>';
        }).join('');
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

        var phaseCells=getPhaseGroups().map(function(ph){
          var vis=visiblePhaseSchemas(ph.key);
          if(!vis.length)return '';
          return vis.map(function(s,i){
            var val=d[s.key]||'';
            var isDate=s.field_type==='date';
            var isOverdue=isDate&&val&&new Date(val)<new Date()&&d.status!=='approved'&&d.status!=='issued';
            var display=isDate?fmtDateShort(val):(val||'--');
            var style='font-size:10px;white-space:nowrap;'+(i===0?'border-left:2px solid '+ph.color+'30;':'');
            if(isOverdue)style+='color:var(--red);font-weight:600;';
            else if(isDate)style+='color:var(--text3);';
            else if(s.key.indexOf('_lod')>=0||s.key.indexOf('_loi')>=0)style+='text-align:center;font-weight:700;color:'+ph.color+';';
            return '<td style="'+style+'">'+display+(isOverdue?' ⚠':'')+'</td>';
          }).join('');
        }).join('');

        return '<tr>'+
          '<td class="scol" style="left:0;background:var(--surface)">'+
          '<span class="code-chip" style="font-size:8px;display:inline-block;word-break:break-all;white-space:normal;line-height:1.4;max-width:155px">'+d.code+'</span>'+
          (d.work_package?'<div style="font-size:9px;color:var(--text3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:155px">'+d.work_package+'</div>':'')+
          '</td>'+
          '<td class="scol" style="left:'+stickyLeft2+'px;background:var(--surface)">'+
          '<div style="font-weight:600;color:var(--text);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:155px" title="'+d.name+'">'+d.name+'</div>'+
          (d.description?'<div style="font-size:9px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:155px">'+d.description+'</div>':'')+
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
      '</div>'+ // close midp-scroll
      '<div style="padding:8px 14px;background:var(--bg);font-size:10px;color:var(--text3);border-top:1px solid var(--border2);border-radius:0 0 var(--rl) var(--rl)">'+
      items.length+' entregable(s) mostrado(s) de '+total+' totales</div></div>';
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
  // Cargar entregables tipo MOD para doc_assoc
  var getD=id?sbGet('deliverables','?id=eq.'+id+'&limit=1').then(function(r){return r[0];}):Promise.resolve(null);
  var getMods=sbGet('deliverables',
    '?project_id=eq.'+APP.project.id+
    '&is_active=eq.true'+
    '&field_values->>tipo_documento=eq.MOD'+
    '&select=id,code,name&order=code.asc'
  ).catch(function(){return [];});
  Promise.all([getD,getMods]).then(function(res){
  var d=res[0];
  window._modDels=res[1];
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
      var colMap={
        nombre:'name',titulo:'name',title:'name',
        descripcion:'description',description:'description',
        paquete:'work_package',
        formato:'file_format',
        tamano_lamina:'sheet_size',
        escala:'scale',
        estado:'status',
        responsable:'assigned_to',
        predecesores:'predecessors'
      };
      var col=colMap[s.key];
      var val=d&&col?d[col]||'':'';

      if(s.key==='paquete'){
        return '<div class="form-group"><label class="label">'+s.name+'</label>'+
          '<select class="input" id="gen_paquete">'+
          '<option value="">Sin paquete</option>'+
          APP.packages.map(function(p){return '<option value="'+p.code+'"'+(d&&d.work_package===p.code?' selected':'')+'>'+p.code+' - '+p.name+'</option>';}).join('')+
          '</select></div>';
      }
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

    // Si no hay campos en general, mostrar campo de nombre minimo
    var hasNameField=generalSchemas().some(function(s){
      return ['nombre','titulo','title','name','contenedor'].indexOf(s.key)>=0;
    });
    if(!hasNameField){
      var existingVal=d?d.name||'':'';
      generalInputs='<div class="form-group full">'+
        '<label class="label">Nombre del entregable *</label>'+
        '<input type="text" class="input" id="gen_nombre" value="'+existingVal+'" placeholder="Nombre descriptivo del entregable">'+
        '</div>'+generalInputs;
    }

    // Seccion 3: Fases RIBA — dinamicas
    var phaseBlocks=getPhaseGroups().map(function(ph){
      var fields=phaseSchemas(ph.key);
      if(!fields.length)return '';
      var inputs=fields.map(function(s){
        var val=d&&d[s.key]||'';
        var isFull=s.key===ph.key+'_doc_assoc';
        var inp='';
        if(s.key.indexOf('_doc_assoc')>=0){
          // Doc. asociada = dropdown de entregables tipo MOD (Modelo)
          inp='<select class="input" id="ph_'+s.key+'">'+
            '<option value="">Sin documento asociado</option>'+
            (window._modDels||[]).map(function(m){return '<option value="'+m.code+'"'+(val===m.code?' selected':'')+'>'+m.code+' - '+m.name+'</option>';}).join('')+
            '</select>';
        }else if(s.field_type==='dropdown'&&s.options){
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
  }); // cierre Promise.all([getD,getMods])
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

  // Leer nombre del entregable — el campo que mapea a la columna 'name' en BD
  // Leer nombre del entregable de cualquier fuente disponible
  var nameVal='';
  // 1. Buscar en campos generales (gen_*) por keys de nombre conocidas
  var NAME_KEYS=['nombre','titulo','title','name','contenedor','titulo1'];
  for(var ni=0;ni<NAME_KEYS.length;ni++){
    var el_n=document.getElementById('gen_'+NAME_KEYS[ni]);
    if(el_n&&el_n.value.trim()){nameVal=el_n.value.trim();break;}
  }
  // 2. Buscar en CUALQUIER input gen_ que no sea select ni estado
  if(!nameVal){
    document.querySelectorAll('[id^="gen_"]').forEach(function(el){
      if(!nameVal&&el.tagName!=='SELECT'&&el.id!=='gen_estado'&&el.value.trim())
        nameVal=el.value.trim();
    });
  }
  // 3. Buscar en campos de codificacion (schema-field) — si todo falla usar el codigo
  if(!nameVal){
    document.querySelectorAll('.schema-field').forEach(function(el){
      if(!nameVal&&el.value.trim())nameVal=el.value.trim();
    });
  }
  // 4. Ultimo recurso: usar el codigo generado
  if(!nameVal) nameVal=code;
  var name=nameVal;

  btn.disabled=true;btn.textContent='Guardando...';
  var dupQ='?project_id=eq.'+APP.project.id+'&code=eq.'+encodeURIComponent(code)+'&is_active=eq.true';
  if(id)dupQ+='&id=neq.'+id;

  sbGet('deliverables',dupQ).then(function(dup){
    if(dup.length>0){toast('Codigo duplicado.','error');btn.disabled=false;btn.textContent=id?'Actualizar':'Crear entregable';return;}

    function gv(key){var el=document.getElementById('gen_'+key);return el?el.value||null:null;}

    // Smart gv — try by key and also by colMap reverse lookup
    function gvSmart(targetCol){
      // Try known keys first
      var KNOWN={description:['descripcion','description'],work_package:['paquete','work_package'],
        file_format:['formato','file_format'],sheet_size:['tamano_lamina','sheet_size'],
        scale:['escala','scale'],status:['estado','status'],assigned_to:['responsable','assigned_to'],
        predecessors:['predecesores','predecessors']};
      var keys=KNOWN[targetCol]||[targetCol];
      for(var ki=0;ki<keys.length;ki++){var e=document.getElementById('gen_'+keys[ki]);if(e&&e.value)return e.value;}
      // Fallback: find schema that maps to this column
      var colMap={nombre:'name',titulo:'name',title:'name',
        descripcion:'description',description:'description',paquete:'work_package',
        formato:'file_format',tamano_lamina:'sheet_size',escala:'scale',
        estado:'status',responsable:'assigned_to',predecesores:'predecessors'};
      var matchKey=Object.keys(colMap).find(function(k){return colMap[k]===targetCol;});
      if(matchKey){var e2=document.getElementById('gen_'+matchKey);if(e2&&e2.value)return e2.value;}
      return null;
    }
    var payload={
      project_id:APP.project.id,code:code,name:name,field_values:fields,created_by:APP.user.id,
      description:gvSmart('description'),
      work_package:gvSmart('work_package'),
      file_format:gvSmart('file_format'),
      sheet_size:gvSmart('sheet_size'),
      scale:gvSmart('scale'),
      status:gvSmart('status')||'pending',
      assigned_to:gvSmart('assigned_to'),
      predecessors:gvSmart('predecessors')
    };

    // Campos de fase — leer todos los schemas de fase
    getPhaseGroups().forEach(function(ph){
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

  // Estructura fija: filtros arriba, contenido abajo
  document.getElementById('content').innerHTML=
    '<div class="page-header"><div><h1 class="page-title">Control de avance</h1>'+
    '<p class="page-sub">'+(APP.project?APP.project.name:'')+'</p></div></div>'+
    // Filtros — siempre visibles
    '<div class="card" style="padding:14px 16px;margin-bottom:16px">'+
    '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Filtros</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'+
    '<div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Disciplina</label>'+
    '<select class="input" style="width:130px;font-size:11px" id="pf-disc" onchange="applyProgressFilters()">'+
    '<option value="">Todas</option></select></div>'+
    '<div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Paquete</label>'+
    '<select class="input" style="width:140px;font-size:11px" id="pf-pkg" onchange="applyProgressFilters()">'+
    '<option value="">Todos</option>'+
    APP.packages.map(function(p){return '<option value="'+p.code+'">'+p.code+' - '+p.name+'</option>';}).join('')+
    '</select></div>'+
    '<div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Fase RIBA</label>'+
    '<select class="input" style="width:160px;font-size:11px" id="pf-phase" onchange="applyProgressFilters()">'+
    '<option value="">Todas las fases</option>'+
    '<option value="riba2">RIBA 2 - Presentacion 0</option>'+
    '<option value="riba3">RIBA 3 - Presentacion 1</option>'+
    '<option value="riba4">RIBA 4 - Presentacion 2</option>'+
    '</select></div>'+
    '<div style="padding-top:16px">'+
    '<button class="btn btn-sm" onclick="clearProgressFilters()">x Limpiar</button></div>'+
    '</div></div>'+
    // Contenido dinamico
    '<div id="progress-content">'+loading()+'</div>';

  // Cargar datos
  window._progressAllDels=null;window._progressProd=null;
  Promise.all([
    sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc'),
    sbGet('production_units','?select=*').catch(function(){return[];})
  ]).then(function(res){
    window._progressAllDels=res[0];
    window._progressProd=res[1];
    // Poblar disciplinas
    var discs=[];
    res[0].forEach(function(d){
      var disc=(d.field_values&&d.field_values.disciplina)||'';
      if(disc&&discs.indexOf(disc)<0)discs.push(disc);
    });
    discs.sort();
    var discSel=document.getElementById('pf-disc');
    if(discSel){
      discSel.innerHTML='<option value="">Todas</option>';
      discs.forEach(function(d){
        var o=document.createElement('option');
        o.value=d;o.textContent=d;
        discSel.appendChild(o);
      });
    }
    applyProgressFilters();
  }).catch(function(e){
    var pce=document.getElementById('progress-content');
    if(pce)pce.innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';
  });
}

function clearProgressFilters(){
  var d=document.getElementById('pf-disc');if(d)d.value='';
  var p=document.getElementById('pf-pkg');if(p)p.value='';
  var ph=document.getElementById('pf-phase');if(ph)ph.value='';
  applyProgressFilters();
}

function applyProgressFilters(){
  var disc=document.getElementById('pf-disc')?document.getElementById('pf-disc').value:'';
  var pkg=document.getElementById('pf-pkg')?document.getElementById('pf-pkg').value:'';
  var phase=document.getElementById('pf-phase')?document.getElementById('pf-phase').value:'';
  var allDels=window._progressAllDels;
  if(!allDels){return;}
  var deliverables=allDels.filter(function(d){
    if(disc&&(d.field_values&&d.field_values.disciplina)!==disc)return false;
    if(pkg&&d.work_package!==pkg)return false;
    if(phase&&!d[phase+'_delivery_date'])return false;
    return true;
  });
  var pce=document.getElementById('progress-content');
  if(!pce)return;
  renderProgressContent(deliverables,window._progressProd||[]);
}

function renderProgressContent(deliverables,prod){
  var el=document.getElementById('progress-content');
  if(!el)return;
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

    var phaseStats=getPhaseGroups().map(function(ph){
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
      getPhaseGroups().map(function(ph){return '<th style="color:'+ph.color+';font-size:9px">'+ph.label+' Fecha</th>';}).join('')+
      '<th>Estado</th>'+(canProg?'<th>Registrar</th>':'')+
      '</tr></thead><tbody>'+
      deliverables.map(function(d){
        var p=prodMap[d.id]||{plan:0,cons:0};
        var pct=p.plan>0?Math.round(p.cons/p.plan*100):0;
        var today=new Date();
        var phaseDates=getPhaseGroups().map(function(ph){
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
  el.innerHTML=html;
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
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-sm btn-primary" onclick="openNewHitoModal()">+ Nuevo hito</button>';
  document.getElementById('content').innerHTML=loading();

  sbGet('field_schemas','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=field_order.asc,code_order.asc').then(function(schemas){
    APP.schemas=schemas;

    // Fixed groups
    var fixedGroups=[
      {id:'code',   label:'Codificacion',        color:'var(--brand)', desc:'Campos que forman el codigo del entregable', fixed:false},
      {id:'general',label:'Informacion general', color:'var(--slate)', desc:'Metadata del contenedor de informacion',     fixed:false}
    ];

    // Dynamic milestone groups — discover from schemas
    var hitoIds=[];
    schemas.forEach(function(s){
      var g=s.field_group;
      if(g&&g!=='code'&&g!=='general'&&hitoIds.indexOf(g)<0)hitoIds.push(g);
    });
    // Sort hitos: riba2 < riba3 < riba4 < custom
    hitoIds.sort(function(a,b){
      var order={riba2:1,riba3:2,riba4:3};
      return (order[a]||99)-(order[b]||99);
    });

    var HITO_COLORS=['#06b6d4','#3b82f6','#8b5cf6','#f59e0b','#10b981','#f43f5e','#6366f1'];
    var hitoGroups=hitoIds.map(function(id,i){
      // Try to get label from schema description or use id
      var sample=schemas.find(function(s){return s.field_group===id;});
      var label=sample&&sample.description&&sample.description.indexOf('hito:')===0
        ?sample.description.replace('hito:','').trim()
        :id.replace('riba2','RIBA 2 - Presentacion 0')
           .replace('riba3','RIBA 3 - Presentacion 1')
           .replace('riba4','RIBA 4 - Presentacion 2')
           .replace(/_/g,' ').replace(/\w/g,function(c){return c.toUpperCase();});
      return {id:id,label:label,color:HITO_COLORS[i%HITO_COLORS.length],desc:'Campos del hito '+label,fixed:false};
    });

    var allGroups=fixedGroups.concat(hitoGroups);

    function renderSchemaItem(s,g){
      var isCode=g.id==='code';
      var el=document.createElement('div');
      el.className='schema-item';
      el.style.marginBottom='5px';
      el.innerHTML=
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
        (!isCode?
          '<div style="display:flex;align-items:center;gap:6px;margin-right:8px">'+
          '<span style="font-size:10px;color:var(--text3)">Visible</span>'+
          '<label class="toggle"><input type="checkbox"'+(s.is_visible?' checked':'')+' data-schema-id="'+s.id+'"><span class="toggle-slider"></span></label>'+
          '</div>':'')+ 
        '<div style="display:flex;gap:4px">'+
        '<button class="btn btn-ghost btn-sm" data-edit-schema="'+s.id+'" data-group="'+g.id+'">'+
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
        (!isCode?'<button class="btn btn-ghost btn-sm" style="color:var(--red)" data-del-schema="'+s.id+'" data-schema-name="'+s.name+'">'+
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>':'')+
        '</div>';
      return el;
    }

    var container=document.createElement('div');
    container.innerHTML='<div class="page-header"><div><h1 class="page-title">Config. de campos</h1>'+
      '<p class="page-sub">Codificacion, metadata e hitos del proyecto · '+APP.project.code+'</p></div></div>';

    allGroups.forEach(function(g){
      var fields=schemas.filter(function(s){return s.field_group===g.id;})
        .sort(function(a,b){return g.id==='code'?(a.code_order-b.code_order):(a.field_order-b.field_order);});

      var section=document.createElement('div');
      section.style.marginBottom='20px';

      // Header
      var header=document.createElement('div');
      header.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:8px';
      header.innerHTML=
        '<div>'+
        '<div style="font-size:12px;font-weight:700;color:'+g.color+'">'+g.label+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+g.desc+'</div></div>';

      // Buttons for non-fixed groups
      if(!g.fixed){
        var btnWrap=document.createElement('div');
        btnWrap.style.cssText='display:flex;gap:6px;align-items:center';
        var addBtn=document.createElement('button');
        addBtn.className='btn btn-sm btn-primary';
        addBtn.textContent='+ Agregar campo';
        addBtn.onclick=(function(gid){return function(){openSchemaModal(null,gid);};})(g.id);
        btnWrap.appendChild(addBtn);
        // Allow rename/delete hito for non-standard groups
        if(g.id!=='general'&&g.id!=='riba2'&&g.id!=='riba3'&&g.id!=='riba4'){
          var renameBtn=document.createElement('button');
          renameBtn.className='btn btn-sm';
          renameBtn.textContent='Renombrar';
          renameBtn.onclick=(function(gid,glabel){return function(){openRenameHitoModal(gid,glabel);};})(g.id,g.label);
          btnWrap.appendChild(renameBtn);
        }
        header.appendChild(btnWrap);
      }
      section.appendChild(header);

      if(!fields.length){
        var empty=document.createElement('div');
        empty.style.cssText='padding:12px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--r);font-size:12px;color:var(--text3)';
        empty.textContent='Sin campos configurados. Agrega el primero con "+ Agregar campo".';
        section.appendChild(empty);
      }else{
        fields.forEach(function(s){section.appendChild(renderSchemaItem(s,g));});
      }
      container.appendChild(section);
    });

    // Add "+ Nuevo hito" teaser at bottom if no custom hitos
    if(hitoGroups.length===0){
      var hint=document.createElement('div');
      hint.style.cssText='padding:14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--rl);font-size:12px;color:var(--text3);text-align:center';
      hint.innerHTML='No hay hitos configurados. Usa <strong>+ Nuevo hito</strong> en la barra superior para agregar (Ej: RIBA 2, RIBA 3, Construccion...).';
      container.appendChild(hint);
    }

    var el=document.getElementById('content');
    el.innerHTML='';
    el.appendChild(container);

    // Attach events via DOM (avoid inline onclick issues)
    el.querySelectorAll('[data-edit-schema]').forEach(function(btn){
      btn.onclick=function(){openSchemaModal(btn.dataset.editSchema,btn.dataset.group);};
    });
    el.querySelectorAll('[data-del-schema]').forEach(function(btn){
      btn.onclick=function(){confirmDeleteSchema(btn.dataset.delSchema,btn.dataset.schemaName);};
    });
    el.querySelectorAll('input[data-schema-id]').forEach(function(inp){
      inp.onchange=function(){toggleVisible(inp.dataset.schemaId,inp.checked);};
    });

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

  var baseKey=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  // Build unique key: hito fields get group prefix; if key exists, add numeric suffix
  var key=baseKey;
  if(!id){
    if(grp!=='code'&&grp!=='general') key=grp+'_'+baseKey;
    // Ensure uniqueness within this project's schemas
    var existing=APP.schemas.filter(function(s){return s.key===key;});
    if(existing.length>0) key=key+'_'+Date.now().toString().slice(-4);
  }
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

// ── PAQUETES ──
function renderPackages(){
  document.getElementById('topbar-actions').innerHTML='<button class="btn btn-primary btn-sm" onclick="openPackageModal(null)">+ Nuevo paquete</button>';
  document.getElementById('content').innerHTML='<div class="page-header"><div><h1 class="page-title">Paquetes de trabajo</h1><p class="page-sub">'+(APP.project?APP.project.name:'')+'</p></div></div><div id="pkg-list">'+loading()+'</div>';
  loadPackages();
}

function loadPackages(){
  sbGet('packages','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc')
    .then(function(pkgs){
      APP.packages=pkgs;
      var el=document.getElementById('pkg-list');
      if(!el)return;
      if(!pkgs.length){
        el.innerHTML='<div class="card"><div class="empty"><div class="empty-title">Sin paquetes</div><div class="empty-desc">Crea el primero con + Nuevo paquete.</div></div></div>';
        return;
      }
      var rows=pkgs.map(function(p){
        var tr=document.createElement('tr');
        tr.innerHTML=
          '<td><span class="code-chip">'+p.code+'</span></td>'+
          '<td style="font-weight:600;color:var(--text)">'+p.name+'</td>'+
          '<td style="font-size:11px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(p.description||'--')+'</td>'+
          '<td>'+(p.discipline?'<span class="badge b-progress">'+p.discipline+'</span>':'--')+'</td>'+
          '<td style="font-size:11px">'+(p.responsible||'--')+'</td>'+
          '<td style="font-size:11px">'+(p.start_date?new Date(p.start_date).toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'}):'--')+'</td>'+
          '<td style="font-size:11px">'+(p.end_date?new Date(p.end_date).toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'}):'--')+'</td>'+
          '<td></td>';
        // Build action buttons safely
        var btnEdit=document.createElement('button');
        btnEdit.className='btn btn-ghost btn-sm';
        btnEdit.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        btnEdit.onclick=(function(pid){return function(){openPackageModal(pid);};})(p.id);
        var btnDel=document.createElement('button');
        btnDel.className='btn btn-ghost btn-sm';
        btnDel.style.color='var(--red)';
        btnDel.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
        btnDel.onclick=(function(pid,pname){return function(){confirmDeletePackage(pid,pname);};})(p.id,p.name);
        var wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:4px;justify-content:flex-end';
        wrap.appendChild(btnEdit);wrap.appendChild(btnDel);
        tr.lastElementChild.appendChild(wrap);
        return tr.outerHTML;
      }).join('');
      el.innerHTML='<div class="card" style="overflow:hidden"><table class="tbl"><thead><tr>'+
        '<th>Codigo</th><th>Nombre</th><th>Descripcion</th><th>Disciplina</th>'+
        '<th>Responsable</th><th>Inicio</th><th>Fin</th><th style="text-align:right">Acciones</th>'+
        '</tr></thead><tbody>'+rows+'</tbody></table></div>';
    }).catch(function(e){
      var el=document.getElementById('pkg-list');
      if(el)el.innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';
    });
}

function openPackageModal(pid){
  var p=pid?APP.packages.find(function(x){return x.id===pid;}):null;
  var discSchema=codeSchemas().find(function(s){return s.key==='disciplina';});
  var discOpts='<option value="">Sin disciplina</option>';
  if(discSchema&&discSchema.allowed_values){
    discOpts+=discSchema.allowed_values.map(function(v){
      return '<option value="'+v.value+'"'+(p&&p.discipline===v.value?' selected':'')+'>'+v.value+' - '+v.label+'</option>';
    }).join('');
  }
  var overlay=document.createElement('div');
  overlay.id='pkg-modal';
  overlay.className='modal-overlay';
  overlay.innerHTML=
    '<div class="modal"><div class="modal-header">'+
    '<div class="modal-title">'+(p?'Editar: '+p.name:'Nuevo paquete')+'</div>'+
    '<button class="btn btn-ghost btn-sm" id="pkg-close-btn">X</button></div>'+
    '<div class="modal-body"><div class="form-grid">'+
    '<div class="form-group"><label class="label">Codigo *</label>'+
    '<input type="text" class="input" id="pkg-code" value="'+(p?p.code:'')+'" placeholder="Ej: PKG-ARQ-01"'+(p?' disabled':'')+' style="font-family:monospace"></div>'+
    '<div class="form-group"><label class="label">Nombre *</label>'+
    '<input type="text" class="input" id="pkg-name" value="'+(p?p.name:'')+'" placeholder="Ej: Paquete Arquitectura"></div>'+
    '<div class="form-group full"><label class="label">Descripcion</label>'+
    '<textarea class="input" id="pkg-desc" rows="2">'+(p?p.description||'':'')+'</textarea></div>'+
    '<div class="form-group"><label class="label">Disciplina</label>'+
    '<select class="input" id="pkg-disc">'+discOpts+'</select></div>'+
    '<div class="form-group"><label class="label">Responsable</label>'+
    '<input type="text" class="input" id="pkg-resp" value="'+(p?p.responsible||'':'')+'"></div>'+
    '<div class="form-group"><label class="label">Fecha inicio</label>'+
    '<input type="date" class="input" id="pkg-start" value="'+(p?p.start_date||'':'')+'"></div>'+
    '<div class="form-group"><label class="label">Fecha fin</label>'+
    '<input type="date" class="input" id="pkg-end" value="'+(p?p.end_date||'':'')+'"></div>'+
    '</div></div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="pkg-cancel-btn">Cancelar</button>'+
    '<button class="btn btn-primary" id="pkg-save-btn">'+(p?'Actualizar paquete':'Crear paquete')+'</button>'+
    '</div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('pkg-close-btn').onclick=function(){closeModal('pkg-modal');};
  document.getElementById('pkg-cancel-btn').onclick=function(){closeModal('pkg-modal');};
  document.getElementById('pkg-save-btn').onclick=function(){savePackage(pid||null);};
}

function savePackage(pid){
  var btn=document.getElementById('pkg-save-btn');
  var code=document.getElementById('pkg-code').value.trim().toUpperCase();
  var name=document.getElementById('pkg-name').value.trim();
  if(!code||!name){toast('Codigo y nombre son obligatorios.','error');return;}
  btn.disabled=true;btn.textContent='Guardando...';
  var payload={
    project_id:APP.project.id,code:code,name:name,
    description:document.getElementById('pkg-desc').value||null,
    discipline:document.getElementById('pkg-disc').value||null,
    responsible:document.getElementById('pkg-resp').value||null,
    start_date:document.getElementById('pkg-start').value||null,
    end_date:document.getElementById('pkg-end').value||null
  };
  var req=pid?sbPatch('packages','id=eq.'+pid,payload):sbPost('packages',payload);
  req.then(function(){
    toast(pid?'Paquete actualizado.':'Paquete creado.');
    closeModal('pkg-modal');
    sbGet('packages','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc')
      .then(function(pkgs){APP.packages=pkgs;}).catch(function(){});
    loadPackages();
  }).catch(function(e){toast(e.message,'error');btn.disabled=false;btn.textContent=pid?'Actualizar':'Crear paquete';});
}

function confirmDeletePackage(pid,pname){
  var overlay=document.createElement('div');
  overlay.id='pkg-confirm';overlay.className='modal-overlay';
  overlay.innerHTML=
    '<div class="modal" style="max-width:380px">'+
    '<div class="modal-header"><div class="modal-title">Eliminar paquete?</div>'+
    '<button class="btn btn-ghost btn-sm" id="pkgc-close">X</button></div>'+
    '<div class="modal-body"><p style="font-size:13px;color:var(--text2)">Eliminar el paquete <strong>'+pname+'</strong>?</p>'+
    '<p style="font-size:11px;color:var(--text3);margin-top:6px">Los entregables asociados no se veran afectados.</p></div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="pkgc-cancel">Cancelar</button>'+
    '<button class="btn btn-danger" id="pkgc-del">Eliminar</button>'+
    '</div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('pkgc-close').onclick=function(){closeModal('pkg-confirm');};
  document.getElementById('pkgc-cancel').onclick=function(){closeModal('pkg-confirm');};
  document.getElementById('pkgc-del').onclick=function(){deletePackage(pid);};
}

function deletePackage(pid){
  sbPatch('packages','id=eq.'+pid,{is_active:false})
    .then(function(){closeModal('pkg-confirm');toast('Paquete eliminado.');loadPackages();})
    .catch(function(e){toast(e.message,'error');});
}

// ── PROJECTS (Admin) ──
function renderProjects(){
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-primary btn-sm" onclick="openNewProjectModal()">+ Nuevo proyecto</button>';
  document.getElementById('content').innerHTML=
    '<div class="page-header"><div><h1 class="page-title">Proyectos</h1>'+
    '<p class="page-sub">Gestion de proyectos de la organizacion</p></div></div>'+
    '<div id="proj-list">'+loading()+'</div>';
  sbGet('projects','?is_active=eq.true&order=created_at.desc')
    .then(function(projects){
      if(!projects.length){
        document.getElementById('proj-list').innerHTML=
          '<div class="card"><div class="empty"><div class="empty-title">Sin proyectos</div></div></div>';
        return;
      }
      // For each project get member count
      var memberCounts={};
      sbGet('project_members','?select=project_id').then(function(members){
        members.forEach(function(m){memberCounts[m.project_id]=(memberCounts[m.project_id]||0)+1;});
        var rows=projects.map(function(p){
          var isActive=p.id===APP.project.id;
          return '<tr>'+
            '<td><span class="code-chip">'+p.code+'</span>'+(isActive?'<span class="badge b-approved" style="font-size:9px;margin-left:6px">Activo</span>':'')+
            '</td><td style="font-weight:600;color:var(--text)">'+p.name+'</td>'+
            '<td style="font-size:11px">'+(p.client||'--')+'</td>'+
            '<td style="font-size:11px">'+(p.location||'--')+'</td>'+
            '<td style="font-size:11px">'+(p.phase||'--')+'</td>'+
            '<td style="text-align:center"><span class="badge b-progress">'+(memberCounts[p.id]||0)+' miembros</span></td>'+
            '<td><div style="display:flex;gap:4px;justify-content:flex-end">'+
            buildProjBtn('edit',p.id)+
            buildProjBtn('members',p.id)+
            buildProjBtn('switch',p.id)+
            '</div></td></tr>';
        }).join('');
        document.getElementById('proj-list').innerHTML=
          '<div class="card" style="overflow:hidden"><table class="tbl"><thead><tr>'+
          '<th>Codigo</th><th>Nombre</th><th>Cliente</th><th>Ubicacion</th><th>Fase</th><th>Miembros</th><th style="text-align:right">Acciones</th>'+
          '</tr></thead><tbody>'+rows+'</tbody></table></div>';
        // Attach event listeners via DOM
        document.querySelectorAll('[data-proj-action]').forEach(function(btn){
          btn.onclick=function(){
            var action=btn.dataset.projAction;
            var pid=btn.dataset.projId;
            if(action==='edit')openEditProjectModal(pid);
            else if(action==='members')openProjectMembersModal(pid);
            else if(action==='switch')selectProject(pid);
          };
        });
      });
    }).catch(function(e){
      document.getElementById('proj-list').innerHTML=
        '<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';
    });
}

function buildProjBtn(action,pid){
  var icons={
    edit:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    members:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    switch:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
  };
  var titles={edit:'Editar',members:'Miembros',switch:'Ir a proyecto'};
  return '<button class="btn btn-ghost btn-sm" data-proj-action="'+action+'" data-proj-id="'+pid+'" title="'+titles[action]+'">'+icons[action]+'</button>';
}

function openEditProjectModal(pid){
  var proj=null;
  sbGet('projects','?id=eq.'+pid+'&limit=1').then(function(r){
    proj=r[0];if(!proj)return;
    var overlay=document.createElement('div');
    overlay.className='modal-overlay';overlay.id='edit-proj-modal';
    overlay.innerHTML=
      '<div class="modal"><div class="modal-header">'+
      '<div class="modal-title">Editar proyecto</div>'+
      '<button class="btn btn-ghost btn-sm" id="ep-close">X</button></div>'+
      '<div class="modal-body"><div class="form-grid">'+
      '<div class="form-group"><label class="label">Codigo</label>'+
      '<input type="text" class="input" id="ep-code" value="'+proj.code+'" disabled style="font-family:monospace"></div>'+
      '<div class="form-group"><label class="label">Nombre *</label>'+
      '<input type="text" class="input" id="ep-name" value="'+proj.name+'"></div>'+
      '<div class="form-group full"><label class="label">Descripcion</label>'+
      '<textarea class="input" id="ep-desc" rows="2">'+(proj.description||'')+'</textarea></div>'+
      '<div class="form-group"><label class="label">Cliente</label>'+
      '<input type="text" class="input" id="ep-client" value="'+(proj.client||'')+'"></div>'+
      '<div class="form-group"><label class="label">Ubicacion</label>'+
      '<input type="text" class="input" id="ep-location" value="'+(proj.location||'')+'"></div>'+
      '<div class="form-group"><label class="label">Fase</label>'+
      '<input type="text" class="input" id="ep-phase" value="'+(proj.phase||'')+'"></div>'+
      '</div></div>'+
      '<div class="modal-footer">'+
      '<button class="btn" id="ep-cancel">Cancelar</button>'+
      '<button class="btn btn-primary" id="ep-save">Actualizar</button>'+
      '</div></div>';
    document.getElementById('modal-container').appendChild(overlay);
    document.getElementById('ep-close').onclick=function(){overlay.remove();};
    document.getElementById('ep-cancel').onclick=function(){overlay.remove();};
    document.getElementById('ep-save').onclick=function(){
      var name=document.getElementById('ep-name').value.trim();
      if(!name){toast('Nombre obligatorio.','error');return;}
      sbPatch('projects','id=eq.'+pid,{
        name:name,
        description:document.getElementById('ep-desc').value||null,
        client:document.getElementById('ep-client').value||null,
        location:document.getElementById('ep-location').value||null,
        phase:document.getElementById('ep-phase').value||null
      }).then(function(){toast('Proyecto actualizado.');overlay.remove();renderProjects();})
        .catch(function(e){toast(e.message,'error');});
    };
  });
}

function openProjectMembersModal(pid){
  var overlay=document.createElement('div');
  overlay.className='modal-overlay';overlay.id='members-modal';
  overlay.innerHTML=
    '<div class="modal"><div class="modal-header">'+
    '<div class="modal-title">Miembros del proyecto</div>'+
    '<button class="btn btn-ghost btn-sm" id="pm-close">X</button></div>'+
    '<div class="modal-body">'+
    '<div id="pm-list">'+loading()+'</div>'+
    '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border2)">'+
    '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:8px">Agregar usuario</div>'+
    '<div style="display:flex;gap:8px">'+
    '<select class="input" id="pm-user-sel" style="flex:1">'+
    '<option value="">Seleccionar usuario...</option>'+
    APP.users.map(function(u){return '<option value="'+u.id+'">'+u.full_name+' ('+u.email+')</option>';}).join('')+
    '</select>'+
    '<button class="btn btn-primary btn-sm" id="pm-add-btn">Agregar</button>'+
    '</div></div></div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="pm-done">Cerrar</button>'+
    '</div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('pm-close').onclick=function(){overlay.remove();};
  document.getElementById('pm-done').onclick=function(){overlay.remove();renderProjects();};
  document.getElementById('pm-add-btn').onclick=function(){
    var uid=document.getElementById('pm-user-sel').value;
    if(!uid){toast('Selecciona un usuario.','error');return;}
    sbPost('project_members',{project_id:pid,user_id:uid,role:'member'})
      .then(function(){toast('Usuario agregado.');loadProjMembers(pid);})
      .catch(function(e){toast(e.message.indexOf('duplicate')>=0?'El usuario ya es miembro.':e.message,'error');});
  };
  loadProjMembers(pid);
}

function loadProjMembers(pid){
  var el=document.getElementById('pm-list');
  if(!el)return;
  sbGet('project_members','?project_id=eq.'+pid+'&select=id,user_id,role,users(full_name,email,role)')
    .then(function(members){
      if(!members.length){el.innerHTML='<p style="font-size:12px;color:var(--text3)">Sin miembros registrados.</p>';return;}
      el.innerHTML='<div style="max-height:200px;overflow-y:auto">'+
        members.map(function(m){
          var u=m.users||{};
          return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2)">'+
            '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--text)">'+u.full_name+'</div>'+
            '<div style="font-size:10px;color:var(--text3)">'+u.email+'</div></div>'+
            roleBadge(u.role)+
            '<button class="btn btn-ghost btn-sm" style="color:var(--red)" data-mid="'+m.id+'" data-remove-member>'+
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>'+
            '</div>';
        }).join('')+'</div>';
      document.querySelectorAll('[data-remove-member]').forEach(function(btn){
        btn.onclick=function(){
          sbPatch('project_members','id=eq.'+btn.dataset.mid,{}).catch(function(){});
          // Actually delete it
          fetch(SUPA_URL+'/rest/v1/project_members?id=eq.'+btn.dataset.mid,{method:'DELETE',headers:H})
            .then(function(){toast('Miembro eliminado.');loadProjMembers(pid);})
            .catch(function(e){toast(e.message,'error');});
        };
      });
    });
}

// ── HITO MANAGEMENT ──
function openNewHitoModal(){
  var overlay=document.createElement('div');
  overlay.className='modal-overlay';overlay.id='hito-modal';
  overlay.innerHTML=
    '<div class="modal" style="max-width:440px">'+
    '<div class="modal-header"><div class="modal-title">Nuevo hito</div>'+
    '<button class="btn btn-ghost btn-sm" id="hito-close">X</button></div>'+
    '<div class="modal-body">'+
    '<p style="font-size:12px;color:var(--text2);margin-bottom:14px">'+
    'Un hito agrupa campos de informacion por fase de entrega (Ej: RIBA 2, RIBA 3, Construccion, Puesta en Marcha).</p>'+
    '<div class="form-grid">'+
    '<div class="form-group full"><label class="label">Nombre del hito *</label>'+
    '<input type="text" class="input" id="hito-name" placeholder="Ej: Construccion, Puesta en Marcha, RIBA 2..."></div>'+
    '<div class="form-group full"><label class="label">Descripcion corta</label>'+
    '<input type="text" class="input" id="hito-desc" placeholder="Ej: Presentacion 3, Entrega final..."></div>'+
    '</div></div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="hito-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="hito-save">Crear hito</button>'+
    '</div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('hito-close').onclick=function(){overlay.remove();};
  document.getElementById('hito-cancel').onclick=function(){overlay.remove();};
  document.getElementById('hito-save').onclick=function(){
    var name=document.getElementById('hito-name').value.trim();
    if(!name){toast('El nombre es obligatorio.','error');return;}
    var key='hito_'+name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    // Check not duplicate
    var existing=APP.schemas.find(function(s){return s.field_group===key;});
    if(existing){toast('Ya existe un hito con ese nombre.','error');return;}
    // Create a placeholder field to establish the group (will be the "responsible" field)
    var desc=document.getElementById('hito-desc').value.trim();
    var placeholder={
      project_id:APP.project.id,
      name:name+' - Responsable',
      key:key+'_responsible',
      field_type:'text',
      is_required:false,is_part_of_code:false,
      code_order:99,separator:'',max_length:255,
      field_group:key,
      is_visible:true,
      field_order:1,
      placeholder:'Responsable del hito',
      is_active:true,
      // Store hito label in description with prefix for lookup
      description:'hito:'+name+(desc?' - '+desc:'')
    };
    sbPost('field_schemas',placeholder).then(function(){
      toast('Hito "'+name+'" creado.');
      overlay.remove();
      renderSchemas();
    }).catch(function(e){toast(e.message,'error');});
  };
  document.getElementById('hito-name').focus();
}

function openRenameHitoModal(groupId,currentLabel){
  var overlay=document.createElement('div');
  overlay.className='modal-overlay';overlay.id='rename-hito-modal';
  overlay.innerHTML=
    '<div class="modal" style="max-width:400px">'+
    '<div class="modal-header"><div class="modal-title">Renombrar hito</div>'+
    '<button class="btn btn-ghost btn-sm" id="rh-close">X</button></div>'+
    '<div class="modal-body">'+
    '<div class="form-group"><label class="label">Nuevo nombre</label>'+
    '<input type="text" class="input" id="rh-name" value="'+currentLabel+'"></div>'+
    '</div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="rh-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="rh-save">Guardar</button>'+
    '</div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('rh-close').onclick=function(){overlay.remove();};
  document.getElementById('rh-cancel').onclick=function(){overlay.remove();};
  document.getElementById('rh-save').onclick=function(){
    var newName=document.getElementById('rh-name').value.trim();
    if(!newName){toast('Nombre obligatorio.','error');return;}
    // Update description of all schemas in this group
    var ids=APP.schemas.filter(function(s){return s.field_group===groupId;}).map(function(s){return s.id;});
    var updates=ids.map(function(id){
      return sbPatch('field_schemas','id=eq.'+id,{description:'hito:'+newName});
    });
    Promise.all(updates).then(function(){
      toast('Hito renombrado.');overlay.remove();renderSchemas();
    }).catch(function(e){toast(e.message,'error');});
  };
}
