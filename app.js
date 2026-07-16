const SUPABASE_URL='https://csyrwvimhvhqurqlrkkw.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzeXJ3dmltaHZocXVycWxya2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MDE1ODUsImV4cCI6MjA5Njk3NzU4NX0.APMpi2u9sbzuWNJ1-y__FDMCxYb1KPoe11K_Xjnl4p0';
const{createClient}=supabase;
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);
let currentUser=null,currentUserRole='editor',selectedToneVal='',currentProjectId=null,allProjects=[];
let adminNotes=[],clientNotes=[],uploadedImages=[];

// AUTH
async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-password').value;
  const err=document.getElementById('auth-err');
  const btn=document.getElementById('login-btn');
  err.style.display='none';btn.textContent='Signing in...';btn.disabled=true;
  
  // Step 1: Try to sign in
  let signInError=null;
  try{
    const result=await sb.auth.signInWithPassword({email,password:pass});
    if(result.data&&result.data.user){
      btn.textContent='Sign in →';btn.disabled=false;
      currentUser=result.data.user;loadUserRole(currentUser);showApp();return;
    }
    signInError=result.error;
  }catch(e){signInError=e;}
  
  // Step 2: Check if session exists anyway (schema errors)
  try{
    await new Promise(r=>setTimeout(r,500));
    const{data:sd}=await sb.auth.getSession();
    if(sd&&sd.session&&sd.session.user){
      btn.textContent='Sign in →';btn.disabled=false;
      currentUser=sd.session.user;loadUserRole(currentUser);showApp();return;
    }
  }catch(e){}
  
  // Step 3: Show error only if truly failed
  btn.textContent='Sign in →';btn.disabled=false;
  const msg=signInError?.message||'Login failed';
  if(msg.toLowerCase().includes('invalid')||msg.toLowerCase().includes('credentials')){
    err.textContent='Invalid email or password.';
  } else if(msg.toLowerCase().includes('schema')||msg.toLowerCase().includes('database')){
    err.textContent='Connection issue. Please try again.';
  } else {
    err.textContent=msg;
  }
  err.style.display='block';
}



// ═══════════════════════════════════════
// OUTPUT TRACKER
// ═══════════════════════════════════════

async function loadOutputs(projectId){
  var{data}=await sb.from('project_outputs').select('*').eq('project_id',projectId).order('created_at',{ascending:false});
  var outputs=data||[];
  var el=document.getElementById('modal-outputs');
  if(!el)return;
  if(!outputs.length){
    el.innerHTML='<div style="font-size:11px;color:var(--text3);padding:6px 0;margin-bottom:4px">No outputs yet — add a link below.</div>';
    return;
  }
  var typeIcons={video:'🎬',image:'🖼️',blueprint:'📄',other:'📎'};
  el.innerHTML=outputs.map(function(o){
    var icon=typeIcons[o.type]||'📎';
    var date=new Date(o.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);margin-bottom:6px">'
      +'<span style="font-size:16px">'+icon+'</span>'
      +'<div style="flex:1;min-width:0">'
      +'<a href="'+o.url+'" target="_blank" style="font-size:12px;color:var(--yellow);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">'+o.label+'</a>'
      +'<div style="font-size:10px;color:var(--text3)">'+o.type+' · '+date+'</div>'
      +'</div>'
      +'<button data-oid="'+o.id+'" class="del-output-btn" style="background:none;border:none;color:var(--text4);cursor:pointer;font-size:14px;padding:2px 6px">✕</button>'
      +'</div>';
  }).join('');
}

async function addOutput(){
  if(!currentProjectId)return;
  var url=document.getElementById('output-url-input')?.value?.trim();
  var type=document.getElementById('output-type-select')?.value||'video';
  if(!url){showNotif('Paste a URL first','error');return;}
  var typeLabels={video:'Video output',image:'Image output',blueprint:'Blueprint PDF',other:'File'};
  var label=typeLabels[type]||'Output';
  var{error}=await sb.from('project_outputs').insert({
    project_id:currentProjectId,
    user_id:currentUser.id,
    url:url,type:type,label:label
  });
  if(error){showNotif('Error: '+error.message,'error');return;}
  document.getElementById('output-url-input').value='';
  showNotif('Output added! ✓','success');
  loadOutputs(currentProjectId);
  logActivity('OUTPUT_ADDED',label);
  // Attach delete handlers
  setTimeout(function(){
    document.querySelectorAll('.del-output-btn').forEach(function(btn){
      btn.addEventListener('click',function(){deleteOutput(this.dataset.oid);});
    });
  },200);
  // Auto notify client if project has client_id
  var project=allProjects.find(function(p){return p.id===currentProjectId;});
  if(project?.client_id){
    await sb.from('notifications').insert({
      user_id:project.client_id,
      message:'Your project "'+project.client_name+'" has a new '+type+' output ready!',
      type:'output',
      project_id:currentProjectId,
      is_read:false
    }).then(function(){},function(){});
  }
}

async function deleteOutput(id){
  if(!confirm('Delete this output?'))return;
  await sb.from('project_outputs').delete().eq('id',id);
  showNotif('Output removed','success');
  loadOutputs(currentProjectId);
}

// ═══════════════════════════════════════
// NOTIFICATION SYSTEM
// ═══════════════════════════════════════

var notifInterval=null;

async function loadNotifications(){
  var{data}=await sb.from('projects')
    .select('*')
    .eq('status','Ready for Editor')
    .order('updated_at',{ascending:false});
  var items=data||[];
  notifCount=items.length;
  var bell=document.getElementById('notif-bell-count');
  if(bell){bell.textContent=notifCount;bell.style.display=notifCount>0?'flex':'none';}
  // Load user-specific notifications
  if(currentUser){
    var{data:userNotifs}=await sb.from('notifications')
      .select('*').eq('user_id',currentUser.id)
      .eq('is_read',false).order('created_at',{ascending:false}).limit(10);
    var unread=(userNotifs||[]).length;
    if(unread>0&&bell){
      bell.textContent=unread;bell.style.display='flex';
    }
  }
  // Poll every 30 seconds
  if(!notifInterval)notifInterval=setInterval(loadNotifications,30000);
}

async function toggleNotifPanel(){
  var panel=document.getElementById('notif-panel');
  if(!panel)return;
  var isOpen=panel.style.display==='block';
  panel.style.display=isOpen?'none':'block';
  if(!isOpen)await refreshNotifPanel();
}

async function refreshNotifPanel(){
  var list=document.getElementById('notif-list');
  if(!list)return;
  list.innerHTML='<div style="padding:1rem;text-align:center;font-size:11px;color:var(--text3)">Loading...</div>';
  // Get assigned projects (for editors) or all active (for admin)
  var items=[];
  if(currentUserRole==='admin'){
    var{data}=await sb.from('projects').select('*').in('status',['Ready for Editor','In Production']).order('updated_at',{ascending:false}).limit(8);
    items=data||[];
  } else {
    var{data}=await sb.from('projects').select('*').eq('assigned_to',currentUser.id).neq('status','Approved / Done').order('updated_at',{ascending:false}).limit(8);
    items=data||[];
  }
  // Get user notifications
  var userNotifHtml='';
  if(currentUser){
    var{data:uNotifs}=await sb.from('notifications').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(5);
    if(uNotifs?.length){
      userNotifHtml=uNotifs.map(function(n){
        var bg=n.is_read?"":"var(--yellow-dim)";
        var time=new Date(n.created_at).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
        return '<div class="notif-item" data-nid="'+n.id+'" style="padding:10px 14px;border-bottom:0.5px solid var(--border);background:'+bg+';cursor:pointer">'
          +'<div style="font-size:11px;color:var(--text)">'+( n.is_read?"":"🔔 ")+n.message+'</div>'
          +'<div style="font-size:9px;color:var(--text3);margin-top:2px">'+time+'</div></div>';
      }).join("");
    }
  }
  var projHtml=items.length?items.map(function(p){
    return '<div class="proj-notif-item" data-pid="'+p.id+'" style="padding:10px 14px;border-bottom:0.5px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:8px">'
      +'<div style="flex:1"><div style="font-size:12px;color:var(--text);font-weight:500">'+p.client_name+'</div>'
      +'<div style="font-size:10px;color:var(--text3);margin-top:1px">'+p.status+' · '+new Date(p.updated_at||p.created_at).toLocaleDateString("en-PH",{month:"short",day:"numeric"})+'</div></div>'
      +statusBadge(p.status)
      +'</div>';
  }).join(""):'<div style="padding:1.5rem;text-align:center;font-size:12px;color:var(--text3)">All clear! ✓</div>';
  list.innerHTML=(userNotifHtml||"")+projHtml;
  // Attach event listeners
  setTimeout(function(){
    list.querySelectorAll(".notif-item").forEach(function(el){el.addEventListener("click",function(){markRead(this.dataset.nid);});});
    list.querySelectorAll(".proj-notif-item").forEach(function(el){el.addEventListener("click",function(){openModal(this.dataset.pid);toggleNotifPanel();});});
  },100);
}

async function markRead(notifId){
  await sb.from('notifications').update({is_read:true}).eq('id',notifId);
  refreshNotifPanel();loadNotifications();
}

async function markAllRead(){
  if(!currentUser)return;
  await sb.from('notifications').update({is_read:true}).eq('user_id',currentUser.id);
  refreshNotifPanel();loadNotifications();
  showNotif('All marked as read ✓','success');
}

// Send notification to editor when assigned
async function notifyEditorAssigned(editorId,projectName){
  if(!editorId)return;
  await sb.from('notifications').insert({
    user_id:editorId,
    message:'New project assigned to you: "'+projectName+'"',
    type:'assignment',
    is_read:false
  }).then(function(){},function(){});
}


// ═══════════════════════════════════════
// SECURITY + AUTO-SAVE SYSTEM
// ═══════════════════════════════════════

// SESSION TIMEOUT - 30 mins inactivity
var inactivityTimer=null;
var SESSION_TIMEOUT=30*60*1000;

function resetInactivityTimer(){
  clearTimeout(inactivityTimer);
  inactivityTimer=setTimeout(function(){
    showNotif('Session expired. Please login again.','error');
    setTimeout(function(){sb.auth.signOut().then(function(){location.reload();});},2000);
  },SESSION_TIMEOUT);
}

function initSecurityListeners(){
  ['mousemove','keydown','click','scroll','touchstart'].forEach(function(evt){
    document.addEventListener(evt,resetInactivityTimer,{passive:true});
  });
  resetInactivityTimer();
}

// ROLE-BASED PAGE PROTECTION
var ADMIN_PAGES=['dashboard','new-project','all-projects','users','clients','analytics','submission','settings','chat','activity','attendance'];
var EDITOR_PAGES=['editor-portal','all-projects','chat','profile','worklog','automation','clients','activity','attendance','for-upload'];
var CLIENT_PAGES=['client-dashboard','profile'];

function canAccessPage(page){
  if(currentUserRole==='admin')return true;
  if(currentUserRole==='client')return CLIENT_PAGES.indexOf(page)>=0;
  return EDITOR_PAGES.indexOf(page)>=0;
}

// ACTIVITY LOG
async function logActivity(action,details){
  try{
    await sb.from('activity_logs').insert({
      user_id:currentUser?.id,
      action:action,
      details:details||null,
      created_at:new Date().toISOString()
    });
  }catch(e){}
}

// AUTO-SAVE new project form
var autoSaveTimer=null;

function initAutoSave(){
  var fields=['f-client','f-biztype','f-product','f-pain','f-usp','f-audience','f-goal','f-emphasize','f-brief','f-script'];
  fields.forEach(function(id){
    var el=document.getElementById(id);
    if(el){
      // Restore saved value
      var saved=localStorage.getItem('ace_draft_'+id);
      if(saved&&!el.value)el.value=saved;
      // Auto-save on input
      el.addEventListener('input',function(){
        clearTimeout(autoSaveTimer);
        autoSaveTimer=setTimeout(function(){
          fields.forEach(function(fid){
            var fel=document.getElementById(fid);
            if(fel&&fel.value)localStorage.setItem('ace_draft_'+fid,fel.value);
          });
          showDraftSaved();
        },1500);
      });
    }
  });
}

function showDraftSaved(){
  var el=document.getElementById('draft-saved-indicator');
  if(!el)return;
  el.style.opacity='1';
  setTimeout(function(){el.style.opacity='0';},2000);
}

function clearDraft(){
  var fields=['f-client','f-biztype','f-product','f-pain','f-usp','f-audience','f-goal','f-emphasize','f-brief','f-script'];
  fields.forEach(function(id){localStorage.removeItem('ace_draft_'+id);});
}


async function loadUserRole(user){
  var email=user?.email||'';
  // Check DB for actual role
  var{data}=await sb.from('profiles').select('role,name').eq('id',user.id).maybeSingle();
  if(data?.role==='client'){
    currentUserRole='client';
  } else if(data?.role==='admin'||email==='admin@aicreatives.com'){
    currentUserRole='admin';
  } else {
    currentUserRole='editor';
  }
  // Update sidebar display name
  var nameEl=document.getElementById('user-name-display');
  var roleEl=document.getElementById('user-role-label');
  if(nameEl)nameEl.textContent=data?.name||email;
  if(roleEl)roleEl.textContent=currentUserRole==='admin'?'Super Admin':currentUserRole==='client'?'Client':'Editor';
  document.getElementById('user-email-label').textContent=email;
  document.getElementById('user-role-label').textContent=currentUserRole==='admin'?'Super Admin':'Editor';
  applyRoleUI();
  sb.from('profiles').select('role').eq('id',user.id).maybeSingle().then(({data})=>{
    if(data?.role&&currentUserRole!=='admin'){
      currentUserRole=data.role;
      document.getElementById('user-role-label').textContent=currentUserRole==='admin'?'Super Admin':'Editor';
      applyRoleUI();
    }
  }).catch(()=>{});
}

function applyRoleUI(){
  var isAdmin=currentUserRole==='admin';
  var isEditor=currentUserRole==='editor';
  var isClient=currentUserRole==='client';

  if(isAdmin){
    // Admin sees everything
    document.querySelectorAll('.admin-only').forEach(function(el){el.style.display='';});
    document.querySelectorAll('.nav-item').forEach(function(el){el.style.display='flex';});

  } else if(isEditor){
    // Editor — limited nav only
    document.querySelectorAll('.nav-item').forEach(function(el){el.style.display='none';});
    // Hide admin-only elements first
    document.querySelectorAll('.admin-only').forEach(function(el){el.style.display='none';});
    // Show editor-allowed nav items — force show even if admin-only class
    var editorNavs=['nav-editor-portal','nav-all-projects','nav-chat','nav-profile','nav-worklog','nav-automation','nav-clients','nav-activity','nav-attendance','nav-for-upload'];
    editorNavs.forEach(function(id){
      var el=document.getElementById(id);
      if(el){el.style.display='flex';el.style.setProperty('display','flex','important');}
    });
    showPage('editor-portal');

  } else if(isClient){
    // Client — most restricted
    document.querySelectorAll('.nav-item').forEach(function(el){el.style.display='none';});
    document.querySelectorAll('.admin-only').forEach(function(el){el.style.display='none';});
    var clientNavs=['nav-profile'];
    clientNavs.forEach(function(id){
      var el=document.getElementById(id);
      if(el)el.style.display='flex';
    });
    showPage('client-dashboard');
    loadClientDashboard();
  }
}

async function doLogout(){
  await sb.auth.signOut();
  document.getElementById('app').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  currentUser=null;currentUserRole='editor';
}

function showApp(){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').style.display='block';
  initSecurityListeners();
  logActivity('LOGIN','User logged in');
  initTimeInSystem();
  // Load team API keys for everyone (editors can generate without seeing keys)
  loadTeamApiKeys();
  if(currentUserRole==='admin'){loadDashboard();loadNotifications();}
  else if(currentUserRole==='client'){showPage('client-dashboard');loadClientDashboard();}
  else{loadEditorPortal();loadNotifications();}
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+page);if(pg)pg.classList.add('active');
  const nv=document.getElementById('nav-'+page);if(nv)nv.classList.add('active');
  const titles={dashboard:'Dashboard','new-project':'New project','all-projects':'All projects','editor-portal':'My tasks',users:'Team members',analytics:'Analytics',submission:'Client form',settings:'Settings',chat:'Team chat',profile:'My profile',clients:'Clients','client-dashboard':'My dashboard',activity:'Activity log',attendance:'Attendance',worklog:'Work log',automation:'Automation Pipeline','image-creatives':'⚡ Image Creatives'};
  document.getElementById('topbar-title').textContent=titles[page]||page;
  if(page==='all-projects')loadAllProjects();
  if(page==='new-project')loadAssignDropdown();
  if(page==='editor-portal')loadEditorPortal();
  if(page==='users')loadUsers();
  if(page==='dashboard')loadDashboard();
  if(page==='analytics')loadAnalytics();
  if(page==='outputs'){if(currentUserRole!=='admin'){showNotif('Admin only!','error');return;}loadOutputsTable();}
  if(page==='clients')loadClients();
  if(page==='for-upload')loadForUpload();
  if(page==='activity')loadActivityLog();
  if(page==='attendance'){var today=new Date().toISOString().slice(0,10);var df=document.getElementById('attendance-date');if(df&&!df.value)df.value=today;loadAttendance();}
  if(page==='worklog')loadWorkLog();
  if(page==='client-dashboard')loadClientDashboard();
  if(page==='settings'){if(currentUserRole!=='admin'){showNotif('Admin only!','error');return;}loadSettings();}
  if(page==='automation'){loadAutomationProjects();}
  if(page==='chat'){loadChat();}
  if(page==='profile'){loadProfile();}
}

// NOTES
function addNote(type){
  const input=document.getElementById(type+'-note-input');
  const text=input.value.trim();
  if(!text)return;
  if(type==='admin')adminNotes.push(text);else clientNotes.push(text);
  input.value='';renderNotes(type);
}

function renderNotes(type){
  const notes=type==='admin'?adminNotes:clientNotes;
  const list=document.getElementById(type+'-notes-list');
  list.innerHTML=notes.map((n,i)=>`
    <div class="note-item">
      <div class="note-dot"></div>
      <div class="note-text">${n}</div>
      <button class="note-del" onclick="removeNote('${type}',${i})">×</button>
    </div>`).join('');
}

function removeNote(type,i){
  if(type==='admin')adminNotes.splice(i,1);else clientNotes.splice(i,1);
  renderNotes(type);
}

