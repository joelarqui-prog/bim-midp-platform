// Unify Management - app.js v3.0 — Campos completamente configurables
var SUPA_URL='https://rrzlwvqlzhmzyrramjcw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyemx3dnFsemhtenlycmFtamN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODIyMzYsImV4cCI6MjA5MDE1ODIzNn0.IeZlvcT1GaqQybZRbxyjgoEFfJ6Z6BVxbZRgLPzi2Fw';
var H={'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Prefer':'return=representation'};
function sbGet(t,p){return fetch(SUPA_URL+'/rest/v1/'+t+(p||''),{headers:H}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPost(t,b){return fetch(SUPA_URL+'/rest/v1/'+t,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPatch(t,f,b){return fetch(SUPA_URL+'/rest/v1/'+t+'?'+f,{method:'PATCH',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbRpc(fn,b){return fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}

var APP={user:null,project:null,schemas:[],users:[],packages:[],projectMembers:[],projectMember:null,search:'',statusFilter:'',packageFilter:'',fieldFilters:{},selectedIds:[]};
var DEFAULT_PERMS={can_create_deliverables:false,can_edit_deliverables:false,can_delete_deliverables:false,can_change_status:false,can_register_progress:false};
function can(a){
  if(!APP.user)return false;
  // Admin global: siempre puede todo
  if(APP.user.role==='admin')return true;
  // Leer permisos del proyecto activo desde project_members
  var pm=APP.projectMember;
  // project_admin del proyecto: todo excepto crear nuevos proyectos
  if(pm&&pm.role==='project_admin'){
    if(a==='can_create_project')return false;
    return true;
  }
  // Otros usuarios: permisos específicos del proyecto
  var perms=(pm&&pm.permissions)||DEFAULT_PERMS;
  return !!(perms[a]);
}

// isAdminLevel: true para admin Y project_admin
function isAdminLevel(){if(!APP.user)return false;if(APP.user.role==='admin')return true;var pm=APP.projectMember;return pm&&(pm.role==='project_admin');}

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
var ROLE_CFG={admin:{label:'Administrador',cls:'b-admin'},project_admin:{label:'Admin. Proyecto',cls:'b-proj-admin'},bim_manager:{label:'BIM Manager',cls:'b-bim'},specialist:{label:'Especialista',cls:'b-spec'}};
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
  // phase field — columna directa, normalizando prefijo del hito
  // s.key puede ser 'lod' o 'riba2_lod'; la columna en BD siempre es 'riba2_lod'
  var pGroup=s.field_group;
  var dbKey=s.key.indexOf(pGroup+'_')===0?s.key:pGroup+'_'+s.key;
  return d[dbKey]||d[s.key]||'';
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
      var pid=APP.project.id;
      var p2=sbGet('field_schemas','?project_id=eq.'+pid+'&is_active=eq.true&order=field_order.asc,code_order.asc');
      var p3=sbGet('packages','?project_id=eq.'+pid+'&is_active=eq.true&order=code.asc');
      // Cargar todos los miembros del proyecto con sus permisos por proyecto
      var p4=sbGet('project_members','?project_id=eq.'+pid+'&select=id,user_id,role,permissions,users(id,full_name,email,role,specialty,company,is_active)');
      return Promise.all([p2,sbGet('users','?select=id,email,full_name,role,specialty,company,is_active&order=full_name.asc'),p3,p4]);
    })
    .then(function(r){
      APP.schemas=r[0];APP.users=r[1];APP.packages=r[2];
      APP.projectMembers=r[3]||[];
      // Guardar la membresía del usuario actual en este proyecto
      APP.projectMember=APP.projectMembers.find(function(m){return m.user_id===APP.user.id;})||null;
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
  var pm=APP.projectMember;
  var isAdminLvl=isAdmin||(pm&&pm.role==='project_admin');
  var pkgBtn=document.getElementById('sb-packages');if(pkgBtn)pkgBtn.style.display=isAdminLvl?'flex':'none';
  var usrBtn=document.getElementById('sb-users');if(usrBtn)usrBtn.style.display=isAdminLvl?'flex':'none';
  var prjBtn=document.getElementById('sb-projects');if(prjBtn)prjBtn.style.display=isAdmin?'flex':'none';
  restoreSidebarState();
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
// ── SIDEBAR COLLAPSE ──
function toggleSidebar(){
  var sb=document.querySelector('.sidebar');
  if(!sb)return;
  sb.classList.toggle('collapsed');
  try{localStorage.setItem('midp_sb_collapsed',sb.classList.contains('collapsed')?'1':'0');}catch(e){}
}
function restoreSidebarState(){
  try{
    if(localStorage.getItem('midp_sb_collapsed')==='1'){
      var sb=document.querySelector('.sidebar');if(sb)sb.classList.add('collapsed');
    }
  }catch(e){}
}

function nav(view,el){
  document.querySelectorAll('.sb-item').forEach(function(i){i.classList.remove('active');});
  if(el)el.classList.add('active');
  document.getElementById('bread-title').textContent=BREAD[view]||view;
  var subEl=document.getElementById('bread-sub');
  if(subEl)subEl.textContent=APP.project?'· '+APP.project.name:'';
  // Deliverables uses its own zone layout; others need padding
  var contentEl=document.getElementById('content');
  if(view==='deliverables'){
    contentEl.style.padding='0';
    contentEl.style.overflowY='hidden';
  } else {
    contentEl.style.padding='20px';
    contentEl.style.overflowY='auto';
  }
  ({deliverables:renderDeliverables,packages:renderPackages,progress:renderProgress,schemas:renderSchemas,users:renderUsers,projects:renderProjects})[view]&&
  ({deliverables:renderDeliverables,packages:renderPackages,progress:renderProgress,schemas:renderSchemas,users:renderUsers,projects:renderProjects})[view]();
}

// ── DELIVERABLES ──
function renderDeliverables(){
  var canCreate=can('can_create_deliverables');
  var canEdit=can('can_edit_deliverables');
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-sm" onclick="exportCSV()">&#8595; CSV</button>'+
    '<button class="btn btn-sm" onclick="exportMIDP()">&#8595; MIDP</button>'+
    (canEdit?'<button class="btn btn-sm" id="btn-bulk-edit" onclick="openBulkEditModal()" style="display:none">&#9998; Editar seleccion</button>':'')+
    (canCreate?'<button class="btn btn-primary btn-sm" onclick="openDeliverableModal()">+ Nuevo entregable</button>':'');
  // Clear selection when re-rendering
  APP.selectedIds=[];

  // Filtros por campo de codificacion
  var schemaFilters=codeSchemas()
    .filter(function(s){return FILTER_FIELDS.indexOf(s.key)>=0;})
    .map(function(s){
      var cur=APP.fieldFilters[s.key]||'';
      var opts='<option value="">'+s.name+'</option>';
      if(s.allowed_values)opts+=s.allowed_values.map(function(v){return '<option value="'+v.value+'"'+(cur===v.value?' selected':'')+'>'+v.value+' - '+v.label+'</option>';}).join('');
      return '<select class="input" style="width:110px;font-size:11px" onchange="setFieldFilter(\''+s.key+'\',this.value)">'+opts+'</select>';
    }).join('');

  // ZONA FIJA: header + KPIs + filtros
  // ZONA SCROLL: solo la tabla
  document.getElementById('content').innerHTML=
    '<div class="del-fixed-zone">'+
    '<div class="kpi-grid" id="kpi-area"><div class="loading"><div class="spinner"></div></div></div>'+
    '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center">'+
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
    '<button class="btn btn-sm" onclick="loadDeliverables()">&#8635;</button>'+
    '</div>'+
    // Barra de acciones masivas (oculta hasta seleccionar)
    '<div id="bulk-bar" style="display:none;align-items:center;gap:10px;padding:8px 12px;background:var(--brand-light);border:1px solid #bfdbfe;border-radius:8px;margin-top:8px">'+
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'+
    '<span class="bulk-count" style="font-size:12px;font-weight:600;color:var(--brand);flex:1">0 seleccionados</span>'+
    (canEdit?'<button class="btn btn-primary btn-sm" onclick="openBulkEditModal()">&#9998; Editar seleccion</button>':'')+
    '<button class="btn btn-sm" style="color:var(--slate)" onclick="clearSelection()">&#10006; Deseleccionar</button>'+
    '</div>'+
    '</div>'+  // close del-fixed-zone
    '<div class="del-scroll-zone" id="del-table">'+loading()+'</div>';
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
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 16px;text-align:center">'+
        '<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>'+
        '<div class="empty-title">Sin entregables</div>'+
        '<div class="empty-desc">No hay resultados para los filtros actuales.</div></div>';
      return;
    }

    // Campos generales visibles (excluyendo estado que tiene columna propia con select)
    var visGeneral=visibleGeneralSchemas().filter(function(s){return s.key!=='estado'&&s.key!=='responsable';});
    // Campos de fase visibles — LOD, LOI y fecha solo (siempre los mismos 3 para la vista)
    var phaseColKeys=['lod','loi','delivery_date'];

    // Sticky col widths
    var W={chk:36,code:150,name:140,status:95,general:80,lod:42,loi:38,fecha:74,acc:48};
    var stickyLeft2=(canEdit?W.chk:0)+W.code; // where Name starts

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
      '<table class="midp-tbl" style="min-width:'+minW+'px;width:max-content"><thead><tr>'+
      (canEdit?'<th class="scol" style="left:0;width:'+W.chk+'px;min-width:'+W.chk+'px;max-width:'+W.chk+'px;z-index:4;text-align:center;padding:0"><input type="checkbox" id="sel-all" style="cursor:pointer;margin:0" title="Seleccionar todos"></th>':'')+
      // Sticky col 1: Codigo
      '<th class="scol" style="left:'+(canEdit?W.chk:0)+'px;min-width:'+W.code+'px;max-width:'+W.code+'px;z-index:4">Codigo</th>'+
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
      (canEdit?'<th class="scol" style="left:0;background:var(--bg);z-index:4"></th>':'')+
      '<th class="scol" style="left:'+(canEdit?W.chk:0)+'px;background:var(--bg);z-index:4"></th>'+
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

        return '<tr class="del-row"'+(APP.selectedIds.indexOf(d.id)>=0?' style="background:var(--brand-light)"':'')+' data-id="'+d.id+'">'+ 
          (canEdit?'<td class="scol del-chk" style="left:0;background:var(--surface);text-align:center;padding:0;width:'+W.chk+'px"><input type="checkbox"'+(APP.selectedIds.indexOf(d.id)>=0?' checked':'')+' class="row-chk" data-id="'+d.id+'" style="cursor:pointer;margin:0"></td>':'')+ 
          '<td class="scol" style="left:'+(canEdit?W.chk:0)+'px;background:var(--surface)">'+ 
          '<span class="code-chip" style="font-size:10px;display:inline-block;word-break:break-all;white-space:normal;line-height:1.4;max-width:155px">'+d.code+'</span>'+
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
      '</table>'+
      '<div style="padding:8px 0;font-size:10px;color:var(--text3);margin-top:4px">'+
      items.length+' entregable(s) mostrado(s) de '+total+' totales</div>';
    // Wrap table in a styled container but keep it inside del-scroll-zone
    var dt=document.getElementById('del-table');
    dt.innerHTML='';
    // Outer border container — must not clip the table
    var wrapper=document.createElement('div');
    wrapper.style.cssText='border-radius:var(--rl);border:1px solid var(--border);background:var(--surface);display:inline-block;min-width:100%';
    wrapper.innerHTML=html;
    dt.appendChild(wrapper);
    // ── Checkbox event listeners ──
    if(canEdit){
      var selAll=document.getElementById('sel-all');
      if(selAll){
        selAll.checked=APP.selectedIds.length===items.length&&items.length>0;
        selAll.addEventListener('change',function(){
          APP.selectedIds=this.checked?items.map(function(d){return d.id;}) :[];
          updateBulkBar();
          // Update all row checkboxes
          document.querySelectorAll('.row-chk').forEach(function(chk){
            chk.checked=this.checked;
            chk.closest('tr').style.background=this.checked?'var(--brand-light)':'';
          },this);
        });
      }
      document.querySelectorAll('.row-chk').forEach(function(chk){
        chk.addEventListener('change',function(){
          var id=this.dataset.id;
          if(this.checked){if(APP.selectedIds.indexOf(id)<0)APP.selectedIds.push(id);}
          else{APP.selectedIds=APP.selectedIds.filter(function(x){return x!==id;});}
          this.closest('tr').style.background=this.checked?'var(--brand-light)':'';
          // Update sel-all state
          var sa=document.getElementById('sel-all');
          if(sa)sa.checked=APP.selectedIds.length===items.length&&items.length>0;
          updateBulkBar();
        });
      });
      updateBulkBar();
    }
  }).catch(function(e){
    document.getElementById('del-table').innerHTML='<div class="card"><div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div></div>';
  });
}

// ── EDICIÓN MASIVA ──

// Muestra/oculta la barra de acciones masivas
function updateBulkBar(){
  var bar=document.getElementById('bulk-bar');
  var n=APP.selectedIds.length;
  if(bar){
    bar.style.display=n>0?'flex':'none';
    var lbl=bar.querySelector('.bulk-count');
    if(lbl)lbl.textContent=n+' entregable'+(n>1?'s':'')+' seleccionado'+(n>1?'s':'');
  }
}

// Deseleccionar todo
function clearSelection(){
  APP.selectedIds=[];
  document.querySelectorAll('.row-chk').forEach(function(c){
    c.checked=false;
    var tr=c.closest('tr');
    if(tr)tr.style.background='';
  });
  var sa=document.getElementById('sel-all');
  if(sa)sa.checked=false;
  updateBulkBar();
}

// Modal de edición masiva
function openBulkEditModal(){
  if(!APP.selectedIds.length){toast('Selecciona al menos un entregable.','error');return;}
  var n=APP.selectedIds.length;
  var phGroups=getPhaseGroups();

  // Cargar entregables tipo MOD para doc_assoc
  var getMods=sbGet('deliverables',
    '?project_id=eq.'+APP.project.id+
    '&is_active=eq.true'+
    '&field_values->>tipo_documento=eq.MOD'+
    '&select=id,code,name&order=code.asc'
  ).catch(function(){return[];});

  getMods.then(function(modDels){
  var overlay=document.createElement('div');
  overlay.className='modal-overlay';overlay.id='bulk-modal';

  // ── Sección 1: Campos de codificación ──
  var codeHtml=
    '<div class="form-section-title" style="font-size:11px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px;display:flex;align-items:center;gap:6px">'+
    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--brand)"></span>1. Campos de codificación</div>'+
    '<div class="form-grid">'+
    codeSchemas().map(function(s){
      var inputHtml='';
      if(s.field_type==='dropdown'&&s.allowed_values&&s.allowed_values.length){
        inputHtml='<select class="input" id="bulk-cod-'+s.key+'"><option value="">— Sin cambio —</option>'+
          s.allowed_values.map(function(v){return '<option value="'+v.value+'">'+v.value+' — '+v.label+'</option>';}).join('')+'</select>';
      }else{
        inputHtml='<input type="text" class="input" id="bulk-cod-'+s.key+'" placeholder="— Sin cambio —" maxlength="'+s.max_length+'">';
      }
      return '<div class="form-group"><label class="label">'+s.name+'<span style="font-size:8px;color:var(--brand);margin-left:4px">cod.#'+s.code_order+'</span></label>'+inputHtml+'</div>';
    }).join('')+
    '</div>';

  // ── Sección 2: Estado y campos generales ──
  var genHtml=
    '<div class="form-section-title" style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 10px;display:flex;align-items:center;gap:6px">'+
    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--slate)"></span>2. Estado e información general</div>'+
    '<div class="form-group">'+
    '<label class="label">Estado del entregable</label>'+
    '<select class="input" id="bulk-status"><option value="">— Sin cambio —</option>'+
    Object.entries(STATUS_CFG).map(function(e){return '<option value="'+e[0]+'">'+e[1].label+'</option>';}).join('')+
    '</select></div>'+
    (APP.packages.length?
      '<div class="form-group"><label class="label">Paquete de trabajo</label>'+
      '<select class="input" id="bulk-pkg"><option value="">— Sin cambio —</option>'+
      APP.packages.map(function(p){return '<option value="'+p.code+'">'+p.code+' — '+p.name+'</option>';}).join('')+
      '</select></div>':'') +
    '<div class="form-grid">'+
    generalSchemas().filter(function(s){return s.key!=='estado'&&s.key!=='status'&&s.key!=='paquete';}).map(function(s){
      var inputHtml='';
      if(s.field_type==='dropdown'&&s.options&&s.options.length){
        inputHtml='<select class="input" id="bulk-gen-'+s.key+'"><option value="">— Sin cambio —</option>'+
          s.options.map(function(o){return '<option value="'+o+'">'+o+'</option>';}).join('')+'</select>';
      }else if(s.field_type==='date'){
        inputHtml='<input type="date" class="input" id="bulk-gen-'+s.key+'">';
      }else{
        inputHtml='<input type="text" class="input" id="bulk-gen-'+s.key+'" placeholder="— Sin cambio —">';
      }
      return '<div class="form-group"><label class="label">'+s.name+'</label>'+inputHtml+'</div>';
    }).join('')+
    '</div>';

  // ── Sección 3: Hitos RIBA ──
  var hitoHtml=phGroups.map(function(ph){
    var schemas=phaseSchemas(ph.key);
    if(!schemas.length)return '';
    return '<div class="form-section-title" style="font-size:11px;font-weight:700;color:'+ph.color+';text-transform:uppercase;letter-spacing:.05em;margin:14px 0 10px;display:flex;align-items:center;gap:6px">'+
      '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+ph.color+'"></span>'+ph.label+(ph.sub?' · '+ph.sub:'')+
      '</div><div class="form-grid">'+
      schemas.map(function(s){
        var label=s.name.replace(ph.label+' - ','');
        var isDocAssoc=s.key.indexOf('_doc_assoc')>=0;
        var inputHtml='';
        if(isDocAssoc){
          inputHtml='<select class="input" id="bulk-ph-'+s.key+'">'+
            '<option value="">— Sin cambio —</option>'+
            modDels.map(function(m){return '<option value="'+m.code+'">'+m.code+' - '+m.name+'</option>';}).join('')+
            '</select>';
        }else if(s.field_type==='dropdown'&&s.options&&s.options.length){
          inputHtml='<select class="input" id="bulk-ph-'+s.key+'"><option value="">— Sin cambio —</option>'+
            s.options.map(function(o){return '<option value="'+o+'">'+o+'</option>';}).join('')+'</select>';
        }else if(s.field_type==='date'){
          inputHtml='<input type="date" class="input" id="bulk-ph-'+s.key+'">';
        }else{
          inputHtml='<input type="text" class="input" id="bulk-ph-'+s.key+'" placeholder="— Sin cambio —">';
        }
        return '<div class="form-group'+(isDocAssoc?' full':'')+'"><label class="label">'+label+'</label>'+inputHtml+'</div>';
      }).join('')+
      '</div>';
  }).join('');

  overlay.innerHTML=
    '<div class="modal" style="max-width:680px;max-height:88vh;display:flex;flex-direction:column">'+
    '<div class="modal-header">'+
    '<div>'+
    '<div class="modal-title">Edición masiva</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-top:2px">'+n+' entregable'+(n>1?'s':'')+' seleccionado'+(n>1?'s':'')+' — Solo se actualizarán los campos que completes</div>'+
    '</div>'+
    '<button class="btn btn-ghost btn-sm" id="bm-close">X</button></div>'+
    '<div class="modal-body" style="overflow-y:auto;flex:1">'+
    codeHtml+genHtml+hitoHtml+
    '</div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="bm-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="bm-save">Guardar en '+n+' entregable'+(n>1?'s':'')+'</button>'+
    '</div></div>';

  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('bm-close').onclick=function(){overlay.remove();};
  document.getElementById('bm-cancel').onclick=function(){overlay.remove();};
  document.getElementById('bm-save').onclick=function(){saveBulkEdit(overlay);};
  });
}

// Ejecutar guardado masivo
function saveBulkEdit(overlay){
  var btn=document.getElementById('bm-save');
  btn.disabled=true;btn.textContent='Guardando...';

  // Construir payload de columnas directas
  var payload={updated_at:new Date().toISOString()};
  var hasChange=false;

  // Estado
  var st=document.getElementById('bulk-status');
  if(st&&st.value){payload.status=st.value;hasChange=true;}

  // Paquete
  var pkg=document.getElementById('bulk-pkg');
  if(pkg&&pkg.value){payload.work_package=pkg.value;hasChange=true;}

  // Campos generales (mapean a columnas directas en deliverables)
  var GEN_MAP={nombre:'name',titulo:'name',title:'name',descripcion:'description',
               description:'description',formato:'file_format',
               tamano_lamina:'sheet_size',escala:'scale',predecesores:'predecessors'};
  generalSchemas().filter(function(s){
    return s.key!=='estado'&&s.key!=='status'&&s.key!=='paquete';
  }).forEach(function(s){
    var el=document.getElementById('bulk-gen-'+s.key);
    if(el&&el.value.trim()){
      var col=GEN_MAP[s.key];
      if(col){payload[col]=el.value.trim();hasChange=true;}
    }
  });

  // Campos de hito (columnas directas con prefijo ph.key_campo)
  getPhaseGroups().forEach(function(ph){
    phaseSchemas(ph.key).forEach(function(s){
      var el=document.getElementById('bulk-ph-'+s.key);
      if(el&&el.value){
        var dbCol=s.key.indexOf(ph.key+'_')===0?s.key:ph.key+'_'+s.key;
        payload[dbCol]=el.value||null;
        hasChange=true;
      }
    });
  });

  // Campos de codificación — se guardan en field_values JSONB
  // Para edición masiva, necesitamos leer el field_values actual de cada
  // entregable y hacer merge con los campos que el usuario cambió
  var codeChanges={};
  codeSchemas().forEach(function(s){
    var el=document.getElementById('bulk-cod-'+s.key);
    if(el&&el.value.trim()){
      codeChanges[s.key]=el.value.trim();
      hasChange=true;
    }
  });

  if(!hasChange){
    toast('No hay cambios que guardar.','error');
    btn.disabled=false;
    btn.textContent='Guardar en '+APP.selectedIds.length+' entregable'+(APP.selectedIds.length>1?'s':'');
    return;
  }

  var ids=APP.selectedIds.slice();

  // Si hay cambios en campos de código, necesitamos:
  // 1. Leer el field_values actual de cada entregable
  // 2. Hacer merge con los cambios
  // 3. Recalcular el código
  var promise;
  if(Object.keys(codeChanges).length>0){
    // Cargar los field_values actuales de los entregables seleccionados
    promise=sbGet('deliverables',
      '?id=in.('+ids.join(',')+')'+'&select=id,field_values'
    ).then(function(delivs){
      var delivMap={};
      delivs.forEach(function(d){delivMap[d.id]=d.field_values||{};});
      var promises=ids.map(function(id){
        // Merge: campo a campo, solo sobrescribir los que el usuario cambió
        var mergedFV=Object.assign({},delivMap[id]||{},codeChanges);
        var newCode=buildCode(mergedFV);
        var p=Object.assign({},payload,{field_values:mergedFV});
        if(newCode)p.code=newCode;
        return sbPatch('deliverables','id=eq.'+id,p);
      });
      return Promise.all(promises);
    });
  }else{
    // Sin cambios en código — PATCH directo para todos
    var promises=ids.map(function(id){
      return sbPatch('deliverables','id=eq.'+id,payload);
    });
    promise=Promise.all(promises);
  }

  promise.then(function(){
    toast(ids.length+' entregable'+(ids.length>1?'s':'')+' actualizado'+(ids.length>1?'s':'')+'.');
    overlay.remove();
    clearSelection();
    loadDeliverables();
  }).catch(function(e){
    toast(e.message,'error');
    btn.disabled=false;
    btn.textContent='Guardar en '+ids.length+' entregable'+(ids.length>1?'s':'');
  });
}

