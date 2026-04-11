// Unify Management - app.js v3.0 — Campos completamente configurables
var SUPA_URL='https://rrzlwvqlzhmzyrramjcw.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyemx3dnFsemhtenlycmFtamN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODIyMzYsImV4cCI6MjA5MDE1ODIzNn0.IeZlvcT1GaqQybZRbxyjgoEFfJ6Z6BVxbZRgLPzi2Fw';
var H={'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Prefer':'return=representation'};
function sbGet(t,p){return fetch(SUPA_URL+'/rest/v1/'+t+(p||''),{headers:H}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPost(t,b){return fetch(SUPA_URL+'/rest/v1/'+t,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbPatch(t,f,b){return fetch(SUPA_URL+'/rest/v1/'+t+'?'+f,{method:'PATCH',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}
function sbRpc(fn,b){return fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(!r.ok)return r.text().then(function(e){throw new Error(e);});return r.json();});}

var APP={user:null,project:null,schemas:[],users:[],packages:[],groups:[],phases:[],projectMembers:[],projectMember:null,search:'',statusFilter:'',packageFilter:'',fieldFilters:{},selectedIds:[]};
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

// Returns true for phases that have dedicated columns in deliverables table
function isKnownPhase(phKey){
  return phKey==='riba2'||phKey==='riba3'||phKey==='riba4';
}

// Get any field value from a deliverable — checks direct columns AND field_values JSONB
function getDelFieldVal(d, fieldKey){
  if(!d||!fieldKey)return '';
  // 1. Direct column (riba2_delivery_date, work_package, etc.)
  if(d[fieldKey]!=null&&d[fieldKey]!=='')return d[fieldKey];
  // 2. field_values exact key
  var fv=d.field_values||{};
  if(fv[fieldKey]!=null&&fv[fieldKey]!=='')return fv[fieldKey];
  // 3. field_values with double-underscore prefix (custom hito format: group__field)
  // e.g. date_field_key = 'delivery_date' but stored as 'hito_01__delivery_date'
  var keys=Object.keys(fv);
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    // Match: key ends with '__fieldKey' or is exactly fieldKey
    if(k===fieldKey)return fv[k]||'';
    if(k.indexOf('__')>=0&&k.split('__').pop()===fieldKey&&fv[k])return fv[k];
    // Also match full suffix: 'hito_01__delivery_date' matches 'hito_01_delivery_date'
    if(k.replace('__','_')===fieldKey&&fv[k])return fv[k];
  }
  return '';
}

// Gets the field key and value that identify "models" for this project
// Default: field_values->>tipo_documento = 'MOD'
// Configurable: stored in localStorage as midp_model_cfg_{projectId}
function getModelConfig(){
  var projectId=APP.project&&APP.project.id;
  if(!projectId)return {fieldKey:'tipo_documento',fieldValue:'MOD'};
  try{
    var raw=localStorage.getItem('midp_model_cfg_'+projectId);
    if(raw)return JSON.parse(raw);
  }catch(e){}
  return {fieldKey:'tipo_documento',fieldValue:'MOD'};
}

function saveModelConfig(fieldKey,fieldValue){
  var projectId=APP.project&&APP.project.id;
  if(!projectId)return;
  localStorage.setItem('midp_model_cfg_'+projectId,JSON.stringify({fieldKey:fieldKey,fieldValue:fieldValue}));
}

// Build Supabase query param for model filter
function getModelFilterParam(){
  var cfg=getModelConfig();
  return '&field_values->>'+encodeURIComponent(cfg.fieldKey)+'=eq.'+encodeURIComponent(cfg.fieldValue);
}



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
        g.replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
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
  // phase field: known phases → direct column; custom hitos → field_values JSONB
  var pGroup=s.field_group;
  if(isKnownPhase(pGroup)){
    var dbKey=s.key.indexOf(pGroup+'_')===0?s.key:pGroup+'_'+s.key;
    return d[dbKey]||d[s.key]||'';
  }else{
    var fvKey=pGroup+'__'+(s.key.indexOf(pGroup+'_')===0?s.key.slice(pGroup.length+1):s.key);
    return (d.field_values&&d.field_values[fvKey])||'';
  }
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
      var p4=sbGet('project_members','?project_id=eq.'+pid+'&select=id,user_id,role,permissions,users(id,full_name,email,role,specialty,company,is_active)');
      var p5=sbGet('deliverable_groups','?project_id=eq.'+pid+'&is_active=eq.true&order=name.asc').catch(function(){return[];});
      var p6=sbGet('project_phases','?project_id=eq.'+pid+'&is_active=eq.true&order=display_order.asc').catch(function(){return[];});
      return Promise.all([p2,sbGet('users','?select=id,email,full_name,role,specialty,company,is_active&order=full_name.asc'),p3,p4,p5,p6]);
    })
    .then(function(r){
      APP.schemas=r[0];APP.users=r[1];APP.packages=r[2];
      APP.projectMembers=r[3]||[];APP.groups=r[4]||[];APP.phases=r[5]||[];
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
  var modBtn=document.getElementById('sb-models');if(modBtn)modBtn.style.display='flex';
  var grpBtn=document.getElementById('sb-groups');if(grpBtn)grpBtn.style.display=isAdminLvl?'flex':'none';
  var phsBtn=document.getElementById('sb-phases');if(phsBtn)phsBtn.style.display=isAdminLvl?'flex':'none';
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
var BREAD={deliverables:'Entregables MIDP',packages:'Paquetes de trabajo',progress:'Control de avance',schemas:'Config. de campos',users:'Usuarios y permisos',projects:'Proyectos',models:'Modelos BIM',groups:'Grupos de entregables',phases:'Fases del proyecto'};
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
    contentEl.style.overflow='hidden'; // .content clips; del-scroll-zone scrolls internally
    contentEl.style.overflowX='hidden'; // explicit: prevent double scrollbar on content
  } else {
    contentEl.style.padding='20px';
    contentEl.style.overflow='auto'; // allow scroll in both axes for normal views
  }
  ({deliverables:renderDeliverables,packages:renderPackages,progress:renderProgress,schemas:renderSchemas,users:renderUsers,projects:renderProjects,models:renderModels,groups:renderGroups,phases:renderPhases})[view]&&
  ({deliverables:renderDeliverables,packages:renderPackages,progress:renderProgress,schemas:renderSchemas,users:renderUsers,projects:renderProjects,models:renderModels,groups:renderGroups,phases:renderPhases})[view]();
}

// ── DELIVERABLES ──
function renderDeliverables(){
  var canCreate=can('can_create_deliverables');
  var canEdit=can('can_edit_deliverables');
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-sm" onclick="exportCSV()">&#8595; CSV</button>'+
    '<button class="btn btn-sm" onclick="exportMIDP()">&#8595; MIDP</button>'+
    (canCreate?'<button class="btn btn-sm" onclick="downloadDelTemplate()">&#8659; Plantilla</button>':'')+
    (canCreate?'<button class="btn btn-sm" onclick="importDeliverables()">&#8593; Importar</button>':'')+
    
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
      if(!prodMap[p.deliverable_id])prodMap[p.deliverable_id]={plan:0,pct:0,consUP:0};
      var w=Number(p.planned_qty)||0;
      var pct=Math.min(100,Math.max(0,Number(p.consumed_qty)||0));
      prodMap[p.deliverable_id].plan+=w;
      prodMap[p.deliverable_id].pct=pct;
      prodMap[p.deliverable_id].consUP=Math.round(pct/100*w*10)/10;
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
            // Use getFieldVal to correctly handle both known phases (DB cols) and custom hitos (JSONB)
            var val=getFieldVal(d,s);
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
          (d.url?'<a href="'+d.url+'" target="_blank" class="code-chip" style="font-size:10px;display:inline-block;word-break:break-all;white-space:normal;line-height:1.4;max-width:155px;text-decoration:none;color:var(--brand)" title="Abrir enlace: '+d.url+'">'+d.code+' ↗</a>':
          '<span class="code-chip" style="font-size:10px;display:inline-block;word-break:break-all;white-space:normal;line-height:1.4;max-width:155px">'+d.code+'</span>')+ 
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
    wrapper.style.cssText='border-radius:var(--rl);border:1px solid var(--border);background:var(--surface);overflow:visible;margin:0 20px 0 20px';
    wrapper.style.minWidth=minW+'px';
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
    getModelFilterParam()+
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

  // Campos de hito: known → direct columns; custom → field_values JSONB
  var bulkCustomFV={};
  getPhaseGroups().forEach(function(ph){
    phaseSchemas(ph.key).forEach(function(s){
      var el=document.getElementById('bulk-ph-'+s.key);
      if(el&&el.value){
        if(isKnownPhase(ph.key)){
          var dbCol=s.key.indexOf(ph.key+'_')===0?s.key:ph.key+'_'+s.key;
          payload[dbCol]=el.value||null;
        }else{
          var fvKey=ph.key+'__'+(s.key.indexOf(ph.key+'_')===0?s.key.slice(ph.key.length+1):s.key);
          bulkCustomFV[fvKey]=el.value||null;
        }
        hasChange=true;
      }
    });
  });
  if(Object.keys(bulkCustomFV).length>0&&!payload.field_values){
    payload._customHitoFV=bulkCustomFV; // handled in PATCH loop
  }

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
      var p=payload;
      // If there are custom hito changes, need to merge per-deliverable field_values
      if(payload._customHitoFV){
        p=Object.assign({},payload);delete p._customHitoFV;
        p.field_values=Object.assign({},payload._existingFV||{},bulkCustomFV);
      }
      return sbPatch('deliverables','id=eq.'+id,p);
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


function changeStatus(id,s){
  if(!can('can_change_status')){toast('Sin permiso.','error');return;}
  sbPatch('deliverables','id=eq.'+id,{status:s}).then(function(){toast('Estado actualizado.');}).catch(function(e){toast(e.message,'error');});
}

// ── DELIVERABLE MODAL — campos dinámicos ──
function openDeliverableModal(id){
  if(id&&!can('can_edit_deliverables')){toast('Sin permiso para editar.','error');return;}
  if(!id&&!can('can_create_deliverables')){toast('Sin permiso para crear.','error');return;}
  var getD=id?sbGet('deliverables','?id=eq.'+id+'&limit=1').then(function(r){return r[0];}):Promise.resolve(null);
  var getMods=sbGet('deliverables',
    '?project_id=eq.'+APP.project.id+
    '&is_active=eq.true'+
    getModelFilterParam()+
    '&select=id,code,name&order=code.asc'
  ).catch(function(){return [];});
  var getUnits=id
    ?sbGet('production_units','?deliverable_id=eq.'+id+'&limit=1').then(function(r){return r[0]||null;})
    :Promise.resolve(null);
  Promise.all([getD,getMods,getUnits]).then(function(res){
  var d=res[0];
  window._modDels=res[1];
  window._delUnits=(res[2]&&res[2].planned_qty!=null)?res[2].planned_qty:1;
    var fv=d?d.field_values||{}:{};
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

    var usersOpts=APP.users.filter(function(u){return u.is_active;}).map(function(u){
      return '<option value="'+u.id+'"'+(d&&d.assigned_to===u.id?' selected':'')+'>'+u.full_name+(u.specialty?' ('+u.specialty+')':'')+'</option>';
    }).join('');

    var generalInputs=generalSchemas().map(function(s){
      var colMap={nombre:'name',titulo:'name',title:'name',descripcion:'description',description:'description',
        paquete:'work_package',formato:'file_format',tamano_lamina:'sheet_size',escala:'scale',
        estado:'status',responsable:'assigned_to',predecesores:'predecessors'};
      var col=colMap[s.key];
      var val=d&&col?d[col]||'':'';
      if(s.key==='paquete'){
        return '<div class="form-group"><label class="label">'+s.name+'</label>'+
          '<select class="input" id="gen_paquete"><option value="">Sin paquete</option>'+
          APP.packages.map(function(p){return '<option value="'+p.code+'"'+(d&&d.work_package===p.code?' selected':'')+'>'+p.code+' - '+p.name+'</option>';}).join('')+
          '</select></div>';
      }
      if(s.key==='grupo'||s.key==='group'){
        return '<div class="form-group"><label class="label">'+s.name+'</label>'+
          '<select class="input" id="gen_grupo"><option value="">Sin grupo</option>'+
          (APP.groups||[]).map(function(g){return '<option value="'+g.code+'"'+(d&&d.group_code===g.code?' selected':'')+'>'+g.code+' - '+g.name+'</option>';}).join('')+
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

    var hasNameField=generalSchemas().some(function(s){
      return ['nombre','titulo','title','name','contenedor'].indexOf(s.key)>=0;
    });
    if(!hasNameField){
      var existingVal=d?d.name||'':'';
      generalInputs='<div class="form-group full"><label class="label">Nombre del entregable *</label>'+
        '<input type="text" class="input" id="gen_nombre" value="'+existingVal+'" placeholder="Nombre descriptivo del entregable">'+
        '</div>'+generalInputs;
    }

    var phaseBlocks=getPhaseGroups().map(function(ph){
      var fields=phaseSchemas(ph.key);
      if(!fields.length)return '';
      var inputs=fields.map(function(s){
        var val='';
        var isFull=false;
        if(isKnownPhase(ph.key)){
          var dbCol=s.key.indexOf(ph.key+'_')===0?s.key:ph.key+'_'+s.key;
          val=d?(d[dbCol]||d[s.key]||''):'';
          isFull=dbCol===ph.key+'_doc_assoc'||s.key===ph.key+'_doc_assoc';
        }else{
          // Custom hito: read from field_values JSONB
          var fvKey=ph.key+'__'+(s.key.indexOf(ph.key+'_')===0?s.key.slice(ph.key.length+1):s.key);
          val=d&&d.field_values?d.field_values[fvKey]||'':'';
          isFull=s.key.indexOf('_doc_assoc')>=0;
        }
        var inp='';
        if(s.key.indexOf('_doc_assoc')>=0){
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
      '<div class="form-grid" style="margin-bottom:8px">'+generalInputs+'</div>'+

      // ── Campos fijos siempre presentes (independientes de field_schemas) ──
      '<div class="form-grid" style="margin-bottom:8px">'+

      // Paquete — siempre visible
      (generalSchemas().every(function(s){return s.key!=='paquete'&&s.key!=='work_package';})?
        '<div class="form-group"><label class="label">Paquete de trabajo</label>'+
        '<select class="input" id="del-pkg-fixed">'+
        '<option value="">Sin paquete</option>'+
        APP.packages.map(function(p){return '<option value="'+p.code+'"'+(d&&d.work_package===p.code?' selected':'')+'>'+p.code+' — '+p.name+'</option>';}).join('')+
        '</select></div>':'')+

      // Grupo de entregables — siempre visible si hay grupos configurados
      '<div class="form-group"><label class="label">🗂️ Grupo de entregables</label>'+
      '<select class="input" id="del-group-fixed">'+
      '<option value="">Sin grupo</option>'+
      (APP.groups||[]).map(function(g){
        return '<option value="'+g.code+'"'+(d&&d.group_code===g.code?' selected':'')+'>'+g.code+' — '+g.name+(g.type?' ('+g.type+')':'')+'</option>';
      }).join('')+
      '</select></div>'+

      // Unidades productivas (peso del entregable para control de avance)
      '<div class="form-group"><label class="label">⚖️ Unidades productivas <span style="font-size:9px;color:var(--text3);font-weight:400">(peso en control de avance)</span></label>'+
      '<input type="number" class="input" id="del-units-fixed" min="0" step="0.5" value="'+(d&&window._delUnits?window._delUnits:1)+'" placeholder="1">'+
      '<div style="font-size:9px;color:var(--text3);margin-top:3px">Mayor peso = mayor impacto en el % de avance global del proyecto</div></div>'+

      // Modelo asociado — siempre visible
      '<div class="form-group"><label class="label">🏗️ Modelo BIM asociado</label>'+
      '<select class="input" id="del-model-fixed">'+
      '<option value="">Sin modelo asociado</option>'+
      (window._modDels||[]).map(function(m){
        var isSelected=d&&(d.riba2_doc_assoc===m.code||d.riba3_doc_assoc===m.code||d.riba4_doc_assoc===m.code);
        return '<option value="'+m.code+'"'+(isSelected?' selected':'')+'>'+m.code+' — '+m.name+'</option>';
      }).join('')+
      '</select><div style="font-size:9px;color:var(--text3);margin-top:3px">Se asignará al hito más reciente sin modelo</div></div>'+

      '</div>'+

      '<div class="form-group full" style="margin-bottom:16px">'+
      '<label class="label">🔗 Hipervínculo (ACC, Drive, Dropbox, etc.)</label>'+
      '<input type="url" class="input" id="del-url" value="'+(d?d.url||'':'')+'" placeholder="https://docs.b360.autodesk.com/..."></div>'+
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
  var nameVal='';
  var NAME_KEYS=['nombre','titulo','title','name','contenedor','titulo1'];
  for(var ni=0;ni<NAME_KEYS.length;ni++){
    var el_n=document.getElementById('gen_'+NAME_KEYS[ni]);
    if(el_n&&el_n.value.trim()){nameVal=el_n.value.trim();break;}
  }
  if(!nameVal){
    document.querySelectorAll('[id^="gen_"]').forEach(function(el){
      if(!nameVal&&el.tagName!=='SELECT'&&el.id!=='gen_estado'&&el.value.trim())
        nameVal=el.value.trim();
    });
  }
  if(!nameVal)nameVal=code;
  var name=nameVal;
  btn.disabled=true;btn.textContent='Guardando...';
  var dupQ='?project_id=eq.'+APP.project.id+'&code=eq.'+encodeURIComponent(code)+'&is_active=eq.true';
  if(id)dupQ+='&id=neq.'+id;
  sbGet('deliverables',dupQ).then(function(dup){
    if(dup.length>0){toast('Codigo duplicado.','error');btn.disabled=false;btn.textContent=id?'Actualizar':'Crear entregable';return;}
    function gvSmart(targetCol){
      var KNOWN={description:['descripcion','description'],work_package:['paquete','work_package'],
        file_format:['formato','file_format'],sheet_size:['tamano_lamina','sheet_size'],
        scale:['escala','scale'],status:['estado','status'],assigned_to:['responsable','assigned_to'],
        predecessors:['predecesores','predecessors']};
      var keys=KNOWN[targetCol]||[targetCol];
      for(var ki=0;ki<keys.length;ki++){var e=document.getElementById('gen_'+keys[ki]);if(e&&e.value)return e.value;}
      return null;
    }
    // ── Read all fixed fields (always present regardless of field_schemas) ──
    var urlVal=document.getElementById('del-url')?document.getElementById('del-url').value.trim()||null:null;
    var fixedPkgEl=document.getElementById('del-pkg-fixed');
    var fixedPkgVal=fixedPkgEl?fixedPkgEl.value||null:null;
    var fixedGroupEl=document.getElementById('del-group-fixed');
    var fixedGroupVal=fixedGroupEl?fixedGroupEl.value||null:null;
    var fixedUnitsEl=document.getElementById('del-units-fixed');
    var fixedUnitsVal=fixedUnitsEl?parseFloat(fixedUnitsEl.value)||1:1;
    var fixedModelEl=document.getElementById('del-model-fixed');
    var fixedModelVal=fixedModelEl?fixedModelEl.value||null:null;

    var payload={
      project_id:APP.project.id,code:code,name:name,field_values:fields,created_by:APP.user.id,
      description:gvSmart('description'),
      work_package:fixedPkgVal||gvSmart('work_package'),
      file_format:gvSmart('file_format'),sheet_size:gvSmart('sheet_size'),
      scale:gvSmart('scale'),status:gvSmart('status')||'pending',
      assigned_to:gvSmart('assigned_to'),predecessors:gvSmart('predecessors'),
      url:urlVal,
      group_code:fixedGroupVal||gvSmart('group_code')||null
    };
    // Apply fixed model to the first phase doc_assoc without a value
    if(fixedModelVal){
      ['riba2','riba3','riba4'].forEach(function(phKey){
        if(!payload[phKey+'_doc_assoc'])payload[phKey+'_doc_assoc']=fixedModelVal;
      });
    }
    // Known phases → direct DB columns; custom hitos → field_values JSONB
    var customHitoFV={};
    getPhaseGroups().forEach(function(ph){
      phaseSchemas(ph.key).forEach(function(s){
        var el=document.getElementById('ph_'+s.key);
        var val=el?el.value||null:null;
        if(isKnownPhase(ph.key)){
          var dbCol=s.key.indexOf(ph.key+'_')===0?s.key:ph.key+'_'+s.key;
          payload[dbCol]=val;
        }else{
          // Custom hito: store in field_values with double-underscore separator
          var fvKey=ph.key+'__'+(s.key.indexOf(ph.key+'_')===0?s.key.slice(ph.key.length+1):s.key);
          if(val)customHitoFV[fvKey]=val;
        }
      });
    });
    if(Object.keys(customHitoFV).length>0){
      payload.field_values=Object.assign({},fields,customHitoFV);
    }
    var p=id
      ?sbGet('deliverables','?id=eq.'+id+'&select=version').then(function(r){payload.version=((r[0]?r[0].version:1)||1)+1;return sbPatch('deliverables','id=eq.'+id,payload);})
      :sbPost('deliverables',payload);
    return p.then(function(saved){
      // Save / update production_units with fixedUnitsVal as weight (planned_qty)
      // consumed_qty stays as-is (progress %)
      var delId=id||( Array.isArray(saved)?saved[0].id:(saved&&saved.id?saved.id:null) );
      if(delId){
        sbGet('production_units','?deliverable_id=eq.'+delId+'&limit=1').then(function(ex){
          if(ex.length){
            sbPatch('production_units','deliverable_id=eq.'+delId,{planned_qty:fixedUnitsVal});
          }else{
            sbPost('production_units',{deliverable_id:delId,planned_qty:fixedUnitsVal,consumed_qty:0,unit_label:'UP'});
          }
        }).catch(function(){});
      }
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
      'RIBA2 LOD','RIBA2 LOI','RIBA2 Fecha','RIBA3 LOD','RIBA3 LOI','RIBA3 Fecha',
      'RIBA4 LOD','RIBA4 LOI','RIBA4 Fecha'];
    var rows=items.map(function(d){return [
      d.code,'"'+(d.name||'')+'"',d.status,d.file_format||'',d.scale||'',d.work_package||'',
      d.riba2_lod||'',d.riba2_loi||'',d.riba2_delivery_date||'',
      d.riba3_lod||'',d.riba3_loi||'',d.riba3_delivery_date||'',
      d.riba4_lod||'',d.riba4_loi||'',d.riba4_delivery_date||''];});
    var csv='\uFEFF'+[headers].concat(rows).map(function(r){return r.join(',');}).join('\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='MIDP_'+APP.project.code+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    toast('CSV exportado.');
  }).catch(function(e){toast(e.message,'error');});
}

function exportMIDP(){
  sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc').then(function(items){
    var headers=['N Ref','Titulo','Descripcion','Paquete','Formato','Tamano','Escala','Predecesores',
      'Proyecto','Originador','Fase Programa','Area Funcional','Fase Proyecto',
      'Volumen','Nivel','Disciplina','Tipo','Secuencial','Codigo','Estado',
      'RIBA2 Resp','RIBA2 LOD','RIBA2 LOI','RIBA2 Doc','RIBA2 T.Prod','RIBA2 Fecha',
      'RIBA3 Resp','RIBA3 LOD','RIBA3 LOI','RIBA3 Doc','RIBA3 T.Prod','RIBA3 Fecha',
      'RIBA4 Resp','RIBA4 LOD','RIBA4 LOI','RIBA4 Doc','RIBA4 T.Prod','RIBA4 Fecha'];
    var rows=items.map(function(d,i){
      var fv=d.field_values||{};
      return [i+1,'"'+(d.name||'')+'"','"'+(d.description||'')+'"',d.work_package||'',
        d.file_format||'',d.sheet_size||'',d.scale||'',d.predecessors||'',
        fv.proyecto||'',fv.originador||'',fv.fase_programa||'',fv.area_funcional||'',
        fv.fase_proyecto||'',fv.volumen||'',fv.nivel||'',fv.disciplina||'',
        fv.tipo_documento||'',fv.secuencial||'',d.code,d.status,
        d.riba2_responsible||'',d.riba2_lod||'',d.riba2_loi||'',d.riba2_doc_assoc||'',d.riba2_prod_time||'',d.riba2_delivery_date||'',
        d.riba3_responsible||'',d.riba3_lod||'',d.riba3_loi||'',d.riba3_doc_assoc||'',d.riba3_prod_time||'',d.riba3_delivery_date||'',
        d.riba4_responsible||'',d.riba4_lod||'',d.riba4_loi||'',d.riba4_doc_assoc||'',d.riba4_prod_time||'',d.riba4_delivery_date||''];
    });
    var csv='\uFEFF'+[headers].concat(rows).map(function(r){return r.join(',');}).join('\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='MIDP_Completo_'+APP.project.code+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    toast('MIDP exportado.');
  }).catch(function(e){toast(e.message,'error');});
}

// ── PROGRESS ──
function renderProgress(){
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-sm" onclick="exportProgressPDF()">&#8659; Exportar PDF</button>'+
    (isAdminLevel()?'<button class="btn btn-sm" onclick="openProgressConfigPanel()">⚙ Configurar vista</button>':'');
  document.getElementById('content').innerHTML=
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
    (getProjectPhases().length>0
      ?getProjectPhases().map(function(ph){return '<option value="'+ph.id+'">'+ph.name+(ph.sub_label?' — '+ph.sub_label:'')+'</option>';}).join('')
      :getPhaseGroups().map(function(ph){return '<option value="'+ph.key+'">'+ph.label+(ph.sub?' - '+ph.sub:'')+'</option>';}).join(''))+
    '</select></div>'+
    '<div style="padding-top:16px"><button class="btn btn-sm" onclick="clearProgressFilters()">x Limpiar</button></div>'+
    '</div></div>'+
    '<div id="progress-content">'+loading()+'</div>';
  window._progressAllDels=null;window._progressProd=null;
  Promise.all([
    sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc'),
  ]).then(function(res){
    var dels=res[0];
    window._progressAllDels=dels;
    // Load production_units scoped to this project's deliverables
    if(!dels||!dels.length){window._progressProd=[];applyProgressFilters();return;}
    var ids=dels.map(function(d){return d.id;});
    sbGet('production_units','?deliverable_id=in.('+ids.join(',')+')'+'&select=*').catch(function(){return[];})
    .then(function(prod){
      window._progressProd=prod;
    var discs=[];
    var _progDiscField=getProgressConfig().discField||'disciplina';
    dels.forEach(function(d){
      var disc=(d.field_values&&d.field_values[_progDiscField])||d[_progDiscField]||'';
      if(disc&&discs.indexOf(disc)<0)discs.push(disc);
    });
    discs.sort();
    var discSel=document.getElementById('pf-disc');
    if(discSel){
      discSel.innerHTML='<option value="">Todas</option>';
      discs.forEach(function(d){var o=document.createElement('option');o.value=d;o.textContent=d;discSel.appendChild(o);});
    }
      applyProgressFilters();
    });
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
  if(!allDels)return;
  var deliverables=allDels.filter(function(d){
    var _discKey=getProgressConfig().discField||'disciplina';
    if(disc&&((d.field_values&&d.field_values[_discKey])||d[_discKey]||'')!==disc)return false;
    if(pkg&&d.work_package!==pkg)return false;
    if(phase){
      var hasPhase=false;
      // Check if it's a project phase ID or a schema phase key
      var projPh=(APP.phases||[]).find(function(p){return p.id===phase;});
      if(projPh){
        // Match by field_key + field_value
        var fv=d.field_values||{};
        hasPhase=(fv[projPh.field_key]||d[projPh.field_key]||'')===projPh.field_value;
      }else{
        hasPhase=isKnownPhase(phase)
          ?!!d[phase+'_delivery_date']
          :!!(d.field_values&&d.field_values[phase+'__delivery_date']);
      }
      if(!hasPhase)return false;
    }
    return true;
  });
  renderProgressContent(deliverables,window._progressProd||[]);
}

function renderProgressContent(deliverables,prod){
  var el=document.getElementById('progress-content');
  if(!el)return;
  var prodMap={};
  prod.forEach(function(p){
    if(!prodMap[p.deliverable_id])prodMap[p.deliverable_id]={plan:0,pct:0};
    // plan = weight (UP), pct = % avance (0-100), consUP = units consumed
    var w=Number(p.planned_qty)||0;
    var pct=Math.min(100,Math.max(0,Number(p.consumed_qty)||0));
    prodMap[p.deliverable_id].plan+=w;
    prodMap[p.deliverable_id].pct=pct; // last registered pct
    prodMap[p.deliverable_id].consUP=Math.round(pct/100*w*10)/10; // UP consumed
  });
  var totalUP=0,totalConsUP=0;
  deliverables.forEach(function(d){
    var p=prodMap[d.id]||{plan:0,pct:0,consUP:0};
    totalUP+=p.plan;
    totalConsUP+=p.consUP||0;
  });
  // Weighted global progress: sum(pct_i * weight_i) / sum(weight_i)
  var pctGen=totalUP>0?Math.round(totalConsUP/totalUP*100):0;
  var totalDels=deliverables.length;
  var completedDels=deliverables.filter(function(d){return d.status==='approved'||d.status==='issued';}).length;
  var canProg=can('can_register_progress');
  var discFieldKey=getProgressConfig().discField||'disciplina';
  var byDisc={};
  deliverables.forEach(function(d){
    var disc=(d.field_values&&d.field_values[discFieldKey])||d[discFieldKey]||'--';
    if(!byDisc[disc])byDisc[disc]={plan:0,consUP:0,total:0,comp:0};
    var p=prodMap[d.id]||{plan:0,pct:0,consUP:0};
    byDisc[disc].plan+=p.plan;
    byDisc[disc].consUP+=(p.consUP||0);
    byDisc[disc].total++;
    if(d.status==='approved'||d.status==='issued')byDisc[disc].comp++;
  });
  // Use project phases (APP.phases) if configured; fallback to field_schemas phases
  var configuredPhases=getProjectPhases();
  var phaseSource=configuredPhases.length>0?'configured':'schemas';
  var phaseStats=[];
  if(phaseSource==='configured'){
    // Use project_phases table: match by field_key + field_value
    phaseStats=configuredPhases.map(function(ph){
      var phDels=deliverables.filter(function(d){
        // Check field_values (code fields) or direct columns
        var fieldVal=getDelFieldVal(d,ph.field_key);
        return fieldVal===ph.field_value;
        return fieldVal===ph.field_value;
      });
      var phTotalUP=0,phConsUP=0;
      phDels.forEach(function(d){
        var p=prodMap[d.id]||{plan:0,consUP:0};
        phTotalUP+=p.plan;phConsUP+=(p.consUP||0);
      });
      var phPct=phTotalUP>0?Math.round(phConsUP/phTotalUP*100):0;
      var comp=phDels.filter(function(d){return d.status==='approved'||d.status==='issued';}).length;
      // Overdue: check date_field_key
      var overdue=0;
      if(ph.date_field_key){
        overdue=phDels.filter(function(d){
          var dateVal=getDelFieldVal(d,ph.date_field_key);
          return dateVal&&new Date(dateVal)<new Date()&&d.status!=='approved'&&d.status!=='issued';
        }).length;
      }
      // Adapt to same shape as schema-based phases
      return {
        ph:{key:ph.id,label:ph.name,sub:ph.sub_label||'',color:ph.color||'var(--brand)'},
        withDate:phDels.length,comp:comp,overdue:overdue,pct:phPct,
        totalUP:phTotalUP,consUP:phConsUP,phDels:phDels
      };
    });
  }else{
    // Fallback: use getPhaseGroups() from field_schemas
    phaseStats=getPhaseGroups().map(function(ph){
      var phDels=deliverables.filter(function(d){
        var dateVal=isKnownPhase(ph.key)?d[ph.key+'_delivery_date']:
          (d.field_values&&d.field_values[ph.key+'__delivery_date']);
        return !!dateVal;
      });
      var phTotalUP=0,phConsUP=0;
      phDels.forEach(function(d){
        var p=prodMap[d.id]||{plan:0,consUP:0};
        phTotalUP+=p.plan;phConsUP+=(p.consUP||0);
      });
      var phPct=phTotalUP>0?Math.round(phConsUP/phTotalUP*100):0;
      var comp=phDels.filter(function(d){return d.status==='approved'||d.status==='issued';}).length;
      var overdue=phDels.filter(function(d){
        var dateVal=isKnownPhase(ph.key)?d[ph.key+'_delivery_date']:
          (d.field_values&&d.field_values[ph.key+'__delivery_date']);
        return dateVal&&new Date(dateVal)<new Date()&&d.status!=='approved'&&d.status!=='issued';
      }).length;
      return {ph:ph,withDate:phDels.length,comp:comp,overdue:overdue,pct:phPct,totalUP:phTotalUP,consUP:phConsUP};
    });
  }
  // Show config hint if no project phases configured
  var phaseHint='';
  if(phaseSource==='schemas'&&isAdminLevel()){
    phaseHint='<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#c2410c;display:flex;align-items:center;gap:10px">'+
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'+
      '<div>Las fases se detectan automáticamente desde los hitos del esquema. Para mayor control, configura las fases en el menú <strong>Fases</strong> del proyecto.'+
      (isAdminLevel()?' <button class="btn btn-sm" onclick="nav(\'phases\',document.getElementById(\'sb-phases\'))">Configurar Fases</button>':'')+ 
      '</div></div>';
  }
  var html=
    phaseHint+
    '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">'+
    kpiCard('Entregables','var(--brand-light)','var(--brand)',totalDels,'registrados')+
    kpiCard('Completados','var(--green-light)','var(--green)',completedDels,(totalDels?Math.round(completedDels/totalDels*100):0)+'%')+
    kpiCard('UP Planificadas','#eff6ff','var(--brand)',totalUP,'unidades productivas')+
    kpiCard('Avance ponderado','var(--green-light)','var(--green)',pctGen+'%','weighted por UP')+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">'+
    phaseStats.map(function(ps){
      var pct=ps.withDate>0?Math.round(ps.comp/ps.withDate*100):0;
      return '<div class="card" style="padding:14px;border-top:3px solid '+ps.ph.color+'">'+
        '<div style="font-size:10px;font-weight:700;color:'+ps.ph.color+';text-transform:uppercase;margin-bottom:8px">'+ps.ph.label+(ps.ph.sub?' · '+ps.ph.sub:'')+'</div>'+
        '<div style="font-size:26px;font-weight:700;font-family:\'Space Grotesk\',sans-serif;color:var(--text)">'+ps.pct+'%</div>'+
        '<div style="font-size:10px;color:var(--text3);margin-top:2px">'+(Math.round((ps.consUP||0)*10)/10)+' / '+ps.totalUP+' UP · '+ps.comp+' completados</div>'+
        '<div class="prog-track" style="margin-top:8px"><div class="prog-fill" style="width:'+ps.pct+'%;background:'+ps.ph.color+'"></div></div>'+
        (ps.overdue>0?'<div style="font-size:9px;color:var(--red);margin-top:6px;font-weight:600">'+ps.overdue+' vencido(s) ⚠</div>':
        '<div style="font-size:9px;color:var(--green);margin-top:6px">Al día</div>')+
        '</div>';
    }).join('')+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">'+
    '<div class="card" style="padding:18px">'+
    '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">Avance por disciplina</div>'+
    (Object.keys(byDisc).length?Object.entries(byDisc).map(function(e){
      var pct=e[1].plan>0?Math.round((e[1].consUP||0)/e[1].plan*100):0;
      return '<div class="prog-row">'+
        '<div class="prog-label" style="font-size:10px;font-weight:600">'+e[0]+'</div>'+
        '<div class="prog-bar-wrap"><div class="prog-track"><div class="prog-fill" style="width:'+pct+'%;background:'+progColor(pct)+'"></div></div>'+
        '<div style="font-size:9px;color:var(--text3)">'+e[1].comp+'/'+e[1].total+' ent.</div></div>'+
        '<div class="prog-pct">'+pct+'%</div></div>';
    }).join(''):'<p style="color:var(--text3);font-size:12px">Sin datos de avance registrados.</p>')+
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
    '<th title="Peso (Unidades Productivas)">Peso</th><th title="% de avance registrado">Avance %</th>'+
    (phaseStats.length>0
      ?phaseStats.map(function(ps){return '<th style="color:'+ps.ph.color+';font-size:9px">'+ps.ph.label+' Fecha</th>';}).join('')
      :'')+
    '<th>Estado</th>'+(canProg?'<th>Registrar</th>':'')+
    '</tr></thead><tbody>'+
    deliverables.map(function(d){
      var p=prodMap[d.id]||{plan:0,cons:0};
      var weight=p.plan||0;
      var pct=Math.min(100,Math.max(0,Math.round(p.pct||0)));
      var today=new Date();
      var phaseDates=phaseStats.map(function(ps){
        var dt='';
        var ph=ps.ph;
        var projPh=(APP.phases||[]).find(function(p){return p.id===ph.key;});
        if(projPh&&projPh.date_field_key){
          // Use the universal field value getter
          dt=getDelFieldVal(d,projPh.date_field_key);
        }else if(!projPh){
          // Schema-based phase fallback
          dt=isKnownPhase(ph.key)
            ?d[ph.key+'_delivery_date']||''
            :(d.field_values&&d.field_values[ph.key+'__delivery_date'])||'';
        }
        if(!dt)return '<td style="font-size:10px;color:var(--text3)">--</td>';
        var overdue=new Date(dt)<today&&d.status!=='approved'&&d.status!=='issued';
        return '<td style="font-size:10px;'+(overdue?'color:var(--red);font-weight:600':'color:var(--text2)')+'">'+fmtDateShort(dt)+(overdue?' ⚠':'')+'</td>';
      }).join('');
      return '<tr>'+
        '<td><span class="code-chip" style="font-size:9px">'+d.code+'</span>'+
        '<div style="font-size:9px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+d.name+'</div></td>'+
        '<td><span class="badge b-progress" style="font-size:9px">'+((d.field_values&&d.field_values[discFieldKey])||d[discFieldKey]||'--')+'</span></td>'+
        '<td style="text-align:center;color:var(--brand)"><div style="font-weight:700">'+p.plan+'</div><div style="font-size:9px;color:var(--text3)">'+Math.round((p.consUP||0)*10)/10+' UP</div></td>'+
        '<td><div style="display:flex;align-items:center;gap:5px">'+
        '<span style="font-size:10px;font-weight:700;color:'+progColor(pct)+'">'+pct+'%</span></div></td>'+
        phaseDates+
        '<td>'+statusBadge(d.status)+'</td>'+
        (canProg?'<td><button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="openProgressModal(\''+d.id+'\',\''+d.code+'\','+weight+','+pct+')">Registrar</button></td>':'')+
        '</tr>';
    }).join('')+
    '</tbody></table></div>';
  el.innerHTML=html;
}

function openProgressModal(delId,code,plan,pct){
  if(!can('can_register_progress')){toast('Sin permiso.','error');return;}
  var overlay=document.createElement('div');
  overlay.className='modal-overlay';overlay.id='prog-modal';
  overlay.innerHTML=
    '<div class="modal" style="max-width:440px">'+
    '<div class="modal-header"><div class="modal-title">Registrar avance</div>'+
    '<button class="btn btn-ghost btn-sm" id="pm-close">X</button></div>'+
    '<div class="modal-body">'+
    '<div style="background:var(--bg);border-radius:var(--r);padding:10px 12px;margin-bottom:16px;border:1px solid var(--border);display:flex;align-items:center;gap:10px">'+
    '<span class="code-chip" style="font-size:10px">'+code+'</span>'+
    '<span style="font-size:11px;color:var(--text3)">Peso: <strong style="color:var(--brand)">'+plan+'</strong> unidad'+(plan!==1?'es':'')+' productiva'+(plan!==1?'s':'')+'</span>'+
    '</div>'+
    '<label class="label" style="font-size:13px;margin-bottom:10px;display:block">Porcentaje de avance</label>'+
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'+
    '<input type="range" id="prog-pct-range" min="0" max="100" value="'+pct+'" style="flex:1;accent-color:var(--brand)" oninput="document.getElementById(\'prog-pct-num\').value=this.value;updateProgressBar()">'+
    '<input type="number" id="prog-pct-num" min="0" max="100" value="'+pct+'" style="width:64px;text-align:center;font-size:18px;font-weight:700" class="input" oninput="document.getElementById(\'prog-pct-range\').value=this.value;updateProgressBar()">'+
    '<span style="font-size:16px;font-weight:700;color:var(--brand)">%</span>'+
    '</div>'+
    '<div style="height:10px;border-radius:5px;background:var(--border2);overflow:hidden;margin-bottom:6px">'+
    '<div id="prog-preview-fill" style="height:100%;width:'+pct+'%;background:'+(pct>=80?'var(--green)':pct>=50?'var(--brand)':'var(--amber)')+';transition:width .2s;border-radius:5px"></div></div>'+
    '<div style="font-size:10px;color:var(--text3);text-align:center;margin-bottom:4px" id="prog-preview-label">'+pct+'% completado</div>'+
    '</div>'+
    '<div class="modal-footer"><button class="btn" id="pm-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="pm-save">Guardar avance</button></div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('pm-close').onclick=function(){overlay.remove();};
  document.getElementById('pm-cancel').onclick=function(){overlay.remove();};
  document.getElementById('pm-save').onclick=function(){saveProgress(delId,overlay);};
}

function updateProgressBar(){
  var pct=Math.min(100,Math.max(0,parseInt(document.getElementById('prog-pct-num').value)||0));
  var fill=document.getElementById('prog-preview-fill');
  var label=document.getElementById('prog-preview-label');
  if(fill){fill.style.width=pct+'%';fill.style.background=pct>=80?'var(--green)':pct>=50?'var(--brand)':'var(--amber)';}
  if(label)label.textContent=pct+'% completado';
}


function saveProgress(delId,overlay){
  var pct=parseInt(document.getElementById('prog-pct-num').value)||0;
  pct=Math.min(100,Math.max(0,pct));
  // progress_pct is stored in consumed_qty (0-100 range), planned_qty = weight (unchanged)
  sbGet('production_units','?deliverable_id=eq.'+delId+'&limit=1').then(function(ex){
    if(ex.length){
      // Keep planned_qty (weight) unchanged, update consumed_qty = pct
      return sbPatch('production_units','deliverable_id=eq.'+delId,{consumed_qty:pct});
    }else{
      // New record: consumed_qty = pct, planned_qty default 1 (weight)
      return sbPost('production_units',{deliverable_id:delId,planned_qty:1,consumed_qty:pct,unit_label:'%'});
    }
  }).then(function(){
    if(overlay)overlay.remove();else closeModal('prog-modal');
    toast('Avance guardado.');
    renderProgress();
  }).catch(function(e){toast(e.message,'error');});
}

// ── SCHEMAS ──
function renderSchemas(){
  if(!isAdminLevel()){
    document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Acceso restringido</div><div class="empty-desc">Solo el administrador puede configurar campos.</div></div>';
    return;
  }
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-sm" onclick="downloadSchemaTemplate()">&#8659; Plantilla</button>'+
    '<button class="btn btn-sm" onclick="importSchemasFromExcel()">&#8593; Importar campos</button>'+
    '<button class="btn btn-sm btn-primary" onclick="openNewHitoModal()">+ Nuevo hito</button>';
  document.getElementById('content').innerHTML=loading();
  sbGet('field_schemas','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=field_order.asc,code_order.asc').then(function(schemas){
    APP.schemas=schemas;
    var fixedGroups=[
      {id:'code',label:'Codificacion',color:'var(--brand)',desc:'Campos que forman el codigo del entregable',fixed:false},
      {id:'general',label:'Informacion general',color:'var(--slate)',desc:'Metadata del contenedor de informacion',fixed:false}
    ];
    var hitoIds=[];
    schemas.forEach(function(s){
      var g=s.field_group;
      if(g&&g!=='code'&&g!=='general'&&hitoIds.indexOf(g)<0)hitoIds.push(g);
    });
    hitoIds.sort(function(a,b){var order={riba2:1,riba3:2,riba4:3};return (order[a]||99)-(order[b]||99);});
    var HITO_COLORS=['#06b6d4','#3b82f6','#8b5cf6','#f59e0b','#10b981','#f43f5e','#6366f1'];
    var hitoGroups=hitoIds.map(function(id,i){
      var sample=schemas.find(function(s){return s.field_group===id;});
      var label=sample&&sample.description&&sample.description.indexOf('hito:')===0
        ?sample.description.replace('hito:','').trim()
        :id.replace('riba2','RIBA 2 - Presentacion 0').replace('riba3','RIBA 3 - Presentacion 1').replace('riba4','RIBA 4 - Presentacion 2').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
      return {id:id,label:label,color:HITO_COLORS[i%HITO_COLORS.length],desc:'Campos del hito '+label,fixed:false};
    });
    var allGroups=fixedGroups.concat(hitoGroups);
    function renderSchemaItem(s,g){
      var isCode=g.id==='code';
      var el=document.createElement('div');
      el.className='schema-item';el.style.marginBottom='5px';
      el.innerHTML=
        '<div class="schema-order" style="background:'+g.color+'20;color:'+g.color+'">'+(isCode?s.code_order:s.field_order)+'</div>'+
        '<div class="schema-info"><div class="schema-name">'+s.name+'</div>'+
        '<div class="schema-meta"><span class="schema-key">.'+s.key+'</span>'+
        '<span class="schema-type-badge">'+(s.field_type==='dropdown'?'lista':s.field_type)+'</span>'+
        (s.is_required?'<span style="font-size:9px;color:var(--red);font-weight:600">obligatorio</span>':'')+
        (isCode?'<span class="code-seg">cod.#'+s.code_order+(s.separator?' + "'+s.separator+'"':'')+'</span>':'')+
        '</div>'+
        (s.allowed_values?'<div class="schema-vals">'+s.allowed_values.map(function(v){return '<span class="val-pill">'+v.value+'</span>';}).join('')+'</div>':'')+
        (s.options?'<div class="schema-vals">'+JSON.parse(typeof s.options==='string'?s.options:JSON.stringify(s.options)).map(function(v){return '<span class="val-pill">'+v+'</span>';}).join('')+'</div>':'')+
        '</div>'+
        (!isCode?'<div style="display:flex;align-items:center;gap:6px;margin-right:8px">'+
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
    allGroups.forEach(function(g){
      var fields=schemas.filter(function(s){return s.field_group===g.id;})
        .sort(function(a,b){return g.id==='code'?(a.code_order-b.code_order):(a.field_order-b.field_order);});
      var section=document.createElement('div');section.style.marginBottom='20px';
      var header=document.createElement('div');
      header.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:8px';
      header.innerHTML='<div><div style="font-size:12px;font-weight:700;color:'+g.color+'">'+g.label+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+g.desc+'</div></div>';
      if(!g.fixed){
        var btnWrap=document.createElement('div');btnWrap.style.cssText='display:flex;gap:6px;align-items:center';
        var addBtn=document.createElement('button');addBtn.className='btn btn-sm btn-primary';
        addBtn.textContent='+ Agregar campo';
        addBtn.onclick=(function(gid){return function(){openSchemaModal(null,gid);};})(g.id);
        btnWrap.appendChild(addBtn);
        if(g.id!=='general'&&g.id!=='riba2'&&g.id!=='riba3'&&g.id!=='riba4'){
          var renameBtn=document.createElement('button');renameBtn.className='btn btn-sm';
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
        empty.textContent='Sin campos configurados.';section.appendChild(empty);
      }else{fields.forEach(function(s){section.appendChild(renderSchemaItem(s,g));});}
      container.appendChild(section);
    });
    if(hitoGroups.length===0){
      var hint=document.createElement('div');
      hint.style.cssText='padding:14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--rl);font-size:12px;color:var(--text3);text-align:center';
      hint.innerHTML='No hay hitos configurados. Usa <strong>+ Nuevo hito</strong> para agregar.';
      container.appendChild(hint);
    }
    var el=document.getElementById('content');el.innerHTML='';el.appendChild(container);
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
    '<div class="modal-header"><div class="modal-title">'+(s?'Editar: '+s.name:'Nuevo campo — '+(groupLabels[grp]||grp))+'</div>'+
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
    '<div class="form-group full"><label class="label">Opciones (una por linea)</label>'+
    '<textarea class="input" id="sch-opts" rows="4" style="font-family:\'JetBrains Mono\',monospace;font-size:11px" placeholder="RVT&#10;IFC&#10;DWG">'+
    (s&&s.options?JSON.parse(typeof s.options==='string'?s.options:JSON.stringify(s.options)).join('\n'):
    (s&&s.allowed_values?s.allowed_values.map(function(v){return v.value+'|'+v.label;}).join('\n'):''))+
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
    if(isCode){allowedVals=optsRaw.split('\n').filter(Boolean).map(function(l){var p=l.split('|');return{value:p[0].trim(),label:(p[1]||p[0]).trim()};});}
    else{opts=JSON.stringify(optsRaw.split('\n').filter(Boolean).map(function(l){return l.trim();}));}
  }
  var baseKey=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  var key=baseKey;
  if(!id){
    if(grp!=='code'&&grp!=='general')key=grp+'_'+baseKey;
    var existing=APP.schemas.filter(function(s){return s.key===key;});
    if(existing.length>0)key=key+'_'+Date.now().toString().slice(-4);
  }
  var payload={name:name,field_type:type,is_required:!!(document.getElementById('sch-req')&&document.getElementById('sch-req').checked),field_group:grp,project_id:APP.project.id,is_active:true};
  if(isCode){
    payload.key=key;payload.is_part_of_code=true;
    payload.code_order=parseInt(document.getElementById('sch-order').value)||99;
    payload.separator=document.getElementById('sch-sep').value;
    payload.max_length=parseInt(document.getElementById('sch-maxlen').value)||10;
    payload.allowed_values=allowedVals;
  }else{
    if(!id)payload.key=key;payload.is_part_of_code=false;
    payload.field_order=parseInt(document.getElementById('sch-field-order').value)||99;
    payload.placeholder=document.getElementById('sch-placeholder').value||null;
    payload.is_visible=!!(document.getElementById('sch-visible')&&document.getElementById('sch-visible').checked);
    payload.options=opts?JSON.parse(opts):null;payload.max_length=255;payload.code_order=99;payload.separator='';
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
    '<p style="font-size:11px;color:var(--text3);margin-top:6px">Los datos existentes no se borran.</p></div>'+
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
  var isAdminLvl=isAdminLevel();
  document.getElementById('topbar-actions').innerHTML=isAdmin?'<button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Nuevo usuario</button>':'';
  var pid=APP.project&&APP.project.id;
  if(!pid){document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Sin proyecto activo</div></div>';return;}
  document.getElementById('content').innerHTML=loading();
  sbGet('project_members','?project_id=eq.'+pid+'&select=id,user_id,role,permissions,users(id,full_name,email,role,specialty,company,is_active)').then(function(members){
    APP.projectMembers=members;
    var html='<div style="margin-bottom:12px;padding:10px 14px;background:var(--brand-light);border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:var(--brand);display:flex;align-items:center;gap:8px">'+
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'+
      'Los permisos se configuran <strong style="margin:0 3px">por proyecto</strong>. Proyecto activo: <strong style="margin:0 3px">'+APP.project.name+'</strong></div>';
    if(!members.length){
      html+='<div class="empty"><div class="empty-icon">👥</div><div class="empty-title">Sin miembros</div><div class="empty-desc">Agrega miembros desde Proyectos → Miembros</div></div>';
      document.getElementById('content').innerHTML=html;return;
    }
    html+=members.map(function(m){
      var u=m.users||{};
      var pmRole=m.role||'member';
      var pmPerms=m.permissions||DEFAULT_PERMS;
      var isTrueAdmin=(u.role||'')==='admin';
      var isProjAdmin=pmRole==='project_admin';
      var isElevated=isTrueAdmin||isProjAdmin;
      return '<div class="perm-card">'+
        '<div class="perm-card-header">'+
        '<div class="perm-avatar"'+(isProjAdmin?' style="background:var(--violet)"':isTrueAdmin?' style="background:var(--brand)"':'')+'>'+
        (isProjAdmin?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>':initials(u.full_name||'?'))+
        '</div>'+
        '<div class="perm-user-info">'+
        '<div class="perm-name">'+(u.full_name||'Usuario')+(m.user_id===APP.user.id?' <span style="font-size:9px;background:#eff6ff;color:var(--brand);padding:1px 5px;border-radius:10px;font-weight:600">Tú</span>':'')+'</div>'+
        '<div class="perm-email">'+(u.email||'')+(u.specialty?' · '+u.specialty:'')+'</div>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-left:auto">'+
        '<span class="badge '+(isProjAdmin?'b-proj-admin':isTrueAdmin?'b-admin':pmRole==='bim_manager'?'b-bim':'b-spec')+'">'+
        (isProjAdmin?'Admin. Proyecto':isTrueAdmin?'Administrador':pmRole==='bim_manager'?'BIM Manager':'Especialista')+'</span>'+
        (u.is_active?'<span class="badge b-approved" style="font-size:9px">Activo</span>':'<span class="badge b-rejected" style="font-size:9px">Inactivo</span>')+
        (isAdmin&&!isTrueAdmin?'<button class="btn btn-ghost btn-sm edit-user-btn" data-uid="'+m.user_id+'"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'')+
        '</div></div>'+
        '<div class="perm-body">'+
        (isAdmin&&!isTrueAdmin?
          '<div class="perm-item" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:8px 10px;margin-bottom:6px">'+
          '<div style="flex:1"><div class="perm-item-label" style="color:var(--violet);font-weight:700;font-size:12px">⭐ Control de administrador del proyecto</div>'+
          '<div style="font-size:10px;color:var(--text3);margin-top:2px">Acceso total en este proyecto — excepto crear nuevos proyectos</div></div>'+
          '<label class="toggle"><input type="checkbox"'+(isProjAdmin?' checked':'')+' class="proj-admin-toggle" data-mid="'+m.id+'" data-uid="'+m.user_id+'"><span class="toggle-slider" style="--toggle-on:#7c3aed"></span></label>'+
          '</div>':'') +
        PERM_CONFIG.map(function(p){
          var isActive=isElevated?true:!!(pmPerms[p.key]);
          return '<div class="perm-item">'+
            '<div class="perm-item-label">'+p.label+'</div>'+
            (isElevated?'<span style="font-size:10px;color:var(--green);font-weight:600">Siempre</span>':
            (isAdmin?'<label class="toggle"><input type="checkbox"'+(isActive?' checked':'')+' class="perm-toggle" data-mid="'+m.id+'" data-pkey="'+p.key+'"><span class="toggle-slider"></span></label>':
            '<span style="font-size:10px;font-weight:600;color:'+(isActive?'var(--green)':'var(--text3)')+'">'+( isActive?'Sí':'No')+'</span>'))+'</div>';
        }).join('')+
        '</div></div>';
    }).join('');
    document.getElementById('content').innerHTML=html;
    document.querySelectorAll('.edit-user-btn').forEach(function(btn){
      btn.addEventListener('click',function(){openUserModal(btn.dataset.uid);});
    });
    document.querySelectorAll('.proj-admin-toggle').forEach(function(chk){
      chk.addEventListener('change',function(){toggleProjectAdmin(chk.dataset.mid,chk.dataset.uid,chk.checked);});
    });
    document.querySelectorAll('.perm-toggle').forEach(function(chk){
      chk.addEventListener('change',function(){togglePerm(chk.dataset.mid,chk.dataset.pkey,chk.checked);});
    });
  }).catch(function(e){
    document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';
  });
}

function togglePerm(memberId,permKey,value){
  var m=APP.projectMembers.find(function(x){return x.id===memberId;});
  var cp=Object.assign({},DEFAULT_PERMS,m?m.permissions:{});
  cp[permKey]=value;
  sbPatch('project_members','id=eq.'+memberId,{permissions:cp}).then(function(){
    var idx=APP.projectMembers.findIndex(function(x){return x.id===memberId;});
    if(idx>=0)APP.projectMembers[idx].permissions=cp;
    if(m&&m.user_id===APP.user.id)APP.projectMember=APP.projectMembers[idx];
    toast('Permiso actualizado.');
  }).catch(function(e){toast(e.message,'error');renderUsers();});
}

function toggleProjectAdmin(memberId,userId,enable){
  var newPmRole=enable?'project_admin':'member';
  sbPatch('project_members','id=eq.'+memberId,{role:newPmRole}).then(function(){
    var idx=APP.projectMembers.findIndex(function(x){return x.id===memberId;});
    if(idx>=0)APP.projectMembers[idx].role=newPmRole;
    if(userId===APP.user.id)APP.projectMember=APP.projectMembers[idx];
    toast(enable?'Control de administrador activado.':'Control de administrador desactivado.');
    renderUsers();
  }).catch(function(e){toast(e.message,'error');renderUsers();});
}

function openUserModal(id){
  var isAdmin=APP.user&&APP.user.role==='admin';
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
    (isAdmin?'<option value="admin"'+(u&&u.role==='admin'?' selected':'')+'>Administrador</option>':'')+
    '</select></div>'+
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
  document.getElementById('content').innerHTML='<div id="pkg-list">'+loading()+'</div>';
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
        var btnEdit=document.createElement('button');btnEdit.className='btn btn-ghost btn-sm';
        btnEdit.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        btnEdit.onclick=(function(pid){return function(){openPackageModal(pid);};})(p.id);
        var btnDel=document.createElement('button');btnDel.className='btn btn-ghost btn-sm';btnDel.style.color='var(--red)';
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
  // Always fetch fresh from DB to avoid stale APP.packages cache
  var fetchP=pid
    ?sbGet('packages','?id=eq.'+pid+'&limit=1').then(function(r){return r[0]||null;})
    :Promise.resolve(null);
  fetchP.then(function(p){
  var discSchema=codeSchemas().find(function(s){return s.key==='disciplina';});
  var discOpts='<option value="">Sin disciplina</option>';
  if(discSchema&&discSchema.allowed_values){
    discOpts+=discSchema.allowed_values.map(function(v){
      return '<option value="'+v.value+'"'+(p&&p.discipline===v.value?' selected':'')+'>'+v.value+' - '+v.label+'</option>';
    }).join('');
  }
  var overlay=document.createElement('div');overlay.id='pkg-modal';overlay.className='modal-overlay';
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
  }); // end fetchP.then
}

function savePackage(pid){
  var btn=document.getElementById('pkg-save-btn');
  var code=document.getElementById('pkg-code').value.trim().toUpperCase();
  var name=document.getElementById('pkg-name').value.trim();
  if(!code||!name){toast('Codigo y nombre son obligatorios.','error');return;}
  btn.disabled=true;btn.textContent='Guardando...';
  var payload={project_id:APP.project.id,code:code,name:name,
    description:document.getElementById('pkg-desc').value||null,
    discipline:document.getElementById('pkg-disc').value||null,
    responsible:document.getElementById('pkg-resp').value||null,
    start_date:document.getElementById('pkg-start').value||null,
    end_date:document.getElementById('pkg-end').value||null};
  var req=pid?sbPatch('packages','id=eq.'+pid,payload):sbPost('packages',payload);
  req.then(function(){
    toast(pid?'Paquete actualizado.':'Paquete creado.');closeModal('pkg-modal');
    sbGet('packages','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=code.asc')
      .then(function(pkgs){APP.packages=pkgs;}).catch(function(){});
    loadPackages();
  }).catch(function(e){toast(e.message,'error');btn.disabled=false;btn.textContent=pid?'Actualizar':'Crear paquete';});
}

function confirmDeletePackage(pid,pname){
  var overlay=document.createElement('div');overlay.id='pkg-confirm';overlay.className='modal-overlay';
  overlay.innerHTML='<div class="modal" style="max-width:380px">'+
    '<div class="modal-header"><div class="modal-title">Eliminar paquete?</div>'+
    '<button class="btn btn-ghost btn-sm" id="pkgc-close">X</button></div>'+
    '<div class="modal-body"><p style="font-size:13px;color:var(--text2)">Eliminar el paquete <strong>'+pname+'</strong>?</p>'+
    '<p style="font-size:11px;color:var(--text3);margin-top:6px">Los entregables asociados no se veran afectados.</p></div>'+
    '<div class="modal-footer"><button class="btn" id="pkgc-cancel">Cancelar</button>'+
    '<button class="btn btn-danger" id="pkgc-del">Eliminar</button></div></div>';
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

// ── PROJECTS ──
function renderProjects(){
  document.getElementById('topbar-actions').innerHTML=
    (APP.user&&APP.user.role==='admin'?'<button class="btn btn-primary btn-sm" onclick="openNewProjectModal()">+ Nuevo proyecto</button>':'');
  document.getElementById('content').innerHTML='<div id="proj-list">'+loading()+'</div>';
  sbGet('projects','?is_active=eq.true&order=created_at.desc')
    .then(function(projects){
      if(!projects.length){
        document.getElementById('proj-list').innerHTML='<div class="card"><div class="empty"><div class="empty-title">Sin proyectos</div></div></div>';
        return;
      }
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
            buildProjBtn('edit',p.id)+buildProjBtn('members',p.id)+buildProjBtn('switch',p.id)+
            '</div></td></tr>';
        }).join('');
        document.getElementById('proj-list').innerHTML=
          '<div class="card" style="overflow:hidden"><table class="tbl"><thead><tr>'+
          '<th>Codigo</th><th>Nombre</th><th>Cliente</th><th>Ubicacion</th><th>Fase</th><th>Miembros</th><th style="text-align:right">Acciones</th>'+
          '</tr></thead><tbody>'+rows+'</tbody></table></div>';
        document.querySelectorAll('[data-proj-action]').forEach(function(btn){
          btn.onclick=function(){
            var action=btn.dataset.projAction;var pid=btn.dataset.projId;
            if(action==='edit')openEditProjectModal(pid);
            else if(action==='members')openProjectMembersModal(pid);
            else if(action==='switch')selectProject(pid);
          };
        });
      });
    }).catch(function(e){
      document.getElementById('proj-list').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';
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
  sbGet('projects','?id=eq.'+pid+'&limit=1').then(function(r){
    var proj=r[0];if(!proj)return;
    var overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='edit-proj-modal';
    overlay.innerHTML='<div class="modal"><div class="modal-header">'+
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
      '<div class="modal-footer"><button class="btn" id="ep-cancel">Cancelar</button>'+
      '<button class="btn btn-primary" id="ep-save">Actualizar</button></div></div>';
    document.getElementById('modal-container').appendChild(overlay);
    document.getElementById('ep-close').onclick=function(){overlay.remove();};
    document.getElementById('ep-cancel').onclick=function(){overlay.remove();};
    document.getElementById('ep-save').onclick=function(){
      var name=document.getElementById('ep-name').value.trim();
      if(!name){toast('Nombre obligatorio.','error');return;}
      sbPatch('projects','id=eq.'+pid,{name:name,
        description:document.getElementById('ep-desc').value||null,
        client:document.getElementById('ep-client').value||null,
        location:document.getElementById('ep-location').value||null,
        phase:document.getElementById('ep-phase').value||null})
        .then(function(){toast('Proyecto actualizado.');overlay.remove();renderProjects();})
        .catch(function(e){toast(e.message,'error');});
    };
  });
}

function openProjectMembersModal(pid){
  var overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='members-modal';
  overlay.innerHTML='<div class="modal"><div class="modal-header">'+
    '<div class="modal-title">Miembros del proyecto</div>'+
    '<button class="btn btn-ghost btn-sm" id="pm-close">X</button></div>'+
    '<div class="modal-body"><div id="pm-list">'+loading()+'</div>'+
    '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border2)">'+
    '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:8px">Agregar usuario</div>'+
    '<div style="display:flex;gap:8px">'+
    '<select class="input" id="pm-user-sel" style="flex:1"><option value="">Seleccionar usuario...</option>'+
    APP.users.map(function(u){return '<option value="'+u.id+'">'+u.full_name+' ('+u.email+')</option>';}).join('')+
    '</select><button class="btn btn-primary btn-sm" id="pm-add-btn">Agregar</button></div></div></div>'+
    '<div class="modal-footer"><button class="btn" id="pm-done">Cerrar</button></div></div>';
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
  var el=document.getElementById('pm-list');if(!el)return;
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
          fetch(SUPA_URL+'/rest/v1/project_members?id=eq.'+btn.dataset.mid,{method:'DELETE',headers:H})
            .then(function(){toast('Miembro eliminado.');loadProjMembers(pid);})
            .catch(function(e){toast(e.message,'error');});
        };
      });
    });
}

// ── HITOS ──
function openNewHitoModal(){
  var overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='hito-modal';
  overlay.innerHTML='<div class="modal" style="max-width:440px">'+
    '<div class="modal-header"><div class="modal-title">Nuevo hito</div>'+
    '<button class="btn btn-ghost btn-sm" id="hito-close">X</button></div>'+
    '<div class="modal-body">'+
    '<p style="font-size:12px;color:var(--text2);margin-bottom:14px">Un hito agrupa campos por fase de entrega (Ej: RIBA 2, RIBA 3, Construccion...).</p>'+
    '<div class="form-grid">'+
    '<div class="form-group full"><label class="label">Nombre del hito *</label>'+
    '<input type="text" class="input" id="hito-name" placeholder="Ej: Construccion, RIBA 2..."></div>'+
    '<div class="form-group full"><label class="label">Descripcion corta</label>'+
    '<input type="text" class="input" id="hito-desc" placeholder="Ej: Entrega final..."></div>'+
    '</div></div>'+
    '<div class="modal-footer"><button class="btn" id="hito-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="hito-save">Crear hito</button></div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('hito-close').onclick=function(){overlay.remove();};
  document.getElementById('hito-cancel').onclick=function(){overlay.remove();};
  document.getElementById('hito-save').onclick=function(){
    var name=document.getElementById('hito-name').value.trim();
    if(!name){toast('El nombre es obligatorio.','error');return;}
    var key='hito_'+name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    var existing=APP.schemas.find(function(s){return s.field_group===key;});
    if(existing){toast('Ya existe un hito con ese nombre.','error');return;}
    var desc=document.getElementById('hito-desc').value.trim();
    var placeholder={project_id:APP.project.id,name:name+' - Responsable',key:key+'_responsible',
      field_type:'text',is_required:false,is_part_of_code:false,code_order:99,separator:'',max_length:255,
      field_group:key,is_visible:true,field_order:1,placeholder:'Responsable del hito',is_active:true,
      description:'hito:'+name+(desc?' - '+desc:'')};
    sbPost('field_schemas',placeholder).then(function(){
      toast('Hito "'+name+'" creado.');overlay.remove();renderSchemas();
    }).catch(function(e){toast(e.message,'error');});
  };
  document.getElementById('hito-name').focus();
}

function openRenameHitoModal(groupId,currentLabel){
  var overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='rename-hito-modal';
  overlay.innerHTML='<div class="modal" style="max-width:400px">'+
    '<div class="modal-header"><div class="modal-title">Renombrar hito</div>'+
    '<button class="btn btn-ghost btn-sm" id="rh-close">X</button></div>'+
    '<div class="modal-body"><div class="form-group"><label class="label">Nuevo nombre</label>'+
    '<input type="text" class="input" id="rh-name" value="'+currentLabel+'"></div></div>'+
    '<div class="modal-footer"><button class="btn" id="rh-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="rh-save">Guardar</button></div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('rh-close').onclick=function(){overlay.remove();};
  document.getElementById('rh-cancel').onclick=function(){overlay.remove();};
  document.getElementById('rh-save').onclick=function(){
    var newName=document.getElementById('rh-name').value.trim();
    if(!newName){toast('Nombre obligatorio.','error');return;}
    var ids=APP.schemas.filter(function(s){return s.field_group===groupId;}).map(function(s){return s.id;});
    var updates=ids.map(function(id){return sbPatch('field_schemas','id=eq.'+id,{description:'hito:'+newName});});
    Promise.all(updates).then(function(){toast('Hito renombrado.');overlay.remove();renderSchemas();})
      .catch(function(e){toast(e.message,'error');});
  };
}


// ══════════════════════════════════════════════════
// ── MODELOS BIM ──
// Entregables con tipo_documento = 'MOD'
// ══════════════════════════════════════════════════

function renderModels(){
  // Config button (admin only)
  document.getElementById('topbar-actions').innerHTML=
    isAdminLevel()?'<button class="btn btn-sm" onclick="openModelConfigModal()">⚙ Configurar filtro</button>':'';

  document.getElementById('content').innerHTML=loading();
  if(!APP.project)return;

  var cfg=getModelConfig();
  sbGet('deliverables',
    '?project_id=eq.'+APP.project.id+
    '&is_active=eq.true'+
    getModelFilterParam()+
    '&order=code.asc'
  ).then(function(models){
    if(!models.length){
      document.getElementById('content').innerHTML=
        '<div class="empty">'+
        '<div class="empty-icon">🏗️</div>'+
        '<div class="empty-title">Sin modelos registrados</div>'+
        '<div class="empty-desc">Los entregables que cumplan con el filtro configurado aparecerán aquí.<br>'+
        'Filtro actual: <strong>'+cfg.fieldKey+' = '+cfg.fieldValue+'</strong>'+
        (isAdminLevel()?'<br><a href="#" onclick="openModelConfigModal();return false;" style="font-size:11px">Cambiar filtro</a>':'')+
        '</div>'+
        '</div>';
      return;
    }

    // Group by discipline
    var byDisc={};
    models.forEach(function(m){
      var disc=(m.field_values&&m.field_values.disciplina)||'Sin disciplina';
      if(!byDisc[disc])byDisc[disc]=[];
      byDisc[disc].push(m);
    });

    var html='<div style="margin-bottom:14px;display:flex;align-items:center;gap:10px">'+
      '<div style="font-size:12px;color:var(--text3)">'+models.length+' modelo'+(models.length>1?'s':'')+' registrado'+(models.length>1?'s':'')+' en este proyecto</div>'+
      '</div>';

    Object.entries(byDisc).forEach(function(entry){
      var disc=entry[0]; var items=entry[1];
      html+='<div style="margin-bottom:20px">'+
        '<div style="font-size:11px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;display:flex;align-items:center;gap:6px">'+
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--brand)"></span>'+disc+
        ' <span style="font-size:9px;color:var(--text3);font-weight:400;text-transform:none">('+items.length+' modelo'+(items.length>1?'s':'')+')</span></div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">'+
        items.map(function(m){
          // Get deliverables associated to this model
          var assocCount=0; // Will be loaded async if needed
          var statusInfo=STATUS_CFG[m.status]||STATUS_CFG.pending;
          // Build phase info
          var phaseInfo=getPhaseGroups().map(function(ph){
            var lod=m[ph.key+'_lod']||m[(ph.key.indexOf(ph.key+'_')===0?ph.key+'_lod':ph.key+'_lod')];
            var date=m[ph.key+'_delivery_date'];
            if(!lod&&!date)return '';
            return '<span style="font-size:9px;color:'+ph.color+';font-weight:600">'+ph.label+
              (lod?' LOD'+lod:'')+(date?' · '+fmtDateShort(date):'')+
              '</span>';
          }).filter(Boolean).join(' · ');

          return '<div class="card" style="padding:14px;border-left:3px solid var(--brand)">'+
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">'+
            // Code — clickable if url
            (m.url?
              '<a href="'+m.url+'" target="_blank" class="code-chip" style="font-size:10px;text-decoration:none;color:var(--brand)" title="Abrir en repositorio">'+m.code+' ↗</a>':
              '<span class="code-chip" style="font-size:10px">'+m.code+'</span>')+
            '<span class="badge '+statusInfo.cls+'" style="font-size:9px">'+statusInfo.label+'</span>'+
            '</div>'+
            '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px;line-height:1.3">'+m.name+'</div>'+
            (m.description?'<div style="font-size:11px;color:var(--text3);margin-bottom:6px;line-height:1.4">'+m.description+'</div>':'')+
            (phaseInfo?'<div style="margin-bottom:8px">'+phaseInfo+'</div>':'')+
            (m.work_package?'<div style="font-size:9px;color:var(--text3)">📦 '+m.work_package+'</div>':'')+
            // Associated deliverables
            '<div id="assoc-'+m.id+'" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border2);font-size:10px;color:var(--text3)">'+
            '<span>Cargando entregables asociados...</span></div>'+
            (can('can_edit_deliverables')?
              '<div style="margin-top:8px">'+
              '<button class="btn btn-ghost btn-sm" onclick="openDeliverableModal(\''+m.id+'\')" style="font-size:10px;width:100%">✎ Editar modelo</button>'+
              '</div>':'')+
            '</div>';
        }).join('')+
        '</div></div>';
    });

    document.getElementById('content').innerHTML=html;

    // Load associated deliverables for each model async
    models.forEach(function(m){
      sbGet('deliverables',
        '?project_id=eq.'+APP.project.id+
        '&is_active=eq.true'+
        '&select=id,code,name,status'+
        // Find deliverables where any phase doc_assoc = this model's code
        '&or=(riba2_doc_assoc.eq.'+encodeURIComponent(m.code)+
        ',riba3_doc_assoc.eq.'+encodeURIComponent(m.code)+
        ',riba4_doc_assoc.eq.'+encodeURIComponent(m.code)+')'
      ).then(function(assoc){
        var el=document.getElementById('assoc-'+m.id);
        if(!el)return;
        if(!assoc.length){
          el.innerHTML='<span style="color:var(--text3)">Sin entregables asociados</span>';
        }else{
          el.innerHTML='<div style="font-size:10px;font-weight:600;color:var(--text3);margin-bottom:4px">'+
            assoc.length+' entregable'+(assoc.length>1?'s':'')+' asociado'+(assoc.length>1?'s':'')+':</div>'+
            assoc.map(function(d){
              return '<div style="display:flex;align-items:center;gap:6px;margin-top:3px">'+
                '<span class="code-chip" style="font-size:9px">'+d.code+'</span>'+
                '<span style="font-size:10px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+d.name+'</span>'+
                statusBadge(d.status)+
                '</div>';
            }).join('');
        }
      }).catch(function(){});
    });
  }).catch(function(e){
    document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';
  });
}

// ══════════════════════════════════════════════════
// ── GRUPOS DE ENTREGABLES ──
// Configura los nombres y tipos de grupos
// Un grupo se asigna a cada entregable como campo adicional
// ══════════════════════════════════════════════════

function openModelConfigModal(){
  var cfg=getModelConfig();
  // Build field key options from codeSchemas + generalSchemas
  var allKeys=[].concat(
    codeSchemas().map(function(s){return {key:s.key,name:s.name+' (código)',vals:s.allowed_values};}),
    generalSchemas().map(function(s){return {key:s.key,name:s.name+' (general)',vals:null};})
  );

  var overlay=document.createElement('div');
  overlay.className='modal-overlay';overlay.id='model-cfg-modal';
  overlay.innerHTML=
    '<div class="modal" style="max-width:520px">'+
    '<div class="modal-header">'+
    '<div><div class="modal-title">⚙ Configurar identificador de Modelos</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-top:2px">Define qué campo y valor identifica un entregable como Modelo BIM</div>'+
    '</div>'+
    '<button class="btn btn-ghost btn-sm" id="mcfg-close">X</button></div>'+
    '<div class="modal-body">'+
    '<div style="background:var(--brand-light);border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:var(--brand)">'+
    '📋 Configuración actual: <strong>'+cfg.fieldKey+' = "'+cfg.fieldValue+'"</strong>'+
    '</div>'+
    '<div class="form-grid">'+
    '<div class="form-group"><label class="label">Campo identificador *</label>'+
    '<select class="input" id="mcfg-key">'+
    allKeys.map(function(f){
      return '<option value="'+f.key+'"'+(f.key===cfg.fieldKey?' selected':'')+'>'+f.name+' ('+f.key+')</option>';
    }).join('')+
    // Also allow manual entry
    '<option value="__custom"'+(allKeys.every(function(f){return f.key!==cfg.fieldKey;})?'':'')+'>Otro (escribir)</option>'+
    '</select></div>'+
    '<div class="form-group"><label class="label">Valor que identifica un modelo *</label>'+
    '<input type="text" class="input" id="mcfg-val" value="'+cfg.fieldValue+'" placeholder="Ej: MOD, Modelo, BIM...">'+
    '</div>'+
    '</div>'+
    // Preview: show values from the selected field
    '<div style="margin-top:8px;padding:10px;background:var(--bg);border-radius:8px;font-size:11px;color:var(--text3)">'+
    '💡 <strong>Ejemplos:</strong> '+
    'Si tu campo es <em>tipo_documento</em> con valor <em>MOD</em> → todos los entregables con tipo MOD serán Modelos.<br>'+
    'Si usas otro campo como <em>disciplina</em> con valor <em>BIM</em> → los de disciplina BIM serán Modelos.'+
    '</div>'+
    '</div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="mcfg-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="mcfg-save">Guardar configuración</button>'+
    '</div></div>';

  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('mcfg-close').onclick=function(){overlay.remove();};
  document.getElementById('mcfg-cancel').onclick=function(){overlay.remove();};
  document.getElementById('mcfg-save').onclick=function(){
    var keyEl=document.getElementById('mcfg-key');
    var valEl=document.getElementById('mcfg-val');
    var key=keyEl.value.trim();
    var val=valEl.value.trim();
    if(!key||!val){toast('Campo y valor son obligatorios.','error');return;}
    saveModelConfig(key,val);
    toast('Configuración guardada. Recargando modelos...');
    overlay.remove();
    renderModels();
  };
}

// ══════════════════════════════════════════════════════════════
// ── FASES DEL PROYECTO ──
// Configura qué fases tiene el proyecto y cómo se identifican
// los entregables de cada fase (campo de codificación o general)
// ══════════════════════════════════════════════════════════════

// ── Config panel for Control de avance ──
function openProgressConfigPanel(){
  if(!isAdminLevel()){toast('Sin permiso.','error');return;}
  var projectPhases=getProjectPhases();

  var overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='prog-cfg-modal';
  overlay.innerHTML=
    '<div class="modal" style="max-width:560px">'+
    '<div class="modal-header">'+
    '<div><div class="modal-title">⚙ Configurar Control de avance</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-top:2px">Define qué campos se usan para los gráficos y métricas</div>'+
    '</div>'+
    '<button class="btn btn-ghost btn-sm" id="pcfg-close">X</button></div>'+
    '<div class="modal-body">'+

    // Disciplina field config
    '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">'+
    '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px">📊 Campo Disciplina</div>'+
    '<div class="form-group">'+
    '<label class="label">Campo que contiene la disciplina del entregable</label>'+
    '<select class="input" id="pcfg-disc-field">'+
    '<option value="">— Sin disciplina configurada —</option>'+
    codeSchemas().concat(generalSchemas()).map(function(s){
      var saved=getProgressConfig().discField||'disciplina';
      return '<option value="'+s.key+'"'+(saved===s.key?' selected':'')+'>'+s.name+' ('+s.key+')</option>';
    }).join('')+
    '</select></div></div>'+

    // Phase cards info
    (projectPhases.length>0?
      '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:12px">'+
      '<div style="font-size:11px;font-weight:700;color:#15803d;margin-bottom:6px">✅ Fases configuradas ('+projectPhases.length+')</div>'+
      '<div style="font-size:11px;color:var(--text2)">'+
      projectPhases.map(function(ph){
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
          '<span style="width:10px;height:10px;border-radius:50%;background:'+ph.color+';flex-shrink:0"></span>'+
          '<strong>'+ph.name+'</strong> — campo: <code>'+ph.field_key+'</code> = "'+ph.field_value+'"'+
          (ph.date_field_key?' · fecha: <code>'+ph.date_field_key+'</code>':' <span style="color:var(--red);font-size:10px">⚠ Sin fecha de entrega</span>')+
          '</div>';
      }).join('')+
      '</div></div>':
      '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;color:#c2410c">'+
      '⚠ No hay fases configuradas. Las tarjetas de fases en Control de avance estarán vacías.'+
      '<br><button class="btn btn-sm" style="margin-top:8px" onclick="document.getElementById(\'prog-cfg-modal\').remove();nav(\'phases\',document.getElementById(\'sb-phases\'))">→ Configurar Fases</button>'+
      '</div>')+

    '</div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="pcfg-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="pcfg-save">Guardar configuración</button>'+
    '</div></div>';

  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('pcfg-close').onclick=function(){overlay.remove();};
  document.getElementById('pcfg-cancel').onclick=function(){overlay.remove();};
  document.getElementById('pcfg-save').onclick=function(){
    var discField=document.getElementById('pcfg-disc-field').value;
    saveProgressConfig({discField:discField||'disciplina'});
    toast('Configuración guardada.');
    overlay.remove();
    renderProgress();
  };
}

// Progress config stored in localStorage per project
function getProgressConfig(){
  var pid=APP.project&&APP.project.id;
  if(!pid)return {discField:'disciplina'};
  try{var r=localStorage.getItem('midp_progress_cfg_'+pid);if(r)return JSON.parse(r);}catch(e){}
  return {discField:'disciplina'};
}
function saveProgressConfig(cfg){
  var pid=APP.project&&APP.project.id;
  if(!pid)return;
  localStorage.setItem('midp_progress_cfg_'+pid,JSON.stringify(cfg));
}

function renderPhases(){
  if(!isAdminLevel()){
    document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Acceso restringido</div><div class="empty-desc">Solo el administrador puede configurar fases.</div></div>';
    return;
  }
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-primary btn-sm" onclick="openPhaseModal(null)">+ Nueva fase</button>';
  document.getElementById('content').innerHTML=loading();

  sbGet('project_phases','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=display_order.asc')
    .then(function(phases){
      APP.phases=phases;
      if(!phases.length){
        document.getElementById('content').innerHTML=
          '<div style="background:var(--brand-light);border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin-bottom:16px">'+
          '<div style="font-size:13px;font-weight:700;color:var(--brand);margin-bottom:8px">¿Para qué sirven las Fases?</div>'+
          '<div style="font-size:12px;color:var(--text2);line-height:1.6">'+
          'Las fases permiten vincular entregables a etapas del proyecto (RIBA 2, RIBA 3, Construcción, etc.).<br>'+
          'Para cada fase debes definir:<br>'+
          '• <strong>Qué campo identifica la fase</strong> — ej: el campo "Fase Proyecto" con valor "RIBA 2"<br>'+
          '• <strong>Qué campo contiene la fecha de entrega</strong> — para medir avance y alertas de vencimiento<br>'+
          'Esto reemplaza la dependencia de columnas fijas y funciona con cualquier esquema de codificación.'+
          '</div></div>'+
          '<div class="empty"><div class="empty-icon">🗓️</div>'+
          '<div class="empty-title">Sin fases configuradas</div>'+
          '<div class="empty-desc">Crea la primera con <strong>+ Nueva fase</strong></div></div>';
        return;
      }

      // Build all field options for display
      var allSchemas=codeSchemas().concat(generalSchemas());

      // Build row HTML with data-id attributes — NO onclick in outerHTML (listeners attached after)
      var allSchemas=codeSchemas().concat(generalSchemas());
      var rowsHtml=phases.map(function(ph){
        var idSchm=allSchemas.find(function(s){return s.key===ph.field_key;})||null;
        var dtSchm=allSchemas.find(function(s){return s.key===ph.date_field_key;})||null;
        return '<tr data-phase-id="'+ph.id+'" data-phase-name="'+ph.name.replace(/"/g,'&quot;')+'">'+
          '<td><span class="code-chip">'+ph.order_num+'</span></td>'+
          '<td><div style="font-weight:600;color:var(--text)">'+ph.name+'</div>'+
          (ph.sub_label?'<div style="font-size:10px;color:var(--text3)">'+ph.sub_label+'</div>':'')+
          '</td>'+
          '<td><div style="font-size:11px"><span class="schema-key">.'+ph.field_key+'</span>'+
          (idSchm?'<span style="font-size:10px;color:var(--text3);margin-left:4px">'+idSchm.name+'</span>':'')+
          '</div><div style="font-size:10px;color:var(--brand);margin-top:2px">= "'+ph.field_value+'"</div></td>'+
          '<td><div style="font-size:11px">'+
          (ph.date_field_key?
            '<span class="schema-key">.'+ph.date_field_key+'</span>'+
            (dtSchm?'<span style="font-size:10px;color:var(--text3);margin-left:4px">'+dtSchm.name+'</span>':'')
            :'<span style="color:var(--text3);font-size:11px">No configurado</span>')+
          '</div></td>'+
          '<td style="text-align:center">'+
          '<div style="width:16px;height:16px;border-radius:50%;background:'+ph.color+';margin:0 auto"></div></td>'+
          '<td><div style="display:flex;gap:4px;justify-content:flex-end">'+
          '<button class="btn btn-ghost btn-sm ph-edit-btn" data-id="'+ph.id+'" title="Editar">'+
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'+
          '</button>'+
          '<button class="btn btn-ghost btn-sm ph-del-btn" data-id="'+ph.id+'" data-name="'+ph.name.replace(/"/g,'&quot;')+'" style="color:var(--red)" title="Eliminar">'+
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>'+
          '</button>'+
          '</div></td></tr>';
      }).join('');

      document.getElementById('content').innerHTML=
        '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#15803d">'+
        '✅ <strong>'+phases.length+'</strong> fase'+(phases.length>1?'s':'')+' configurada'+(phases.length>1?'s':'')+' · '+
        'El menú Control de avance las mostrará automáticamente'+
        '</div>'+
        '<div class="card" style="overflow:hidden"><table class="tbl"><thead><tr>'+
        '<th>#</th><th>Nombre de la fase</th><th>Campo identificador · Valor</th>'+
        '<th>Campo fecha de entrega</th><th>Color</th><th style="text-align:right">Acciones</th>'+
        '</tr></thead><tbody>'+rowsHtml+'</tbody></table></div>';

      // Attach event listeners via data-* after innerHTML set
      document.querySelectorAll('.ph-edit-btn').forEach(function(btn){
        btn.addEventListener('click',function(e){
          e.stopPropagation();
          openPhaseModal(btn.dataset.id);
        });
      });
      document.querySelectorAll('.ph-del-btn').forEach(function(btn){
        btn.addEventListener('click',function(e){
          e.stopPropagation();
          confirmDeletePhase(btn.dataset.id,btn.dataset.name);
        });
      });
    }).catch(function(e){
      document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'<br><small>Ejecuta el SQL de creación de tabla project_phases en Supabase.</small></div></div>';
    });
}

function openPhaseModal(phId){
  var fetchPh=phId
    ?sbGet('project_phases','?id=eq.'+phId+'&limit=1').then(function(r){return r[0]||null;})
    :Promise.resolve(null);

  fetchPh.then(function(ph){
    // Build field options from schemas
    var codeOpts=codeSchemas().map(function(s){
      return '<option value="'+s.key+'"'+(ph&&ph.field_key===s.key?' selected':'')+'>'+s.name+' ('+s.key+') — codificación</option>';
    }).join('');
    var genOpts=generalSchemas().map(function(s){
      return '<option value="'+s.key+'"'+(ph&&ph.field_key===s.key?' selected':'')+'>'+s.name+' ('+s.key+') — general</option>';
    }).join('');
    var fieldOpts='<option value="">Seleccionar campo...</option>'+codeOpts+genOpts;

    // Date field options (all schemas)
    var allDateOpts='<option value="">Sin fecha de entrega</option>'+
      codeSchemas().concat(generalSchemas()).map(function(s){
        return '<option value="'+s.key+'"'+(ph&&ph.date_field_key===s.key?' selected':'')+'>'+s.name+' ('+s.key+')</option>';
      }).join('');

    // Phase schemas date fields (riba2_delivery_date, etc.)
    var knownDates='<optgroup label="Campos de hito (columnas directas)">'+
      [].concat.apply([],getPhaseGroups().map(function(g){
        return phaseSchemas(g.key).filter(function(s){return s.field_type==='date';}).map(function(s){
          var display=s.name+' ('+s.key+')';
          return '<option value="'+s.key+'"'+(ph&&ph.date_field_key===s.key?' selected':'')+'>'+display+'</option>';
        });
      })).join('')+
      '</optgroup>';

    var orderVal=ph?ph.display_order:(APP.phases.length+1);
    var colorVal=ph?ph.color:['#3B6FE8','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4'][APP.phases.length%6];

    var overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='phase-modal';
    overlay.innerHTML=
      '<div class="modal" style="max-width:580px">'+
      '<div class="modal-header">'+
      '<div><div class="modal-title">'+(ph?'Editar fase: '+ph.name:'Nueva fase del proyecto')+'</div>'+
      '<div style="font-size:11px;color:var(--text3);margin-top:2px">Define cómo se identifican los entregables de esta fase</div>'+
      '</div>'+
      '<button class="btn btn-ghost btn-sm" id="pm-close">X</button></div>'+
      '<div class="modal-body">'+

      '<div class="form-grid">'+
      '<div class="form-group"><label class="label">Nombre de la fase *</label>'+
      '<input type="text" class="input" id="ph-name" value="'+(ph?ph.name:'')+'" placeholder="Ej: RIBA 2, Construcción, Licitación..."></div>'+
      '<div class="form-group"><label class="label">Subtítulo / descripción corta</label>'+
      '<input type="text" class="input" id="ph-sub" value="'+(ph?ph.sub_label||'':'')+'" placeholder="Ej: Presentación 0, Etapa 1..."></div>'+
      '<div class="form-group"><label class="label">Orden de visualización</label>'+
      '<input type="number" class="input" id="ph-order" value="'+orderVal+'" min="1"></div>'+
      '<div class="form-group"><label class="label">Color identificador</label>'+
      '<input type="color" class="input" id="ph-color" value="'+colorVal+'" style="height:38px;cursor:pointer"></div>'+
      '</div>'+

      '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin:10px 0">'+
      '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Identificación de entregables</div>'+
      '<div class="form-grid">'+
      '<div class="form-group full">'+
      '<label class="label">Campo que identifica la fase *'+
      '<span style="font-size:10px;color:var(--text3);font-weight:400;margin-left:6px">¿En qué campo está guardada la fase del entregable?</span></label>'+
      '<select class="input" id="ph-field-key">'+fieldOpts+'</select>'+
      '</div>'+
      '<div class="form-group full">'+
      '<label class="label">Valor que debe tener ese campo *'+
      '<span style="font-size:10px;color:var(--text3);font-weight:400;margin-left:6px">Ej: "RIBA2", "Construccion", "F1"</span></label>'+
      '<input type="text" class="input" id="ph-field-value" value="'+(ph?ph.field_value||'':'')+'" placeholder="Valor exacto a buscar">'+
      '</div>'+
      '</div>'+
      '<div style="font-size:10px;color:var(--text3);margin-top:4px">'+
      '💡 Un entregable pertenece a esta fase si su <strong>campo seleccionado</strong> tiene exactamente este <strong>valor</strong>.</div>'+
      '</div>'+

      '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin:10px 0">'+
      '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Fecha de entrega</div>'+
      '<div class="form-group full">'+
      '<label class="label">Campo con la fecha de entrega'+
      '<span style="font-size:10px;color:var(--text3);font-weight:400;margin-left:6px">Se usa para alertas de vencimiento y filtros de fase</span></label>'+
      '<select class="input" id="ph-date-key">'+allDateOpts+knownDates+'</select>'+
      '</div>'+
      '</div>'+

      '</div>'+
      '<div class="modal-footer">'+
      '<button class="btn" id="ph-cancel">Cancelar</button>'+
      '<button class="btn btn-primary" id="ph-save">'+(ph?'Actualizar fase':'Crear fase')+'</button>'+
      '</div></div>';

    // Remove any existing phase modal first
    var existing=document.getElementById('phase-modal');
    if(existing)existing.remove();
    document.getElementById('modal-container').appendChild(overlay);
    // Use overlay.querySelector to avoid ID conflicts with other modals
    overlay.querySelector('#pm-close').onclick=function(){overlay.remove();};
    overlay.querySelector('#ph-cancel').onclick=function(){overlay.remove();};
    overlay.querySelector('#ph-save').onclick=function(){savePhase(phId||null,overlay);};
  });
}

function savePhase(phId,overlay){
  var name=document.getElementById('ph-name').value.trim();
  var fieldKey=document.getElementById('ph-field-key').value;
  var fieldValue=document.getElementById('ph-field-value').value.trim();
  if(!name||!fieldKey||!fieldValue){toast('Nombre, campo y valor son obligatorios.','error');return;}

  var payload={
    project_id:APP.project.id,
    name:name,
    sub_label:document.getElementById('ph-sub').value.trim()||null,
    display_order:parseInt(document.getElementById('ph-order').value)||1,
    order_num:parseInt(document.getElementById('ph-order').value)||1,
    color:document.getElementById('ph-color').value||'#3B6FE8',
    field_key:fieldKey,
    field_value:fieldValue,
    date_field_key:document.getElementById('ph-date-key').value||null,
    is_active:true
  };

  var req=phId?sbPatch('project_phases','id=eq.'+phId,payload):sbPost('project_phases',payload);
  req.then(function(){
    toast(phId?'Fase actualizada.':'Fase creada.');
    overlay.remove();
    renderPhases();
    // Reload phases into APP
    sbGet('project_phases','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=display_order.asc')
      .then(function(ph){APP.phases=ph||[];}).catch(function(){});
  }).catch(function(e){toast(e.message,'error');});
}

function confirmDeletePhase(phId,phName){
  var overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='ph-confirm';
  overlay.innerHTML='<div class="modal" style="max-width:380px">'+
    '<div class="modal-header"><div class="modal-title">Eliminar fase?</div>'+
    '<button class="btn btn-ghost btn-sm" id="phc-close">X</button></div>'+
    '<div class="modal-body"><p style="font-size:13px;color:var(--text2)">¿Eliminar la fase <strong>'+phName+'</strong>?</p>'+
    '<p style="font-size:11px;color:var(--text3);margin-top:6px">No afecta a los entregables registrados.</p></div>'+
    '<div class="modal-footer"><button class="btn" id="phc-cancel">Cancelar</button>'+
    '<button class="btn btn-danger" id="phc-del">Eliminar</button></div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('phc-close').onclick=function(){overlay.remove();};
  document.getElementById('phc-cancel').onclick=function(){overlay.remove();};
  document.getElementById('phc-del').onclick=function(){
    sbPatch('project_phases','id=eq.'+phId,{is_active:false})
      .then(function(){overlay.remove();toast('Fase eliminada.');renderPhases();})
      .catch(function(e){toast(e.message,'error');});
  };
}

// Helper: get project phases — use APP.phases if loaded, else empty array
function getProjectPhases(){
  return APP.phases||[];
}

function renderGroups(){
  if(!isAdminLevel()){
    document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Acceso restringido</div></div>';
    return;
  }
  document.getElementById('topbar-actions').innerHTML=
    '<button class="btn btn-primary btn-sm" onclick="openGroupModal(null)">+ Nuevo grupo</button>';
  document.getElementById('content').innerHTML=loading();

  sbGet('deliverable_groups','?project_id=eq.'+APP.project.id+'&is_active=eq.true&order=name.asc')
    .then(function(groups){
      APP.groups=groups;
      if(!groups.length){
        document.getElementById('content').innerHTML=
          '<div class="empty">'+
          '<div class="empty-icon">🗂️</div>'+
          '<div class="empty-title">Sin grupos configurados</div>'+
          '<div class="empty-desc">Los grupos permiten clasificar entregables por categoría personalizada.<br>'+
          'Ej: Arquitectura, Estructuras, Instalaciones, BIM...</div>'+
          '</div>';
        return;
      }
      var rows=groups.map(function(g){
        var tr=document.createElement('tr');
        tr.innerHTML=
          '<td><span class="code-chip">'+g.code+'</span></td>'+
          '<td style="font-weight:600;color:var(--text)">'+g.name+'</td>'+
          '<td>'+(g.type?'<span class="badge b-bim" style="font-size:10px">'+g.type+'</span>':'--')+'</td>'+
          '<td style="font-size:11px;color:var(--text3)">'+(g.description||'--')+'</td>'+
          '<td></td>';
        var btnEdit=document.createElement('button');btnEdit.className='btn btn-ghost btn-sm';
        btnEdit.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        btnEdit.onclick=(function(gid){return function(){openGroupModal(gid);};})(g.id);
        var btnDel=document.createElement('button');btnDel.className='btn btn-ghost btn-sm';btnDel.style.color='var(--red)';
        btnDel.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
        btnDel.onclick=(function(gid,gname){return function(){confirmDeleteGroup(gid,gname);};})(g.id,g.name);
        var wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:4px;justify-content:flex-end';
        wrap.appendChild(btnEdit);wrap.appendChild(btnDel);
        tr.lastElementChild.appendChild(wrap);
        return tr.outerHTML;
      }).join('');
      document.getElementById('content').innerHTML=
        '<div class="card" style="overflow:hidden"><table class="tbl"><thead><tr>'+
        '<th>Código</th><th>Nombre</th><th>Tipo</th><th>Descripción</th><th style="text-align:right">Acciones</th>'+
        '</tr></thead><tbody>'+rows+'</tbody></table></div>';
    }).catch(function(e){
      document.getElementById('content').innerHTML='<div class="empty"><div class="empty-title">Error</div><div class="empty-desc">'+e.message+'</div></div>';
    });
}

function openGroupModal(gid){
  var fetchG=gid
    ?sbGet('deliverable_groups','?id=eq.'+gid+'&limit=1').then(function(r){return r[0]||null;})
    :Promise.resolve(null);
  fetchG.then(function(g){
    var overlay=document.createElement('div');overlay.id='grp-modal';overlay.className='modal-overlay';
    overlay.innerHTML=
      '<div class="modal"><div class="modal-header">'+
      '<div class="modal-title">'+(g?'Editar grupo: '+g.name:'Nuevo grupo de entregables')+'</div>'+
      '<button class="btn btn-ghost btn-sm" id="grp-close">X</button></div>'+
      '<div class="modal-body"><div class="form-grid">'+
      '<div class="form-group"><label class="label">Código *</label>'+
      '<input type="text" class="input" id="grp-code" value="'+(g?g.code:'')+'" placeholder="Ej: GRP-ARQ"'+(g?' disabled':'')+' style="font-family:monospace"></div>'+
      '<div class="form-group"><label class="label">Nombre *</label>'+
      '<input type="text" class="input" id="grp-name" value="'+(g?g.name:'')+'" placeholder="Ej: Arquitectura"></div>'+
      '<div class="form-group"><label class="label">Tipo</label>'+
      '<select class="input" id="grp-type">'+
      '<option value="">Sin tipo</option>'+
      ['Diseño','Coordinación','Construcción','Especialidad','BIM','Documentación','Otro'].map(function(t){
        return '<option value="'+t+'"'+(g&&g.type===t?' selected':'')+'>'+t+'</option>';
      }).join('')+
      '</select></div>'+
      '<div class="form-group full"><label class="label">Descripción</label>'+
      '<input type="text" class="input" id="grp-desc" value="'+(g?g.description||'':'')+'" placeholder="Descripción del grupo"></div>'+
      '</div></div>'+
      '<div class="modal-footer"><button class="btn" id="grp-cancel">Cancelar</button>'+
      '<button class="btn btn-primary" id="grp-save">'+(g?'Actualizar grupo':'Crear grupo')+'</button>'+
      '</div></div>';
    document.getElementById('modal-container').appendChild(overlay);
    document.getElementById('grp-close').onclick=function(){overlay.remove();};
    document.getElementById('grp-cancel').onclick=function(){overlay.remove();};
    document.getElementById('grp-save').onclick=function(){saveGroup(gid||null,overlay);};
  });
}

function saveGroup(gid,overlay){
  var code=document.getElementById('grp-code').value.trim().toUpperCase();
  var name=document.getElementById('grp-name').value.trim();
  if(!code||!name){toast('Código y nombre son obligatorios.','error');return;}
  var payload={project_id:APP.project.id,code:code,name:name,
    type:document.getElementById('grp-type').value||null,
    description:document.getElementById('grp-desc').value||null,
    is_active:true};
  var req=gid?sbPatch('deliverable_groups','id=eq.'+gid,payload):sbPost('deliverable_groups',payload);
  req.then(function(){
    toast(gid?'Grupo actualizado.':'Grupo creado.');
    overlay.remove();
    renderGroups();
  }).catch(function(e){toast(e.message,'error');});
}

function confirmDeleteGroup(gid,gname){
  var overlay=document.createElement('div');overlay.id='grp-confirm';overlay.className='modal-overlay';
  overlay.innerHTML='<div class="modal" style="max-width:380px">'+
    '<div class="modal-header"><div class="modal-title">Eliminar grupo?</div>'+
    '<button class="btn btn-ghost btn-sm" id="gc-close">X</button></div>'+
    '<div class="modal-body"><p style="font-size:13px;color:var(--text2)">¿Eliminar el grupo <strong>'+gname+'</strong>?</p>'+
    '<p style="font-size:11px;color:var(--text3);margin-top:6px">Los entregables con este grupo no se verán afectados.</p></div>'+
    '<div class="modal-footer"><button class="btn" id="gc-cancel">Cancelar</button>'+
    '<button class="btn btn-danger" id="gc-del">Eliminar</button></div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  document.getElementById('gc-close').onclick=function(){overlay.remove();};
  document.getElementById('gc-cancel').onclick=function(){overlay.remove();};
  document.getElementById('gc-del').onclick=function(){
    sbPatch('deliverable_groups','id=eq.'+gid,{is_active:false})
      .then(function(){overlay.remove();toast('Grupo eliminado.');renderGroups();})
      .catch(function(e){toast(e.message,'error');});
  };
}

// ══════════════════════════════════════════════════════════════
// ── IMPORTAR / EXPORTAR PLANTILLAS ──
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// A. PLANTILLA + IMPORTACIÓN DE CAMPOS (Config. de campos)
// ─────────────────────────────────────────────────────────────

function downloadSchemaTemplate(){
  // Build template using SheetJS (loaded via CDN in index.html)
  if(typeof XLSX==='undefined'){toast('Librería Excel no disponible.','error');return;}

  var wb=XLSX.utils.book_new();

  // ── Hoja 1: Instrucciones ──
  var instrData=[
    ['PLANTILLA DE IMPORTACIÓN DE CAMPOS — Unify Management'],
    [''],
    ['INSTRUCCIONES DE USO'],
    ['1. Esta plantilla tiene 4 hojas: Instrucciones, Campos_Codificacion, Campos_Generales y Campos_Hito'],
    ['2. Complete cada hoja según el tipo de campo que desea crear.'],
    ['3. NO modifique los encabezados de las columnas (fila 1 de cada hoja de datos).'],
    ['4. NO modifique el nombre de las hojas.'],
    ['5. Los campos marcados con * son OBLIGATORIOS.'],
    ['6. Una vez completada, use el botón "Importar campos" en Config. de campos.'],
    [''],
    ['TIPOS DE CAMPO VÁLIDOS (columna field_type):'],
    ['  text      → Texto libre'],
    ['  dropdown  → Lista desplegable (complete la columna "opciones" separadas por |)'],
    ['  number    → Número'],
    ['  date      → Fecha'],
    [''],
    ['NOTAS IMPORTANTES:'],
    ['  • La columna "key" se genera automáticamente si la deja vacía'],
    ['  • Para campo de codificación tipo dropdown, use columna "valores_codigo" con formato: VALOR|Etiqueta'],
    ['  • El orden en codificación determina la posición en el código del entregable'],
    ['  • Para campos de hito, la columna "nombre_hito" debe coincidir con un hito existente en la plataforma'],
    [''],
    ['Proyecto activo: '+((window.APP&&APP.project)?APP.project.name:'—')],
  ];
  var wsInstr=XLSX.utils.aoa_to_sheet(instrData);
  wsInstr['!cols']=[{wch:90}];
  XLSX.utils.book_append_sheet(wb,wsInstr,'Instrucciones');

  // ── Hoja 2: Campos de Codificación ──
  var codHeaders=['nombre*','key','field_type*','separador','longitud_max','posicion_codigo*','es_obligatorio','valores_codigo (VALOR|Etiqueta, uno por fila)'];
  var codExample=['Proyecto','proyecto','dropdown','-','5','1','SI','HRDTRU|Hospital Regional Trujillo'];
  var wsCod=XLSX.utils.aoa_to_sheet([codHeaders,codExample]);
  wsCod['!cols']=[{wch:25},{wch:20},{wch:15},{wch:12},{wch:14},{wch:18},{wch:15},{wch:45}];
  styleHeaderRow(wsCod,codHeaders.length);
  XLSX.utils.book_append_sheet(wb,wsCod,'Campos_Codificacion');

  // ── Hoja 3: Campos Generales ──
  var genHeaders=['nombre*','key','field_type*','orden_formulario','placeholder','es_obligatorio','es_visible','opciones (separadas por |)'];
  var genExample=['Formato de Archivo','formato','dropdown','1','Ej: RVT, IFC, DWG','NO','SI','RVT|IFC|DWG|PDF|DWG'];
  var wsGen=XLSX.utils.aoa_to_sheet([genHeaders,genExample]);
  wsGen['!cols']=[{wch:25},{wch:20},{wch:15},{wch:18},{wch:30},{wch:15},{wch:12},{wch:35}];
  styleHeaderRow(wsGen,genHeaders.length);
  XLSX.utils.book_append_sheet(wb,wsGen,'Campos_Generales');

  // ── Hoja 4: Campos de Hito ──
  var hitoHeaders=['nombre_hito*','nombre_campo*','key','field_type*','orden_formulario','placeholder','es_obligatorio','es_visible','opciones (separadas por |)'];
  var hitoExample=['riba2','LOD','riba2_lod','dropdown','1','','NO','SI','LOD100|LOD200|LOD300|LOD400'];
  var wsHito=XLSX.utils.aoa_to_sheet([hitoHeaders,hitoExample]);
  wsHito['!cols']=[{wch:22},{wch:25},{wch:22},{wch:15},{wch:18},{wch:25},{wch:15},{wch:12},{wch:35}];
  styleHeaderRow(wsHito,hitoHeaders.length);
  XLSX.utils.book_append_sheet(wb,wsHito,'Campos_Hito');

  XLSX.writeFile(wb,'Plantilla_Campos_'+((APP&&APP.project)?APP.project.code:'Proyecto')+'.xlsx');
  toast('Plantilla descargada.');
}

// Helper: style header row with blue background
function styleHeaderRow(ws,numCols){
  for(var c=0;c<numCols;c++){
    var cell=XLSX.utils.encode_cell({r:0,c:c});
    if(!ws[cell])continue;
    ws[cell].s={
      fill:{fgColor:{rgb:'1B3A6B'}},
      font:{bold:true,color:{rgb:'FFFFFF'},name:'Arial',sz:10},
      alignment:{horizontal:'center',vertical:'center'},
      border:{bottom:{style:'thin',color:{rgb:'FFFFFF'}}}
    };
  }
}

function importSchemasFromExcel(){
  if(!isAdminLevel()){toast('Sin permiso.','error');return;}
  // Open file picker
  var input=document.createElement('input');
  input.type='file';input.accept='.xlsx,.xls';
  input.onchange=function(e){
    var file=e.target.files[0];
    if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var wb=XLSX.read(ev.target.result,{type:'array'});
        var result={created:0,errors:[]};
        var promises=[];

        // Process each data sheet
        ['Campos_Codificacion','Campos_Generales','Campos_Hito'].forEach(function(sheetName){
          var ws=wb.Sheets[sheetName];
          if(!ws)return;
          var rows=XLSX.utils.sheet_to_json(ws,{defval:''});
          rows.forEach(function(row,ri){
            var grp='code';
            if(sheetName==='Campos_Generales')grp='general';
            else if(sheetName==='Campos_Hito')grp=(row['nombre_hito*']||row['nombre_hito']||'').trim();

            var nombre=(row['nombre*']||row['nombre']||'').trim();
            if(!nombre)return;
            var ftype=(row['field_type*']||row['field_type']||'text').trim().toLowerCase();
            var baseKey=nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
            var key=(row['key']||'').trim()||baseKey;
            if(grp!=='code'&&grp!=='general')key=grp+'_'+baseKey;

            // Build opts
            var optsRaw=(row['opciones (separadas por |)']||row['valores_codigo (VALOR|Etiqueta, uno por fila)']||'').trim();
            var opts=null;var allowedVals=null;
            if(optsRaw){
              if(grp==='code'){
                allowedVals=optsRaw.split('\n').concat(optsRaw.split('|')).filter(Boolean)
                  .reduce(function(acc,seg,i,arr){
                    // Detect VALOR|Etiqueta pairs
                    if(seg.indexOf('|')>=0){var p=seg.split('|');acc.push({value:p[0].trim(),label:(p[1]||p[0]).trim()});}
                    else if(i%2===0&&arr[i+1]){/* skip */}
                    else{acc.push({value:seg.trim(),label:seg.trim()});}
                    return acc;
                  },[]);
                // Simpler: just split by | for code allowed_values
                allowedVals=optsRaw.split('|').map(function(s){var p=s.split('=');return{value:p[0].trim(),label:(p[1]||p[0]).trim()};}).filter(function(v){return v.value;});
              }else{
                opts=JSON.stringify(optsRaw.split('|').map(function(s){return s.trim();}).filter(Boolean));
              }
            }

            var isReq=(row['es_obligatorio']||'').toString().toUpperCase()==='SI';
            var isVis=(row['es_visible']||'SI').toString().toUpperCase()!=='NO';

            var payload={name:nombre,key:key,field_type:ftype,is_required:isReq,
              field_group:grp,project_id:APP.project.id,is_active:true};
            if(grp==='code'){
              payload.is_part_of_code=true;
              payload.code_order=parseInt(row['posicion_codigo*']||row['posicion_codigo']||99)||99;
              payload.separator=(row['separador']||'-').trim();
              payload.max_length=parseInt(row['longitud_max']||10)||10;
              payload.allowed_values=allowedVals||null;
              payload.field_order=99;
            }else{
              payload.is_part_of_code=false;
              payload.field_order=parseInt(row['orden_formulario']||99)||99;
              payload.placeholder=(row['placeholder']||'').trim()||null;
              payload.is_visible=isVis;
              payload.options=opts?JSON.parse(opts):null;
              payload.max_length=255;payload.code_order=99;payload.separator='';
            }
            promises.push(sbPost('field_schemas',payload).then(function(){result.created++;}).catch(function(e){result.errors.push(nombre+': '+e.message);}));
          });
        });

        Promise.all(promises).then(function(){
          var msg=result.created+' campo(s) importado(s) correctamente.';
          if(result.errors.length)msg+=' '+result.errors.length+' error(es): '+result.errors.slice(0,3).join(', ');
          toast(msg,result.errors.length?'error':'');
          renderSchemas();
        });
      }catch(err){toast('Error al leer el archivo: '+err.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

// ─────────────────────────────────────────────────────────────
// B. PLANTILLA + IMPORTACIÓN DE ENTREGABLES
// ─────────────────────────────────────────────────────────────

function downloadDelTemplate(){
  if(typeof XLSX==='undefined'){toast('Librería Excel no disponible.','error');return;}

  var wb=XLSX.utils.book_new();
  var codSchemas=codeSchemas();
  var genSchemas=generalSchemas();
  var phases=getPhaseGroups();

  // ── Hoja 1: Instrucciones ──
  var instrLines=[
    ['PLANTILLA DE IMPORTACIÓN DE ENTREGABLES — Unify Management'],
    [''],
    ['INSTRUCCIONES'],
    ['1. Complete la hoja "Entregables" con los datos de cada entregable a registrar.'],
    ['2. NO modifique los encabezados (fila 2) ni el orden de las columnas.'],
    ['3. La fila 3 muestra ejemplos — puede eliminarla antes de importar.'],
    ['4. Si un código ya existe en la plataforma, la importación se cancelará completamente.'],
    ['5. Campos marcados con * son OBLIGATORIOS.'],
    [''],
    ['COLUMNAS DE CODIFICACIÓN (generan el código automáticamente):'],
  ];
  codSchemas.forEach(function(s){
    instrLines.push(['  '+s.name+' ('+s.key+')'+(s.is_required?' *':'')+
      (s.allowed_values?' → Valores: '+s.allowed_values.map(function(v){return v.value;}).join(', '):'')]);
  });
  instrLines.push(['']);
  instrLines.push(['CAMPOS GENERALES:']);
  genSchemas.forEach(function(s){instrLines.push(['  '+s.name+' ('+s.key+')'+(s.is_required?' *':'')]);});
  instrLines.push(['']);
  instrLines.push(['CAMPOS DE HITO:']);
  phases.forEach(function(ph){
    var phs=phaseSchemas(ph.key);
    if(phs.length)instrLines.push(['  '+ph.label+': '+phs.map(function(s){return s.name.replace(ph.label+' - ','');}).join(', ')]);
  });
  instrLines.push(['']);
  instrLines.push(['Proyecto: '+((APP&&APP.project)?APP.project.name+' ('+APP.project.code+')':'—')]);
  instrLines.push(['Generado: '+new Date().toLocaleString('es-PE')]);

  var wsInstr=XLSX.utils.aoa_to_sheet(instrLines);
  wsInstr['!cols']=[{wch:100}];
  XLSX.utils.book_append_sheet(wb,wsInstr,'Instrucciones');

  // ── Hoja 2: Entregables ──
  // Build headers:
  // Row 1: group labels
  // Row 2: field keys (used for import)
  // Row 3: field names (human readable)
  // Row 4: example data
  var grpRow1=['CODIFICACIÓN'];
  var grpRow2=['codigo_generado'];
  var grpRow3=['Código (auto)'];
  var exRow=[''];
  codSchemas.forEach(function(s){
    grpRow1.push('CODIFICACIÓN');
    grpRow2.push(s.key);
    grpRow3.push(s.name+(s.is_required?' *':''));
    exRow.push(s.allowed_values?s.allowed_values[0].value:'EJEMPLO');
  });
  grpRow1.push('GENERAL','GENERAL','GENERAL','GENERAL','GENERAL');
  grpRow2.push('nombre','estado','paquete','grupo','unidades_productivas');
  grpRow3.push('Nombre / Título *','Estado','Paquete','Grupo','Unidades Productivas');
  exRow.push('Plano de distribución arquitectónica','pending','PKG-ARQ-01','GRP-ARQ','1');
  grpRow1.push('GENERAL','GENERAL','GENERAL');
  grpRow2.push('descripcion','formato','url');
  grpRow3.push('Descripción','Formato','Hipervínculo (URL)');
  exRow.push('','RVT','https://acc.autodesk.com/...');
  genSchemas.filter(function(s){return ['nombre','estado','paquete','grupo','descripcion','formato','url'].indexOf(s.key)<0;}).forEach(function(s){
    grpRow1.push('GENERAL');grpRow2.push(s.key);grpRow3.push(s.name+(s.is_required?' *':''));exRow.push('');
  });
  phases.forEach(function(ph){
    phaseSchemas(ph.key).forEach(function(s){
      grpRow1.push(ph.label);
      grpRow2.push(s.key);
      grpRow3.push(s.name.replace(ph.label+' - ',''));
      exRow.push('');
    });
  });

  var wsData=XLSX.utils.aoa_to_sheet([grpRow1,grpRow2,grpRow3,exRow]);
  // Style row 1 (group labels)
  styleHeaderRow(wsData,grpRow1.length);
  // Style row 2 (keys) — light blue
  for(var c=0;c<grpRow2.length;c++){
    var cell2=XLSX.utils.encode_cell({r:1,c:c});
    if(!wsData[cell2])continue;
    wsData[cell2].s={fill:{fgColor:{rgb:'EBF5FB'}},font:{bold:true,color:{rgb:'1B3A6B'},sz:9}};
  }
  wsData['!cols']=grpRow1.map(function(){return {wch:22};});
  wsData['!freeze']={xSplit:0,ySplit:3};
  XLSX.utils.book_append_sheet(wb,wsData,'Entregables');

  XLSX.writeFile(wb,'Plantilla_Entregables_'+((APP&&APP.project)?APP.project.code:'Proyecto')+'.xlsx');
  toast('Plantilla descargada.');
}

function importDeliverables(){
  if(!can('can_create_deliverables')){toast('Sin permiso.','error');return;}
  var input=document.createElement('input');
  input.type='file';input.accept='.xlsx,.xls';
  input.onchange=function(e){
    var file=e.target.files[0];
    if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var wb=XLSX.read(ev.target.result,{type:'array'});
        var ws=wb.Sheets['Entregables'];
        if(!ws){toast('No se encontró la hoja "Entregables".','error');return;}

        // Row 0 = group labels, Row 1 = keys (for mapping), Row 2 = names (skip), Row 3+ = data
        var allRows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        if(allRows.length<4){toast('La plantilla no tiene datos para importar.','error');return;}

        var keyRow=allRows[1]; // field keys
        var dataRows=allRows.slice(3).filter(function(r){return r.some(function(c){return c!=='';});});
        if(!dataRows.length){toast('No hay entregables para importar.','error');return;}

        // Show preview modal
        showImportPreview(keyRow,dataRows);
      }catch(err){toast('Error al leer el archivo: '+err.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function showImportPreview(keyRow,dataRows){
  var overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='import-modal';
  overlay.innerHTML=
    '<div class="modal" style="max-width:640px">'+
    '<div class="modal-header">'+
    '<div><div class="modal-title">Importar entregables</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-top:2px">'+dataRows.length+' entregable(s) detectado(s) en el archivo</div>'+
    '</div>'+
    '<button class="btn btn-ghost btn-sm" id="imp-close">X</button></div>'+
    '<div class="modal-body">'+
    '<div id="import-status" style="margin-bottom:10px">'+
    '<div style="font-size:12px;color:var(--text2)">Verificando códigos duplicados...</div>'+
    '</div>'+
    '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">'+
    '<table class="tbl"><thead><tr>'+
    '<th style="font-size:10px">#</th>'+
    '<th style="font-size:10px">Código</th>'+
    '<th style="font-size:10px">Nombre</th>'+
    '<th style="font-size:10px">Estado</th>'+
    '</tr></thead><tbody id="import-rows">'+
    dataRows.map(function(r,i){
      var code=r[0]||'—';
      var nameIdx=keyRow.indexOf('nombre');
      var name=nameIdx>=0?r[nameIdx]||'—':'—';
      return '<tr><td style="font-size:10px">'+(i+1)+'</td>'+
        '<td><span class="code-chip" style="font-size:9px">'+code+'</span></td>'+
        '<td style="font-size:11px">'+name+'</td>'+
        '<td id="imp-status-'+i+'"><span style="font-size:10px;color:var(--text3)">⏳</span></td>'+
        '</tr>';
    }).join('')+
    '</tbody></table></div>'+
    '</div>'+
    '<div class="modal-footer">'+
    '<button class="btn" id="imp-cancel">Cancelar</button>'+
    '<button class="btn btn-primary" id="imp-confirm" disabled>Importar</button>'+
    '</div></div>';
  document.getElementById('modal-container').appendChild(overlay);
  overlay.querySelector('#imp-close').onclick=function(){overlay.remove();};
  overlay.querySelector('#imp-cancel').onclick=function(){overlay.remove();};

  // Verify for duplicates
  var codes=dataRows.map(function(r){return (r[0]||'').trim();}).filter(Boolean);
  sbGet('deliverables','?project_id=eq.'+APP.project.id+'&is_active=eq.true&select=code')
    .then(function(existing){
      var existingCodes=existing.map(function(d){return d.code;});
      var hasDupes=false;
      dataRows.forEach(function(r,i){
        var code=(r[0]||'').trim();
        var el=document.getElementById('imp-status-'+i);
        if(!el)return;
        if(!code){el.innerHTML='<span style="font-size:10px;color:var(--amber)">⚠ Sin código</span>';hasDupes=true;}
        else if(existingCodes.indexOf(code)>=0){el.innerHTML='<span style="font-size:10px;color:var(--red)">✗ Duplicado</span>';hasDupes=true;}
        else{el.innerHTML='<span style="font-size:10px;color:var(--green)">✓ OK</span>';}
      });
      var statusEl=document.getElementById('import-status');
      var confirmBtn=document.getElementById('imp-confirm');
      if(hasDupes){
        statusEl.innerHTML='<div style="background:var(--red-light);border:1px solid var(--red);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--red)">'+
          '✗ No se puede importar: existen códigos duplicados o faltantes. Corrija el archivo e intente nuevamente.</div>';
        confirmBtn.disabled=true;
      }else{
        statusEl.innerHTML='<div style="background:var(--green-light);border:1px solid var(--green);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--green)">'+
          '✓ Todos los códigos son únicos. Listo para importar.</div>';
        confirmBtn.disabled=false;
        confirmBtn.onclick=function(){executeImport(keyRow,dataRows,overlay);};
      }
    }).catch(function(e){
      document.getElementById('import-status').innerHTML='<div style="color:var(--red);font-size:12px">Error verificando: '+e.message+'</div>';
    });
}

function executeImport(keyRow,dataRows,overlay){
  var btn=overlay.querySelector('#imp-confirm');
  btn.disabled=true;btn.textContent='Importando...';
  var codSchemas=codeSchemas();var genSchemas=generalSchemas();var phases=getPhaseGroups();
  var GEN_MAP={nombre:'name',descripcion:'description',paquete:'work_package',formato:'file_format',url:'url',estado:'status'};
  var promises=dataRows.map(function(r){
    var fieldValues={};var payload={project_id:APP.project.id,is_active:true,status:'pending',created_by:APP.user.id};
    keyRow.forEach(function(key,ci){
      if(!key||key==='codigo_generado')return;
      var val=(r[ci]!==undefined&&r[ci]!=='')?String(r[ci]).trim():'';
      if(!val)return;
      // Code fields → field_values
      if(codSchemas.find(function(s){return s.key===key;})){fieldValues[key]=val;return;}
      // Known mapped cols
      var col=GEN_MAP[key];
      if(col){payload[col]=val;return;}
      // General schemas → direct map or field_values
      if(genSchemas.find(function(s){return s.key===key;})){fieldValues[key]=val;return;}
      // Phase fields
      var isKnownPhaseField=false;
      phases.forEach(function(ph){
        if(phaseSchemas(ph.key).find(function(s){return s.key===key;})){
          if(isKnownPhase(ph.key)){payload[key]=val;}
          else{var fvKey=ph.key+'__'+(key.indexOf(ph.key+'_')===0?key.slice(ph.key.length+1):key);fieldValues[fvKey]=val;}
          isKnownPhaseField=true;
        }
      });
      if(!isKnownPhaseField)fieldValues[key]=val;
    });
    // Build code from field_values
    var code=buildCode(fieldValues);
    if(!code)code=r[0]||'';
    if(!code)return Promise.resolve();
    payload.code=code;
    payload.field_values=fieldValues;
    if(!payload.name)payload.name=code;
    // UP
    var upIdx=keyRow.indexOf('unidades_productivas');
    var up=upIdx>=0&&r[upIdx]?parseFloat(r[upIdx])||1:1;
    return sbPost('deliverables',payload).then(function(saved){
      var delId=Array.isArray(saved)?saved[0].id:saved.id;
      return sbPost('production_units',{deliverable_id:delId,planned_qty:up,consumed_qty:0,unit_label:'UP'});
    });
  });
  Promise.all(promises.filter(Boolean)).then(function(){
    toast(dataRows.length+' entregable(s) importado(s).');
    overlay.remove();
    loadDeliverables();
  }).catch(function(e){
    toast('Error en importación: '+e.message,'error');
    btn.disabled=false;btn.textContent='Importar';
  });
}

// ─────────────────────────────────────────────────────────────
// C. EXPORTAR CONTROL DE AVANCE A PDF
// ─────────────────────────────────────────────────────────────

function exportProgressPDF(){
  var allDels=window._progressAllDels;
  var prod=window._progressProd;
  if(!allDels){toast('Carga el Control de avance antes de exportar.','error');return;}

  // Apply current filters
  var disc=document.getElementById('pf-disc')?document.getElementById('pf-disc').value:'';
  var pkg=document.getElementById('pf-pkg')?document.getElementById('pf-pkg').value:'';
  var phase=document.getElementById('pf-phase')?document.getElementById('pf-phase').value:'';
  var deliverables=allDels.filter(function(d){
    var _discKey=getProgressConfig().discField||'disciplina';
    if(disc&&((d.field_values&&d.field_values[_discKey])||d[_discKey]||'')!==disc)return false;
    if(pkg&&d.work_package!==pkg)return false;
    if(phase){
      var projPh=(APP.phases||[]).find(function(p){return p.id===phase;});
      if(projPh){var hasPhase=(getDelFieldVal(d,projPh.field_key))===projPh.field_value;if(!hasPhase)return false;}
      else{var hasPhaseDate=isKnownPhase(phase)?!!d[phase+'_delivery_date']:!!(d.field_values&&d.field_values[phase+'__delivery_date']);if(!hasPhaseDate)return false;}
    }
    return true;
  });

  // Build prodMap
  var prodMap={};
  (prod||[]).forEach(function(p){
    if(!prodMap[p.deliverable_id])prodMap[p.deliverable_id]={plan:0,pct:0,consUP:0};
    var w=Number(p.planned_qty)||0;var pct=Math.min(100,Math.max(0,Number(p.consumed_qty)||0));
    prodMap[p.deliverable_id]={plan:w,pct:pct,consUP:Math.round(pct/100*w*10)/10};
  });

  var totalUP=0,totalConsUP=0;
  deliverables.forEach(function(d){var p=prodMap[d.id]||{plan:0,consUP:0};totalUP+=p.plan;totalConsUP+=p.consUP||0;});
  var pctGen=totalUP>0?Math.round(totalConsUP/totalUP*100):0;
  var completedDels=deliverables.filter(function(d){return d.status==='approved'||d.status==='issued';}).length;

  var now=new Date();
  var dateStr=now.toLocaleDateString('es-PE',{day:'2-digit',month:'long',year:'numeric'});
  var timeStr=now.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
  var userName=APP.user?APP.user.full_name:'—';

  // Build phase stats
  var configuredPhases=getProjectPhases();
  var phaseRows='';
  configuredPhases.forEach(function(ph){
    var phDels=deliverables.filter(function(d){return getDelFieldVal(d,ph.field_key)===ph.field_value;});
    var phTotalUP=0,phConsUP=0;
    phDels.forEach(function(d){var p=prodMap[d.id]||{plan:0,consUP:0};phTotalUP+=p.plan;phConsUP+=(p.consUP||0);});
    var phPct=phTotalUP>0?Math.round(phConsUP/phTotalUP*100):0;
    var bar='<div style="background:#e2e8f0;border-radius:4px;height:8px;width:120px;display:inline-block;vertical-align:middle"><div style="background:'+ph.color+';height:8px;border-radius:4px;width:'+phPct+'%"></div></div>';
    phaseRows+='<tr><td style="padding:6px 10px;font-size:11px;font-weight:600">'+ph.name+(ph.sub_label?'<div style="font-size:9px;color:#64748b">'+ph.sub_label+'</div>':'')+'</td>'+
      '<td style="padding:6px 10px;text-align:center;font-size:11px">'+phDels.length+'</td>'+
      '<td style="padding:6px 10px;text-align:center;font-size:11px">'+phTotalUP+'</td>'+
      '<td style="padding:6px 10px;text-align:center;font-size:11px">'+Math.round(phConsUP*10)/10+'</td>'+
      '<td style="padding:6px 10px"><div style="display:flex;align-items:center;gap:8px">'+bar+
      '<span style="font-size:11px;font-weight:700;color:'+(phPct>=80?'#16a34a':phPct>=50?'#2563eb':'#d97706')+'">'+phPct+'%</span></div></td></tr>';
  });

  // Build deliverable table rows
  var delRows=deliverables.map(function(d){
    var p=prodMap[d.id]||{plan:0,pct:0,consUP:0};
    var pct=Math.min(100,Math.round(p.pct||0));
    var discKey=getProgressConfig().discField||'disciplina';
    var disc2=(d.field_values&&d.field_values[discKey])||d[discKey]||'—';
    var bar='<div style="background:#e2e8f0;border-radius:3px;height:6px;width:80px;display:inline-block;vertical-align:middle"><div style="background:'+(pct>=80?'#16a34a':pct>=50?'#2563eb':'#d97706')+';height:6px;border-radius:3px;width:'+pct+'%"></div></div>';
    var STATUS_LABELS={pending:'Pendiente',in_progress:'En progreso',for_review:'En revisión',approved:'Aprobado',issued:'Emitido',rejected:'Rechazado'};
    return '<tr><td style="padding:5px 8px;font-size:9px;font-family:monospace">'+d.code+'</td>'+
      '<td style="padding:5px 8px;font-size:10px;max-width:200px">'+d.name+'</td>'+
      '<td style="padding:5px 8px;font-size:10px;text-align:center">'+disc2+'</td>'+
      '<td style="padding:5px 8px;font-size:10px;text-align:center;font-weight:700">'+p.plan+'</td>'+
      '<td style="padding:5px 8px"><div style="display:flex;align-items:center;gap:6px">'+bar+
      '<span style="font-size:10px;font-weight:700">'+pct+'%</span></div></td>'+
      '<td style="padding:5px 8px;font-size:10px;text-align:center">'+(STATUS_LABELS[d.status]||d.status)+'</td></tr>';
  }).join('');

  var filterLabel='';
  if(disc||pkg||phase)filterLabel='<div style="font-size:10px;color:#64748b;margin-bottom:8px">Filtros aplicados: '+(disc?'Disciplina: '+disc+' ':'')+(pkg?'Paquete: '+pkg+' ':'')+(phase?'Fase: '+phase:'')+'</div>';

  // Build HTML for print
  var html='<!DOCTYPE html><html><head><meta charset="utf-8">'+
    '<title>Control de Avance — '+APP.project.name+'</title>'+
    '<style>'+
    'body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1e293b;font-size:12px}'+
    'h1{color:#1B3A6B;font-size:18px;margin:0 0 4px}'+
    'h2{color:#2E86C1;font-size:13px;margin:16px 0 8px;border-bottom:2px solid #2E86C1;padding-bottom:4px}'+
    '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #1B3A6B}'+
    '.meta{font-size:10px;color:#64748b;text-align:right}'+
    '.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}'+
    '.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;text-align:center}'+
    '.kpi-val{font-size:22px;font-weight:700;color:#1B3A6B}'+
    '.kpi-lbl{font-size:10px;color:#64748b;margin-top:2px}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:16px}'+
    'th{background:#1B3A6B;color:#fff;padding:7px 10px;font-size:10px;text-align:left;font-weight:600}'+
    'tr:nth-child(even){background:#f8fafc}'+
    '@media print{body{padding:10px}.no-print{display:none}}'+
    '</style></head><body>'+
    '<div class="header">'+
    '<div>'+
    '<h1>Control de Avance</h1>'+
    '<div style="font-size:13px;color:#2E86C1;font-weight:600">'+APP.project.name+'</div>'+
    (APP.project.code?'<div style="font-size:10px;color:#64748b">Código: '+APP.project.code+'</div>':'')+
    '</div>'+
    '<div class="meta">'+
    '<div>Fecha: <strong>'+dateStr+'</strong></div>'+
    '<div>Hora: <strong>'+timeStr+'</strong></div>'+
    '<div>Exportado por: <strong>'+userName+'</strong></div>'+
    '</div></div>'+
    filterLabel+
    '<div class="kpi-grid">'+
    '<div class="kpi"><div class="kpi-val">'+deliverables.length+'</div><div class="kpi-lbl">Entregables</div></div>'+
    '<div class="kpi"><div class="kpi-val">'+completedDels+'</div><div class="kpi-lbl">Completados</div></div>'+
    '<div class="kpi"><div class="kpi-val">'+totalUP+'</div><div class="kpi-lbl">UP Planificadas</div></div>'+
    '<div class="kpi"><div class="kpi-val" style="color:'+(pctGen>=80?'#16a34a':pctGen>=50?'#2563eb':'#d97706')+'">'+pctGen+'%</div><div class="kpi-lbl">Avance ponderado</div></div>'+
    '</div>'+
    (phaseRows?
      '<h2>Avance por Fase</h2>'+
      '<table><thead><tr><th>Fase</th><th style="text-align:center">Entregables</th><th style="text-align:center">UP Plan.</th><th style="text-align:center">UP Cons.</th><th>Avance</th></tr></thead>'+
      '<tbody>'+phaseRows+'</tbody></table>':'')+
    '<h2>Detalle de Entregables</h2>'+
    '<table><thead><tr><th>Código</th><th>Nombre</th><th style="text-align:center">Disciplina</th><th style="text-align:center">Peso UP</th><th>Avance</th><th style="text-align:center">Estado</th></tr></thead>'+
    '<tbody>'+delRows+'</tbody></table>'+
    '<div style="font-size:9px;color:#94a3b8;margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center">'+
    'Unify Management · '+APP.project.name+' · Informe generado el '+dateStr+' a las '+timeStr+' por '+userName+
    '</div></body></html>';

  // Open in new window and trigger print
  var win=window.open('','_blank','width=900,height=700');
  if(!win){toast('Permite ventanas emergentes para exportar PDF.','error');return;}
  win.document.write(html);
  win.document.close();
  win.onload=function(){
    win.focus();
    setTimeout(function(){win.print();},500);
  };
  toast('PDF listo para imprimir / guardar.');
}