// IMAGE UPLOAD
function handleImageUpload(e){
  const files=Array.from(e.target.files);
  const preview=document.getElementById('uploaded-images-preview');
  files.forEach(file=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      uploadedImages.push({name:file.name,data:ev.target.result});
      const img=document.createElement('img');
      img.src=ev.target.result;img.className='uploaded-img';
      img.title=file.name;preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

// TONE
function selectTone(el){
  document.querySelectorAll('.tone-opt').forEach(t=>t.classList.remove('selected'));
  el.classList.add('selected');selectedToneVal=el.textContent.trim();
}

// STATUS BADGE
function statusBadge(s){
  const m={'New Input':'badge-new','Generating AI':'badge-ai','Ready for Editor':'badge-ready','In Production':'badge-prod','Approved / Done':'badge-done'};
  return`<span class="badge ${m[s]||'badge-new'}">${s}</span>`;
}
function fmtDate(d){return new Date(d).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}


// ═══════════════════════════════════════
// SAVE CLIENT DETAILS (no blueprint yet)
// ═══════════════════════════════════════
async function saveClientDetails(){
  var btn=document.getElementById('save-details-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Saving...';}
  var isPaste=document.getElementById('tab-paste').classList.contains('active');
  var clientName='';
  var product='',emphasize='',script='';
  if(isPaste){
    var brief=document.getElementById('f-brief').value.trim();
    if(!brief){showNotif('Paste client brief first','error');if(btn){btn.disabled=false;btn.innerHTML='💾 Save details only';}return;}
    function extractField(text,keys){
      var ls=text.split('\n');
      for(var i=0;i<ls.length;i++){
        var l=ls[i];
        for(var k=0;k<keys.length;k++){
          if(l.toLowerCase().indexOf(keys[k].toLowerCase())>=0){
            var ci=l.indexOf(':');if(ci>0){var v=l.substring(ci+1).trim().replace(/[*_\[\]]/g,'').trim();if(v)return v;}
          }
        }
      }
      return '';
    }
    clientName=extractField(brief,['client name','business name','brand name','company name'])||'Client '+new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    var extractedBizType=extractField(brief,['business type','type of business','industry','niche']);
    var extractedFB=extractField(brief,['fb page','facebook page','fb link','facebook link']);
    var extractedWebsite=extractField(brief,['website','web link','site url']);
    var extractedAudience=extractField(brief,['target audience','audience','target market']);
    var extractedPain=extractField(brief,['pain point','problem','challenge']);
    var extractedUSP=extractField(brief,['usp','unique selling','advantage']);
    var extractedGoal=extractField(brief,['goal','objective','purpose']);
    var extractedColor1=extractField(brief,['brand color','primary color','color']);
    var extractedModel=extractField(brief,['model','avatar','voice','character']);
    product=extractField(brief,['product','service','offering'])||brief.substring(0,300);
    emphasize=document.getElementById('f-script')?.value||extractField(brief,['emphasize','script','highlight','focus']);
  } else {
    clientName=document.getElementById('f-client')?.value?.trim();
    if(!clientName){showNotif('Client name required','error');if(btn){btn.disabled=false;btn.innerHTML='💾 Save details only';}return;}
    product=document.getElementById('f-product')?.value?.trim()||'';
    emphasize=document.getElementById('f-emphasize')?.value||'';
    script=document.getElementById('f-script')?.value||'';
  }
  var{error}=await sb.from('projects').insert({
    client_name:clientName,
    business_type:isPaste?(extractedBizType||''):document.getElementById('f-biztype')?.value||'',
    product:product||'',
    fb_page:isPaste?(extractedFB||null):document.getElementById('f-fb')?.value?.trim()||null,
    website:isPaste?(extractedWebsite||null):document.getElementById('f-website')?.value?.trim()||null,
    color_primary:isPaste?(extractedColor1||null):document.getElementById('f-color1')?.value||null,
    color_secondary:isPaste?null:document.getElementById('f-color2')?.value||null,
    audience:isPaste?(extractedAudience||''):document.getElementById('f-audience')?.value||'',
    pain_point:isPaste?(extractedPain||''):document.getElementById('f-pain')?.value?.trim()||'',
    usp:isPaste?(extractedUSP||''):document.getElementById('f-usp')?.value?.trim()||'',
    goal:isPaste?(extractedGoal||''):document.getElementById('f-goal')?.value||'',
    video_size:document.getElementById('f-size')?.value||'9:16 Vertical',
    language:document.getElementById('f-lang')?.value||'Taglish',
    voice_actor:isPaste?(extractedModel||null):document.getElementById('f-voice')?.value||null,
    avatar_desc:isPaste?(extractedModel||null):document.getElementById('f-avatar')?.value||null,
    emphasize:emphasize||'',
    tone:selectedToneVal||'',
    status:'New Input',
    blueprint:null,
    assigned_to:document.getElementById('f-assign-to')?.value||null,
    created_by:currentUser?.id,
    gdrive_link:document.getElementById('f-gdrive')?.value?.trim()||null,
    moodboard_link:document.getElementById('f-moodboard')?.value?.trim()||null,
    sample_video_link:document.getElementById('f-sample-video')?.value?.trim()||null,
    client_extra:document.getElementById('f-client-extra')?.value?.trim()||null
  });
  if(btn){btn.disabled=false;btn.innerHTML='💾 Save details only';}
  if(error){showNotif('Error: '+error.message,'error');return;}
  showNotif('Client details saved! ✓ Generate blueprint when ready.','success');
  logActivity('CLIENT_SAVED',clientName);
  // Clear form
  ['f-client','f-biztype','f-product','f-pain','f-usp','f-audience','f-goal','f-emphasize','f-brief','f-script','f-fb','f-website','f-color1','f-color2','f-gdrive','f-moodboard','f-sample-video','f-client-extra'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  selectedToneVal='';
  document.querySelectorAll('.tone-opt').forEach(function(t){t.classList.remove('selected');});
  showPage('dashboard');
}
// DASHBOARD
async function loadDashboard(){
  const{data}=await sb.from('projects').select('*').order('created_at',{ascending:false});
  allProjects=data||[];
  // Load editors for name lookup in pipeline cards
  var{data:editorsList}=await sb.from('profiles').select('id,name,email').eq('role','editor');
  var editorsMap={};
  (editorsList||[]).forEach(function(e){editorsMap[e.id]=e.name||e.email;});
  const ready=allProjects.filter(p=>p.status==='Ready for Editor').length;
  document.getElementById('stat-total').textContent=allProjects.length;
  document.getElementById('stat-ai').textContent=allProjects.filter(p=>p.status==='Generating AI').length;
  document.getElementById('stat-ready').textContent=ready;
  document.getElementById('stat-done').textContent=allProjects.filter(p=>p.status==='Approved / Done').length;
  const tb=document.getElementById('tasks-badge');
  tb.textContent=ready;tb.style.display=ready>0?'':'none';
  const pipes=[['pipe-new','New Input','count-new'],['pipe-ai','Generating AI','count-ai'],['pipe-ready','Ready for Editor','count-ready'],['pipe-prod','In Production','count-prod'],['pipe-done','Approved / Done','count-done']];
  pipes.forEach(([id,status,cid])=>{
    const items=allProjects.filter(p=>p.status===status);
    document.getElementById(cid).textContent=items.length;
    document.getElementById(id).innerHTML=items.length?items.map(function(p){
      var approveBtn="";
      if(status==="In Production")approveBtn='<button onclick="quickApprove(\''+p.id+'\',event)" style="margin-top:6px;width:100%;background:var(--green-dim);color:var(--green);border:none;border-radius:4px;padding:3px 6px;font-size:9px;cursor:pointer">Approve</button>';
      if(status==="Ready for Editor")approveBtn='<button onclick="quickApprove(\''+p.id+'\',event)" style="margin-top:6px;width:100%;background:var(--amber-dim);color:var(--amber);border:none;border-radius:4px;padding:3px 6px;font-size:9px;cursor:pointer">Done</button>';
      var assignedTag=p.assigned_to&&editorsMap[p.assigned_to]?'<div style="font-size:9px;color:var(--green);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">👤 '+editorsMap[p.assigned_to]+'</div>':'';
      return '<div class="pipe-card" onclick="openModal(\''+p.id+'\')"><div class="pipe-card-name">'+p.client_name+'</div><div class="pipe-card-type">'+(p.business_type||'')+"</div>"+assignedTag+approveBtn+'<button onclick="quickAssignModal(\''+p.id+'\',event)" style="margin-top:4px;width:100%;background:var(--bg2);border:0.5px solid var(--border2);color:var(--text3);border-radius:4px;padding:3px 6px;font-size:9px;cursor:pointer">👤 '+(p.assigned_to&&editorsMap[p.assigned_to]?'Re-assign':'Assign')+'</button></div>';
    }).join(""):"<div class=\"pipe-empty\">—</div>";
  });
  document.getElementById('recent-projects-body').innerHTML=allProjects.slice(0,10).map(p=>`
    <div class="table-row projects-cols" onclick="openModal('${p.id}')">
      <div><div class="row-name">${p.client_name}</div><div class="row-sub">${p.video_size||''} · ${p.language||''} · ${p.goal||''} ${getDeadlineStatus(p.deadline)}</div></div>
      <div class="row-meta">${p.business_type||'—'}</div>
      <div>${statusBadge(p.status)}</div>
      <div class="row-date">${fmtDate(p.created_at)}</div>
    </div>`).join('')||'<div class="table-empty"><div class="table-empty-icon">📋</div><div>No projects yet</div><div style="font-size:11px;margin-top:6px;color:var(--text3)">Click + New project to get started</div></div>';
}


async function loadAssignDropdown(){
  var sel=document.getElementById('f-assign-to');
  if(!sel)return;
  var{data}=await sb.from('profiles').select('id,name,email').eq('role','editor').order('name');
  sel.innerHTML='<option value="">Unassigned (assign later)</option>'+(data||[]).map(function(e){
    return '<option value="'+e.id+'">'+(e.name||e.email)+'</option>';
  }).join('');
}
// ALL PROJECTS
async function loadAllProjects(){
  const{data}=await sb.from('projects').select('*').order('created_at',{ascending:false});
  allProjects=data||[];renderProjectsTable(allProjects);
}

function filterProjects(){
  var q=(document.getElementById('search-projects')?.value||'').toLowerCase();
  var s=document.getElementById('filter-status')?.value||'';
  var pr=document.getElementById('filter-priority')?.value||'';
  var df=document.getElementById('proj-date-from')?.value||'';
  var dt=document.getElementById('proj-date-to')?.value||'';
  renderProjectsTable(allProjects.filter(function(p){
    var matchQ=!q||
      (p.client_name||'').toLowerCase().includes(q)||
      (p.business_type||'').toLowerCase().includes(q)||
      (p.goal||'').toLowerCase().includes(q)||
      (p.language||'').toLowerCase().includes(q)||
      (p.status||'').toLowerCase().includes(q)||
      (p.product||'').toLowerCase().includes(q);
    var matchS=!s||p.status===s;
    var matchP=!pr||p.priority===pr;
    var matchDF=!df||new Date(p.created_at)>=new Date(df+'T00:00:00');
    var matchDT=!dt||new Date(p.created_at)<=new Date(dt+'T23:59:59');
    return matchQ&&matchS&&matchP&&matchDF&&matchDT;
  }));
}

function clearProjectFilters(){
  ['search-projects','proj-date-from','proj-date-to'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('filter-status').value='';
  document.getElementById('filter-priority').value='';
  filterProjects();
}

function renderProjectsTable(projects){
  document.getElementById('all-projects-body').innerHTML=projects.length?projects.map(p=>`
    <div class="table-row" style="grid-template-columns:32px 2fr 1fr 1.2fr 0.8fr" onclick="openModal('${p.id}')">
      <div onclick="toggleSelect('${p.id}',event)" style="display:flex;align-items:center;justify-content:center">
        <input type="checkbox" id="cb-${p.id}" class="proj-checkbox" style="cursor:pointer;width:14px;height:14px;accent-color:var(--yellow)" ${selectedProjects.has(p.id)?'checked':''}/>
      </div>
      <div><div class="row-name">${p.client_name} ${priorityBadge(p.priority)}</div><div class="row-sub">${p.video_size||''} · ${p.language||''}</div></div>
      <div class="row-meta">${p.business_type||'—'}</div>
      <div>${statusBadge(p.status)}</div>
      <div class="row-date">${fmtDate(p.created_at)}</div>
    </div>`).join(''):'<div class="table-empty"><div class="table-empty-icon">🔍</div>No projects found.</div>';
}

// EDITOR PORTAL
async function loadEditorPortal(){
  // Load submit output form
  loadEditorOutputProjectSelect();
  loadEditorRecentOutputs();
  // Show assigned projects for editors, all Ready for Editor for admin
  var query;
  if(currentUserRole==='editor'){
    query=sb.from('projects').select('*').eq('assigned_to',currentUser.id).neq('status','Approved / Done').order('created_at',{ascending:false});
  } else {
    query=sb.from('projects').select('*').eq('status','Ready for Editor').order('created_at',{ascending:false});
  }
  const{data}=await query;
  const projects=data||[];
  const tb=document.getElementById('tasks-badge');
  tb.textContent=projects.length;tb.style.display=projects.length>0?'':'none';
  document.getElementById('editor-projects-body').innerHTML=projects.length?projects.map(p=>`
    <div class="editor-card">
      <div class="editor-card-top">
        <div>
          <div class="editor-card-name">${p.client_name}</div>
          <div class="editor-card-meta">${p.business_type||''} · ${p.goal||''} · ${p.video_size||''} · ${p.language||''} · ${statusBadge(p.status)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${getDeadlineStatus(p.deadline)}
        </div>
      </div>
      ${p.emphasize?`<div style="font-size:12px;color:var(--text2);margin-bottom:12px">${p.emphasize}</div>`:''}
      <div class="editor-card-actions">
        <button class="ghost-btn" onclick="openModal('${p.id}')">📄 View blueprint</button>
        ${p.status==='Ready for Editor'?`<button class="yellow-btn" onclick="markInProduction('${p.id}')">🎬 Start production</button>`:''}
        ${p.status==='In Production'?`<button class="yellow-btn" style="background:var(--green-dim);color:var(--green);border:0.5px solid rgba(34,197,94,0.3)" onclick="quickApprove('${p.id}',event)">✅ Mark done</button>`:''}
      </div>
    </div>`).join(''):'<div class="table-empty"><div class="table-empty-icon">✅</div><div>No assigned projects yet</div><div style="font-size:11px;margin-top:4px;color:var(--text3)">Admin will assign projects to you</div></div>';
}

async function markInProduction(id){
  await sb.from('projects').update({status:'In Production',updated_at:new Date().toISOString()}).eq('id',id);
  showNotif('Marked as In Production! 🎬','success');
  loadEditorPortal();
  if(currentUserRole==='admin')loadDashboard();
}

// USERS
async function loadUsers(){
  const{data}=await sb.from('profiles').select('*').order('created_at',{ascending:false});
  document.getElementById('users-body').innerHTML=(data||[]).length?(data).map(u=>`
    <div class="table-row user-table-cols">
      <div><div class="row-name">${u.name||'—'}</div><div class="row-sub">${u.email||''}</div></div>
      <div><span class="user-role-badge ${u.role==='admin'?'role-admin':'role-editor'}">${u.role}</span></div>
      <div class="row-date">${fmtDate(u.created_at)}</div>
      <div><button class="ghost-btn" style="font-size:11px;padding:4px 10px;color:var(--red);border-color:rgba(239,68,68,0.2)" onclick="deleteUser('${u.id}')">Remove</button></div>
    </div>`).join(''):'<div class="table-empty">No team members yet.</div>';
}

async function addUser(){
  const name=document.getElementById('new-user-name').value.trim();
  const email=document.getElementById('new-user-email').value.trim();
  const pass=document.getElementById('new-user-pass').value;
  const role=document.getElementById('new-user-role').value;
  if(!name||!email||!pass){showNotif('Fill in all fields.','error');return;}
  if(pass.length<6){showNotif('Password must be at least 6 characters.','error');return;}
  const btn=document.getElementById('add-user-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Adding...';
  const{data,error}=await sb.rpc('create_user_with_profile',{user_email:email,user_password:pass,user_name:name,user_role:role});
  if(error||!data?.success){showNotif('Error: '+(error?.message||data?.error||'Unknown'),'error');btn.disabled=false;btn.textContent='Add team member';return;}
  showNotif('Team member added! ✓','success');
  ['new-user-name','new-user-email','new-user-pass'].forEach(id=>document.getElementById(id).value='');
  btn.disabled=false;btn.textContent='Add team member';loadUsers();
}

async function deleteUser(id){
  if(!confirm('Remove this team member?'))return;
  await sb.from('profiles').delete().eq('id',id);
  showNotif('Removed.','success');loadUsers();
}

// TAB SWITCH
function switchTab(tab){
  document.getElementById('input-manual').style.display=tab==='manual'?'block':'none';
  document.getElementById('input-paste').style.display=tab==='paste'?'block':'none';
  document.getElementById('tab-manual').classList.toggle('active',tab==='manual');
  document.getElementById('tab-paste').classList.toggle('active',tab==='paste');
}

// BLUEPRINT GENERATOR
async function generateBlueprint(){
  // Detect active tab
  const isPaste=document.getElementById('tab-paste').classList.contains('active');
  const btn=document.getElementById('generate-btn');
  const status=document.getElementById('gen-status');
  const allNotes=[...adminNotes.map(n=>'[Admin] '+n),...clientNotes.map(n=>'[Client] '+n)].join(' | ');
  const script=document.getElementById('f-script').value.trim();
  let userPrompt='';

  if(isPaste){
    const brief=document.getElementById('f-brief').value.trim();
    if(!brief){showNotif('Please paste the client brief first.','error');return;}
    userPrompt=`CLIENT BRIEF (extract ALL details from this and generate blueprint):
${brief}

ADDITIONAL SPECS:
- Video Size: ${document.getElementById('f-size').value}
- Duration: ${document.getElementById('f-duration').value}
- Language: ${document.getElementById('f-lang').value}
- Tone: ${selectedToneVal||'choose best fit based on brand'}
${script?'- Script/Notes: '+script:''}
${allNotes?'- Internal Notes: '+allNotes:''}`;
  } else {
    const client=document.getElementById('f-client').value.trim();
    const biztype=document.getElementById('f-biztype').value;
    const product=document.getElementById('f-product').value.trim();
    const pain=document.getElementById('f-pain').value.trim();
    const usp=document.getElementById('f-usp').value.trim();
    if(!client||!biztype||!product||!pain||!usp){showNotif('Fill in required fields: Client, Type, Product, Pain Point, USP.','error');return;}
    userPrompt=`Generate full video ad blueprint:
- Client: ${client}
- FB Page: ${document.getElementById('f-fb').value||'N/A'}
- Website: ${document.getElementById('f-website').value||'N/A'}
- Business Type: ${biztype}
- Product/Service: ${product}
- Brand Colors: ${document.getElementById('f-color1').value||'N/A'} / ${document.getElementById('f-color2').value||'N/A'}
- Target Audience: ${document.getElementById('f-audience').value||'N/A'}
- Pain Point: ${pain}
- USP: ${usp}
- Intro Idea: ${document.getElementById('f-intro').value||'N/A'}
- Emphasize: ${document.getElementById('f-emphasize').value||'N/A'}
- Goal: ${document.getElementById('f-goal').value||'N/A'}
- Voice/Avatar: ${document.getElementById('f-voice').value||'N/A'}
- Model: ${document.getElementById('f-avatar').value||'N/A'}
- Video Size: ${document.getElementById('f-size').value}
- Duration: ${document.getElementById('f-duration').value}
- Language: ${document.getElementById('f-lang').value}
- Tone: ${selectedToneVal||'N/A'}
${script?'- Script/Notes: '+script:''}
${allNotes?'- Internal Notes: '+allNotes:''}`;
  }

  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Generating...';
  status.textContent='⚡ AI is building your blueprint (10-20 seconds)...';
  document.getElementById('blueprint-output').style.display='none';

  const systemPrompt=`ROLE: Elite AI Creative Director for high-performance Filipino Video Ads Agency. Generate hyper-optimized, high-converting scene-by-scene advertising blueprint. Output requires ZERO manual rewrites.
RULES: 8-12 scenes, 3-5 second visual reset, append "9:16 vertical aspect ratio, mobile-optimized composition, portrait orientation" to EVERY image prompt, establish Visual Anchor in Scene 1 inject to ALL scenes, photorealistic studio commercial photography no text/logos, cinematic video commands, Taglish ElevenLabs script with tone cues.
OUTPUT FORMAT: ### 📊 AUTOMATED PROJECT OVERVIEW\n### 🎙️ ELEVENLABS AUDIO SCRIPT\n### 🎬 SCENE-BY-SCENE PRODUCTION BLUEPRINT`;

  try{
    const res=await fetch('/api/generate',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:4000,system:systemPrompt,messages:[{role:'user',content:userPrompt}]})
    });
    const d=await res.json();
    const text=d.content?.map(i=>i.text||'').join('')||'Error generating blueprint.';
    document.getElementById('blueprint-text').textContent=text;
    document.getElementById('blueprint-output').style.display='block';
    status.textContent='✓ Blueprint ready ('+text.split('\n').length+' lines) — review and save!';
  }catch(e){showNotif('Error: '+e.message,'error');status.textContent='';}
  finally{btn.disabled=false;btn.innerHTML='⚡ Generate blueprint';}
}

// SAVE PROJECT
async function saveProject(){
  const blueprint=document.getElementById('blueprint-text').textContent;
  if(!blueprint)return;
  const btn=document.getElementById('save-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Saving...';
  const isPaste=document.getElementById('tab-paste').classList.contains('active');
  let clientName='New Project',product='',emphasize='';
  if(isPaste){
    const brief=document.getElementById('f-brief').value.trim();
    // Extract helper
    function extractF(text,keys){
      var ls=text.split('\n');
      for(var i=0;i<ls.length;i++){
        var l=ls[i];
        for(var k=0;k<keys.length;k++){
          if(l.toLowerCase().indexOf(keys[k].toLowerCase())>=0){
            var ci=l.indexOf(':');
            if(ci>0){var v=l.substring(ci+1).trim().replace(/[*_\[\]]/g,'').trim();if(v)return v;}
          }
        }
      }
      return '';
    }
    clientName=extractF(brief,['client name','business name','brand name','company name','client:'])||'Client '+new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    var pFB=extractF(brief,['fb page','facebook page','fb link','facebook link','facebook.com','fb.com']);
    // Also check for raw URLs in brief
    var urlMatch=brief.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s]+/i);
    if(!pFB&&urlMatch)pFB=urlMatch[0];
    var pWebsite=extractF(brief,['website','web link','site url','www.']);
    var pBizType=extractF(brief,['business type','type of business','industry','niche']);
    var pAudience=extractF(brief,['target audience','audience','target market']);
    var pPain=extractF(brief,['pain point','problem','challenge']);
    var pUSP=extractF(brief,['usp','unique selling','advantage']);
    var pGoal=extractF(brief,['goal','objective','main goal','purpose']);
    var pColor=extractF(brief,['brand color','primary color','color']);
    var pModel=extractF(brief,['model','avatar','voice actor','character','brand avatar']);
    var pTone=extractF(brief,['tone of voice','tone:','voice tone']);
    product=extractF(brief,['product','service','offering','what we sell'])||brief.substring(0,300);
    emphasize=document.getElementById('f-script')?.value||extractF(brief,['emphasize','script','highlight','focus','what things']);
  } else {
    clientName=document.getElementById('f-client').value.trim()||'Client '+new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    product=document.getElementById('f-product').value.trim();
    emphasize=document.getElementById('f-emphasize').value||'';
  }
  const{error}=await sb.from('projects').insert({
    client_name:clientName,
    business_type:isPaste?'':document.getElementById('f-biztype').value,
    product,
    fb_page:isPaste?(pFB||null):document.getElementById('f-fb')?.value?.trim()||null,
    website:isPaste?(pWebsite||null):document.getElementById('f-website')?.value?.trim()||null,
    color_primary:isPaste?(pColor||null):document.getElementById('f-color1').value||null,
    color_secondary:isPaste?null:document.getElementById('f-color2').value||null,
    audience:isPaste?(pAudience||''):document.getElementById('f-audience').value||'',
    pain_point:isPaste?(pPain||''):document.getElementById('f-pain').value.trim()||'',
    usp:isPaste?(pUSP||''):document.getElementById('f-usp').value.trim()||'',
    goal:isPaste?(pGoal||''):document.getElementById('f-goal').value||'',
    business_type:isPaste?(pBizType||''):document.getElementById('f-biztype').value||'',
    voice_actor:isPaste?(pModel||null):document.getElementById('f-voice').value||null,
    avatar_desc:isPaste?(pModel||null):document.getElementById('f-avatar').value||null,
    video_size:document.getElementById('f-size').value,
    language:document.getElementById('f-lang').value,
    emphasize,tone:isPaste?(pTone||selectedToneVal):selectedToneVal,
    status:'New Input',blueprint:blueprint||null,
    assigned_to:document.getElementById('f-assign-to')?.value||null,
    created_by:currentUser?.id,
    gdrive_link:document.getElementById('f-gdrive')?.value?.trim()||null,
    moodboard_link:document.getElementById('f-moodboard')?.value?.trim()||null,
    sample_video_link:document.getElementById('f-sample-video')?.value?.trim()||null,
    client_extra:document.getElementById('f-client-extra')?.value?.trim()||null
  });
  btn.disabled=false;btn.innerHTML='💾 Save &amp; send to editor';
  if(error){showNotif('Save error: '+error.message,'error');return;}
  showNotif('Project saved! Ready for editor ✓','success');
  document.getElementById('blueprint-output').style.display='none';
  document.getElementById('gen-status').textContent='';
  document.getElementById('f-brief').value='';
  document.getElementById('f-script').value='';
  adminNotes=[];clientNotes=[];
  renderNotes('admin');renderNotes('client');
  selectedToneVal='';
  document.querySelectorAll('.tone-opt').forEach(t=>t.classList.remove('selected'));
  showPage('dashboard');
}

// MODAL
async function openModal(id){
  const p=allProjects.find(x=>x.id===id);if(!p)return;
  currentProjectId=id;
  document.getElementById('modal-client-name').textContent=p.client_name;
  document.getElementById('modal-date').textContent=fmtDate(p.created_at)+' · '+p.business_type;
  document.getElementById('modal-status-select').value=p.status;
  document.getElementById('modal-blueprint').textContent=p.blueprint||'No blueprint yet.';
  // Get assigned editor name
  var assignedName='Unassigned';
  if(p.assigned_to){
    const{data:edData}=await sb.from('profiles').select('name,email').eq('id',p.assigned_to).maybeSingle();
    if(edData)assignedName=edData.name||edData.email;
  }
  // Build material links
  var gdriveHtml=p.gdrive_link?'<a href="'+p.gdrive_link+'" target="_blank" style="color:var(--yellow);font-size:11px">📁 Open GDrive</a>':'—';
  var moodHtml=p.moodboard_link?'<a href="'+p.moodboard_link+'" target="_blank" style="color:var(--yellow);font-size:11px">🖼️ Open Moodboard</a>':'—';
  var sampleHtml=p.sample_video_link?'<a href="'+p.sample_video_link+'" target="_blank" style="color:var(--yellow);font-size:11px">🎬 Open Sample</a>':'—';
  document.getElementById('modal-detail-grid').innerHTML=[
    ['Client',p.client_name],['Business type',p.business_type],
    ['FB Page',p.fb_page?`<a href="${p.fb_page}" target="_blank" style="color:var(--yellow);font-size:11px">🔗 Open FB Page</a>`:'—'],
    ['Website',p.website?`<a href="${p.website}" target="_blank" style="color:var(--yellow);font-size:11px">🔗 Open Website</a>`:'—'],
    ['Goal',p.goal],['Language',p.language],
    ['Video size',p.video_size],['Tone',p.tone],
    ['Audience',p.audience],['Assigned to',assignedName],
    ['Pain point',p.pain_point],['USP',p.usp]
  ].map(([l,v])=>`<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-val">${v||'—'}</div></div>`).join('')
  +`<div class="detail-item"><div class="detail-label">GDrive Materials</div><div class="detail-val">${gdriveHtml}</div></div>`
  +`<div class="detail-item"><div class="detail-label">Moodboard</div><div class="detail-val">${moodHtml}</div></div>`
  +`<div class="detail-item"><div class="detail-label">Sample Video</div><div class="detail-val">${sampleHtml}</div></div>`
  +(p.client_extra?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-label">Extra Notes</div><div class="detail-val">${p.client_extra}</div></div>`:'');
  // Load team members for assignment
  const{data:members}=await sb.from('profiles').select('id,name,email,role').order('name');
  const assignSelect=document.getElementById('modal-assign-select');
  const editors=(members||[]).filter(m=>m.role==='editor');
  assignSelect.innerHTML='<option value="">Unassigned</option>'+editors.map(m=>`<option value="${m.id}" ${p.assigned_to===m.id?'selected':''}>${m.name||m.email}</option>`).join('');
  // Show priority in modal
  const prioSelect=document.getElementById('modal-priority-select');
  if(prioSelect)prioSelect.value=p.priority||'normal';
  // Show deadline in modal
  const deadlineRow=document.getElementById('modal-deadline-row');
  if(deadlineRow){
    var dval=p.deadline||"";
    var did=p.id;
    deadlineRow.innerHTML='<span style="font-size:11px;color:var(--text2);font-weight:500">Deadline:</span>'
      +'<input type="date" class="status-select" id="modal-deadline-input" value="'+dval+'" onchange="setDeadline(\''+did+'\',this.value)" style="cursor:pointer"/>'  
      +getDeadlineStatus(p.deadline);
  }
  document.getElementById('project-modal').classList.add('open');
  loadComments(id);
  loadOutputs(id);
  loadRevisions(id);
  if(p.blueprint)renderBlueprintScenes(p.blueprint,'modal-scenes');
  // Show client approval section if there are outputs and user is client or admin
  var approvalSection=document.getElementById('client-approval-section');
  if(approvalSection){
    var showApproval=(currentUserRole==='client'||currentUserRole==='admin')&&p.status==='In Production';
    approvalSection.style.display=showApproval?'block':'none';
  }
}

function closeModal(){document.getElementById('project-modal').classList.remove('open');currentProjectId=null;}

async function updateProjectStatus(){
  if(!currentProjectId)return;
  const status=document.getElementById('modal-status-select').value;
  const oldProject=allProjects.find(p=>p.id===currentProjectId);
  const oldStatus=oldProject?.status;
  await sb.from('projects').update({status,updated_at:new Date().toISOString()}).eq('id',currentProjectId);
  if(oldStatus&&oldStatus!==status)logStatusChange(currentProjectId,oldStatus,status);
  allProjects=allProjects.map(p=>p.id===currentProjectId?{...p,status}:p);
  showNotif('Status: '+status,'success');loadDashboard();
}

async function deleteProject(){
  if(!currentProjectId||!confirm('Delete this project permanently?'))return;
  await sb.from('projects').delete().eq('id',currentProjectId);
  showNotif('Project deleted.','success');closeModal();loadDashboard();
}

function copyBlueprint(){navigator.clipboard.writeText(document.getElementById('blueprint-text').textContent);showNotif('Copied! ✓','success');}
function copyModalBlueprint(){navigator.clipboard.writeText(document.getElementById('modal-blueprint').textContent);showNotif('Copied! ✓','success');}

// NOTIFICATIONS
let notifCount=0;

async function loadNotifications(){
  const{data}=await sb.from('projects')
    .select('*')
    .eq('status','Ready for Editor')
    .order('created_at',{ascending:false});
  const items=data||[];
  notifCount=items.length;
  const bell=document.getElementById('notif-bell-count');
  if(bell){bell.textContent=notifCount;bell.style.display=notifCount>0?'flex':'none';}
}

async function toggleNotifPanel(){
  const panel=document.getElementById('notif-panel');
  if(!panel)return;
  const isOpen=panel.style.display==='block';
  panel.style.display=isOpen?'none':'block';
  if(!isOpen){
    const{data}=await sb.from('projects').select('*').in('status',['Ready for Editor','In Production']).order('updated_at',{ascending:false}).limit(10);
    panel.innerHTML=(data||[]).length?(data).map(p=>`
      <div onclick="openModal('${p.id}');toggleNotifPanel()" style="padding:10px 14px;border-bottom:0.5px solid var(--border);cursor:pointer;transition:background 0.1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <div style="font-size:12px;color:var(--text);font-weight:600;margin-bottom:2px">${p.client_name}</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="font-size:9px;color:var(--text3)">${fmtDate(p.updated_at||p.created_at)}</span>${statusBadge(p.status)}</div>
      </div>`).join(''):'<div style="padding:1.5rem;text-align:center;font-size:12px;color:var(--text3)">No active projects</div>';
  }
}

// COMMENTS
let currentComments=[];

async function loadComments(projectId){
  const{data}=await sb.from('project_comments').select('*,profiles(name,email)').eq('project_id',projectId).order('created_at',{ascending:true}).limit(20);
  currentComments=data||[];
  renderComments();
}

function renderComments(){
  const box=document.getElementById('modal-comments');
  if(!box)return;
  box.innerHTML=currentComments.length?currentComments.map(c=>`
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start">
      <div style="width:22px;height:22px;border-radius:50%;background:var(--yellow-dim);border:0.5px solid var(--yellow);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--yellow);flex-shrink:0">${((c.profiles?.name||c.profiles?.email||'?')[0]).toUpperCase()}</div>
      <div style="flex:1;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);padding:7px 10px">
        <div style="font-size:9px;color:var(--text3);margin-bottom:3px">${c.profiles?.name||c.profiles?.email||'Unknown'} · ${fmtDate(c.created_at)}</div>
        <div style="font-size:12px;color:var(--text2)">${c.comment}</div>
      </div>
    </div>`).join(''):'<div style="font-size:11px;color:var(--text3);padding:8px 0">No comments yet.</div>';
}

async function addComment(){
  if(!currentProjectId)return;
  const input=document.getElementById('modal-comment-input');
  const text=input.value.trim();if(!text)return;
  await sb.from('project_comments').insert({project_id:currentProjectId,user_id:currentUser.id,comment:text});
  input.value='';
  loadComments(currentProjectId);
}

// DEADLINE
async function setDeadline(id,date){
  await sb.from('projects').update({deadline:date,updated_at:new Date().toISOString()}).eq('id',id);
  allProjects=allProjects.map(p=>p.id===id?{...p,deadline:date}:p);
  showNotif('Deadline set! ✓','success');
}

function getDeadlineStatus(deadline){
  if(!deadline)return'';
  var d=new Date(deadline);var now=new Date();now.setHours(0,0,0,0);d.setHours(0,0,0,0);
  var diff=Math.ceil((d-now)/(1000*60*60*24));
  if(diff<0)return'<span style="color:var(--red);font-size:10px;font-weight:700;background:var(--red-dim);padding:1px 6px;border-radius:4px">⚠ OVERDUE '+Math.abs(diff)+'d</span>';
  if(diff===0)return'<span style="color:var(--red);font-size:10px;font-weight:700;background:var(--red-dim);padding:1px 6px;border-radius:4px">🔴 DUE TODAY</span>';
  if(diff<=3)return'<span style="color:var(--red);font-size:10px;font-weight:600;background:var(--red-dim);padding:1px 6px;border-radius:4px">🔴 '+diff+'d left</span>';
  if(diff<=6)return'<span style="color:var(--amber);font-size:10px;font-weight:600;background:var(--amber-dim);padding:1px 6px;border-radius:4px">🟡 '+diff+'d left</span>';
  return'<span style="color:var(--text3);font-size:10px">'+diff+'d left</span>';
}

// DUPLICATE PROJECT
async function duplicateProject(id){
  const p=allProjects.find(x=>x.id===id);if(!p)return;
  const newName=p.client_name+' (Copy)';
  const{error}=await sb.from('projects').insert({
    client_name:newName,business_type:p.business_type,product:p.product,
    color_primary:p.color_primary,color_secondary:p.color_secondary,
    audience:p.audience,pain_point:p.pain_point,usp:p.usp,goal:p.goal,
    video_size:p.video_size,language:p.language,voice_actor:p.voice_actor,
    avatar_desc:p.avatar_desc,emphasize:p.emphasize,tone:p.tone,
    status:'New Input',blueprint:p.blueprint,assigned_to:null,
    created_by:currentUser?.id
  });
  if(!error){showNotif('Project duplicated! ✓','success');closeModal();loadDashboard();}
  else showNotif('Error: '+error.message,'error');
}

// QUICK APPROVE
async function quickApprove(id,e){
  e.stopPropagation();
  await sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',id);
  showNotif('Approved! ✓','success');loadDashboard();
}

// ASSIGN PROJECT
async function assignProject(){
  if(!currentProjectId)return;
  const assignedTo=document.getElementById('modal-assign-select').value;
  await sb.from('projects').update({assigned_to:assignedTo||null,updated_at:new Date().toISOString()}).eq('id',currentProjectId);
  allProjects=allProjects.map(p=>p.id===currentProjectId?{...p,assigned_to:assignedTo}:p);
  if(assignedTo){
    var proj=allProjects.find(function(p){return p.id===currentProjectId;});
    await sb.from('notifications').insert({
      user_id:assignedTo,
      message:'🎯 New project assigned to you: "'+(proj?.client_name||'Project')+'" — check My Tasks!',
      type:'assignment',project_id:currentProjectId,is_read:false
    }).then(function(){},function(){});
    showNotif('Assigned! Editor notified ✓','success');
  } else {
    showNotif('Unassigned.','success');
  }
  loadDashboard();
}

// EXPORT PDF
function exportPDF(){
  const p=allProjects.find(x=>x.id===currentProjectId);
  if(!p)return;
  const blueprint=document.getElementById('modal-blueprint').textContent;
  const win=window.open('','_blank');
  win.document.write(`
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${p.client_name} — Blueprint</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:13px;line-height:1.8;padding:40px;max-width:800px;margin:0 auto;color:#111}
      h1{font-size:20px;margin-bottom:4px}
      .meta{font-size:11px;color:#666;margin-bottom:24px}
      pre{white-space:pre-wrap;font-family:inherit;font-size:12px;line-height:1.9;background:#f5f5f5;padding:20px;border-radius:6px}
      @media print{body{padding:20px}}
    </style>
    </head><body>
    <h1>${p.client_name}</h1>
    <div class="meta">${p.business_type||''} · ${p.video_size||''} · ${p.language||''} · ${fmtDate(p.created_at)}</div>
    <pre>${blueprint}</pre>
    <script>window.onload=()=>window.print();</script>
    </body></html>
  `);
  win.document.close();
}

// ANALYTICS
async function loadAnalytics(){
  var monthFilter=document.getElementById('analytics-month-filter')?.value||'';
  var aFrom=document.getElementById('analytics-date-from')?.value||'';
  var aTo=document.getElementById('analytics-date-to')?.value||'';
  var query=sb.from('projects').select('*').order('created_at',{ascending:false});
  if(monthFilter){
    var start=new Date(monthFilter+'-01');
    var end=new Date(start.getFullYear(),start.getMonth()+1,0,23,59,59);
    query=query.gte('created_at',start.toISOString()).lte('created_at',end.toISOString());
  } else if(aFrom||aTo){
    if(aFrom)query=query.gte('created_at',aFrom+'T00:00:00');
    if(aTo)query=query.lte('created_at',aTo+'T23:59:59');
  }
  const[{data:projects},{data:members}]=await Promise.all([
    query,
    sb.from('profiles').select('*').eq('role','editor')
  ]);
  const all=projects||[];const eds=members||[];
  
  const total=all.length;
  const done=all.filter(p=>p.status==='Approved / Done').length;
  const inProd=all.filter(p=>p.status==='In Production').length;
  const rate=total>0?Math.round((done/total)*100):0;
  
  document.getElementById('analytics-stats').innerHTML=`
    <div class="stat-card c-yellow"><div class="stat-icon" style="background:var(--yellow-dim)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div><div class="stat-label">Total projects</div><div class="stat-val">${total}</div></div>
    <div class="stat-card c-green"><div class="stat-icon" style="background:var(--green-dim)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div><div class="stat-label">Completed</div><div class="stat-val" style="color:var(--green)">${done}</div></div>
    <div class="stat-card c-amber"><div class="stat-icon" style="background:var(--amber-dim)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="stat-label">In production</div><div class="stat-val" style="color:var(--amber)">${inProd}</div></div>
    <div class="stat-card c-purple"><div class="stat-icon" style="background:var(--purple-dim)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="stat-label">Completion rate</div><div class="stat-val" style="color:var(--purple)">${rate}%</div></div>
  `;

  // Status breakdown
  const statuses=['New Input','Generating AI','Ready for Editor','In Production','Approved / Done'];
  const colors={'New Input':'var(--text2)','Generating AI':'var(--purple)','Ready for Editor':'var(--green)','In Production':'var(--amber)','Approved / Done':'#4caf50'};
  document.getElementById('analytics-status').innerHTML=statuses.map(s=>{
    const count=all.filter(p=>p.status===s).length;
    const pct=total>0?Math.round((count/total)*100):0;
    return`<div style="padding:10px 16px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;gap:10px">
      <div style="flex:1;font-size:12px;color:var(--text2)">${s}</div>
      <div style="font-size:13px;font-weight:600;color:${colors[s]};min-width:24px;text-align:right">${count}</div>
      <div style="width:80px;height:4px;background:var(--border2);border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${colors[s]};border-radius:4px"></div>
      </div>
      <div style="font-size:10px;color:var(--text3);min-width:28px">${pct}%</div>
    </div>`;
  }).join('');

  // Load performance scores
  var perfData=await loadEditorPerformance();
  var perfMap={};
  perfData.forEach(function(d){perfMap[d.editor.id]=d;});

  // Per-editor stats
  const editorStats=eds.map(e=>{
    var perf=perfMap[e.id]||{score:0,onTimeRate:0,avgTurnaround:0};
    const assigned=all.filter(p=>p.assigned_to===e.id);
    const edDone=assigned.filter(p=>p.status==='Approved / Done').length;
    const edProd=assigned.filter(p=>p.status==='In Production').length;
    const edReady=assigned.filter(p=>p.status==='Ready for Editor').length;
    var sc=perf.score;var scColor=scoreColor(sc);
    return`<div style="padding:12px 16px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;gap:12px">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--yellow-dim);border:0.5px solid var(--yellow);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--yellow);flex-shrink:0">${(e.name||e.email||'?')[0].toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:12px;color:var(--text);font-weight:600">${e.name||e.email}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${assigned.length} assigned · ${edProd} in prod · ${edDone} done · avg ${perf.avgTurnaround||0}d</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <div style="text-align:center;padding:4px 8px;background:var(--bg4);border-radius:var(--radius);border:0.5px solid var(--border2)">
          <div style="font-size:14px;font-weight:700;color:${scColor}">${sc}</div>
          <div style="font-size:8px;color:var(--text3);text-transform:uppercase">Score</div>
        </div>
        <div style="text-align:center;padding:4px 8px;background:var(--bg4);border-radius:var(--radius);border:0.5px solid var(--border2)">
          <div style="font-size:14px;font-weight:700;color:var(--green)">${perf.onTimeRate||0}%</div>
          <div style="font-size:8px;color:var(--text3);text-transform:uppercase">On time</div>
        </div>
      </div>
    </div>`;
  }).join('')||'<div style="padding:2rem;text-align:center;font-size:12px;color:var(--text3)">No editors yet.</div>';

  document.getElementById('analytics-activity').innerHTML=editorStats;

  // All projects table
  document.getElementById('analytics-projects').innerHTML=all.map(p=>{
    const editor=eds.find(e=>e.id===p.assigned_to);
    return`<div class="table-row" style="grid-template-columns:2fr 1fr 1fr 1fr" onclick="openModal('${p.id}')">
      <div><div class="row-name">${p.client_name}</div><div class="row-sub">${p.video_size||''} · ${p.language||''}</div></div>
      <div>${statusBadge(p.status)}</div>
      <div class="row-meta" style="font-size:11px">${editor?editor.name||editor.email:'Unassigned'}</div>
      <div class="row-date">${fmtDate(p.created_at)}</div>
    </div>`;
  }).join('')||'<div class="table-empty">No projects yet.</div>';
}



// PRIORITY SYSTEM
async function setPriority(id, priority){
  await sb.from('projects').update({priority, updated_at:new Date().toISOString()}).eq('id',id);
  allProjects=allProjects.map(p=>p.id===id?{...p,priority}:p);
  showNotif('Priority set! ✓','success');
}

function priorityBadge(p){
  if(!p||p==='normal')return '';
  if(p==='urgent')return '<span style="font-size:9px;padding:2px 7px;border-radius:20px;background:#2a0a0a;color:#ef4444;border:0.5px solid rgba(239,68,68,0.3);font-weight:700">URGENT</span>';
  if(p==='low')return '<span style="font-size:9px;padding:2px 7px;border-radius:20px;background:var(--bg4);color:var(--text3);border:0.5px solid var(--border3);font-weight:600">LOW</span>';
  return '';
}

// BULK ACTIONS
let selectedProjects=new Set();

function toggleSelect(id,e){
  e.stopPropagation();
  if(selectedProjects.has(id))selectedProjects.delete(id);
  else selectedProjects.add(id);
  updateBulkBar();
  const cb=document.getElementById('cb-'+id);
  if(cb)cb.checked=selectedProjects.has(id);
}

function updateBulkBar(){
  const bar=document.getElementById('bulk-action-bar');
  const count=document.getElementById('bulk-count');
  if(!bar)return;
  if(selectedProjects.size>0){
    bar.style.display='flex';
    if(count)count.textContent=selectedProjects.size+' selected';
  } else {
    bar.style.display='none';
  }
}

async function bulkApprove(){
  if(!selectedProjects.size)return;
  await Promise.all([...selectedProjects].map(id=>
    sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',id)
  ));
  showNotif(`${selectedProjects.size} projects approved! ✓`,'success');
  selectedProjects.clear();updateBulkBar();loadDashboard();loadAllProjects();
}

async function bulkAssign(){
  if(!selectedProjects.size)return;
  const{data:members}=await sb.from('profiles').select('id,name,email').eq('role','editor');
  const editors=members||[];
  if(!editors.length){showNotif('No editors found.','error');return;}
  const opts=editors.map(function(e){return e.name||e.email;}).join(", ");
  var editorList="";
  editors.forEach(function(e,i){editorList+=(i+1)+". "+(e.name||e.email)+"\n";});
  const choice=prompt("Assign to which editor?\n\n"+editorList+"\nEnter number:");
  const idx=parseInt(choice)-1;
  if(isNaN(idx)||idx<0||idx>=editors.length)return;
  const editor=editors[idx];
  await Promise.all([...selectedProjects].map(id=>
    sb.from('projects').update({assigned_to:editor.id,updated_at:new Date().toISOString()}).eq('id',id)
  ));
  showNotif(selectedProjects.size+' projects assigned to '+(editor.name||editor.email)+'! ✓','success');
  selectedProjects.clear();updateBulkBar();loadAllProjects();
}

async function bulkDelete(){
  if(!selectedProjects.size)return;
  if(!confirm(`Delete ${selectedProjects.size} projects permanently?`))return;
  await Promise.all([...selectedProjects].map(id=>
    sb.from('projects').delete().eq('id',id)
  ));
  showNotif(`${selectedProjects.size} projects deleted.`,'success');
  selectedProjects.clear();updateBulkBar();loadDashboard();loadAllProjects();
}

function clearSelection(){
  selectedProjects.clear();
  updateBulkBar();
  document.querySelectorAll('.proj-checkbox').forEach(cb=>cb.checked=false);
}

// EXPORT CSV
function exportCSV(){
  const headers=['Client','Business Type','Goal','Status','Language','Video Size','Tone','Priority','Date Created'];
  const rows=allProjects.map(p=>[
    p.client_name||'',p.business_type||'',p.goal||'',p.status||'',
    p.language||'',p.video_size||'',p.tone||'',p.priority||'',
    p.created_at?new Date(p.created_at).toLocaleDateString('en-PH'):''
  ].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));
  const csv=[headers.join(',')].concat(rows).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='ai-creatives-projects-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();URL.revokeObjectURL(url);
  showNotif('CSV exported! ✓','success');
}

// STATUS HISTORY LOG
async function loadStatusHistory(projectId){
  const{data}=await sb.from('project_history').select('*').eq('project_id',projectId).order('created_at',{ascending:false}).limit(10);
  return data||[];
}

async function logStatusChange(projectId,oldStatus,newStatus){
  await sb.from('project_history').insert({
    project_id:projectId,
    user_id:currentUser?.id,
    old_status:oldStatus,
    new_status:newStatus,
    changed_at:new Date().toISOString()
  }).catch(()=>{});
}

// WEEKLY REPORT
async function generateWeeklyReport(){
  const oneWeekAgo=new Date();oneWeekAgo.setDate(oneWeekAgo.getDate()-7);
  const{data}=await sb.from('projects').select('*').gte('created_at',oneWeekAgo.toISOString()).order('created_at',{ascending:false});
  const projects=data||[];
  const done=projects.filter(p=>p.status==='Approved / Done').length;
  const inProd=projects.filter(p=>p.status==='In Production').length;
  const ready=projects.filter(p=>p.status==='Ready for Editor').length;
  var divider="==================================================";
  var projList=projects.length?projects.map(function(p){return "• "+p.client_name+" — "+p.status+" ("+(p.language||"")+")";}).join("\n"):"No projects this week.";
  var rate=projects.length>0?Math.round((done/projects.length)*100):0;
  var report="📊 WEEKLY REPORT — "+new Date().toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"})+"\n"
    +divider+"\n\nSUMMARY\n"
    +"• New projects this week: "+projects.length+"\n"
    +"• Completed: "+done+"\n"
    +"• In production: "+inProd+"\n"
    +"• Ready for editor: "+ready+"\n"
    +"• Completion rate: "+rate+"%\n\n"
    +"PROJECTS THIS WEEK\n"+projList+"\n\n"
    +divider+"\nGenerated by AI Creatives Engine";
  
  const win=window.open('','_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Weekly Report</title>'
    +'<style>body{font-family:monospace;font-size:13px;padding:40px;background:#111;color:#f0f0f0;line-height:1.8;white-space:pre-wrap}'
    +'h1{color:#FACC15;font-size:16px}@media print{body{background:#fff;color:#111}}</style></head>'
    +'<body>'+report+'<'+'script>window.onload=()=>window.print();<'+'/script></body></html>');
  win.document.close();
  showNotif('Report generated! 📊','success');
}

// BLUEPRINT TEMPLATES
const TEMPLATES={
  aesthetics:{
    client:'[Clinic Name]',biztype:'Service-Based',
    product:'Aesthetic treatments (facial, skin whitening, hair loss, slimming)',
    pain:'Insecure sa itsura, hindi confident, may skin/hair/body concerns',
    usp:'FDA-approved treatments, certified doctors, visible results in [X] sessions',
    audience:'Women 25-45, Metro Manila, beauty-conscious, may budget',
    goal:'Lead Generation',tone:'💎 Luxurious & aspirational',
    emphasize:'Before/after results, doctor credentials, promo offers, limited slots'
  },
  food:{
    client:'[Food Brand]',biztype:'E-Commerce',
    product:'[Food product] — [flavor/variant]',
    pain:'Hinahangad ng masarap pero healthy na pagkain, walang time magluto',
    usp:'Authentic taste, fresh ingredients, delivered to your door',
    audience:'Foodies 18-40, online shoppers, health-conscious',
    goal:'Sales / Conversion',tone:'😊 Friendly & relatable',
    emphasize:'Taste, convenience, value for money, limited offer'
  },
  fashion:{
    client:'[Fashion Brand]',biztype:'E-Commerce',
    product:'[Clothing/accessories line]',
    pain:'Gusto mag-look good pero hindi alam ang style, limited budget',
    usp:'Trendy designs, affordable prices, high quality materials',
    audience:'Women/Men 18-35, fashion-conscious, social media active',
    goal:'Sales / Conversion',tone:'⚡ Energetic & hype',
    emphasize:'Style, affordability, limited stocks, influencer looks'
  },
  fitness:{
    client:'[Gym/Fitness Brand]',biztype:'Service-Based',
    product:'Gym membership / fitness program / supplements',
    pain:'Gusto magpayat pero walang motivation, hindi alam saan magsimula',
    usp:'Expert trainers, proven programs, real results guaranteed',
    audience:'Men/Women 20-40, health-conscious, wants to lose weight',
    goal:'Bookings / Appointments',tone:'🔥 Urgent & direct',
    emphasize:'Results, community, trainer expertise, promo rates'
  }
};

function applyTemplate(type){
  const t=TEMPLATES[type];if(!t)return;
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val;};
  set('f-client',t.client);set('f-biztype',t.biztype);
  set('f-product',t.product);set('f-pain',t.pain);
  set('f-usp',t.usp);set('f-audience',t.audience);
  set('f-goal',t.goal);set('f-emphasize',t.emphasize);
  // Set tone
  document.querySelectorAll('.tone-opt').forEach(el=>{
    if(el.textContent.trim()===t.tone){selectTone(el);}
  });
  showNotif('Template applied! ✓','success');
  // Switch to manual tab
  switchTab('manual');
}




// ═══════════════════════════════════════
// EDITOR PROFILE
// ═══════════════════════════════════════

async function loadProfile(){
  if(!currentUser)return;
  var{data}=await sb.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();
  var profile=data||{};
  var nameEl=document.getElementById('profile-name-input');
  var emailEl=document.getElementById('profile-email-display');
  var roleEl=document.getElementById('profile-role-display');
  var statsEl=document.getElementById('profile-stats');
  var displayName=profile.name||currentUser.email||'';
  if(nameEl)nameEl.value=displayName;
  if(emailEl)emailEl.textContent=currentUser.email||'';
  if(roleEl)roleEl.textContent=currentUserRole==='admin'?'Super Admin':'Editor';
  // Fix profile display
  var nameDisplay=document.getElementById('profile-name-display');
  var avatarEl=document.getElementById('profile-avatar');
  if(nameDisplay)nameDisplay.textContent=displayName||'—';
  if(avatarEl)avatarEl.textContent=(displayName[0]||'?').toUpperCase();
  // Load stats
  if(statsEl){
    var{data:projects}=await sb.from('projects').select('status,assigned_to').eq('assigned_to',currentUser.id);
    var all=projects||[];
    var done=all.filter(function(p){return p.status==='Approved / Done';}).length;
    var inProd=all.filter(function(p){return p.status==='In Production';}).length;
    statsEl.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">'
      +'<div class="stat-card c-yellow" style="text-align:center"><div class="stat-label">Assigned</div><div class="stat-val">'+all.length+'</div></div>'
      +'<div class="stat-card c-amber" style="text-align:center"><div class="stat-label">In prod</div><div class="stat-val" style="color:var(--amber)">'+inProd+'</div></div>'
      +'<div class="stat-card c-green" style="text-align:center"><div class="stat-label">Completed</div><div class="stat-val" style="color:var(--green)">'+done+'</div></div>'
      +'</div>';
  }
}

async function saveProfile(){
  var name=document.getElementById('profile-name-input')?.value?.trim();
  if(!name){showNotif('Name required','error');return;}
  var{error}=await sb.from('profiles').update({name:name}).eq('id',currentUser.id);
  if(error){showNotif('Error: '+error.message,'error');return;}
  document.getElementById('user-role-label').textContent=currentUserRole==='admin'?'Super Admin':'Editor';
  showNotif('Profile updated! ✓','success');
  loadUserRole(currentUser);
}

async function changePassword(){
  var newPass=document.getElementById('profile-new-pass')?.value?.trim();
  if(!newPass||newPass.length<6){showNotif('Password must be at least 6 characters','error');return;}
  var{error}=await sb.auth.updateUser({password:newPass});
  if(error){showNotif('Error: '+error.message,'error');return;}
  document.getElementById('profile-new-pass').value='';
  showNotif('Password changed! ✓','success');
}


// ═══════════════════════════════════════
// TEAM CHAT SYSTEM
// ═══════════════════════════════════════

var currentRoom='general';
var chatSubscription=null;
var replyToMsg=null;
var lastReadTimes={};

var CHANNEL_INFO={
  announcements:{title:'📢 announcements',desc:'Admin only — important updates & announcements',adminOnly:true},
  general:{title:'# general',desc:'General chat — everyone',adminOnly:false},
  editors:{title:'# editors',desc:'Editors chat — production updates',adminOnly:false},
  admin:{title:'🔐 admin',desc:'Admin only — private channel',adminOnly:true},
  revisions:{title:'✏️ revisions',desc:'Revision requests & feedback',adminOnly:false},
  images:{title:'🖼️ images',desc:'Image references & creative assets',adminOnly:false}
};

async function loadChat(){
  // Attach click to static channel items
  document.querySelectorAll('.ch-item[data-room]').forEach(function(el){
    el.onclick=null;
    el.addEventListener('click',function(){switchChatRoom(this.dataset.room);});
  });
  await loadDMList();
  await switchChatRoom('general');
  loadUnreadBadges();
}

async function loadDMList(){
  var{data}=await sb.from('profiles').select('id,name,email,role').order('name');
  var members=(data||[]).filter(function(m){return m.id!==currentUser?.id;});
  var dmList=document.getElementById('dm-list');
  if(!dmList)return;
  if(!members.length){
    dmList.innerHTML='<div style="font-size:11px;color:var(--text3);padding:6px 10px">No teammates yet</div>';
    return;
  }
  dmList.innerHTML=members.map(function(m){
    var initial=(m.name||m.email||'?')[0].toUpperCase();
    var roomId='dm_'+m.id;
    var roleColor=m.role==='admin'?'var(--yellow)':'var(--purple)';
    var roleBg=m.role==='admin'?'var(--yellow-dim)':'var(--purple-dim)';
    return '<div class="ch-item" data-room="'+roomId+'" style="padding:7px 10px;border-radius:var(--radius);cursor:pointer;margin-bottom:1px;display:flex;align-items:center;gap:8px">'
      +'<div style="width:26px;height:26px;border-radius:50%;background:'+roleBg+';border:0.5px solid '+roleColor+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:'+roleColor+';flex-shrink:0">'+initial+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:500;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(m.name||m.email)+'</div>'
      +'<div style="font-size:9px;color:var(--text3)">'+(m.role==='admin'?'Admin':'Editor')+'</div>'
      +'</div>'
      +'<span class="ch-badge" id="badge-'+roomId+'" style="display:none;background:var(--red);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px">0</span>'
      +'</div>';
  }).join('');
  dmList.querySelectorAll('.ch-item').forEach(function(el){
    el.addEventListener('click',function(){switchChatRoom(this.dataset.room);});
  });
}

async function switchChatRoom(room){
  currentRoom=room;
  // Hide admin channel for non-admins
  document.querySelectorAll('.ch-item[data-room="admin"]').forEach(function(el){
    el.style.display=currentUserRole==='admin'?'flex':'none';
  });
  // Update active channel UI
  document.querySelectorAll('.ch-item').forEach(function(el){
    el.style.background='';el.style.border='';
  });
  var activeEl=document.querySelector('[data-room="'+room+'"]');
  if(activeEl){
    activeEl.style.background='var(--yellow-dim)';
    activeEl.style.border='0.5px solid rgba(250,204,21,0.2)';
  }
  // Update header
  var info=CHANNEL_INFO[room];
  var isDM=room.startsWith('dm_');
  var titleEl=document.getElementById('chat-room-title');
  var descEl=document.getElementById('chat-room-desc');
  var inputEl=document.getElementById('chat-input');
  var announceNotice=document.getElementById('announce-notice');
  if(titleEl)titleEl.textContent=info?info.title:(isDM?'💬 Direct Message':'# '+room);
  if(descEl)descEl.textContent=info?info.desc:(isDM?'Private conversation':'');
  // Announcements — editor read-only
  var isAdminOnlyRoom=info&&info.adminOnly&&currentUserRole!=='admin';
  if(inputEl){
    inputEl.disabled=isAdminOnlyRoom;
    inputEl.placeholder=isAdminOnlyRoom?'Read only — admin posts here...':'Message '+(info?info.title:'...');
  }
  if(announceNotice)announceNotice.style.display=isAdminOnlyRoom?'block':'none';
  var sendBtn=document.querySelector('[onclick="sendMessage()"]');
  if(sendBtn)sendBtn.disabled=isAdminOnlyRoom;
  // Clear reply
  cancelReply();
  // Hide pinned
  var pinnedSection=document.getElementById('pinned-section');
  if(pinnedSection)pinnedSection.style.display='none';
  // Load messages
  await loadMessages(room);
  // Mark as read
  lastReadTimes[room]=new Date().toISOString();
  var badge=document.getElementById('badge-'+room);
  if(badge)badge.style.display='none';
  // Resubscribe
  if(chatSubscription){try{sb.removeChannel(chatSubscription);}catch(e){}}
  chatSubscription=sb.channel('chat-room-'+room+'-'+Date.now())
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},
      function(payload){
        if(payload.new&&payload.new.room===room)loadMessages(room);
      })
    .subscribe(function(status){
      console.log('Chat subscription:',status);
    });
}

async function loadMessages(room){
  try{
    // Step 1: Get messages
    var{data:msgs,error:msgErr}=await sb.from('chat_messages')
      .select('id,room,user_id,message,reply_to_id,reply_to_text,is_pinned,reactions,created_at')
      .eq('room',room)
      .order('created_at',{ascending:true})
      .limit(100);
    if(msgErr){console.error('loadMessages error:',msgErr);return;}
    var messages=msgs||[];
    if(!messages.length){renderMessages([]);return;}
    // Step 2: Get unique user IDs
    var userIds=[...new Set(messages.map(function(m){return m.user_id;}).filter(Boolean))];
    var userMap={};
    if(userIds.length){
      var{data:profiles}=await sb.from('profiles').select('id,name,email').in('id',userIds);
      (profiles||[]).forEach(function(p){userMap[p.id]=p;});
    }
    // Step 3: Attach profile to messages
    messages=messages.map(function(m){
      return Object.assign({},m,{profiles:userMap[m.user_id]||null});
    });
    renderMessages(messages);
  }catch(e){
    console.error('loadMessages catch:',e);
  }
}

function renderMessages(messages){
  var box=document.getElementById('chat-messages');
  if(!box)return;
  if(!messages.length){
    box.innerHTML='<div style="text-align:center;padding:3rem;color:var(--text3);font-size:12px">No messages yet — be the first! 👋</div>';
    return;
  }
  var html='';
  var lastDate='';
  messages.forEach(function(m){
    var isMe=m.user_id===currentUser?.id;
    var name=m.profiles?.name||m.profiles?.email||'Unknown';
    var initial=(name[0]||'?').toUpperCase();
    var msgDate=new Date(m.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    var msgTime=new Date(m.created_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
    // Date divider
    if(msgDate!==lastDate){
      html+='<div style="text-align:center;margin:12px 0"><span style="font-size:10px;color:var(--text3);background:var(--bg3);padding:3px 10px;border-radius:20px">'+msgDate+'</span></div>';
      lastDate=msgDate;
    }
    // Reply preview
    var replyHtml='';
    if(m.reply_to_text){
      replyHtml='<div style="background:rgba(250,204,21,0.05);border-left:2px solid var(--yellow);padding:4px 8px;border-radius:4px;margin-bottom:4px;font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
        +'↩ '+escapeHtml(m.reply_to_text.substring(0,60))+'</div>';
    }
    // Reactions
    var reactions='';
    try{
      if(m.reactions){
        var rxData={};
        try{rxData=typeof m.reactions==='string'?JSON.parse(m.reactions):(m.reactions||{});}catch(ex2){rxData={};}
        var rxEntries=Object.entries(rxData||{});
        if(rxEntries.length)reactions=rxEntries.map(function(e){
          return '<span style="cursor:pointer;font-size:12px;padding:2px 6px;background:var(--bg4);border-radius:20px">'+e[0]+' '+e[1]+'</span>';
        }).join('');
      }
    }catch(ex){reactions='';}
    html+='<div class="msg-row" data-id="'+m.id+'" style="display:flex;gap:8px;align-items:flex-start;padding:3px 0;'+(isMe?'flex-direction:row-reverse':'')+'" onmouseenter="showMsgActions(this)" onmouseleave="hideMsgActions(this)">'
      +'<div style="width:28px;height:28px;border-radius:50%;background:'+(isMe?'var(--yellow-dim)':'var(--bg4)')+';border:0.5px solid '+(isMe?'var(--yellow)':'var(--border2)')+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:'+(isMe?'var(--yellow)':'var(--text2)')+';flex-shrink:0">'+initial+'</div>'
      +'<div style="max-width:65%;'+(isMe?'align-items:flex-end;':'')+'display:flex;flex-direction:column">'
      +'<div style="font-size:9px;color:var(--text3);margin-bottom:2px;'+(isMe?'text-align:right':'')+'">'+name+' · '+msgTime+(m.is_pinned?' 📌':'')+'</div>'
      +replyHtml
      +'<div style="background:'+(isMe?'var(--yellow-dim)':'var(--bg3)')+';border:0.5px solid '+(isMe?'rgba(250,204,21,0.2)':'var(--border2)')+';border-radius:'+(isMe?'12px 4px 12px 12px':'4px 12px 12px 12px')+';padding:8px 12px;font-size:13px;color:'+(isMe?'var(--yellow)':'var(--text)')+';line-height:1.5;word-break:break-word">'+escapeHtml(m.message)+'</div>'
      +(reactions?'<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">'+reactions+'</div>':'')
      +'<div class="msg-actions" style="display:none;gap:4px;margin-top:4px;flex-wrap:wrap">'
      +'<button data-action="reply" data-id="'+m.id+'" data-name="'+name+'" data-text="'+escapeHtml(m.message).substring(0,50)+'" style="font-size:10px;padding:2px 8px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:4px;cursor:pointer;color:var(--text2)">↩ Reply</button>'
      +'<button data-action="react" data-id="'+m.id+'" style="font-size:10px;padding:2px 8px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:4px;cursor:pointer;color:var(--text2)">😊</button>'
      +(currentUserRole==="admin"?'<button data-action="pin" data-id="'+m.id+'" data-pinned="'+m.is_pinned+'" style="font-size:10px;padding:2px 8px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:4px;cursor:pointer;color:var(--text2)">'+(!m.is_pinned?"📌 Pin":"Unpin")+'</button>':"")
      +'</div>'
      +'</div></div>';
  });
  box.innerHTML=html;
  box.scrollTop=box.scrollHeight;
  // Event delegation for message actions
  box.querySelectorAll('[data-action]').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var action=this.dataset.action;
      var id=this.dataset.id;
      if(action==='reply')replyTo(id,this.dataset.name,this.dataset.text);
      else if(action==='react')reactToMsg(id);
      else if(action==='pin')pinMessage(id,this.dataset.pinned!=='true');
    });
  });
}

function showMsgActions(el){
  var actions=el.querySelector('.msg-actions');
  if(actions)actions.style.display='flex';
}
function hideMsgActions(el){
  var actions=el.querySelector('.msg-actions');
  if(actions)actions.style.display='none';
}

function escapeHtml(text){
  if(!text)return'';
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function sendMessage(){
  var input=document.getElementById('chat-input');
  if(!input)return;
  var msg=input.value.trim();
  if(!msg){return;}
  if(!currentUser){showNotif('Not logged in','error');return;}
  var info=CHANNEL_INFO[currentRoom];
  if(info&&info.adminOnly&&currentUserRole!=='admin'){
    showNotif('Only admins can post in #'+currentRoom,'error');return;
  }
  var savedMsg=msg;
  input.value='';
  try{
    var insertData={room:currentRoom,user_id:currentUser.id,message:savedMsg};
    if(replyToMsg){
      insertData.reply_to_id=replyToMsg.id;
      insertData.reply_to_text=replyToMsg.text;
    }
    var{error}=await sb.from('chat_messages').insert(insertData);
    if(error){
      console.error('Chat error:',error);
      showNotif('Send failed: '+error.message,'error');
      input.value=savedMsg;
      return;
    }
    cancelReply();
    await loadMessages(currentRoom);
  }catch(e){
    console.error('Send error:',e);
    showNotif('Error: '+e.message,'error');
    input.value=savedMsg;
  }
}

function replyTo(id,name,text){
  replyToMsg={id:id,text:text};
  var preview=document.getElementById('reply-preview');
  var nameEl=document.getElementById('reply-to-name');
  var textEl=document.getElementById('reply-preview-text');
  if(preview)preview.style.display='block';
  if(nameEl)nameEl.textContent=name;
  if(textEl)textEl.textContent=text;
  document.getElementById('chat-input')?.focus();
}

function cancelReply(){
  replyToMsg=null;
  var preview=document.getElementById('reply-preview');
  if(preview)preview.style.display='none';
}

async function pinMessage(id,pin){
  await sb.from('chat_messages').update({is_pinned:pin}).eq('id',id);
  loadMessages(currentRoom);
  showNotif(pin?'Message pinned! 📌':'Message unpinned','success');
}

async function togglePinnedMessages(){
  var section=document.getElementById('pinned-section');
  if(!section)return;
  var isShowing=section.style.display!=='none';
  if(isShowing){section.style.display='none';return;}
  var{data}=await sb.from('chat_messages').select('*,profiles(name,email)').eq('room',currentRoom).eq('is_pinned',true).order('created_at',{ascending:false});
  var pinned=data||[];
  var box=document.getElementById('pinned-messages');
  if(box)box.innerHTML=pinned.length?pinned.map(function(m){
    return '<div style="font-size:11px;color:var(--text2);padding:4px 0;border-bottom:0.5px solid rgba(245,158,11,0.1)">'
      +'<span style="color:var(--amber);font-weight:600">'+(m.profiles?.name||'?')+': </span>'+escapeHtml(m.message)+'</div>';
  }).join(''):'<div style="font-size:11px;color:var(--text3)">No pinned messages.</div>';
  section.style.display='block';
}

var quickReactions=['👍','🔥','✅','❌','😂','👀'];
function reactToMsg(msgId){
  var row=document.querySelector('[data-id="'+msgId+'"]');
  if(!row)return;
  var existing=row.querySelector('.quick-reactions');
  if(existing){existing.remove();return;}
  var div=document.createElement('div');
  div.className='quick-reactions';
  div.style.cssText='display:flex;gap:4px;margin-top:4px;flex-wrap:wrap';
  quickReactions.forEach(function(e){
    var btn=document.createElement('button');
    btn.textContent=e;
    btn.style.cssText='font-size:16px;padding:2px 6px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:20px;cursor:pointer';
    btn.onclick=function(){addReaction(msgId,e);div.remove();};
    div.appendChild(btn);
  });
  var actions=row.querySelector('.msg-actions');
  if(actions)row.querySelector('[style*="flex-direction:column"]').insertBefore(div,actions);
}

async function addReaction(msgId,emoji){
  var{data}=await sb.from('chat_messages').select('reactions').eq('id',msgId).maybeSingle();
  var reactions={};
  try{
    var raw=data?.reactions;
    if(raw)reactions=typeof raw==='string'?JSON.parse(raw):raw;
  }catch(e){reactions={};}
  reactions[emoji]=(reactions[emoji]||0)+1;
  await sb.from('chat_messages').update({reactions:JSON.stringify(reactions)}).eq('id',msgId);
  loadMessages(currentRoom);
}

function toggleEmojiPicker(){
  var picker=document.getElementById('emoji-picker');
  if(!picker)return;
  picker.style.display=picker.style.display==='flex'?'none':'flex';
}

function insertEmoji(emoji){
  var input=document.getElementById('chat-input');
  if(!input)return;
  input.value+=emoji;input.focus();
  var picker=document.getElementById('emoji-picker');
  if(picker)picker.style.display='none';
}

async function loadUnreadBadges(){
  var rooms=['announcements','general','editors','admin','revisions','images'];
  for(var i=0;i<rooms.length;i++){
    var room=rooms[i];
    if(room===currentRoom)continue;
    var lastRead=lastReadTimes[room]||new Date(0).toISOString();
    var{count}=await sb.from('chat_messages').select('id',{count:'exact',head:true}).eq('room',room).gt('created_at',lastRead);
    var badge=document.getElementById('badge-'+room);
    if(badge&&count>0){badge.textContent=count;badge.style.display='inline-block';}
  }
}


// ═══════════════════════════════════════
// TOOL SETTINGS
// ═══════════════════════════════════════


// ═══════════════════════════════════════
// AUTOMATION PIPELINE
// ═══════════════════════════════════════

var autoProject=null;
var autoScenes=[];
var autoAvatarUrl=null;
var autoOutputs=[];

async function loadAutomationProjects(){
  var sel=document.getElementById('auto-project-select');
  if(!sel)return;
  var{data}=await sb.from('projects').select('id,client_name,status,blueprint')
    .not('blueprint','is',null).order('created_at',{ascending:false});
  sel.innerHTML='<option value="">Select project...</option>';
  (data||[]).forEach(function(p){
    var opt=document.createElement('option');
    opt.value=p.id;
    opt.textContent=p.client_name+' ('+p.status+')';
    sel.appendChild(opt);
  });
}

async function loadAutomationProject(){
  var sel=document.getElementById('auto-project-select');
  if(!sel||!sel.value)return;
  var{data}=await sb.from('projects').select('*').eq('id',sel.value).maybeSingle();
  autoProject=data;
  if(!data)return;
  // Show project info
  var info=document.getElementById('auto-project-info');
  if(info){
    info.style.display='block';
    info.innerHTML='<strong>'+data.client_name+'</strong> · '+data.business_type+' · '+data.video_size
      +'<br><span style="color:var(--text3);font-size:11px">Blueprint: '+( data.blueprint?data.blueprint.length+' chars':'Not generated')+'</span>';
  }
  // Parse scenes from blueprint
  if(data.blueprint){
    autoScenes=parseBlueprint(data.blueprint);
    renderAutomationScenes();
  }
  var avatarEl=document.getElementById('auto-avatar-prompt');
  if(avatarEl&&data.avatar_desc){avatarEl.value=data.avatar_desc+', 9:16 portrait, photorealistic, studio lighting';}
  var avatarEl=document.getElementById('auto-avatar-prompt');
  if(avatarEl&&data.avatar_desc){avatarEl.value=data.avatar_desc+', 9:16 portrait, photorealistic, studio lighting';}
}

function renderAutomationScenes(){
  var grid=document.getElementById('auto-scenes-grid');
  if(!grid)return;
  grid.innerHTML=autoScenes.map(function(s,i){
    return '<div style="background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);overflow:hidden" id="scene-card-'+i+'">'
      +'<div style="aspect-ratio:9/16;background:var(--bg4);display:flex;align-items:center;justify-content:center;position:relative" id="scene-img-container-'+i+'">'
      +'<div style="font-size:10px;color:var(--text3);text-align:center;padding:8px">Scene '+s.num+'<br>'+s.name+'</div>'
      +'</div>'
      +'<div style="padding:8px">'
      +'<div style="font-size:9px;color:var(--text3);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(s.imagePrompt||s.videoPrompt||'').substring(0,50)+'...</div>'
      +'<div style="display:flex;gap:4px">'
      +'<button class="gen-scene-btn" data-idx="'+i+'" style="flex:1;font-size:10px;padding:3px;background:var(--yellow-dim);border:0.5px solid rgba(250,204,21,0.2);border-radius:4px;color:var(--yellow);cursor:pointer">🎨 Gen</button>'
      +'<span id="scene-status-'+i+'" style="font-size:9px;color:var(--text3);display:flex;align-items:center"></span>'
      +'</div></div></div>';
  }).join('');
  // Attach handlers
  grid.querySelectorAll('.gen-scene-btn').forEach(function(btn){
    btn.addEventListener('click',function(){generateSceneImage(parseInt(this.dataset.idx));});
  });
}

async function generateAvatar(){
  var promptEl=document.getElementById('auto-avatar-prompt');
  var prompt=promptEl?.value?.trim();
  if(!prompt){showNotif('Add avatar description first','error');return;}
  var apiKey=getSecureApiKey('dalle')||getToolSetting('dalle-api-key');
  if(!apiKey){showNotif('Set DALL-E API key in Settings first!','error');showPage('settings');return;}
  var btn=document.getElementById('gen-avatar-btn');
  var status=document.getElementById('avatar-gen-status');
  if(btn)btn.disabled=true;
  if(status)status.textContent='⚡ Generating avatar...';
  try{
    var res=await fetch('/api/nano-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        prompt:prompt+' 9:16 vertical portrait aspect ratio, mobile-optimized',
        type:'avatar',
        apiKey:apiKey,
        size:'1024x1536',
        quality:getToolSetting('dalle-quality','hd'),
        style:getToolSetting('dalle-style','vivid')
      })
    });
    var d=await res.json();
    if(d.url){
      autoAvatarUrl=d.url;
      var preview=document.getElementById('avatar-preview');
      var result=document.getElementById('avatar-result');
      if(preview)preview.src=d.url;
      if(result)result.style.display='block';
      if(status)status.textContent='✅ Avatar generated!';
      // Save to project outputs
      if(autoProject?.id){
        await sb.from('project_outputs').insert({
          project_id:autoProject.id,user_id:currentUser.id,
          url:d.url,type:'image',label:'Avatar'
        });
      }
      logActivity('AVATAR_GENERATED',autoProject?.client_name||'');
    } else {
      if(status)status.textContent='Error: '+(d.error||'Failed');
      showNotif('DALL-E error: '+(d.error||'Failed'),'error');
    }
  }catch(e){
    if(status)status.textContent='Error: '+e.message;
    showNotif('Error: '+e.message,'error');
  }finally{
    if(btn)btn.disabled=false;
  }
}

async function uploadOwnAvatar(e){
  var file=e.target.files&&e.target.files[0];
  if(!file)return;
  var status=document.getElementById('avatar-gen-status');
  if(status)status.textContent='⚡ Uploading your avatar...';
  try{
    var reader=new FileReader();
    reader.onload=function(ev){
      var pv=document.getElementById('avatar-preview');
      var rs=document.getElementById('avatar-result');
      if(pv)pv.src=ev.target.result;
      if(rs)rs.style.display='block';
    };
    reader.readAsDataURL(file);
    var ext=(file.name.split('.').pop()||'png').toLowerCase();
    var filePath='images/uploaded-avatar-'+Date.now()+'.'+ext;
    var upl=await sb.storage.from(STORAGE_BUCKET).upload(filePath,file,{contentType:file.type||'image/png',upsert:true});
    if(upl.error){
      console.error('Avatar upload error:',upl.error);
      if(status)status.textContent='⚠️ Preview only (storage failed) — pwede ka pa ring mag-proceed.';
      return;
    }
    var urlData=sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    autoAvatarUrl=urlData?.data?.publicUrl||null;
    if(autoAvatarUrl){
      var pv2=document.getElementById('avatar-preview');
      if(pv2)pv2.src=autoAvatarUrl;
    }
    if(status)status.textContent='✅ Avatar uploaded! Ito na mismong mukha ang gagamitin sa lahat ng scenes.';
    if(autoProject&&autoProject.id){
      try{await sb.from('project_outputs').insert({project_id:autoProject.id,user_id:currentUser.id,url:autoAvatarUrl,type:'image',label:'Avatar (uploaded)'});}catch(err){}
    }
    if(typeof logActivity==='function')logActivity('AVATAR_UPLOADED',autoProject?.client_name||'');
  }catch(err){
    if(status)status.textContent='Error: '+err.message;
    showNotif('Upload error: '+err.message,'error');
  }finally{
    e.target.value='';
  }
}

function approveAvatar(){
  // Unlock Phase 2
  var phase2=document.getElementById('auto-phase2');
  if(phase2){phase2.style.opacity='1';phase2.style.pointerEvents='auto';}
  var p1status=document.getElementById('phase1-status');
  if(p1status){p1status.textContent='✅ Done';p1status.style.color='var(--green)';}
  var p2status=document.getElementById('phase2-status');
  if(p2status)p2status.textContent='⚡ Auto-generating all scenes...';
  showNotif('Avatar approved! Auto-generating scene images... ✓','success');
  // AUTO-START scene generation
  setTimeout(function(){generateAllScenes();},500);
}

async function generateSceneImage(idx){
  var scene=autoScenes[idx];
  if(!scene)return;
  var statusEl=document.getElementById('scene-status-'+idx);
  var container=document.getElementById('scene-img-container-'+idx);
  if(statusEl)statusEl.textContent='⏳';
  // SCENE-ONLY prompt — ang mukha ay galing sa avatarUrl reference, hindi sa text
  var prompt=scene.imagePrompt||scene.videoPrompt||scene.visual||'';
  try{
    var res=await fetch('/api/nano-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        prompt:prompt,
        type:'scene',
        sceneNum:idx+1,
        avatarUrl:autoAvatarUrl||'',
        avatarDesc:autoProject?.avatar_desc||'',
        size:'1024x1536'
      })
    });
    var d=await res.json();
    if(d.url){
      // Show image in card
      if(container){
        container.innerHTML='<img src="'+d.url+'" style="width:100%;height:100%;object-fit:cover"/>'
          +'<div style="position:absolute;bottom:4px;right:4px;display:flex;gap:3px">'
          +'<button class="regen-scene" data-idx="'+idx+'" style="font-size:9px;padding:2px 6px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:3px;cursor:pointer">🔄</button>'
          +'<button class="approve-scene" data-idx="'+idx+'" data-url="'+d.url+'" style="font-size:9px;padding:2px 6px;background:rgba(34,197,94,0.8);color:#fff;border:none;border-radius:3px;cursor:pointer">✓</button>'
          +'</div>';
        container.style.position='relative';
        container.querySelectorAll('.regen-scene').forEach(function(b){b.addEventListener('click',function(){generateSceneImage(parseInt(this.dataset.idx));});});
        container.querySelectorAll('.approve-scene').forEach(function(b){
          b.addEventListener('click',function(){approveSceneImage(parseInt(this.dataset.idx),this.dataset.url);});
        });
      }
      if(statusEl)statusEl.textContent='✅';
      // Save to autoOutputs
      autoOutputs[idx]={url:d.url,type:'image',scene:scene,approved:false};
    } else {
      if(statusEl)statusEl.textContent='❌';
      showNotif('Scene '+scene.num+' error: '+(d.error||'Failed'),'error');
    }
  }catch(e){
    if(statusEl)statusEl.textContent='❌';
  }
}

function approveSceneImage(idx,url){
  if(autoOutputs[idx])autoOutputs[idx].approved=true;
  var btn=document.querySelector('#scene-img-container-'+idx+' .approve-scene');
  if(btn){btn.textContent='✓';btn.style.background='rgba(250,204,21,0.8)';}
  // Check if all approved
  var allApproved=autoScenes.every(function(_,i){return autoOutputs[i]?.approved;});
  if(allApproved){
    var phase3=document.getElementById('auto-phase3');
    if(phase3){phase3.style.opacity='1';phase3.style.pointerEvents='auto';}
    var phase4=document.getElementById('auto-phase4');
    if(phase4){phase4.style.opacity='1';phase4.style.pointerEvents='auto';}
    var p2s=document.getElementById('phase2-status');
    if(p2s){p2s.textContent='✅ All approved!';p2s.style.color='var(--green)';}
    var p3s=document.getElementById('phase3-status');
    if(p3s)p3s.textContent='✅ Ready — pick video tool per scene or animate all';
    showNotif('All scenes approved! Choose video tool to generate 🎬','success');
  }
}

async function generateAllScenes(){
  if(!autoScenes.length){showNotif('Load a project with blueprint first','error');return;}
  var progress=document.getElementById('scenes-progress');
  var btn=document.getElementById('gen-all-scenes-btn');
  if(btn)btn.disabled=true;
  for(var i=0;i<autoScenes.length;i++){
    if(progress)progress.textContent='Generating scene '+(i+1)+' of '+autoScenes.length+'...';
    await generateSceneImage(i);
    await new Promise(function(r){setTimeout(r,8000);}); // 8s delay — respeto sa Gemini rate limits, iwas 429
  }
  if(progress)progress.textContent='All scenes generated! Review and approve each.';
  if(btn)btn.disabled=false;
}

function animateAllScenes(){
  var approvedScenes=autoOutputs.filter(function(o){return o&&o.approved;});
  if(!approvedScenes.length){showNotif('Approve scene images first!','error');return;}
  showNotif('Opening Higgsfield for animation — prompts copied!','success');
  approvedScenes.forEach(function(o,i){
    var animPrompt='Animate this image: '+o.scene.videoPrompt+' Duration: 8-10 seconds, smooth cinematic motion, 9:16 vertical';
    setTimeout(function(){
      navigator.clipboard.writeText(animPrompt);
      window.open('https://higgsfield.ai/create','_blank');
    },i*1500);
  });
  // Unlock phase 4
  setTimeout(function(){
    var phase4=document.getElementById('auto-phase4');
    if(phase4){phase4.style.opacity='1';phase4.style.pointerEvents='auto';}
    var p4s=document.getElementById('phase4-status');
    if(p4s)p4s.textContent='Compile outputs when done animating';
  },2000);
}

async function downloadAllOutputs(){
  var approved=autoOutputs.filter(function(o){return o&&o.url;});
  if(!approved.length){showNotif('No outputs to download','error');return;}
  // Save all to project outputs in DB
  if(autoProject?.id){
    for(var i=0;i<approved.length;i++){
      await sb.from('project_outputs').insert({
        project_id:autoProject.id,user_id:currentUser.id,
        url:approved[i].url,type:'image',
        label:'Scene '+(i+1)+' image'
      }).then(function(){},function(){});
    }
    loadOutputs(autoProject.id);
  }
  // Open each image in new tab for manual download
  approved.forEach(function(o,i){
    setTimeout(function(){window.open(o.url,'_blank');},i*500);
  });
  showNotif('Opening all outputs — save each one ✓','success');
  // Unlock compile
  var p4s=document.getElementById('phase4-status');
  if(p4s){p4s.textContent='✅ Done!';p4s.style.color='var(--green)';}
}

function copyAllLinks(){
  var links=autoOutputs.filter(function(o){return o&&o.url;}).map(function(o,i){return 'Scene '+(i+1)+': '+o.url;}).join('\n');
  navigator.clipboard.writeText(links);
  showNotif('All links copied! ✓','success');
}

async function notifyClientDone(){
  if(!autoProject)return;
  if(autoProject.client_id){
    await sb.from('notifications').insert({
      user_id:autoProject.client_id,
      message:'Your project "'+autoProject.client_name+'" is complete and ready for review!',
      type:'output',is_read:false
    }).then(function(){},function(){});
  }
  await sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',autoProject.id);
  showNotif('Client notified! Project marked complete ✅','success');
  logActivity('PROJECT_COMPLETED',autoProject.client_name);
}


// ═══════════════════════════════════════
// SECURE API KEY MANAGEMENT
// ═══════════════════════════════════════

// Simple obfuscation (not true encryption but prevents casual viewing)
function obfuscate(str){
  return btoa(str.split('').map(function(c,i){
    return String.fromCharCode(c.charCodeAt(0)^(i%7+3));
  }).join(''));
}

function deobfuscate(str){
  try{
    return atob(str).split('').map(function(c,i){
      return String.fromCharCode(c.charCodeAt(0)^(i%7+3));
    }).join('');
  }catch(e){return str;}
}

async function saveApiKey(tool){
  // Admin only
  if(currentUserRole!=='admin'){showNotif('Admin only!','error');return;}
  var input=document.getElementById(tool+'-api-key');
  if(!input)return;
  var key=input.value.trim();
  if(!key){showNotif('Paste your API key first','error');return;}
  // Validate format
  var valid=false;
  if(tool==='grok'&&key.startsWith('xai-'))valid=true;
  if(tool==='veo')valid=true; // Google keys vary in format
  if(tool==='higgs')valid=true;
  if(tool==='dalle'&&key.startsWith('sk-'))valid=true;
  if(!valid){showNotif('Invalid key format for '+tool,'error');return;}
  // Save obfuscated to localStorage (admin browser)
  localStorage.setItem('ace_secure_'+tool, obfuscate(key));
  localStorage.setItem('ace_'+tool+'-api-key', obfuscate(key));
  // Also save to Supabase for team access (obfuscated)
  try{
    await sb.from('app_settings').upsert({
      key:'api_'+tool,
      value:obfuscate(key),
      updated_by:currentUser?.id,
      updated_at:new Date().toISOString()
    },{onConflict:'key'});
  }catch(e){console.log('Settings save:',e);}
  // Show status
  var statusEl=document.getElementById(tool+'-key-status');
  if(statusEl){
    statusEl.textContent='✅ Saved! Key ends in ...'+key.slice(-6);
    statusEl.style.color='var(--green)';
  }
  input.value=key;
  showNotif(tool+' API key saved! ✓','success');
  logActivity('API_KEY_UPDATED',tool+' API key updated');
}

function getSecureApiKey(tool){
  // Check localStorage first (fast, admin browser)
  var val=localStorage.getItem('ace_secure_'+tool)||localStorage.getItem('ace_'+tool+'-api-key')||'';
  if(val){try{return deobfuscate(val);}catch(e){return val;}}
  // Check in-memory cache (loaded from Supabase)
  if(window._apiKeyCache&&window._apiKeyCache[tool])return window._apiKeyCache[tool];
  return'';
}

// Load API keys from Supabase for editors
async function loadTeamApiKeys(){
  try{
    var{data}=await sb.from('app_settings').select('key,value').like('key','api_%');
    if(!data||!data.length)return;
    window._apiKeyCache=window._apiKeyCache||{};
    data.forEach(function(row){
      var tool=row.key.replace('api_','');
      try{window._apiKeyCache[tool]=deobfuscate(row.value);}catch(e){window._apiKeyCache[tool]=row.value;}
    });
    console.log('Team API keys loaded for tools:', Object.keys(window._apiKeyCache).join(', '));
  }catch(e){console.log('No team API keys found');}
}

function saveToolSetting(key, val){
  localStorage.setItem('ace_'+key, val);
}

function getToolSetting(key, def){
  var val=localStorage.getItem('ace_'+key)||def||'';
  // Deobfuscate if it looks encoded
  if(key.endsWith('-api-key')&&val&&!val.startsWith('xai-')&&!val.startsWith('AIza')&&!val.startsWith('higgs')){
    try{val=deobfuscate(val);}catch(e){}
  }
  return val;
}

function loadSettings(){
  // Load all saved settings
  var fields=['higgs-mode','higgs-api-key','higgs-model','higgs-duration',
    'grok-mode','grok-api-key','grok-model','grok-duration',
    'veo-mode','veo-api-key','veo-model','veo-duration'];
  fields.forEach(function(f){
    var el=document.getElementById(f);
    if(el){
      var val=getToolSetting(f);
      if(val)el.value=val;
    }
  });
  // Apply mode toggles
  var grokMode=getToolSetting('grok-mode')||'api';
  var veoMode=getToolSetting('veo-mode')||'api';
  switchToolMode('grok', grokMode);
  switchToolMode('veo', veoMode);
  // Restore API key values + show status
  var tools=['grok','veo','higgs','dalle'];
  tools.forEach(function(t){
    var key=getSecureApiKey(t)||getToolSetting(t+'-api-key');
    var input=document.getElementById(t+'-api-key');
    var statusEl=document.getElementById(t+'-key-status');
    if(input&&key)input.value=key;
    if(statusEl&&key){
      statusEl.textContent='✅ Key saved — ends in ...'+key.slice(-6);
      statusEl.style.color='var(--green)';
    } else if(statusEl){
      statusEl.textContent='⚠️ No API key saved yet';
      statusEl.style.color='var(--amber)';
    }
  });
}

function switchToolMode(tool, mode){
  saveToolSetting(tool+'-mode', mode);
  // Update button states
  var apiBtn=document.getElementById(tool+'-btn-api');
  var accBtn=document.getElementById(tool+'-btn-account');
  if(apiBtn){
    apiBtn.style.background=mode==='api'?'var(--yellow-dim)':'var(--bg3)';
    apiBtn.style.color=mode==='api'?'var(--yellow)':'var(--text3)';
    apiBtn.style.borderColor=mode==='api'?'var(--yellow)':'var(--border2)';
  }
  if(accBtn){
    accBtn.style.background=mode==='account'?'var(--yellow-dim)':'var(--bg3)';
    accBtn.style.color=mode==='account'?'var(--yellow)':'var(--text3)';
    accBtn.style.borderColor=mode==='account'?'var(--yellow)':'var(--border2)';
  }
  // Show/hide sections
  var apiSection=document.getElementById(tool+'-api-section');
  var accSection=document.getElementById(tool+'-account-section');
  if(apiSection)apiSection.style.display=mode==='api'?'block':'none';
  if(accSection)accSection.style.display=mode==='account'?'block':'none';
  // Also update generateWithTool to use new mode
  var modeEl=document.getElementById(tool+'-mode');
  if(modeEl)modeEl.value=mode;
}

function toggleToolMode(tool, mode){
  var apiField=document.getElementById(tool+'-api-field');
  if(apiField){
    apiField.style.display=mode==='api'?'block':'none';
    apiField.style.flex=mode==='api'?'1':'';
  }
  // Update select value
  var sel=document.getElementById(tool+'-mode');
  if(sel&&sel.value!==mode)sel.value=mode;
  // Save
  saveToolSetting(tool+'-mode',mode);
}

function testConnection(tool){
  var urls={
    higgsfield:'https://higgsfield.ai',
    grok:'https://x.ai/grok',
    veo:'https://aistudio.google.com'
  };
  var status=document.getElementById(tool.replace('higgsfield','higgs')+'-status');
  if(urls[tool]){
    window.open(urls[tool],'_blank');
    if(status)status.textContent='✓ Opened '+tool+' in new tab';
    if(status)status.style.color='var(--green)';
  }
}

// ═══════════════════════════════════════
// VIDEO/IMAGE GENERATION
// ═══════════════════════════════════════

function generateWithTool(tool, prompt, type){
  var mode=getToolSetting(tool+'-mode')||(tool==='higgsfield'?'account':'api');
  
  if(mode==='account'){
    // Copy prompt to clipboard
    navigator.clipboard.writeText(prompt).then(function(){
      showNotif('✓ Prompt copied! Opening '+tool+'...','success');
    }).catch(function(){
      showNotif('Opening '+tool+' — paste your prompt there','success');
    });
    // Open the right tool URL
    var urls={
      higgsfield:'https://higgsfield.ai/create',
      grok:'https://grok.com',
      veo:'https://flow.google.com/video'
    };
    setTimeout(function(){
      window.open(urls[tool]||'https://'+tool+'.ai','_blank');
    },300);
    return;
  }

  // API mode — check for key
  var apiKey=getToolSetting(tool+'-api-key')||getSecureApiKey(tool);
  if(!apiKey){
    showNotif('No API key for '+tool+' — set it in Settings!','error');
    setTimeout(function(){showPage('settings');},1500);
    return;
  }

  // Show loading
  showNotif('⚡ Generating with '+tool+'...','success');

  if(tool==='grok'){
    generateGrok(prompt, apiKey, type);
  } else if(tool==='veo'){
    generateVeo(prompt, apiKey, type);
  } else if(tool==='higgsfield'){
    generateHiggsfield(prompt, apiKey, type);
  }
}

// Higgsfield API mode
async function generateHiggsfield(prompt, apiKey, type){
  try{
    showNotif('⚡ Sending to Higgsfield API...','success');
    var res=await fetch('/api/higgs-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt:prompt,apiKey:apiKey,type:type,
        model:getToolSetting('higgs-model','soul-2'),
        duration:parseInt(getToolSetting('higgs-duration','4'))})
    });
    var d=await res.json();
    if(d.url){
      showNotif('✅ Generated! Opening output...','success');
      window.open(d.url,'_blank');
      // Auto-save to project
      if(currentProjectId){
        await sb.from('project_outputs').insert({
          project_id:currentProjectId,user_id:currentUser.id,
          url:d.url,type:type,label:'Higgsfield '+type
        });
        loadOutputs(currentProjectId);
      }
    } else if(d.status==='processing'){
      showNotif('⏳ Generating... Check Higgsfield in ~30 seconds','success');
    } else {
      showNotif('Error: '+(d.error||'Generation failed'),'error');
    }
  }catch(e){
    showNotif('Higgsfield error: '+e.message,'error');
  }
}

async function generateGrok(prompt, apiKey, type){
  try{
    showNotif('⚡ Grok generating (may take 30-60 sec)...','success');
    var model=getToolSetting('grok-model','grok-imagine-video-1.5-preview');
    var duration=parseInt(getToolSetting('grok-duration','8'));
    var res=await fetch('/api/grok-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt:prompt,apiKey:apiKey,model:model,duration:duration,type:type})
    });
    var d=await res.json();
    if(d.url){
      showNotif('✅ Grok video ready! Opening...','success');
      window.open(d.url,'_blank');
      // Auto-save output
      if(currentProjectId){
        await sb.from('project_outputs').insert({
          project_id:currentProjectId,user_id:currentUser.id,
          url:d.url,type:'video',label:'Grok video'
        });
        loadOutputs(currentProjectId);
      }
    } else if(d.status==='processing'){
      showNotif('⏳ Still generating — check back in 1 minute','success');
    } else {
      showNotif('Grok error: '+(d.error||'Failed'),'error');
    }
  }catch(e){
    showNotif('Grok error: '+e.message,'error');
  }
}

async function generateVeo(prompt, apiKey, type){
  try{
    showNotif('⚡ Veo generating (1-3 minutes)...','success');
    var model=getToolSetting('veo-model','veo-3');
    var duration=parseInt(getToolSetting('veo-duration','8'));
    var res=await fetch('/api/veo-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt:prompt,apiKey:apiKey,model:model,duration:duration,type:type})
    });
    var d=await res.json();
    if(d.url){
      showNotif('✅ Veo video ready! Opening...','success');
      window.open(d.url,'_blank');
      // Auto-save output
      if(currentProjectId){
        await sb.from('project_outputs').insert({
          project_id:currentProjectId,user_id:currentUser.id,
          url:d.url,type:'video',label:'Veo video'
        });
        loadOutputs(currentProjectId);
      }
    } else if(d.status==='processing'){
      showNotif('⏳ Veo is still processing — check Google AI Studio','success');
    } else {
      showNotif('Veo error: '+(d.error||'Failed'),'error');
    }
  }catch(e){
    showNotif('Veo error: '+e.message,'error');
  }
}

// Parse blueprint and extract scenes with prompts
function parseBlueprint(blueprintText){
  var scenes=[];

  // Clean a captured value: strip markdown (**, ▸, #), surrounding quotes, and labels.
  function cleanVal(s){
    if(!s) return '';
    s=s.replace(/\*\*/g,'').replace(/[▸►#]/g,'').trim();
    // If the label has a "(...)" qualifier before the colon we already skipped it in the regex.
    // Prefer text inside the first pair of double quotes (that's the real prompt).
    var q=s.match(/[\"\u201c]([^\"\u201d]+)[\"\u201d]/);
    if(q) return q[1].trim();
    return s.replace(/^["'\u201c\u201d\s:]+|["'\u201c\u201d\s]+$/g,'').trim();
  }

  // Grab the FIRST match of a label that may have an optional "(label)" before the colon.
  // e.g. "IMAGE PROMPT (PRIMARY — Woman):", "**IMAGE PROMPT:**", "VIDEO PROMPT:"
  function grab(block, label){
    // Matches:  LABEL: value  |  LABEL — value  |  LABEL (qualifier): value  |  **LABEL:** value
    // Optional (qualifier) in parens, then a separator (: or – or — or -), then the value.
    var re=new RegExp(label+'\\s*(?:\\([^)]*\\))?\\s*[:\\u2013\\u2014\\-]+\\s*\\**\\s*([^\\n]+)','i');
    var m=block.match(re);
    return m?cleanVal(m[1]):'';
  }

  var matches=blueprintText.match(/SCENE\s+\d+[^]*?(?=SCENE\s+\d+|(?:PRODUCTION|═{5}|$))/gi)||[];
  matches.forEach(function(block){
    var numMatch=block.match(/SCENE\s+(\d+)/i);
    var nameMatch=block.match(/SCENE\s+\d+\s*[-\u2014]\s*\**\s*([^\n(*]+)/i);
    var img=grab(block,'IMAGE PROMPT');
    var vid=grab(block,'VIDEO PROMPT');
    var vo=grab(block,'VOICEOVER');
    var vis=grab(block,'VISUAL');
    scenes.push({
      num:numMatch?numMatch[1]:'?',
      name:nameMatch?nameMatch[1].replace(/\*/g,'').trim():'Scene',
      imagePrompt:img,
      videoPrompt:vid,
      voiceover:vo,
      visual:vis
    });
  });
  return scenes;
}

function renderBlueprintScenes(blueprintText, containerId){
  var container=document.getElementById(containerId);
  if(!container)return;
  
  // Simple scene extraction
  var sceneBlocks=blueprintText.split(/SCENE\s+\d+/i).filter(function(b){return b.trim();});
  var sceneNums=blueprintText.match(/SCENE\s+(\d+)/gi)||[];
  
  if(!sceneBlocks.length){
    container.innerHTML='<div style="font-size:12px;color:var(--text3);padding:1rem">Blueprint rendered above. Use Copy buttons to grab prompts.</div>';
    return;
  }

  var html='';
  sceneBlocks.forEach(function(block, idx){
    var num=sceneNums[idx]?sceneNums[idx].replace(/SCENE\s+/i,''):(idx+1).toString();
    
    // Extract prompts
    var imgMatch=block.match(/IMAGE PROMPT[:\s]+([^\n\u25B8]+)/i);
    var vidMatch=block.match(/VIDEO PROMPT[:\s]+([^\n\u25B8]+)/i);
    var voMatch=block.match(/VOICEOVER[:\s]+"?([^\n"]+)"?/i);
    
    var imgPrompt=imgMatch?imgMatch[1].trim():'';
    var vidPrompt=vidMatch?vidMatch[1].trim():'';
    var vo=voMatch?voMatch[1].trim():'';
    
    if(!imgPrompt&&!vidPrompt)return;
    
    html+='<div style="background:var(--bg3);border:0.5px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:8px">';
    html+='<div style="font-size:10px;font-weight:700;color:var(--yellow);margin-bottom:8px;text-transform:uppercase">Scene '+num+'</div>';
    
    if(vo){
      html+='<div style="font-size:11px;color:var(--text2);margin-bottom:8px;padding:7px 10px;background:var(--bg4);border-radius:6px;font-style:italic">&ldquo;'+vo.substring(0,120)+'&rdquo;</div>';
    }
    
    if(imgPrompt){
      html+='<div style="margin-bottom:8px">';
      html+='<div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;margin-bottom:4px">Image Prompt</div>';
      html+='<div style="font-size:11px;color:var(--text2);margin-bottom:5px">'+imgPrompt.substring(0,120)+'...</div>';
      html+='<div style="display:flex;gap:5px;flex-wrap:wrap">';
      html+='<button class="tool-btn higgs-btn" data-prompt="'+encodeURIComponent(imgPrompt)+'" data-type="image" style="font-size:10px;padding:3px 9px;background:var(--bg2);border:0.5px solid var(--border2);border-radius:5px;color:var(--text2);cursor:pointer">🎬 Higgsfield</button>';
      html+='<button class="copy-btn" data-prompt="'+encodeURIComponent(imgPrompt)+'" style="font-size:10px;padding:3px 9px;background:var(--bg2);border:0.5px solid var(--border3);border-radius:5px;color:var(--text3);cursor:pointer">📋 Copy</button>';
      html+='</div></div>';
    }
    
    if(vidPrompt){
      html+='<div>';
      html+='<div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;margin-bottom:4px">Video Prompt</div>';
      html+='<div style="font-size:11px;color:var(--text2);margin-bottom:5px">'+vidPrompt.substring(0,120)+'...</div>';
      html+='<div style="display:flex;gap:5px;flex-wrap:wrap">';
      html+='<button class="tool-btn higgs-btn" data-prompt="'+encodeURIComponent(vidPrompt)+'" data-type="video" style="font-size:10px;padding:3px 9px;background:var(--yellow-dim);border:0.5px solid rgba(250,204,21,0.2);border-radius:5px;color:var(--yellow);cursor:pointer;font-weight:600">⚡ Higgsfield</button>';
      html+='<button class="tool-btn grok-btn" data-prompt="'+encodeURIComponent(vidPrompt)+'" data-type="video" style="font-size:10px;padding:3px 9px;background:var(--purple-dim);border:0.5px solid rgba(127,119,221,0.2);border-radius:5px;color:var(--purple);cursor:pointer;font-weight:600">⚡ Grok</button>';
      html+='<button class="tool-btn veo-btn" data-prompt="'+encodeURIComponent(vidPrompt)+'" data-type="video" style="font-size:10px;padding:3px 9px;background:var(--amber-dim);border:0.5px solid rgba(245,158,11,0.2);border-radius:5px;color:var(--amber);cursor:pointer;font-weight:600">⚡ Veo</button>';
      html+='<button class="copy-btn" data-prompt="'+encodeURIComponent(vidPrompt)+'" style="font-size:10px;padding:3px 9px;background:var(--bg2);border:0.5px solid var(--border3);border-radius:5px;color:var(--text3);cursor:pointer">📋 Copy</button>';
      html+='</div></div>';
    }
    
    html+='</div>';
  });
  
  container.innerHTML=html||'<div style="font-size:12px;color:var(--text3);padding:1rem">No scene prompts found.</div>';
  
  // Attach event listeners
  container.querySelectorAll('.higgs-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      generateWithTool('higgsfield',decodeURIComponent(this.dataset.prompt)+' 9:16 vertical',this.dataset.type);
    });
  });
  container.querySelectorAll('.grok-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      generateWithTool('grok',decodeURIComponent(this.dataset.prompt)+' 9:16 vertical',this.dataset.type);
    });
  });
  container.querySelectorAll('.veo-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      generateWithTool('veo',decodeURIComponent(this.dataset.prompt)+' 9:16 vertical',this.dataset.type);
    });
  });
  container.querySelectorAll('.copy-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      navigator.clipboard.writeText(decodeURIComponent(this.dataset.prompt));
      showNotif('Copied! ✓','success');
    });
  });
}


function showNotif(msg,type){
  const n=document.getElementById('notif');
  n.textContent=msg;n.className='notif show '+(type||'');
  setTimeout(()=>{n.className='notif';},3000);
}

sb.auth.getSession().then(({data})=>{
  if(data.session){currentUser=data.session.user;loadUserRole(currentUser);showApp();}
});
document.getElementById('project-modal').addEventListener('click',function(e){if(e.target===this)closeModal();});
// ═══════════════════════════════════════
// WORK LOG SYSTEM
// ═══════════════════════════════════════

var sessionTimer=null;

async function loadWorkLog(){
  if(!currentUser)return;
  // Update session banner
  var banner=document.getElementById('worklog-session-banner');
  var elapsedEl=document.getElementById('session-elapsed');
  if(banner){
    if(currentTimeInRecord){
      banner.style.display='flex';
      // Update elapsed every minute
      if(sessionTimer)clearInterval(sessionTimer);
      sessionTimer=setInterval(function(){
        if(elapsedEl)elapsedEl.textContent=getElapsed(currentTimeInRecord.time_in)+' elapsed';
      },60000);
      if(elapsedEl)elapsedEl.textContent=getElapsed(currentTimeInRecord.time_in)+' elapsed';
    } else {
      banner.style.display='none';
    }
  }
  await loadWorkLogTasks();
  await loadWorkLogProjectSelect();
  await loadWorkUpdates();
}

async function loadWorkLogTasks(){
  if(!currentUser)return;
  var el=document.getElementById('worklog-tasks');
  if(!el)return;
  // Get assigned tasks
  var{data:projects}=await sb.from('projects')
    .select('id,client_name,status,deadline,priority')
    .eq('assigned_to',currentUser.id)
    .neq('status','Approved / Done')
    .order('created_at',{ascending:false});
  var tasks=projects||[];
  if(!tasks.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0">No tasks assigned yet.</div>';
    return;
  }
  el.innerHTML=tasks.map(function(p){
    var deadline=p.deadline?getDeadlineStatus(p.deadline):'';
    var prioColor=p.priority==='urgent'?'var(--red)':p.priority==='normal'?'var(--amber)':'var(--text3)';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);margin-bottom:6px">'
      +'<div style="flex:1">'
      +'<div style="font-size:12px;font-weight:600;color:var(--text)">'+p.client_name+'</div>'
      +'<div style="font-size:10px;color:var(--text3);margin-top:2px;display:flex;gap:8px;align-items:center">'
      +statusBadge(p.status)+' '+deadline
      +'</div></div>'
      +'<div style="display:flex;gap:6px">'
      +'<button data-pid="'+p.id+'" data-pname="'+p.client_name+'" class="update-task-btn" style="font-size:10px;padding:3px 10px;background:var(--yellow-dim);border:0.5px solid rgba(250,204,21,0.2);border-radius:4px;color:var(--yellow);cursor:pointer;font-weight:600">📝 Update</button>'
      +'<button data-pid="'+p.id+'" class="done-task-btn" style="font-size:10px;padding:3px 10px;background:var(--green-dim);border:0.5px solid rgba(34,197,94,0.2);border-radius:4px;color:var(--green);cursor:pointer;font-weight:600">✅ Done</button>'
      +'</div></div>';
  }).join('');
  // Attach handlers
  el.querySelectorAll('.update-task-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.getElementById('worklog-project-select').value=this.dataset.pid;
      document.getElementById('worklog-update-text').focus();
      document.getElementById('worklog-update-text').scrollIntoView({behavior:'smooth'});
    });
  });
  el.querySelectorAll('.done-task-btn').forEach(function(btn){
    btn.addEventListener('click',function(){markTaskDoneFromLog(this.dataset.pid);});
  });
}

async function loadWorkLogProjectSelect(){
  var sel=document.getElementById('worklog-project-select');
  if(!sel)return;
  var{data}=await sb.from('projects').select('id,client_name')
    .eq('assigned_to',currentUser.id).neq('status','Approved / Done');
  sel.innerHTML=(data||[]).map(function(p){
    return '<option value="'+p.id+'">'+p.client_name+'</option>';
  }).join('');
}

async function loadWorkUpdates(){
  var el=document.getElementById('worklog-updates-list');
  if(!el)return;
  var today=new Date().toISOString().slice(0,10);
  var{data}=await sb.from('work_updates')
    .select('*,projects(client_name)')
    .eq('user_id',currentUser.id)
    .gte('created_at',today+'T00:00:00')
    .order('created_at',{ascending:false});
  var updates=data||[];
  if(!updates.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0">No updates yet today.</div>';
    return;
  }
  var statusColors={'in-progress':'var(--amber)','done':'var(--green)','blocked':'var(--red)','review':'var(--purple)'};
  var statusIcons={'in-progress':'🔄','done':'✅','blocked':'🚫','review':'👀'};
  el.innerHTML=updates.map(function(u){
    var time=new Date(u.created_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
    var color=statusColors[u.status]||'var(--text2)';
    var icon=statusIcons[u.status]||'📝';
    var eta=u.eta?'<span style="font-size:9px;color:var(--purple)">ETA: '+u.eta+'</span>':'';
    return '<div style="padding:10px 12px;background:var(--bg3);border:0.5px solid var(--border2);border-left:2px solid '+color+';border-radius:var(--radius);margin-bottom:6px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
      +'<div style="font-size:11px;font-weight:600;color:'+color+'">'+icon+' '+(u.projects?.client_name||'Project')+'</div>'
      +'<div style="display:flex;gap:8px;align-items:center">'+eta+'<span style="font-size:10px;color:var(--text3)">'+time+'</span></div>'
      +'</div>'
      +'<div style="font-size:12px;color:var(--text2)">'+u.notes+'</div>'
      +'</div>';
  }).join('');
}

async function submitWorkUpdate(){
  var projectId=document.getElementById('worklog-project-select')?.value;
  var status=document.getElementById('worklog-status-select')?.value||'in-progress';
  var notes=document.getElementById('worklog-update-text')?.value?.trim();
  var eta=document.getElementById('worklog-eta')?.value||null;
  if(!notes){showNotif('Add a note first','error');return;}
  if(!projectId){showNotif('Select a project','error');return;}
  var{error}=await sb.from('work_updates').insert({
    user_id:currentUser.id,
    project_id:projectId,
    status:status,
    notes:notes,
    eta:eta
  });
  if(error){showNotif('Error: '+error.message,'error');return;}
  // Update project status if done
  if(status==='done'){
    await sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',projectId);
  } else if(status==='in-progress'){
    await sb.from('projects').update({status:'In Production',updated_at:new Date().toISOString()}).eq('id',projectId);
  } else if(status==='review'){
    await sb.from('projects').update({status:'Ready for Editor',updated_at:new Date().toISOString()}).eq('id',projectId);
  }
  document.getElementById('worklog-update-text').value='';
  document.getElementById('worklog-eta').value='';
  showNotif('Update submitted! ✓','success');
  logActivity('WORK_UPDATE',notes.substring(0,50));
  // Notify admin
  await sb.from('notifications').insert({
    user_id:null,message:'Work update: '+notes.substring(0,60),
    type:'work_update',is_read:false
  }).then(function(){},function(){});
  loadWorkUpdates();
  loadWorkLogTasks();
}

async function markTaskDoneFromLog(projectId){
  await sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',projectId);
  showNotif('Task marked done! ✓','success');
  logActivity('TASK_DONE','Project completed');
  loadWorkLog();
}


// ═══════════════════════════════════════
// ATTENDANCE / TIME-IN SYSTEM
// ═══════════════════════════════════════

var currentTimeInRecord=null;

async function initTimeInSystem(){
  if(!currentUser)return;
  var today=new Date().toISOString().slice(0,10);
  var{data}=await sb.from('attendance')
    .select('*').eq('user_id',currentUser.id)
    .eq('date',today).is('time_out',null).maybeSingle();
  currentTimeInRecord=data;
  updateTimeInUI();
  // Load active now for dashboard
  loadActiveNow();
}

function updateTimeInUI(){
  var btn=document.getElementById('timein-btn');
  var status=document.getElementById('timein-status');
  if(!btn)return;
  if(currentTimeInRecord){
    btn.style.background='var(--red-dim)';
    btn.style.color='var(--red)';
    btn.style.borderColor='rgba(239,68,68,0.3)';
    btn.textContent='🔴 Time Out';
    btn.onclick=openTimeOutModal;
    var timeIn=new Date(currentTimeInRecord.time_in).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
    var elapsed=getElapsed(currentTimeInRecord.time_in);
    if(status)status.innerHTML='Timed in: <strong style="color:var(--green)">'+timeIn+'</strong><br>'+elapsed+' elapsed';
  } else {
    btn.style.background='var(--green-dim)';
    btn.style.color='var(--green)';
    btn.style.borderColor='rgba(34,197,94,0.3)';
    btn.textContent='🟢 Time In';
    btn.onclick=openTimeInModal;
    if(status)status.textContent='';
  }
}

function getElapsed(timeIn){
  var ms=Date.now()-new Date(timeIn).getTime();
  var h=Math.floor(ms/(1000*60*60));
  var m=Math.floor((ms%(1000*60*60))/(1000*60));
  return h+'h '+m+'m';
}

async function openTimeInModal(){
  // Load assigned tasks
  var{data:projects}=await sb.from('projects')
    .select('id,client_name,status,business_type')
    .eq('assigned_to',currentUser.id)
    .neq('status','Approved / Done')
    .order('created_at',{ascending:false});
  var tasks=projects||[];
  var listEl=document.getElementById('timein-task-list');
  if(listEl){
    listEl.innerHTML=tasks.length?tasks.map(function(p){
      return '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);margin-bottom:6px;cursor:pointer">'
        +'<input type="checkbox" value="'+p.id+'" class="task-checkbox" style="width:14px;height:14px;accent-color:var(--yellow);cursor:pointer"/>'
        +'<div><div style="font-size:12px;color:var(--text);font-weight:500">'+p.client_name+'</div>'
        +'<div style="font-size:10px;color:var(--text3)">'+p.status+' · '+(p.business_type||'')+'</div></div>'
        +'</label>';
    }).join(''):'<div style="font-size:12px;color:var(--text3);padding:8px">No assigned tasks — admin will assign shortly.</div>';
  }
  var modal=document.getElementById('timein-modal');
  if(modal)modal.style.display='flex';
}

async function confirmTimeIn(){
  var now=new Date();
  var today=now.toISOString().slice(0,10);
  // Get selected tasks
  var selectedTasks=[];
  document.querySelectorAll('.task-checkbox:checked').forEach(function(cb){
    selectedTasks.push(cb.value);
  });
  var notes=document.getElementById('timein-notes')?.value||'';
  var{data,error}=await sb.from('attendance').insert({
    user_id:currentUser.id,
    date:today,
    time_in:now.toISOString(),
    status:'present',
    tasks:JSON.stringify(selectedTasks),
    notes:notes
  }).select().maybeSingle();
  if(error){showNotif('Error: '+error.message,'error');return;}
  currentTimeInRecord=data;
  // Update task statuses to in-progress
  for(var i=0;i<selectedTasks.length;i++){
    await sb.from('projects').update({status:'In Production',updated_at:now.toISOString()}).eq('id',selectedTasks[i]);
  }
  var modal=document.getElementById('timein-modal');
  if(modal)modal.style.display='none';
  updateTimeInUI();
  var timeStr=now.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  showNotif('Timed in at '+timeStr+'! '+selectedTasks.length+' task(s) active ✓','success');
  logActivity('TIME_IN','Time in: '+timeStr+' | Tasks: '+selectedTasks.length);
  loadActiveNow();
}

async function openTimeOutModal(){
  if(!currentTimeInRecord)return;
  var timeIn=new Date(currentTimeInRecord.time_in);
  var elapsed=getElapsed(currentTimeInRecord.time_in);
  var timeInStr=timeIn.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  // Load tasks worked on
  var tasks=[];
  try{tasks=JSON.parse(currentTimeInRecord.tasks||'[]');}catch(e){}
  var taskDetails='';
  if(tasks.length){
    var{data}=await sb.from('projects').select('client_name,status').in('id',tasks);
    taskDetails=(data||[]).map(function(p){return '• '+p.client_name+' ('+p.status+')'}).join('<br>');
  }
  var summaryEl=document.getElementById('timeout-summary');
  if(summaryEl){
    summaryEl.innerHTML='<div style="margin-bottom:6px"><span style="color:var(--text3)">Time in:</span> <strong>'+timeInStr+'</strong></div>'
      +'<div style="margin-bottom:6px"><span style="color:var(--text3)">Duration:</span> <strong style="color:var(--yellow)">'+elapsed+'</strong></div>'
      +(taskDetails?'<div style="color:var(--text3);font-size:10px;margin-top:6px">Tasks:<br>'+taskDetails+'</div>':'');
  }
  var modal=document.getElementById('timeout-modal');
  if(modal)modal.style.display='flex';
}

async function confirmTimeOut(){
  if(!currentTimeInRecord)return;
  var now=new Date();
  var durationMs=now-new Date(currentTimeInRecord.time_in);
  var durationMins=Math.floor(durationMs/(1000*60));
  var notes=document.getElementById('timeout-notes')?.value||'';
  await sb.from('attendance').update({
    time_out:now.toISOString(),
    duration_minutes:durationMins,
    end_notes:notes
  }).eq('id',currentTimeInRecord.id);
  var modal=document.getElementById('timeout-modal');
  if(modal)modal.style.display='none';
  var h=Math.floor(durationMins/60);var m=durationMins%60;
  showNotif('Timed out! Duration: '+h+'h '+m+'m ✓','success');
  logActivity('TIME_OUT','Duration: '+h+'h '+m+'m');
  currentTimeInRecord=null;
  updateTimeInUI();
  loadActiveNow();
}

// Handle old time in button
async function handleTimeIn(){openTimeInModal();}
async function handleTimeOut(){openTimeOutModal();}

// ACTIVE NOW - show who is currently timed in
async function loadActiveNow(){
  var el=document.getElementById('active-now-list');
  if(!el)return;
  var today=new Date().toISOString().slice(0,10);
  var{data}=await sb.from('attendance')
    .select('*,profiles(name,email)')
    .eq('date',today).is('time_out',null)
    .order('time_in',{ascending:true});
  var active=data||[];
  if(!active.length){
    el.innerHTML='<div style="font-size:11px;color:var(--text3);padding:6px 0">No one timed in yet today.</div>';
    return;
  }
  el.innerHTML=active.map(function(r){
    var name=r.profiles?.name||r.profiles?.email||'?';
    var initial=name[0].toUpperCase();
    var timeIn=new Date(r.time_in).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
    var elapsed=getElapsed(r.time_in);
    var tasks=[];
    try{tasks=JSON.parse(r.tasks||'[]');}catch(e){}
    return '<div style="background:var(--bg3);border:0.5px solid var(--green-dim);border-left:2px solid var(--green);border-radius:var(--radius-lg);padding:10px 14px;display:flex;align-items:center;gap:10px;min-width:200px">'
      +'<div style="position:relative">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:var(--yellow-dim);border:1.5px solid var(--yellow);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--yellow)">'+initial+'</div>'
      +'<div style="position:absolute;bottom:0;right:0;width:10px;height:10px;background:var(--green);border-radius:50%;border:1.5px solid var(--bg3)"></div>'
      +'</div>'
      +'<div>'
      +'<div style="font-size:12px;font-weight:600;color:var(--text)">'+name+'</div>'
      +'<div style="font-size:10px;color:var(--text3)">In since '+timeIn+' · '+elapsed+'</div>'
      +(tasks.length?'<div style="font-size:9px;color:var(--green);margin-top:2px">'+tasks.length+' task(s) active</div>':'')
      +'</div></div>';
  }).join('');
}

async function loadAttendance(){
  var dateFilter=document.getElementById('attendance-date')?.value||new Date().toISOString().slice(0,10);
  var editorFilter=document.getElementById('attendance-editor-filter')?.value||'';
  var{data:editors}=await sb.from('profiles').select('id,name,email').eq('role','editor').order('name');
  var filterEl=document.getElementById('attendance-editor-filter');
  if(filterEl&&filterEl.options.length<=1){
    (editors||[]).forEach(function(e){
      var opt=document.createElement('option');
      opt.value=e.id;opt.textContent=e.name||e.email;
      filterEl.appendChild(opt);
    });
  }
  var query=sb.from('attendance').select('*,profiles(name,email)').eq('date',dateFilter).order('time_in',{ascending:true});
  if(editorFilter)query=query.eq('user_id',editorFilter);
  var{data}=await query;
  var records=data||[];
  var statsEl=document.getElementById('attendance-stats');
  if(statsEl){
    var present=records.length;
    var timedOut=records.filter(function(r){return r.time_out;}).length;
    var avgDur=records.filter(function(r){return r.duration_minutes;});
    var avgMins=avgDur.length?Math.round(avgDur.reduce(function(a,r){return a+r.duration_minutes;},0)/avgDur.length):0;
    statsEl.innerHTML=
      '<div class="stat-card c-green"><div class="stat-label">Present</div><div class="stat-val" style="color:var(--green)">'+present+'</div></div>'
      +'<div class="stat-card c-yellow"><div class="stat-label">Timed out</div><div class="stat-val">'+timedOut+'</div></div>'
      +'<div class="stat-card c-purple"><div class="stat-label">Still in</div><div class="stat-val" style="color:var(--purple)">'+(present-timedOut)+'</div></div>'
      +'<div class="stat-card c-amber"><div class="stat-label">Avg hours</div><div class="stat-val" style="color:var(--amber)">'+Math.floor(avgMins/60)+'h '+(avgMins%60)+'m</div></div>';
  }
  var bodyEl=document.getElementById('attendance-body');
  if(!bodyEl)return;
  if(!records.length){bodyEl.innerHTML='<div class="table-empty"><div class="table-empty-icon">🕐</div>No attendance records for this date.</div>';return;}
  bodyEl.innerHTML=records.map(function(r){
    var name=r.profiles?.name||r.profiles?.email||'Unknown';
    var timeIn=r.time_in?new Date(r.time_in).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'—';
    var timeOut=r.time_out?new Date(r.time_out).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'—';
    var dur=r.duration_minutes?Math.floor(r.duration_minutes/60)+'h '+(r.duration_minutes%60)+'m':'🟢 Still in';
    var tasks=[];try{tasks=JSON.parse(r.tasks||'[]');}catch(e){}
    var isLate=r.time_in&&new Date(r.time_in).getHours()>=9;
    var timeInDisplay=timeIn+(isLate?' <span style="font-size:9px;color:var(--amber);font-weight:600">Late</span>':'');
    return '<div class="table-row" style="grid-template-columns:1.5fr 0.8fr 1fr 1fr 1fr 1fr;cursor:pointer" data-rid="'+r.id+'" class2="att-row">'
      +'<div><div class="row-name">'+name+'</div>'+(tasks.length?'<div class="row-sub">'+tasks.length+' task(s)</div>':'')+'</div>'
      +'<div class="row-date">'+r.date+'</div>'
      +'<div style="font-size:12px">'+timeInDisplay+'</div>'
      +'<div style="font-size:12px;color:var(--text2)">'+timeOut+'</div>'
      +'<div style="font-size:12px;color:var(--yellow);font-weight:600">'+dur+'</div>'
      +'<div>'+(r.time_out?'<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:var(--bg4);color:var(--text3)">Done</span>':'<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:var(--green-dim);color:var(--green);font-weight:600">🟢 Active</span>')+'</div>'
      +'</div>';
  }).join('');
}

async function showAttendanceDetail(recordId){
  var{data}=await sb.from('attendance').select('*,profiles(name,email)').eq('id',recordId).maybeSingle();
  if(!data)return;
  var name=data.profiles?.name||data.profiles?.email||'Unknown';
  var tasks=[];try{tasks=JSON.parse(data.tasks||'[]');}catch(e){}
  var taskDetails='No tasks selected';
  if(tasks.length){
    var{data:projs}=await sb.from('projects').select('client_name,status').in('id',tasks);
    taskDetails=(projs||[]).map(function(p){return '• '+p.client_name+' ('+p.status+')';}).join('\n');
  }
  var timeIn=new Date(data.time_in).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  var timeOut=data.time_out?new Date(data.time_out).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'Still in';
  var msg=name+" — "+data.date+"\n";
  msg+="Time In: "+timeIn+"\n";
  msg+="Time Out: "+timeOut+"\n";
  msg+="Duration: "+dur+"\n";
  msg+="\nTasks:\n"+taskDetails;
  if(data.notes)msg+="\n\nPlan:\n"+data.notes;
  if(data.end_notes)msg+="\n\nEnd of day:\n"+data.end_notes;
  alert(msg);
}

function exportAttendanceCSV(){
  var rows=document.querySelectorAll('#attendance-body .table-row');
  var csvRows=['"Editor","Date","Time In","Time Out","Duration","Status"'];
  rows.forEach(function(row){
    var cells=row.querySelectorAll('div:not(div div)');
    var vals=[];
    cells.forEach(function(c,i){if(i<6)vals.push('"'+c.textContent.trim().replace(/"/g,'""')+'"');});
    if(vals.length)csvRows.push(vals.join(','));
  });
  var blob=new Blob([csvRows.join('\n')],{type:'text/csv'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='attendance-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  showNotif('Exported! ✓','success');
}



// ═══════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════
async function loadClients(){
  var{data}=await sb.from('profiles').select('*').eq('role','client').order('created_at',{ascending:false});
  var clients=data||[];
  var statsEl=document.getElementById('clients-stats');
  if(statsEl){
    var paid=clients.filter(function(c){return c.payment_status==='paid';}).length;
    var unpaid=clients.filter(function(c){return c.payment_status==='unpaid';}).length;
    var overdue=clients.filter(function(c){return c.payment_status==='overdue';}).length;
    statsEl.innerHTML='<div class="stat-card c-yellow"><div class="stat-label">Total clients</div><div class="stat-val">'+clients.length+'</div></div>'
      +'<div class="stat-card c-green"><div class="stat-label">Paid</div><div class="stat-val" style="color:var(--green)">'+paid+'</div></div>'
      +'<div class="stat-card c-red"><div class="stat-label">Unpaid</div><div class="stat-val" style="color:var(--red)">'+unpaid+'</div></div>'
      +'<div class="stat-card c-amber"><div class="stat-label">Overdue</div><div class="stat-val" style="color:var(--amber)">'+overdue+'</div></div>';
  }
  var badge=document.getElementById('clients-badge');
  if(badge){badge.textContent=clients.length;badge.style.display=clients.length>0?'':'none';}
  document.getElementById('clients-body').innerHTML=clients.length?clients.map(function(c){
    var payColor=c.payment_status==='paid'?'var(--green)':c.payment_status==='overdue'?'var(--red)':'var(--amber)';
    var payIcon=c.payment_status==='paid'?'✅':c.payment_status==='overdue'?'⚠️':'❌';
    return '<div class="table-row" style="grid-template-columns:2fr 1.5fr 1fr 1fr 1fr 100px">'
      +'<div><div class="row-name">'+(c.name||'—')+'</div><div class="row-sub">'+(c.company||'')+'</div></div>'
      +'<div><div class="row-meta" style="font-size:11px">'+(c.email||'')+'</div><div class="row-sub">'+(c.phone||'')+'</div></div>'
      +'<div class="row-meta">'+(c.plan||'basic')+'</div>'
      +'<div><span style="font-size:10px;color:'+payColor+';font-weight:600">'+payIcon+' '+(c.payment_status||'unpaid')+'</span></div>'
      +'<div class="row-date">'+(c.payment_due||'—')+'</div>'
      +'<div><button onclick="deleteClient(\''+c.id+'\')" class="ghost-btn" style="font-size:10px;padding:3px 8px;color:var(--red);border-color:rgba(239,68,68,0.2)">Remove</button></div>'
      +'</div>';
  }).join(''):'<div class="table-empty"><div class="table-empty-icon">👥</div>No clients yet.</div>';
}

async function addClient(){
  var name=document.getElementById('new-client-name')?.value?.trim();
  var company=document.getElementById('new-client-company')?.value?.trim();
  var email=document.getElementById('new-client-email')?.value?.trim();
  var phone=document.getElementById('new-client-phone')?.value?.trim();
  var pass=document.getElementById('new-client-pass')?.value;
  var plan=document.getElementById('new-client-plan')?.value||'basic';
  var due=document.getElementById('new-client-due')?.value||null;
  var payment=document.getElementById('new-client-payment')?.value||'unpaid';
  if(!name||!email||!pass){showNotif('Fill in name, email, password','error');return;}
  if(pass.length<6){showNotif('Password min 6 characters','error');return;}
  var btn=document.getElementById('add-client-btn');
  btn.disabled=true;btn.textContent='Adding...';
  var{data,error}=await sb.rpc('create_user_with_profile',{user_email:email,user_password:pass,user_name:name,user_role:'client'});
  if(error||!data?.success){showNotif('Error: '+(error?.message||'Failed'),'error');btn.disabled=false;btn.textContent='Add client';return;}
  if(data.user_id){await sb.from('profiles').update({company:company,phone:phone,plan:plan,payment_due:due,payment_status:payment}).eq('id',data.user_id);}
  showNotif('Client added! ✓','success');
  ['new-client-name','new-client-company','new-client-email','new-client-phone','new-client-pass'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  btn.disabled=false;btn.textContent='Add client';
  loadClients();
}

async function deleteClient(id){
  if(!confirm('Remove this client?'))return;
  await sb.from('profiles').delete().eq('id',id);
  showNotif('Client removed','success');loadClients();
}

function filterClients(){
  var q=(document.getElementById('search-clients')?.value||'').toLowerCase();
  var pay=document.getElementById('filter-payment')?.value||'';
  document.querySelectorAll('#clients-body .table-row').forEach(function(row){
    var text=row.textContent.toLowerCase();
    row.style.display=(!q||text.includes(q))&&(!pay||text.includes(pay))?'':'none';
  });
}

// ═══════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════
async function loadActivityLog(){
  var from=document.getElementById('activity-date-from')?.value||'';
  var to=document.getElementById('activity-date-to')?.value||'';
  var query=sb.from('activity_logs').select('*,profiles(name,email)').order('created_at',{ascending:false}).limit(100);
  if(from)query=query.gte('created_at',from+'T00:00:00');
  if(to)query=query.lte('created_at',to+'T23:59:59');
  var{data}=await query;
  var records=data||[];
  var bodyEl=document.getElementById('activity-log-body');
  if(!bodyEl)return;
  if(!records.length){bodyEl.innerHTML='<div class="table-empty"><div class="table-empty-icon">📋</div>No activity yet.</div>';return;}
  var actionColor={LOGIN:'var(--green)',TIME_IN:'var(--green)',TIME_OUT:'var(--red)',OUTPUT_ADDED:'var(--amber)',API_KEY_UPDATED:'var(--purple)',AVATAR_GENERATED:'var(--purple)',WORK_UPDATE:'var(--amber)',PROJECT_COMPLETED:'#4caf50'};
  bodyEl.innerHTML=records.map(function(r){
    var name=r.profiles?.name||r.profiles?.email||'System';
    var time=new Date(r.created_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    var color=actionColor[r.action]||'var(--text2)';
    return '<div class="table-row" style="grid-template-columns:1.5fr 1fr 2fr 1fr">'
      +'<div class="row-meta">'+name+'</div>'
      +'<div><span style="font-size:10px;color:'+color+';font-weight:600;background:var(--bg3);padding:2px 8px;border-radius:20px">'+r.action+'</span></div>'
      +'<div style="font-size:11px;color:var(--text3)">'+(r.details||'—')+'</div>'
      +'<div class="row-date">'+time+'</div>'
      +'</div>';
  }).join('');
}

// ═══════════════════════════════════════
// REVISIONS
// ═══════════════════════════════════════
async function loadRevisions(projectId){
  var{data}=await sb.from('project_revisions').select('*,profiles(name,email)').eq('project_id',projectId).order('created_at',{ascending:false});
  var revisions=data||[];
  var badge=document.getElementById('revision-count-badge');
  if(badge)badge.textContent=revisions.length;
  var el=document.getElementById('modal-revisions');
  if(!el)return;
  if(!revisions.length){el.innerHTML='<div style="font-size:11px;color:var(--text3);padding:4px 0">No revisions yet.</div>';return;}
  el.innerHTML=revisions.map(function(r){
    var time=new Date(r.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    var doneBtn=r.is_done?'<span style="font-size:9px;color:var(--green);padding:1px 6px;border-radius:3px;background:var(--green-dim)">✓ Done</span>':'<button onclick="markRevisionDone(\''+r.id+'\')" style="font-size:9px;padding:1px 8px;background:var(--green-dim);color:var(--green);border:none;border-radius:3px;cursor:pointer">✓ Done</button>';
    return '<div style="padding:7px 10px;background:var(--bg3);border:0.5px solid '+(r.is_done?'var(--border2)':'rgba(245,158,11,0.2)')+';border-radius:var(--radius);margin-bottom:4px;display:flex;align-items:flex-start;gap:8px">'
      +'<div style="flex:1"><div style="font-size:11px;color:'+(r.is_done?'var(--text3)':'var(--text2)')+';'+(r.is_done?'text-decoration:line-through':'')+'">'+r.description+'</div>'
      +'<div style="font-size:9px;color:var(--text3);margin-top:2px">'+(r.profiles?.name||r.profiles?.email||'?')+' · '+time+'</div></div>'
      +doneBtn+'</div>';
  }).join('');
}

async function addRevision(){
  if(!currentProjectId)return;
  var input=document.getElementById('revision-input');
  var desc=input?.value?.trim();
  if(!desc){showNotif('Describe the revision','error');return;}
  await sb.from('project_revisions').insert({project_id:currentProjectId,user_id:currentUser.id,description:desc,is_done:false});
  input.value='';
  showNotif('Revision requested ✓','success');
  loadRevisions(currentProjectId);
}

async function markRevisionDone(id){
  await sb.from('project_revisions').update({is_done:true}).eq('id',id);
  loadRevisions(currentProjectId);
  showNotif('Revision done ✓','success');
}

// ═══════════════════════════════════════
// EDITOR PERFORMANCE
// ═══════════════════════════════════════
async function loadEditorPerformance(){
  var{data:editors}=await sb.from('profiles').select('id,name,email').eq('role','editor');
  var results=[];
  for(var i=0;i<(editors||[]).length;i++){
    var e=editors[i];
    var{data:projects}=await sb.from('projects').select('*').eq('assigned_to',e.id);
    var all=projects||[];
    var done=all.filter(function(p){return p.status==='Approved / Done';});
    var onTime=done.filter(function(p){return !p.deadline||new Date(p.updated_at)<=new Date(p.deadline);}).length;
    var onTimeRate=done.length?Math.round((onTime/done.length)*100):0;
    var score=Math.min(100,Math.round((done.length*20)+(onTimeRate*0.5)));
    var totalDays=done.reduce(function(acc,p){return acc+Math.round((new Date(p.updated_at)-new Date(p.created_at))/(1000*60*60*24));},0);
    var avgTurnaround=done.length?Math.round(totalDays/done.length):0;
    results.push({editor:e,score:score,onTimeRate:onTimeRate,avgTurnaround:avgTurnaround});
  }
  return results;
}

function scoreColor(score){
  if(score>=80)return'var(--green)';
  if(score>=50)return'var(--amber)';
  return'var(--red)';
}

// ═══════════════════════════════════════
// CLIENT DASHBOARD
// ═══════════════════════════════════════
async function loadClientDashboard(){
  if(!currentUser)return;
  var{data:projects}=await sb.from('projects').select('*').eq('created_by',currentUser.id).order('created_at',{ascending:false});
  var all=projects||[];
  var statsEl=document.getElementById('client-stats');
  if(statsEl){
    statsEl.innerHTML='<div class="stat-card c-yellow"><div class="stat-label">My projects</div><div class="stat-val">'+all.length+'</div></div>'
      +'<div class="stat-card c-green"><div class="stat-label">Completed</div><div class="stat-val" style="color:var(--green)">'+all.filter(function(p){return p.status==='Approved / Done';}).length+'</div></div>'
      +'<div class="stat-card c-amber"><div class="stat-label">In progress</div><div class="stat-val" style="color:var(--amber)">'+all.filter(function(p){return p.status==='In Production';}).length+'</div></div>'
      +'<div class="stat-card c-purple"><div class="stat-label">Ready</div><div class="stat-val" style="color:var(--purple)">'+all.filter(function(p){return p.status==='Ready for Editor';}).length+'</div></div>';
  }
  var bodyEl=document.getElementById('client-projects-body');
  if(bodyEl){bodyEl.innerHTML=all.length?all.map(function(p){return '<div class="editor-card"><div class="editor-card-top"><div><div class="editor-card-name">'+p.client_name+'</div><div class="editor-card-meta">'+fmtDate(p.created_at)+' · '+(p.video_size||'')+'</div></div>'+statusBadge(p.status)+'</div></div>';}).join(''):'<div class="table-empty"><div class="table-empty-icon">📋</div>No projects yet.</div>';}
}

async function submitClientBrief(){
  var brief=document.getElementById('client-brief-input')?.value?.trim();
  if(!brief){showNotif('Please describe your project first','error');return;}
  var btn=document.getElementById('client-submit-btn');
  var status=document.getElementById('client-submit-status');
  btn.disabled=true;if(status)status.textContent='⚡ Generating blueprint...';
  try{
    var res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:3000,
        system:'You are an expert video ad blueprint generator for Filipino businesses.',
        messages:[{role:'user',content:brief}]})});
    var d=await res.json();
    var blueprint=d.content?.map(function(i){return i.text||'';}).join('')||'';
    if(blueprint){
      await sb.from('projects').insert({client_name:currentUser.email,blueprint:blueprint,status:'New Input',created_by:currentUser.id,
        video_size:document.getElementById('client-size')?.value||'9:16 Vertical',
        language:document.getElementById('client-lang')?.value||'Taglish'});
      showNotif('Brief submitted! ✓','success');
      document.getElementById('client-brief-input').value='';
      loadClientDashboard();
    }
  }catch(e){showNotif('Error: '+e.message,'error');}
  btn.disabled=false;if(status)status.textContent='';
}

// ═══════════════════════════════════════
// AUTOMATION — PHASE 3 VIDEO (per scene, editor picks model)
// ═══════════════════════════════════════

// Override renderAutomationScenes to include video generation per scene
function renderAutomationScenes(){
  var grid=document.getElementById('auto-scenes-grid');
  if(!grid)return;
  var videoSize=autoProject?.video_size||'9:16';
  var isSquare=videoSize.includes('1:1');
  var sizeLabel=isSquare?'1:1':'9:16';
  var dalleSize=isSquare?'1024x1024':'1024x1536';

  grid.innerHTML=autoScenes.map(function(s,i){
    var aspectStyle=isSquare?'aspect-ratio:1/1':'aspect-ratio:9/16';
    return '<div style="background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);overflow:hidden" id="scene-card-'+i+'">'
      +'<div style="'+aspectStyle+';background:var(--bg4);display:flex;align-items:center;justify-content:center;position:relative;max-height:200px" id="scene-img-container-'+i+'">'
      +'<div style="font-size:10px;color:var(--text3);text-align:center;padding:8px">Scene '+s.num+'<br><span style="font-size:9px;color:var(--yellow)">'+sizeLabel+'</span></div>'
      +'</div>'
      +'<div style="padding:8px">'
      +'<div style="font-size:9px;color:var(--text3);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(s.voiceover||s.imagePrompt||'').substring(0,50)+'...</div>'
      // Image generation
      +'<div style="display:flex;gap:4px;margin-bottom:6px">'
      +'<button class="gen-scene-btn" data-idx="'+i+'" data-size="'+dalleSize+'" style="flex:1;font-size:10px;padding:4px;background:var(--yellow-dim);border:0.5px solid rgba(250,204,21,0.2);border-radius:4px;color:var(--yellow);cursor:pointer;font-weight:600">🎨 Gen Image</button>'
      +'<span id="scene-status-'+i+'" style="font-size:9px;color:var(--text3);display:flex;align-items:center;padding:0 4px"></span>'
      +'</div>'
      // Video generation — editor picks model
      +'<div style="font-size:9px;color:var(--text3);margin-bottom:4px;font-weight:600;text-transform:uppercase">🎬 Generate Video:</div>'
      +'<div style="display:flex;gap:3px;flex-wrap:wrap">'
      +'<button class="gen-video-btn" data-idx="'+i+'" data-tool="higgsfield" style="font-size:9px;padding:3px 6px;background:var(--bg2);border:0.5px solid var(--border2);border-radius:4px;color:var(--text2);cursor:pointer">Higgsfield</button>'
      +'<button class="gen-video-btn" data-idx="'+i+'" data-tool="grok" style="font-size:9px;padding:3px 6px;background:var(--purple-dim);border:0.5px solid rgba(127,119,221,0.2);border-radius:4px;color:var(--purple);cursor:pointer">Grok</button>'
      +'<button class="gen-video-btn" data-idx="'+i+'" data-tool="veo" style="font-size:9px;padding:3px 6px;background:var(--amber-dim);border:0.5px solid rgba(245,158,11,0.2);border-radius:4px;color:var(--amber);cursor:pointer">Veo</button>'
      +'</div>'
      +'<div id="scene-video-status-'+i+'" style="font-size:9px;color:var(--text3);margin-top:4px"></div>'
      +'</div></div>';
  }).join('');

  // Attach image gen handlers
  grid.querySelectorAll('.gen-scene-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      generateSceneImage(parseInt(this.dataset.idx),this.dataset.size);
    });
  });

  // Attach video gen handlers — per scene, editor picks tool
  grid.querySelectorAll('.gen-video-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      generateSceneVideo(parseInt(this.dataset.idx),this.dataset.tool);
    });
  });
}

// Generate video per scene with chosen tool
async function generateSceneVideo(idx,tool){
  var scene=autoScenes[idx];
  if(!scene){showNotif('No scene found','error');return;}
  var statusEl=document.getElementById('scene-video-status-'+idx);
  if(statusEl)statusEl.textContent='⏳ Generating with '+tool+'...';

  var videoSize=autoProject?.video_size||'9:16';
  var sizeTag=videoSize.includes('1:1')?'1:1 square format, equal width and height':'9:16 vertical portrait, mobile-optimized';
  var prompt=(scene.videoPrompt||scene.imagePrompt||scene.visual||'Cinematic video clip')
    +' Duration: 8-10 seconds, smooth cinematic motion, '+sizeTag+', photorealistic, no text overlays';

  // Add avatar context
  if(autoProject?.avatar_desc)prompt='Featuring: '+autoProject.avatar_desc+'. '+prompt;

  if(tool==='higgsfield'){
    // Own account — copy prompt + open tab
    navigator.clipboard.writeText(prompt).catch(function(){});
    window.open('https://higgsfield.ai/create','_blank');
    if(statusEl)statusEl.innerHTML='✅ Prompt copied! <span style="color:var(--yellow)">Paste in Higgsfield →</span>';
    // Save placeholder output
    if(autoProject?.id){
      autoOutputs[idx]=autoOutputs[idx]||{};
      autoOutputs[idx].videoTool='higgsfield';
      autoOutputs[idx].videoPrompt=prompt;
    }
  } else {
    // API mode — Grok or Veo
    var apiKey=getSecureApiKey(tool)||getToolSetting(tool+'-api-key');
    if(!apiKey){showNotif('No API key for '+tool+' — set in Settings!','error');showPage('settings');return;}
    try{
      var endpoint=tool==='grok'?'/api/grok-generate':'/api/veo-generate';
      var model=tool==='grok'?getToolSetting('grok-model','grok-imagine-video-1.5-preview'):getToolSetting('veo-model','veo-3');
      var res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt:prompt,apiKey:apiKey,model:model,duration:8,type:'video'})});
      var d=await res.json();
      if(d.url){
        if(statusEl)statusEl.innerHTML='✅ Video ready! <a href="'+d.url+'" target="_blank" style="color:var(--yellow)">Open →</a>';
        // Save to outputs
        if(autoProject?.id){
          try{await sb.from('project_outputs').insert({project_id:autoProject.id,user_id:currentUser.id,url:d.url,type:'video',label:'Scene '+scene.num+' video ('+tool+')'});}catch(err){}
        }
        autoOutputs[idx]=autoOutputs[idx]||{};
        autoOutputs[idx].videoUrl=d.url;
        autoOutputs[idx].videoTool=tool;
        showNotif('Scene '+scene.num+' video done! ✓','success');
        // Unlock phase 4 if any video done
        var phase4=document.getElementById('auto-phase4');
        if(phase4){phase4.style.opacity='1';phase4.style.pointerEvents='auto';}
      } else if(d.status==='processing'){
        if(statusEl)statusEl.textContent='⏳ Processing... check back in 1 min';
      } else {
        if(statusEl)statusEl.textContent='❌ Error: '+(d.error||'Failed');
        showNotif(tool+' error: '+(d.error||'Failed'),'error');
      }
    }catch(e){
      if(statusEl)statusEl.textContent='❌ '+e.message;
      showNotif('Error: '+e.message,'error');
    }
  }
}

// Override generateSceneImage to support 1:1 size
async function generateSceneImage(idx, dalleSize){
  var scene=autoScenes[idx];
  if(!scene)return;
  var apiKey=getSecureApiKey('dalle')||getToolSetting('dalle-api-key');
  if(!apiKey){showNotif('Set DALL-E API key in Settings!','error');showPage('settings');return;}
  var statusEl=document.getElementById('scene-status-'+idx);
  var container=document.getElementById('scene-img-container-'+idx);
  if(statusEl)statusEl.textContent='⏳';
  var videoSize=autoProject?.video_size||'9:16';
  var isSquare=videoSize.includes('1:1');
  var imgSize=dalleSize||(isSquare?'1024x1024':'1024x1536');
  var sizeTag=isSquare?'1:1 square format, equal dimensions':'9:16 vertical portrait, mobile-optimized';
  var prompt=scene.imagePrompt||scene.videoPrompt||scene.visual||'';
  
  if(autoProject?.color_primary)prompt+='. Brand color: '+autoProject.color_primary;
  prompt+=' '+sizeTag+', photorealistic, natural lighting, no text, no logos';
  try{
    var res=await fetch('/api/nano-generate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt:prompt,apiKey:apiKey,size:imgSize,quality:getToolSetting('dalle-quality','hd'),style:getToolSetting('dalle-style','vivid')})});
    var d=await res.json();
    if(d.url){
      if(container){
        var aspectStyle=isSquare?'aspect-ratio:1/1':'aspect-ratio:9/16';
        container.innerHTML='<img src="'+d.url+'" style="width:100%;height:100%;object-fit:cover;max-height:200px"/>'
          +'<div style="position:absolute;bottom:4px;right:4px;display:flex;gap:3px">'
          +'<button class="regen-scene" data-idx="'+idx+'" style="font-size:9px;padding:2px 6px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:3px;cursor:pointer">🔄</button>'
          +'<button class="approve-scene" data-idx="'+idx+'" data-url="'+d.url+'" style="font-size:9px;padding:2px 6px;background:rgba(34,197,94,0.8);color:#fff;border:none;border-radius:3px;cursor:pointer">✅</button>'
          +'</div>';
        container.style.position='relative';
        container.querySelectorAll('.regen-scene').forEach(function(b){b.addEventListener('click',function(){generateSceneImage(parseInt(this.dataset.idx));});});
        container.querySelectorAll('.approve-scene').forEach(function(b){b.addEventListener('click',function(){approveSceneImage(parseInt(this.dataset.idx),this.dataset.url);});});
      }
      if(statusEl)statusEl.textContent='✅';
      autoOutputs[idx]=autoOutputs[idx]||{};
      autoOutputs[idx].url=d.url;autoOutputs[idx].type='image';autoOutputs[idx].scene=scene;
      // Save to DB
      if(autoProject?.id){
        try{await sb.from('project_outputs').insert({project_id:autoProject.id,user_id:currentUser.id,url:d.url,type:'image',label:'Scene '+scene.num+' image'});}catch(err){}
      }
    } else {
      if(statusEl)statusEl.textContent='❌';
      showNotif('Scene '+scene.num+' error: '+(d.error||'Failed'),'error');
    }
  }catch(e){if(statusEl)statusEl.textContent='❌';}
}


// ═══════════════════════════════════════
// SUPABASE STORAGE — AUTO-UPLOAD IMAGES
// Bucket: "Ai creatives system storage"
// Prevents DALL-E URL expiry (1 hour limit)
// ═══════════════════════════════════════

var STORAGE_BUCKET='Ai creatives system storage';

// Upload image from URL to Supabase Storage
// Returns permanent Supabase URL or original URL if fails
async function uploadImageToStorage(imageUrl, fileName){
  try{
    // Fetch the image
    var response=await fetch(imageUrl);
    if(!response.ok)throw new Error('Failed to fetch image');
    var blob=await response.blob();
    // Upload to Supabase Storage
    var filePath='images/'+fileName;
    var{data,error}=await sb.storage.from(STORAGE_BUCKET).upload(filePath,blob,{
      contentType:'image/png',
      upsert:true
    });
    if(error){console.error('Storage upload error:',error);return imageUrl;}
    // Get public URL
    var{data:urlData}=sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return urlData?.publicUrl||imageUrl;
  }catch(e){
    console.error('Storage upload failed:',e);
    return imageUrl; // Fallback to original URL
  }
}

// Generate unique filename
function genFileName(prefix,idx){
  var ts=Date.now();
  var proj=autoProject?.id?.slice(0,8)||'proj';
  return prefix+'-'+proj+'-'+(idx!==undefined?idx+'-':'')+ts+'.png';
}

// Override generateAvatar to auto-save to storage
var _origGenerateAvatar=generateAvatar;
generateAvatar=async function(){
  var promptEl=document.getElementById('auto-avatar-prompt');
  var prompt=promptEl?.value?.trim();
  if(!prompt){showNotif('Add avatar description first','error');return;}
  var apiKey=getSecureApiKey('dalle')||getToolSetting('dalle-api-key');
  // Nano Banana: server-side GEMINI_API_KEY na ang gamit — hindi na required ang DALL-E key
  var btn=document.getElementById('gen-avatar-btn');
  var status=document.getElementById('avatar-gen-status');
  if(btn)btn.disabled=true;
  if(status)status.textContent='⚡ Generating avatar...';
  try{
    var res=await fetch('/api/nano-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        prompt:prompt+' 9:16 vertical portrait aspect ratio, mobile-optimized',
        apiKey:apiKey,
        type:'avatar',
        avatarDesc:prompt,
        brandType:autoProject?.business_type||'',
        sceneNum:1,
        size:'1024x1536',
        quality:getToolSetting('dalle-quality','hd'),
        style:getToolSetting('dalle-style','vivid')
      })
    });
    var d=await res.json();
    if(d.url){
      if(status)status.textContent='⚡ Saving to storage...';
      // Upload to Supabase Storage
      var fileName=genFileName('avatar');
      var permanentUrl=await uploadImageToStorage(d.url,fileName);
      autoAvatarUrl=permanentUrl;
      var preview=document.getElementById('avatar-preview');
      var result=document.getElementById('avatar-result');
      if(preview)preview.src=permanentUrl;
      if(result)result.style.display='block';
      if(status)status.textContent='✅ Avatar saved to storage!';
      // Save permanent URL to project outputs
      if(autoProject?.id){
        await sb.from('project_outputs').insert({
          project_id:autoProject.id,user_id:currentUser.id,
          url:permanentUrl,type:'image',label:'Avatar'
        });
      }
      logActivity('AVATAR_GENERATED',autoProject?.client_name||'');
    } else {
      if(status)status.textContent='Error: '+(d.error||'Failed');
      showNotif('DALL-E error: '+(d.error||'Failed'),'error');
    }
  }catch(e){
    if(status)status.textContent='Error: '+e.message;
    showNotif('Error: '+e.message,'error');
  }finally{
    if(btn)btn.disabled=false;
  }
};

// Override generateSceneImage to auto-save to storage
var _origGenerateSceneImage=generateSceneImage;
generateSceneImage=async function(idx,dalleSize){
  var scene=autoScenes[idx];
  if(!scene)return;
  var apiKey=getSecureApiKey('dalle')||getToolSetting('dalle-api-key');
  // Nano Banana: server-side GEMINI_API_KEY na ang gamit — hindi na required ang DALL-E key
  var statusEl=document.getElementById('scene-status-'+idx);
  var container=document.getElementById('scene-img-container-'+idx);
  if(statusEl)statusEl.textContent='⏳';
  var videoSize=autoProject?.video_size||'9:16';
  var isSquare=videoSize.includes('1:1');
  var imgSize=dalleSize||(isSquare?'1024x1024':'1024x1536');
  var sizeTag=isSquare?'1:1 square format':'9:16 vertical portrait, mobile-optimized';
  var prompt=scene.imagePrompt||scene.videoPrompt||scene.visual||'';
  
  if(autoProject?.color_primary)prompt+='. Brand color: '+autoProject.color_primary;
  prompt+=' '+sizeTag+', photorealistic, natural lighting, no text, no logos';
  try{
    var res=await fetch('/api/nano-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt:prompt,apiKey:apiKey,size:imgSize,
        type:'scene',
        avatarUrl:autoAvatarUrl||'',
        avatarDesc:autoProject?.avatar_desc||'',
        brandType:autoProject?.business_type||'',
        product:autoProject?.product||'',
        sceneNum:idx+1,
        quality:getToolSetting('dalle-quality','hd'),
        style:getToolSetting('dalle-style','vivid')})
    });
    var d=await res.json();
    if(d.url){
      if(statusEl)statusEl.textContent='💾';
      // Upload to Supabase Storage
      var fileName=genFileName('scene',idx);
      var permanentUrl=await uploadImageToStorage(d.url,fileName);
      if(container){
        var aspectStyle=isSquare?'aspect-ratio:1/1':'aspect-ratio:9/16';
        container.innerHTML='<img src="'+permanentUrl+'" style="width:100%;height:100%;object-fit:cover;max-height:200px"/>'
          +'<div style="position:absolute;bottom:4px;right:4px;display:flex;gap:3px">'
          +'<button class="regen-scene" data-idx="'+idx+'" style="font-size:9px;padding:2px 6px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:3px;cursor:pointer">🔄</button>'
          +'<button class="approve-scene" data-idx="'+idx+'" data-url="'+permanentUrl+'" style="font-size:9px;padding:2px 6px;background:rgba(34,197,94,0.8);color:#fff;border:none;border-radius:3px;cursor:pointer">✅</button>'
          +'</div>';
        container.style.position='relative';
        container.querySelectorAll('.regen-scene').forEach(function(b){b.addEventListener('click',function(){generateSceneImage(parseInt(this.dataset.idx));});});
        container.querySelectorAll('.approve-scene').forEach(function(b){b.addEventListener('click',function(){approveSceneImage(parseInt(this.dataset.idx),this.dataset.url);});});
      }
      if(statusEl)statusEl.textContent='✅';
      autoOutputs[idx]=autoOutputs[idx]||{};
      autoOutputs[idx].url=permanentUrl;
      autoOutputs[idx].type='image';
      autoOutputs[idx].scene=scene;
      // Save permanent URL to DB
      if(autoProject?.id){
        try{
          await sb.from('project_outputs').insert({
            project_id:autoProject.id,user_id:currentUser.id,
            url:permanentUrl,type:'image',label:'Scene '+scene.num+' image'
          });
        }catch(err){}
      }
    } else {
      if(statusEl)statusEl.textContent='❌';
      showNotif('Scene '+scene.num+' error: '+(d.error||'Failed'),'error');
    }
  }catch(e){
    if(statusEl)statusEl.textContent='❌';
    console.error('Scene gen error:',e);
  }
};



// ═══════════════════════════════════════
// EDITOR OUTPUT SUBMISSION
// ═══════════════════════════════════════

async function loadEditorOutputProjectSelect(){
  var sel=document.getElementById('submit-project-select');
  if(!sel)return;
  var{data}=await sb.from('projects').select('id,client_name,status')
    .eq('assigned_to',currentUser.id)
    .neq('status','Approved / Done')
    .order('client_name');
  sel.innerHTML='<option value="">Select project...</option>'+(data||[]).map(function(p){
    return '<option value="'+p.id+'">'+p.client_name+' ('+p.status+')</option>';
  }).join('');
}

async function loadEditorRecentOutputs(){
  var el=document.getElementById('editor-recent-outputs');
  if(!el)return;
  var{data}=await sb.from('project_outputs')
    .select('*,projects(client_name,business_type,audience,goal,video_size,color_primary,product)')
    .eq('user_id',currentUser.id)
    .order('created_at',{ascending:false})
    .limit(8);
  var outputs=data||[];
  if(!outputs.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0">No outputs submitted yet.</div>';
    return;
  }
  var typeIcons={video:'🎬',image:'🖼️',blueprint:'📄',other:'📎'};
  el.innerHTML=outputs.map(function(o){
    var date=new Date(o.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);margin-bottom:6px">'
      +'<span style="font-size:16px">'+(typeIcons[o.type]||'📎')+'</span>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(o.projects?.client_name||'Project')+'</div>'
      +'<a href="'+o.url+'" target="_blank" style="font-size:10px;color:var(--yellow);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">'+o.url.substring(0,40)+'...</a>'
      +'</div>'
      +'<div style="font-size:9px;color:var(--text3);white-space:nowrap">'+date+'</div>'
      +'</div>';
  }).join('');
}

// Load client details when project selected
async function loadSubmitClientDetails(){
  var sel=document.getElementById('submit-project-select');
  if(!sel||!sel.value)return;
  var{data}=await sb.from('projects').select('*').eq('id',sel.value).maybeSingle();
  if(!data)return;
  // Store for later use
  window._currentSubmitProject=data;
  var el=document.getElementById('submit-client-details');
  if(el){
    el.innerHTML='<strong style="color:var(--yellow)">'+(data.client_name||'—')+'</strong>'
      +(data.business_type?'<br>Type: '+data.business_type:'')
      +(data.product?'<br>Product: '+data.product.substring(0,80)+'...':'')
      +(data.audience?'<br>Audience: '+data.audience:'')
      +(data.goal?'<br>Goal: '+data.goal:'')
      +(data.video_size?'<br>Size: '+data.video_size:'')
      +(data.color_primary?'<br>Brand color: '+data.color_primary:'');
  }
}

function toggleClientDetails(){
  var el=document.getElementById('submit-client-details');
  if(!el)return;
  if(el.style.display==='none'||!el.style.display){
    if(!window._currentSubmitProject){showNotif('Select a project first','error');return;}
    el.style.display='block';
    document.getElementById('view-client-btn').textContent='🙈';
  } else {
    el.style.display='none';
    document.getElementById('view-client-btn').textContent='👁';
  }
}

async function submitEditorOutput(markDone){
  var projectId=document.getElementById('submit-project-select')?.value;
  var url=document.getElementById('submit-output-url')?.value?.trim();
  var sheetUrl=document.getElementById('submit-output-sheet')?.value?.trim()||'';
  var type=document.getElementById('submit-output-type')?.value||'video';
  var notes=document.getElementById('submit-output-notes')?.value?.trim()||'';
  if(!projectId){showNotif('Select a project first','error');return;}
  if(!url){showNotif('Paste the Google Drive / Video link','error');return;}
  var{data:project}=await sb.from('projects').select('*').eq('id',projectId).maybeSingle();
  var typeLabels={video:'Video output',image:'Image output',blueprint:'Blueprint PDF',other:'File'};
  var label=typeLabels[type]||'Output';
  if(notes)label=label+' — '+notes.substring(0,30);
  // Save main output (GDrive/video link)
  var{error}=await sb.from('project_outputs').insert({
    project_id:projectId,
    user_id:currentUser.id,
    url:url,
    type:type,
    label:label
  });
  if(error){showNotif('Error: '+error.message,'error');return;}
  // Save sheet link if provided
  if(sheetUrl){
    await sb.from('project_outputs').insert({
      project_id:projectId,
      user_id:currentUser.id,
      url:sheetUrl,
      type:'other',
      label:'📊 Excel / Sheet'+(notes?' — '+notes.substring(0,20):'')
    }).catch(function(){});
  }
  // Log activity
  logActivity('OUTPUT_SUBMITTED',(project?.client_name||'Project')+' — '+type+(sheetUrl?' + Sheet':''));
  // Mark done if requested
  if(markDone){
    await sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',projectId);
    showNotif('Output submitted + marked Done! ✅','success');
  } else {
    showNotif('Output submitted! ✓','success');
  }
  // Notify admin
  await sb.from('notifications').insert({
    user_id:null,
    message:'New output from editor: "'+(project?.client_name||'Project')+'" — '+type+(sheetUrl?' + Sheet link':''),
    type:'output',
    project_id:projectId,
    is_read:false
  }).catch(function(){});
  // Clear form
  document.getElementById('submit-output-url').value='';
  document.getElementById('submit-output-sheet').value='';
  document.getElementById('submit-output-notes').value='';
  document.getElementById('submit-client-details').style.display='none';
  document.getElementById('view-client-btn').textContent='👁';
  window._currentSubmitProject=null;
  // Reload
  loadEditorRecentOutputs();
  loadEditorPortal();
}

async function submitAndMarkDone(){
  await submitEditorOutput(true);
}

// ═══════════════════════════════════════
// ADMIN OUTPUTS TABLE
// ═══════════════════════════════════════

async function loadOutputsTable(){
  var editorFilter=document.getElementById('outputs-editor-filter')?.value||'';
  var typeFilter=document.getElementById('outputs-type-filter')?.value||'';
  var dateFrom=document.getElementById('outputs-date-from')?.value||'';
  var dateTo=document.getElementById('outputs-date-to')?.value||'';

  // Load editors for filter dropdown
  var filterEl=document.getElementById('outputs-editor-filter');
  if(filterEl&&filterEl.options.length<=1){
    var{data:eds}=await sb.from('profiles').select('id,name,email').eq('role','editor').order('name');
    (eds||[]).forEach(function(e){
      var opt=document.createElement('option');
      opt.value=e.id;opt.textContent=e.name||e.email;
      filterEl.appendChild(opt);
    });
  }

  // Build query
  var query=sb.from('project_outputs')
    .select('*,profiles(name,email),projects(client_name,status)')
    .order('created_at',{ascending:false})
    .limit(200);
  if(editorFilter)query=query.eq('user_id',editorFilter);
  if(typeFilter)query=query.eq('type',typeFilter);
  if(dateFrom)query=query.gte('created_at',dateFrom+'T00:00:00');
  if(dateTo)query=query.lte('created_at',dateTo+'T23:59:59');

  var{data}=await query;
  var outputs=data||[];

  // Stats
  var statsEl=document.getElementById('outputs-stats');
  if(statsEl){
    var videos=outputs.filter(function(o){return o.type==='video';}).length;
    var images=outputs.filter(function(o){return o.type==='image';}).length;
    var total=outputs.length;
    // Count unique projects
    var uniqueProjects=new Set(outputs.map(function(o){return o.project_id;})).size;
    statsEl.innerHTML=
      '<div class="stat-card c-yellow"><div class="stat-label">Total outputs</div><div class="stat-val">'+total+'</div></div>'
      +'<div class="stat-card c-purple"><div class="stat-label">Videos</div><div class="stat-val" style="color:var(--purple)">'+videos+'</div></div>'
      +'<div class="stat-card c-green"><div class="stat-label">Images</div><div class="stat-val" style="color:var(--green)">'+images+'</div></div>'
      +'<div class="stat-card c-amber"><div class="stat-label">Projects</div><div class="stat-val" style="color:var(--amber)">'+uniqueProjects+'</div></div>';
  }

  // Update badge
  var badge=document.getElementById('outputs-badge');
  if(badge){badge.textContent=outputs.length;badge.style.display=outputs.length>0?'':'none';}

  // Table body
  var bodyEl=document.getElementById('outputs-table-body');
  if(!bodyEl)return;
  if(!outputs.length){
    bodyEl.innerHTML='<div class="table-empty"><div class="table-empty-icon">📦</div>No outputs yet.</div>';
    return;
  }
  var typeIcons={video:'🎬',image:'🖼️',blueprint:'📄',other:'📎'};
  bodyEl.innerHTML=outputs.map(function(o){
    var date=new Date(o.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
    var editor=o.profiles?.name||o.profiles?.email||'Unknown';
    var client=o.projects?.client_name||'—';
    var projStatus=o.projects?.status||'';
    var icon=typeIcons[o.type]||'📎';
    var shortUrl=o.url.length>40?o.url.substring(0,40)+'...':o.url;
    return '<div class="table-row" style="grid-template-columns:1.5fr 1.5fr 1fr 1fr 2fr 1fr">'
      +'<div><div class="row-name">'+editor+'</div></div>'
      +'<div><div class="row-name">'+client+'</div><div class="row-sub">'+projStatus+'</div></div>'
      +'<div><span style="font-size:12px">'+icon+' '+o.type+'</span></div>'
      +'<div>'+statusBadge(projStatus)+'</div>'
      +'<div><a href="'+o.url+'" target="_blank" style="font-size:11px;color:var(--yellow);word-break:break-all">'+shortUrl+'</a>'
      +(o.label?'<div style="font-size:10px;color:var(--text3)">'+o.label+'</div>':'')+'</div>'
      +'<div class="row-date">'+date+'</div>'
      +'</div>';
  }).join('');
}

function exportOutputsCSV(){
  var rows=document.querySelectorAll('#outputs-table-body .table-row');
  var csvRows=['"Editor","Client","Type","Status","URL","Label","Date"'];
  rows.forEach(function(row){
    var cells=row.querySelectorAll('div.row-name,div.row-sub,span,a,div.row-date');
    // Better approach - re-fetch from table data
  });
  // Export from current data
  sb.from('project_outputs').select('*,profiles(name,email),projects(client_name,status)').order('created_at',{ascending:false}).limit(500)
    .then(function({data}){
      var outputs=data||[];
      var csv=['"Editor","Client","Type","Output URL","Label","Date"'].concat(
        outputs.map(function(o){
          return [
            o.profiles?.name||o.profiles?.email||'',
            o.projects?.client_name||'',
            o.type||'',
            o.url||'',
            o.label||'',
            o.created_at?new Date(o.created_at).toLocaleDateString('en-PH'):''
          ].map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
        })
      ).join('\n');
      var blob=new Blob([csv],{type:'text/csv'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='outputs-'+new Date().toISOString().slice(0,10)+'.csv';
      a.click();
      showNotif('Exported! ✓','success');
    });
}

// ═══════════════════════════════════════
// QUICK ASSIGN FROM DASHBOARD
// ═══════════════════════════════════════

async function quickAssignModal(projectId, e){
  e.stopPropagation();
  var{data:editors}=await sb.from('profiles').select('id,name,email').eq('role','editor').order('name');
  if(!editors||!editors.length){showNotif('No editors found','error');return;}
  var proj=allProjects.find(function(p){return p.id===projectId;});
  var projName=proj?.client_name||'Project';
  // Build picker UI
  var picker=document.getElementById('quick-assign-picker');
  if(!picker){
    picker=document.createElement('div');
    picker.id='quick-assign-picker';
    picker.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg2);border:0.5px solid var(--border2);border-radius:var(--radius-lg);padding:1.25rem;z-index:9999;min-width:280px;box-shadow:0 16px 48px rgba(0,0,0,0.6)';
    document.body.appendChild(picker);
  }
  picker.innerHTML='<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">Assign project</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:1rem">'+projName+'</div>'
    +editors.map(function(e){
      var eName=e.name||e.email;
      return '<div onclick="doQuickAssign(\"'+projectId+'\",\"'+e.id+'\",\"'+eName+'\")" style="padding:10px 12px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);margin-bottom:6px;cursor:pointer;display:flex;align-items:center;gap:10px" onmouseover="this.style.borderColor=\'var(--yellow)\'" onmouseout="this.style.borderColor=\'var(--border2)\'">'
        +'<div style="width:28px;height:28px;border-radius:50%;background:var(--yellow-dim);border:1.5px solid var(--yellow);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--yellow)">'+eName[0].toUpperCase()+'</div>'
        +'<div><div style="font-size:12px;font-weight:600;color:var(--text)">'+eName+'</div>'
        +'<div style="font-size:10px;color:var(--text3)">Editor</div></div>'
        +'</div>';
    }).join('')
    +'<button onclick="closeQuickAssign()" style="width:100%;margin-top:8px;padding:8px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);color:var(--text3);cursor:pointer;font-size:12px">Cancel</button>';
  picker.style.display='block';
  // Click outside to close
  setTimeout(function(){
    document.addEventListener('click',function handler(ev){
      if(!picker.contains(ev.target)){closeQuickAssign();document.removeEventListener('click',handler);}
    });
  },100);
}

function closeQuickAssign(){
  var picker=document.getElementById('quick-assign-picker');
  if(picker)picker.style.display='none';
}

async function doQuickAssign(projectId, editorId, editorName){
  await sb.from('projects').update({assigned_to:editorId,updated_at:new Date().toISOString()}).eq('id',projectId);
  allProjects=allProjects.map(function(p){return p.id===projectId?Object.assign({},p,{assigned_to:editorId}):p;});
  // Notify editor
  var proj=allProjects.find(function(p){return p.id===projectId;});
  await sb.from('notifications').insert({
    user_id:editorId,
    message:'New project assigned to you: "'+(proj?.client_name||'Project')+'" — check My Tasks!',
    type:'assignment',
    project_id:projectId,
    is_read:false
  }).catch(function(){});
  closeQuickAssign();
  showNotif('Assigned to '+editorName+'! ✓','success');
  // Update local allProjects so tag shows immediately
  allProjects=allProjects.map(function(p){return p.id===projectId?Object.assign({},p,{assigned_to:editorId}):p;});
  loadDashboard();
}


/* ═══════════════════════════════════════════════════════════
   AI IMAGE CREATIVES — JS FUNCTIONS
   Paste at the END of app.js (before the last closing lines)
   ═══════════════════════════════════════════════════════════ */

// ─── STATE ───
var icState = {
  prompts: [],           // array of 15 {name, tagline, subheadline, imagePrompt, bullets, cta}
  images: [],            // generated image URLs
  currentIdx: 0,         // which prompt is being generated
  batchNumber: 1,        // current batch
  usedAngles: [],        // track used creative angles across batches
  isRunning: false,      // auto-generate running
  stopRequested: false   // stop signal
};

// ─── MEGA SYSTEM PROMPT (from doc) ───
function getICSystemPrompt() {
  return `Act as a senior graphic designer, creative strategist, direct-response copywriter, and performance marketer for the Philippine market in 2026.

Your task is to generate HIGH-CONVERTING STATIC IMAGE AD CREATIVE STRATEGIES for Facebook and Instagram Ads.

The goal is to create message-first, scroll-stopping, conversion-focused 1080x1080 static image ads.

RULES:
- Tagline/Headline must be the BIGGEST visual element
- Logo must be minimal only — small corner placement
- Image must instantly communicate the offer within 1-2 seconds
- Must be Meta Ads Policy and Community Standards compliant
- No misleading claims, no guaranteed results, no before-and-after exaggeration
- No direct personal callouts about sensitive topics
- Use UGC-style ultra-realistic iPhone photo visuals
- Natural skin, visible pores, candid real Philippine environment
- Performance over aesthetics. Message-first always.

FOR EACH CREATIVE, respond with ONLY valid JSON. No markdown, no explanation.`;
}

// ─── BUILD USER PROMPT ───
function buildICUserPrompt(batchNum, usedAngles) {
  var brand = document.getElementById('ic-brand').value.trim();
  var biztype = document.getElementById('ic-biztype').value;
  var product = document.getElementById('ic-product').value.trim();
  var audience = document.getElementById('ic-audience').value.trim();
  var goal = document.getElementById('ic-goal').value;
  var usp = document.getElementById('ic-usp').value.trim();
  var pain = document.getElementById('ic-pain').value.trim();
  var price = document.getElementById('ic-price').value.trim();
  var colors = document.getElementById('ic-colors').value.trim();
  var tone = document.getElementById('ic-tone').value;
  var notes = document.getElementById('ic-notes').value.trim();

  var avoidAngles = usedAngles.length > 0
    ? 'IMPORTANT: Do NOT repeat these angles already used in previous batches: ' + usedAngles.join(', ') + '. Generate 15 completely new and different angles.'
    : '';

  return `Generate exactly 15 high-converting static image ad creative strategies (Batch ${batchNum}) for the following business:

BRAND: ${brand}
BUSINESS TYPE: ${biztype}
PRODUCT/SERVICE: ${product}
TARGET AUDIENCE: ${audience}
MAIN GOAL: ${goal}
KEY BENEFITS/USP: ${usp}
PAIN POINTS: ${pain}
PRICE/OFFER: ${price || 'Not specified'}
BRAND COLORS: ${colors || 'Not specified'}
BRAND TONE: ${tone}
ADDITIONAL NOTES: ${notes || 'None'}

${avoidAngles}

Return ONLY a valid JSON array of exactly 15 objects. Each object must have these exact keys:
{
  "id": 1,
  "name": "Creative Name",
  "angle": "brief angle description for tracking",
  "tagline": "Main headline — biggest text in design",
  "subheadline": "One supporting line",
  "bullets": ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4"],
  "cta": "CTA text",
  "colorStyle": "Color direction",
  "imagePrompt": "Complete detailed image generation prompt for Flux/DALL-E. Must be 1080x1080. Include: scene description, UGC iPhone photo style, natural lighting, realistic Filipino model details if needed, text overlay hierarchy with tagline as biggest text, benefits list as secondary, small logo corner, premium ad layout, Meta-compliant visual. NO misleading claims."
}

Return ONLY the JSON array. No markdown, no explanation, no extra text.`;
}

// ─── STEP 1: GENERATE 15 PROMPTS ───
async function generateICPrompts() {
  var brand = document.getElementById('ic-brand').value.trim();
  var product = document.getElementById('ic-product').value.trim();
  if (!brand || !product) {
    showNotif('Fill in Brand Name and Product/Service first!', 'error');
    return;
  }

  var btn = document.getElementById('ic-gen-prompts-btn');
  var status = document.getElementById('ic-prompt-status');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating 15 strategies...';
  status.textContent = 'Calling Claude AI...';

  try {
    var res = await fetch('/api/video-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: getICSystemPrompt(),
        prompt: buildICUserPrompt(icState.batchNumber, icState.usedAngles),
        max_tokens: 8000
      })
    });

    // Fallback: try Anthropic directly if video-prompt not available
    if (!res.ok) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: getICSystemPrompt(),
          messages: [{ role: 'user', content: buildICUserPrompt(icState.batchNumber, icState.usedAngles) }]
        })
      });
    }

    var data = await res.json();
    var text = '';

    // Handle both response formats
    if (data.content && Array.isArray(data.content)) {
      text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    } else if (data.result) {
      text = data.result;
    } else if (data.text) {
      text = data.text;
    }

    // Parse JSON
    var jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in response');

    icState.prompts = JSON.parse(jsonMatch[0]);
    icState.images = new Array(icState.prompts.length).fill(null);

    // Track angles for future batches
    icState.prompts.forEach(function(p) {
      if (p.angle) icState.usedAngles.push(p.angle);
    });

    renderICPromptsList();
    document.getElementById('ic-step2').style.display = 'block';
    document.getElementById('ic-batch-badge').style.display = 'inline-flex';
    document.getElementById('ic-batch-badge').textContent = 'Batch ' + icState.batchNumber;
    status.textContent = '✅ 15 strategies ready!';

  } catch(e) {
    console.error(e);
    showNotif('Error generating strategies: ' + e.message, 'error');
    status.textContent = 'Error: ' + e.message;
  }

  btn.disabled = false;
  btn.innerHTML = '⚡ Generate 15 Image Strategies';
}

// ─── RENDER PROMPTS LIST ───
function renderICPromptsList() {
  var list = document.getElementById('ic-prompts-list');
  list.innerHTML = '';
  icState.prompts.forEach(function(p, i) {
    var div = document.createElement('div');
    div.style.cssText = 'background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);padding:10px 14px;display:flex;align-items:flex-start;gap:12px;transition:all 0.2s';
    div.id = 'ic-prompt-row-' + i;
    div.innerHTML = `
      <div style="width:24px;height:24px;border-radius:50%;background:var(--yellow-dim);border:1.5px solid var(--yellow);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--yellow);flex-shrink:0">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px">${p.name}</div>
        <div style="font-size:11px;color:var(--yellow);margin-bottom:3px">"${p.tagline}"</div>
        <div style="font-size:10px;color:var(--text3)">${p.subheadline || ''}</div>
      </div>
      <div id="ic-prompt-status-${i}" style="font-size:10px;color:var(--text3);white-space:nowrap;flex-shrink:0">Pending</div>
    `;
    list.appendChild(div);
  });
}

// ─── STEP 3: AUTO-GENERATE IMAGES ───
async function startAutoGenerate() {
  var apiKey = localStorage.getItem('dalle-api-key') || localStorage.getItem('replicate-key');
  if (!apiKey) {
    showNotif('Set your image API key in Settings first!', 'error');
    return;
  }

  icState.isRunning = true;
  icState.stopRequested = false;
  icState.currentIdx = 0;
  icState.images = new Array(icState.prompts.length).fill(null);

  document.getElementById('ic-step3').style.display = 'block';
  document.getElementById('ic-images-grid').innerHTML = '';
  document.getElementById('ic-download-all-wrap').style.display = 'none';
  document.getElementById('ic-stop-btn').style.display = 'inline-flex';
  document.getElementById('ic-start-btn').disabled = true;
  document.getElementById('ic-start-btn').textContent = '⏳ Generating...';

  // Pre-render empty cards
  var grid = document.getElementById('ic-images-grid');
  icState.prompts.forEach(function(p, i) {
    var card = document.createElement('div');
    card.id = 'ic-card-' + i;
    card.style.cssText = 'background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-lg);overflow:hidden;position:relative';
    card.innerHTML = `
      <div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:var(--bg4)" id="ic-card-img-${i}">
        <div style="text-align:center;color:var(--text3)">
          <div style="font-size:18px;margin-bottom:4px">🖼️</div>
          <div style="font-size:9px">${i+1}. ${p.name}</div>
        </div>
      </div>
      <div style="padding:8px">
        <div style="font-size:10px;font-weight:600;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.tagline}</div>
        <div style="font-size:9px;color:var(--text3)">${p.cta || 'Message Us'}</div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Generate one by one
  for (var i = 0; i < icState.prompts.length; i++) {
    if (icState.stopRequested) break;

    icState.currentIdx = i;
    updateICProgress(i);

    // Update prompt row status
    var row = document.getElementById('ic-prompt-row-' + i);
    var rowStatus = document.getElementById('ic-prompt-status-' + i);
    if (row) row.style.borderColor = 'rgba(250,204,21,0.4)';
    if (rowStatus) rowStatus.innerHTML = '<span class="spinner"></span>';

    // Update card
    var cardImg = document.getElementById('ic-card-img-' + i);
    if (cardImg) {
      cardImg.innerHTML = '<div style="text-align:center;color:var(--yellow)"><span class="spinner" style="width:20px;height:20px"></span><div style="font-size:9px;margin-top:6px">Generating...</div></div>';
    }

    try {
      var imgUrl = await generateSingleICImage(icState.prompts[i], i);
      icState.images[i] = imgUrl;

      // Update card with image
      if (cardImg && imgUrl) {
        cardImg.innerHTML = `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover" />`;
      }

      // Add download button
      var card = document.getElementById('ic-card-' + i);
      if (card) {
        var dlBtn = document.createElement('button');
        dlBtn.style.cssText = 'position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.7);border:0.5px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;font-size:10px;padding:3px 8px;cursor:pointer;backdrop-filter:blur(4px)';
        dlBtn.textContent = '↓ Save';
        dlBtn.onclick = (function(url, name) {
          return function() { downloadICImage(url, name); };
        })(imgUrl, icState.prompts[i].name);
        card.appendChild(dlBtn);
      }

      if (row) row.style.borderColor = 'rgba(34,197,94,0.3)';
      if (rowStatus) rowStatus.innerHTML = '<span style="color:var(--green)">✓ Done</span>';

    } catch(e) {
      console.error('Error on image', i, e);
      if (cardImg) {
        cardImg.innerHTML = '<div style="text-align:center;color:var(--red);font-size:10px;padding:8px">Error<br>' + e.message + '</div>';
      }
      if (rowStatus) rowStatus.innerHTML = '<span style="color:var(--red)">✗ Error</span>';
    }

    // Small delay between generations
    if (!icState.stopRequested) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // Done
  icState.isRunning = false;
  document.getElementById('ic-stop-btn').style.display = 'none';
  document.getElementById('ic-start-btn').disabled = false;
  document.getElementById('ic-start-btn').textContent = '🎨 Auto-Generate All Images';

  var successCount = icState.images.filter(Boolean).length;
  updateICProgress(icState.prompts.length, true);

  if (successCount > 0) {
    document.getElementById('ic-download-all-wrap').style.display = 'block';
    document.getElementById('ic-new-batch-btn').style.display = 'inline-flex';
    document.getElementById('ic-batch-info').textContent = successCount + '/' + icState.prompts.length + ' images generated';
    showNotif('✅ ' + successCount + ' creatives generated!', 'success');
  }
}

// ─── GENERATE SINGLE IMAGE ───
async function generateSingleICImage(promptObj, idx) {
  var finalPrompt = promptObj.imagePrompt;

  // Try /api/dalle-generate (existing endpoint)
  var res = await fetch('/api/dalle-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: finalPrompt,
      mode: 'scene',
      sceneIndex: idx,
      size: '1024x1024',
      clientName: document.getElementById('ic-brand').value.trim() || 'client'
    })
  });

  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Generation failed');
  if (!data.imageUrl) throw new Error('No image URL returned');

  return data.imageUrl;
}

// ─── PROGRESS ───
function updateICProgress(current, done) {
  var total = icState.prompts.length;
  var pct = done ? 100 : Math.round((current / total) * 100);
  document.getElementById('ic-progress-bar').style.width = pct + '%';
  document.getElementById('ic-gen-progress').textContent = done
    ? '✅ Complete — ' + icState.images.filter(Boolean).length + '/' + total + ' generated'
    : 'Generating ' + (current + 1) + ' of ' + total + '...';
}

// ─── STOP ───
function stopImageCreatives() {
  icState.stopRequested = true;
  icState.isRunning = false;
  showNotif('Stopping after current image...', 'error');
  document.getElementById('ic-stop-btn').style.display = 'none';
  document.getElementById('ic-stop-btn2').style.display = 'none';
}

// ─── DOWNLOAD SINGLE ───
function downloadICImage(url, name) {
  var a = document.createElement('a');
  a.href = url;
  a.download = (name || 'creative').replace(/[^a-z0-9]/gi, '-') + '.png';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── DOWNLOAD ALL ───
async function downloadAllICImages() {
  var generated = icState.images.filter(Boolean);
  if (generated.length === 0) {
    showNotif('No images to download!', 'error');
    return;
  }
  showNotif('Downloading ' + generated.length + ' images...', 'success');
  for (var i = 0; i < icState.images.length; i++) {
    if (icState.images[i]) {
      await new Promise(r => setTimeout(r, 300));
      downloadICImage(icState.images[i], icState.prompts[i] ? icState.prompts[i].name : ('creative-' + (i+1)));
    }
  }
}

// ─── NEW BATCH ───
function newICBatch() {
  icState.batchNumber++;
  icState.prompts = [];
  icState.images = [];
  icState.currentIdx = 0;
  icState.isRunning = false;
  icState.stopRequested = false;

  // Reset UI
  document.getElementById('ic-step2').style.display = 'none';
  document.getElementById('ic-step3').style.display = 'none';
  document.getElementById('ic-images-grid').innerHTML = '';
  document.getElementById('ic-prompts-list').innerHTML = '';
  document.getElementById('ic-progress-bar').style.width = '0%';
  document.getElementById('ic-gen-progress').textContent = '';
  document.getElementById('ic-download-all-wrap').style.display = 'none';
  document.getElementById('ic-new-batch-btn').style.display = 'none';
  document.getElementById('ic-stop-btn').style.display = 'none';
  document.getElementById('ic-batch-badge').textContent = 'Batch ' + icState.batchNumber;
  document.getElementById('ic-prompt-status').textContent = '';
  document.getElementById('ic-start-btn').textContent = '🎨 Auto-Generate All Images';
  document.getElementById('ic-start-btn').disabled = false;

  showNotif('Ready for Batch ' + icState.batchNumber + ' — ' + icState.usedAngles.length + ' angles will be avoided!', 'success');

  // Auto-generate new prompts
  generateICPrompts();
}
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// CREATIVES UPLOAD — v6 (custom dropdowns, filters sa baba, contrast)
// PALITAN ang buong lumang CREATIVES UPLOAD JS section ng ito.
// ═══════════════════════════════════════════════════════════

var forUploadState = { items: [], filtered: [], formOpen: false, allStaff: [] };

function fuToggleForm(){
  forUploadState.formOpen = !forUploadState.formOpen;
  var wrap = document.getElementById('fu-form-wrap');
  var btn = document.getElementById('fu-toggle-btn');
  if (!wrap) return;
  if (forUploadState.formOpen){
    wrap.style.maxHeight = '640px'; wrap.style.opacity = '1'; wrap.style.marginBottom = '20px';
    if (btn) btn.style.opacity = '0.55';
  } else {
    wrap.style.maxHeight = '0'; wrap.style.opacity = '0'; wrap.style.marginBottom = '0';
    if (btn) btn.style.opacity = '1';
  }
}

// ── CUSTOM DROPDOWN ──
function fuDdToggle(id){
  var dd = document.getElementById(id);
  if (!dd) return;
  var wasOpen = dd.classList.contains('open');
  // isara lahat muna
  document.querySelectorAll('.fu-dd.open').forEach(function(x){ x.classList.remove('open'); });
  if (!wasOpen) dd.classList.add('open');
}
function fuDdPick(ddId, hiddenId, val, itemEl, label){
  var dd = document.getElementById(ddId);
  var hidden = document.getElementById(hiddenId);
  if (dd){
    var lbl = dd.querySelector('[data-label]');
    if (lbl) lbl.textContent = label;
    dd.querySelectorAll('.fu-dd-item').forEach(function(x){ x.classList.remove('active'); });
    if (itemEl) itemEl.classList.add('active');
    dd.classList.remove('open');
  }
  if (hidden){ hidden.value = val; }
  filterForUpload();
}
// isara ang dropdown pag nag-click sa labas
document.addEventListener('click', function(e){
  if (!e.target.closest('.fu-dd')) {
    document.querySelectorAll('.fu-dd.open').forEach(function(x){ x.classList.remove('open'); });
  }
});

async function loadForUpload(){
  var nowIso = new Date().toISOString();
  try {
    await sb.from('creatives_upload').delete().lt('expires_at', nowIso).not('expires_at','is',null);
  } catch(e){ console.log('Cleanup skip:', e.message); }

  try {
    var { data:staff } = await sb.from('profiles').select('name,email').order('name',{ascending:true});
    forUploadState.allStaff = (staff||[]).map(function(s){ return s.name || s.email; }).filter(Boolean);
  } catch(e){ forUploadState.allStaff = []; }

  var { data } = await sb.from('creatives_upload')
    .select('*')
    .order('created_at', { ascending:false });
  forUploadState.items = data || [];

  // Populate CUSTOM staff dropdown menu
  var staffMenu = document.getElementById('fu-dd-staff-menu');
  var hiddenOwner = document.getElementById('fu-owner-filter');
  if (staffMenu){
    var names = forUploadState.allStaff.slice();
    forUploadState.items.forEach(function(c){ if (c.owner_name && names.indexOf(c.owner_name)<0) names.push(c.owner_name); });
    var html = '<div class="fu-dd-item active" data-val="" onclick="fuDdPick(\'fu-dd-staff\',\'fu-owner-filter\',\'\',this,\'All staff\')">All staff</div>';
    names.forEach(function(name){
      var safe = escapeHtml(name);
      html += '<div class="fu-dd-item" data-val="'+safe+'" onclick="fuDdPick(\'fu-dd-staff\',\'fu-owner-filter\',\''+safe.replace(/'/g,"\\'")+'\',this,\''+safe.replace(/'/g,"\\'")+'\')">'+safe+'</div>';
    });
    staffMenu.innerHTML = html;
    // sync hidden select options
    if (hiddenOwner){
      hiddenOwner.innerHTML = '<option value=""></option>' + names.map(function(n){ return '<option value="'+escapeHtml(n)+'"></option>'; }).join('');
    }
  }

  var waiting = forUploadState.items.filter(function(c){ return c.status !== 'Published'; }).length;
  var published = forUploadState.items.filter(function(c){ return c.status === 'Published'; }).length;
  var wEl = document.getElementById('fu-waiting-count');
  var pEl = document.getElementById('fu-published-count');
  if (wEl) wEl.textContent = waiting;
  if (pEl) pEl.textContent = published;

  filterForUpload();
}

function filterForUpload(){
  var q = (document.getElementById('fu-search')?.value || '').toLowerCase();
  var owner = document.getElementById('fu-owner-filter')?.value || '';
  var status = document.getElementById('fu-status-filter')?.value || '';
  var pageF = document.getElementById('fu-page-filter')?.value || '';
  forUploadState.filtered = forUploadState.items.filter(function(c){
    var matchQ = !q ||
      (c.project_name||'').toLowerCase().includes(q) ||
      (c.owner_name||'').toLowerCase().includes(q) ||
      (c.headline||'').toLowerCase().includes(q) ||
      (c.ad_copy||'').toLowerCase().includes(q);
    var matchOwner = !owner || c.owner_name === owner;
    var matchStatus = !status || c.status === status;
    var matchPage = !pageF || c.content_type === pageF;
    return matchQ && matchOwner && matchStatus && matchPage;
  });
  renderForUpload();
}

function fuCountdown(expiresAt){
  if (!expiresAt) return '';
  var ms = new Date(expiresAt) - new Date();
  if (ms <= 0) return '<span style="font-size:9px;color:var(--red)">Removing...</span>';
  var h = Math.floor(ms / (1000*60*60));
  var m = Math.floor((ms % (1000*60*60)) / (1000*60));
  var label = h > 0 ? ('Removes in ' + h + 'h') : ('Removes in ' + m + 'm');
  return '<div style="font-size:9px;color:#f5a623;margin-top:4px;font-weight:600;display:flex;align-items:center;gap:3px"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + label + '</div>';
}

function fuPageBadge(page){
  if (!page) return '<span style="color:#6a6a75">—</span>';
  var styles = {
    'VIRAL UGC': { bg:'rgba(167,139,250,0.16)', c:'#b9a5fc', bd:'rgba(167,139,250,0.4)' },
    'HCSI':      { bg:'rgba(250,204,21,0.16)',  c:'#fbd94f', bd:'rgba(250,204,21,0.4)' }
  };
  var s = styles[page] || { bg:'rgba(255,255,255,0.06)', c:'#c8c8d0', bd:'rgba(255,255,255,0.12)' };
  return '<span style="font-size:9px;padding:4px 12px;border-radius:20px;background:'+s.bg+';color:'+s.c+';border:0.5px solid '+s.bd+';font-weight:750;letter-spacing:0.03em">'+escapeHtml(page)+'</span>';
}

function fuStaffChip(name){
  name = name || 'Unknown';
  var initial = name.trim().charAt(0).toUpperCase();
  var colors = ['#f472b6','#38bdf8','#a78bfa','#34d399','#fbbf24','#fb7185','#22d3ee','#c084fc'];
  var idx = 0; for (var i=0;i<name.length;i++){ idx += name.charCodeAt(i); }
  var col = colors[idx % colors.length];
  return '<div style="display:flex;align-items:center;gap:9px">'
    + '<div style="width:28px;height:28px;border-radius:50%;background:'+col+'26;border:0.5px solid '+col+'66;color:'+col+';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:750;flex-shrink:0">'+initial+'</div>'
    + '<span style="font-size:12px;font-weight:600;color:#d4d4dc">'+escapeHtml(name)+'</span>'
    + '</div>';
}

function fuViewAdCopy(id){
  var c = forUploadState.items.find(function(x){ return x.id === id; });
  if (!c || !c.ad_copy) return;
  var el = document.getElementById('fu-adcopy-text');
  var modal = document.getElementById('fu-adcopy-modal');
  if (el) el.textContent = c.ad_copy;
  if (modal) modal.style.display = 'flex';
}
function fuCloseAdCopy(){
  var modal = document.getElementById('fu-adcopy-modal');
  if (modal) modal.style.display = 'none';
}
function fuCopyAdCopy(btn){
  var txt = document.getElementById('fu-adcopy-text')?.textContent || '';
  navigator.clipboard.writeText(txt).then(function(){
    if (btn){
      var orig = btn.innerHTML;
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
      setTimeout(function(){ btn.innerHTML = orig; }, 1500);
    }
    if (typeof showNotif==='function') showNotif('Ad copy copied! ✓','success');
  });
}

function fuCopyHeadline(text){
  if (!text) return;
  navigator.clipboard.writeText(text).then(function(){
    if (typeof showNotif==='function') showNotif('Headline copied! ✓','success');
  });
}

// ═══════════════════════════════════════════════════════════
// CREATIVES UPLOAD — v7 PATCH (capsule status dropdown per row)
//
// DALAWANG BAGAY LANG ANG PAPALITAN — hindi buong file:
//
// PALIT A: Ang `renderForUpload` function (buong function)
// PALIT B: Idagdag ang bagong status-dropdown functions + CSS
//
// Hanapin sa app.js: function renderForUpload(){
// Palitan ang BUONG renderForUpload ng version sa baba.
// Tapos idagdag ang bagong functions PAGKATAPOS ng fuDelete.
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────
// PALIT A — Buong renderForUpload (may capsule status)
// ─────────────────────────────────────────
function renderForUpload(){
  var body = document.getElementById('fu-table-body');
  if (!body) return;
  var items = forUploadState.filtered;
  if (!items.length){
    body.innerHTML = '<div class="table-empty"><div class="table-empty-icon">'
      + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#6a6a75" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
      + '</div>Wala pang creatives. Click "Add creative" above!</div>';
    return;
  }
  body.innerHTML = items.map(function(c){
    var d = new Date(c.created_at);
    var dateMain = d.toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    var dateYear = d.toLocaleDateString('en-PH',{year:'numeric'});
    var dateTime = d.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'});
    var isPublished = c.status === 'Published';
    var adCopy = c.ad_copy
      ? '<button class="fu-adcopy-btn" data-id="'+c.id+'" style="cursor:pointer;color:var(--yellow);background:none;border:none;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;padding:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View</button>'
      : '<span style="color:#6a6a75">—</span>';
    var fileLink = c.file_link ? '<a href="'+c.file_link+'" target="_blank" style="color:var(--yellow);font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>Open</a>' : '<span style="color:#6a6a75">—</span>';
    var headline = c.headline
      ? '<button class="fu-headline-btn" data-headline="'+escapeHtml(c.headline)+'" title="Click to copy" style="cursor:pointer;background:none;border:none;color:#d4d4dc;font-size:11px;text-align:left;padding:0;display:inline-flex;align-items:center;gap:5px">'+escapeHtml(c.headline.substring(0,26))+(c.headline.length>26?'…':'')+'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8a95" stroke-width="2" style="flex-shrink:0"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>'
      : '<span style="color:#6a6a75">—</span>';

    // ── CAPSULE STATUS DROPDOWN ──
    var pillColor = isPublished ? '#0f2a1a' : '#2e1215';
    var pillText  = isPublished ? '#4ade80' : '#f87171';
    var pillBorder= isPublished ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)';
    var pillBg    = isPublished ? 'linear-gradient(180deg,rgba(34,197,94,0.22),rgba(34,197,94,0.12))' : 'linear-gradient(180deg,rgba(239,68,68,0.22),rgba(239,68,68,0.12))';
    var statusCell =
      '<div class="fu-status-dd" id="fu-sdd-'+c.id+'">'
      + '<button class="fu-status-pill" onclick="fuStatusToggle(\''+c.id+'\')" style="background:'+pillBg+';color:'+pillText+';border:0.5px solid '+pillBorder+'">'
      +   '<span class="fu-pill-dot" style="background:'+pillText+'"></span>'
      +   '<span>'+c.status+'</span>'
      +   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</button>'
      + '<div class="fu-status-menu">'
      +   '<div class="fu-status-opt" onclick="fuStatusPick(\''+c.id+'\',\'Unpublished\')"><span class="fu-pill-dot" style="background:#f87171"></span>Unpublished</div>'
      +   '<div class="fu-status-opt" onclick="fuStatusPick(\''+c.id+'\',\'Published\')"><span class="fu-pill-dot" style="background:#4ade80"></span>Published</div>'
      + '</div>'
      + (isPublished ? fuCountdown(c.expires_at) : '')
      + '</div>';

    return '<div class="table-row fu-row" style="grid-template-columns:1.2fr 1.5fr 0.9fr 0.7fr 0.8fr 1.4fr 1.1fr 1.3fr;align-items:center">'
      + '<div>'+fuStaffChip(c.owner_name)+'</div>'
      + '<div><div class="row-name" style="font-weight:600;color:#f4f4f7">'+escapeHtml(c.project_name||'—')+'</div></div>'
      + '<div>'+fuPageBadge(c.content_type)+'</div>'
      + '<div>'+adCopy+'</div>'
      + '<div>'+fileLink+'</div>'
      + '<div>'+headline+'</div>'
      + '<div><div style="font-size:12px;font-weight:600;color:#e8e8ec">'+dateMain+'</div><div style="font-size:9px;color:#7a7a85;margin-top:1px">'+dateYear+' · '+dateTime+'</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px">'+statusCell
      +   '<button class="fu-del-btn" data-id="'+c.id+'" style="background:none;border:none;color:#6a6a75;cursor:pointer;font-size:12px">✕</button>'
      + '</div>'
      + '</div>';
  }).join('');

  body.querySelectorAll('.fu-del-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ fuDelete(this.dataset.id); });
  });
  body.querySelectorAll('.fu-adcopy-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ fuViewAdCopy(this.dataset.id); });
  });
  body.querySelectorAll('.fu-headline-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ fuCopyHeadline(this.dataset.headline); });
  });
}

// ─────────────────────────────────────────
// PALIT B — Idagdag ITO pagkatapos ng fuDelete function
// ─────────────────────────────────────────
function fuStatusToggle(id){
  var dd = document.getElementById('fu-sdd-'+id);
  if (!dd) return;
  var wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.fu-status-dd.open').forEach(function(x){ x.classList.remove('open'); });
  if (!wasOpen) dd.classList.add('open');
}
async function fuStatusPick(id, status){
  var dd = document.getElementById('fu-sdd-'+id);
  if (dd) dd.classList.remove('open');
  await fuSetStatus(id, status);
}
// isara ang status dropdown pag nag-click sa labas
document.addEventListener('click', function(e){
  if (!e.target.closest('.fu-status-dd')) {
    document.querySelectorAll('.fu-status-dd.open').forEach(function(x){ x.classList.remove('open'); });
  }
});

async function fuDelete(id){
  if (!confirm('Delete this creative?')) return;
  await sb.from('creatives_upload').delete().eq('id', id);
  showNotif('Deleted.', 'success');
  loadForUpload();
}
