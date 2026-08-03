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
      +'<button onclick="deleteOutput(\''+o.id+'\')" style="background:none;border:none;color:var(--text4);cursor:pointer;font-size:14px;padding:2px 6px">✕</button>'
      +'</div>';
  }).join('');
}

async function addOutput(markDone){
  if(!currentProjectId)return;
  var submitBtn=document.getElementById('modal-submit-output-btn');
  var doneBtn=document.getElementById('modal-submit-done-btn');
  if(submitBtn&&submitBtn.disabled) return; // already submitting — ignore extra clicks
  var url=document.getElementById('output-url-input')?.value?.trim();
  var sheetUrl=document.getElementById('output-sheet-input')?.value?.trim()||'';
  var type=document.getElementById('output-type-select')?.value||'video';
  var notes=document.getElementById('output-notes-input')?.value?.trim()||'';
  if(!url){showNotif('Paste a URL first','error');return;}

  var submitBtnHtml=submitBtn?submitBtn.innerHTML:'';
  var doneBtnHtml=doneBtn?doneBtn.innerHTML:'';
  if(submitBtn){submitBtn.disabled=true;submitBtn.innerHTML='<span class="spinner"></span> Submitting...';}
  if(doneBtn)doneBtn.disabled=true;

  try{
    var typeLabels={video:'Video output',image:'Image output',blueprint:'Blueprint PDF',other:'File'};
    var label=typeLabels[type]||'Output';
    if(notes)label=label+' — '+notes.substring(0,30);
    var{error}=await sb.from('project_outputs').insert({
      project_id:currentProjectId,
      user_id:currentUser.id,
      url:url,type:type,label:label
    });
    if(error){showNotif('Error: '+error.message,'error');return;}
    if(sheetUrl && sheetUrl!==url){
      try{
        await sb.from('project_outputs').insert({
          project_id:currentProjectId,
          user_id:currentUser.id,
          url:sheetUrl,type:'other',
          label:'📊 Excel / Sheet'+(notes?' — '+notes.substring(0,20):'')
        });
      }catch(e){}
    }
    logActivity('OUTPUT_ADDED',label);
    // Mark done if requested — otherwise still touch updated_at so this shows
    // up in All Projects' date-filter/list as fresh activity today
    var project=allProjects.find(function(p){return p.id===currentProjectId;});
    if(markDone){
      await sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',currentProjectId);
      showNotif('Output submitted + marked Done! ✅','success');
    } else {
      await sb.from('projects').update({updated_at:new Date().toISOString()}).eq('id',currentProjectId);
      showNotif('Output added! ✓','success');
    }
    document.getElementById('output-url-input').value='';
    document.getElementById('output-sheet-input').value='';
    document.getElementById('output-notes-input').value='';
    loadOutputs(currentProjectId);
    // Auto notify client if project has client_id
    if(project?.client_id){
      await sb.from('notifications').insert({
        user_id:project.client_id,
        message:'Your project "'+project.client_name+'" has a new '+type+' output ready!',
        type:'output',
        project_id:currentProjectId,
        is_read:false
      }).then(function(){},function(){});
    }
    // Refresh lists so the completed client's details show up right away
    loadAllProjects();
    if(currentUserRole==='admin')loadDashboard();
    if(markDone){
      var statusSel=document.getElementById('modal-status-select');
      if(statusSel)statusSel.value='Approved / Done';
    }
  } catch(err){
    showNotif('Error: '+(err?.message||err),'error');
  } finally {
    if(submitBtn){submitBtn.disabled=false;submitBtn.innerHTML=submitBtnHtml;}
    if(doneBtn){doneBtn.disabled=false;doneBtn.innerHTML=doneBtnHtml;}
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
  var email=(user?.email||'').toLowerCase();
  var ADMIN_EMAILS=['admin@aicreatives.com','hazel@aicreatives.com','mheca@aicreatives.com'];
  // Check DB for actual role
  var{data}=await sb.from('profiles').select('role,name').eq('id',user.id).maybeSingle();
  if(data?.role==='client'){
    currentUserRole='client';
  } else if(data?.role==='brand_intern'){
    currentUserRole='brand_intern';
  } else if(data?.role==='admin'||ADMIN_EMAILS.indexOf(email)!==-1){
    currentUserRole='admin';
  } else {
    currentUserRole='editor';
  }
  // Update sidebar display name
  var nameEl=document.getElementById('user-name-display');
  var roleEl=document.getElementById('user-role-label');
  var roleLabel=currentUserRole==='admin'?'Super Admin':currentUserRole==='client'?'Client':currentUserRole==='brand_intern'?'Brand Intern':'Editor';
  if(nameEl)nameEl.textContent=data?.name||email;
  if(roleEl)roleEl.textContent=roleLabel;
  document.getElementById('user-email-label').textContent=email;
  document.getElementById('user-role-label').textContent=roleLabel;
  applyRoleUI();
  sb.from('profiles').select('role').eq('id',user.id).maybeSingle().then(({data})=>{
    if(data?.role&&currentUserRole!=='admin'&&ADMIN_EMAILS.indexOf(email)===-1){
      currentUserRole=data.role;
      var lbl=currentUserRole==='admin'?'Super Admin':currentUserRole==='client'?'Client':currentUserRole==='brand_intern'?'Brand Intern':'Editor';
      document.getElementById('user-role-label').textContent=lbl;
      applyRoleUI();
    }
  }).catch(()=>{});
}

// Non-admin accounts allowed to see Sales & Expenses (VAs who input sales).
// Edit this list (or ask Claude to) to add/remove people.
var FINANCE_ALLOWED_EMAILS=['hazel@aicreatives.com','mheca@aicreatives.com'];
function canAccessFinance(){
  return currentUserRole==='admin' || FINANCE_ALLOWED_EMAILS.indexOf((currentUser?.email||'').toLowerCase())>=0;
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
    var editorNavs=['nav-editor-portal','nav-all-projects','nav-chat','nav-profile','nav-worklog','nav-automation','nav-clients','nav-activity','nav-attendance','nav-for-upload','nav-extensions','nav-social','nav-brand'];
    if(canAccessFinance()) editorNavs.push('nav-finance');
    editorNavs.forEach(function(id){
      var el=document.getElementById(id);
      if(el){el.style.display='flex';el.style.setProperty('display','flex','important');}
    });
    showPage('editor-portal');

  } else if(isClient){
    // Client — most restricted
    document.querySelectorAll('.nav-item').forEach(function(el){el.style.display='none';});
    document.querySelectorAll('.admin-only').forEach(function(el){el.style.display='none';});
    var clientNavs=['nav-profile','nav-extensions'];
    clientNavs.forEach(function(id){
      var el=document.getElementById(id);
      if(el)el.style.display='flex';
    });
    showPage('client-dashboard');
    loadClientDashboard();

  } else if(currentUserRole==='brand_intern'){
    // Brand Intern — Own Brand Creatives only
    document.querySelectorAll('.nav-item').forEach(function(el){el.style.display='none';});
    document.querySelectorAll('.admin-only').forEach(function(el){el.style.display='none';});
    var internNavs=['nav-brand','nav-profile'];
    internNavs.forEach(function(id){
      var el=document.getElementById(id);
      if(el)el.style.display='flex';
    });
    showPage('brand');
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
  const titles={dashboard:'Dashboard','new-project':'New project','all-projects':'All projects','editor-portal':'My tasks',users:'Team members',analytics:'Analytics',finance:'Sales & Expenses',submission:'Client form',settings:'Settings',chat:'Team chat',profile:'My profile',clients:'Clients','client-dashboard':'My dashboard',activity:'Activity log',attendance:'Attendance',worklog:'Work log',automation:'Automation Pipeline','image-creatives':'⚡ Image Creatives',extensions:'Extensions',social:'Social Posting',brand:'Own Brand Creatives'};
  document.getElementById('topbar-title').textContent=titles[page]||page;
  var tbCenter=document.getElementById('topbar-center');
  if(tbCenter) tbCenter.style.display = (page==='image-creatives') ? 'flex' : 'none';
  if(page==='all-projects'){loadAllProjects();loadApSubmitProjectSelect();loadApOutputsTable();}
  if(page==='new-project'){loadAssignDropdown(); if(typeof npStartPolling==='function') npStartPolling(); setTimeout(function(){if(typeof fbValidateSubmit==='function')fbValidateSubmit();},500);}
  if(page==='editor-portal')loadEditorPortal();
  if(page==='users')loadUsers();
  if(page==='dashboard')loadDashboard();
  if(page==='analytics')loadAnalytics();
  if(page==='finance'){if(!canAccessFinance()){showNotif('Admin only!','error');return;}loadFinancePage();}
  if(page==='outputs'){if(currentUserRole!=='admin'){showNotif('Admin only!','error');return;}loadOutputsTable();loadMonthlyOutputSummary();}
  if(page==='clients')loadClients();
  if(page==='for-upload')loadForUpload();
  if(page==='activity')loadActivityLog();
  if(page==='attendance'){var today=new Date().toISOString().slice(0,10);var df=document.getElementById('attendance-date');if(df&&!df.value)df.value=today;loadAttendance();}
  if(page==='worklog')loadWorkLog();
  if(page==='client-dashboard')loadClientDashboard();
  if(page==='settings'){ loadConnectors(); if(currentUserRole==='admin'){loadSettings();} }
  if(page==='automation'){loadAutomationProjects();}
  if(page==='social'){loadSocial();}
  if(page==='brand'){loadBrandCreatives();}
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
// ── LIVE SUBMIT VALIDATION — dim ang button habang kulang ──
function fbValidateSubmit(){
  var btn=document.getElementById('save-details-btn');
  var hint=document.getElementById('fb-submit-hint');
  if(!btn) return;
  var isPaste=document.getElementById('tab-paste')?.classList.contains('active');
  var brief=(document.getElementById('f-brief')?.value||'').trim();
  var client=(document.getElementById('f-client')?.value||'').trim();
  var freebies=parseInt(document.getElementById('f-freebies-count')?.value,10)||0;
  // Video editor pwedeng galing sa freebies dropdown (taas) o sa main assign
  var veditor=(document.getElementById('f-freebies-veditor')?.value||'')||(document.getElementById('f-assign-to')?.value||'');
  var missing=[];
  if(isPaste){ if(!brief) missing.push('Brief'); } else { if(!client) missing.push('Client name'); }
  if(freebies<1) missing.push('Freebies count');
  if(!veditor) missing.push('Video editor');
  var ok=missing.length===0;
  btn.style.opacity=ok?'1':'0.45';
  btn.style.cursor=ok?'pointer':'not-allowed';
  if(hint){
    hint.textContent=ok?'':'Kulang pa: '+missing.join(', ');
    hint.style.display=ok?'none':'';
  }
  return ok;
}

async function saveClientDetails(){
  var btn=document.getElementById('save-details-btn');
  // ── VALIDATION GATE — kailangan kumpleto bago mag-submit ──
  var vIsPaste=document.getElementById('tab-paste').classList.contains('active');
  var vBrief=(document.getElementById('f-brief')?.value||'').trim();
  var vClient=(document.getElementById('f-client')?.value||'').trim();
  var vFreebies=parseInt(document.getElementById('f-freebies-count')?.value,10)||0;
  var vVeditor=(document.getElementById('f-freebies-veditor')?.value||'')||(document.getElementById('f-assign-to')?.value||'');
  var missing=[];
  if(vIsPaste){ if(!vBrief) missing.push('Brief'); } else { if(!vClient) missing.push('Client name'); }
  if(vFreebies<1) missing.push('Freebies count');
  if(!vVeditor) missing.push('Video editor');
  if(missing.length){
    showNotif('Kulang pa: '+missing.join(', ')+' — kumpletuhin muna bago mag-submit','error');
    return;
  }
  // Siguraduhin naka-sync ang main assign field para tama ang assigned_to
  var vSync=document.getElementById('f-assign-to');
  if(vSync && vVeditor){ vSync.value=vVeditor; }
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Saving...';}
  var isPaste=document.getElementById('tab-paste').classList.contains('active');
  var clientName='';
  var product='',emphasize='',script='';
  if(isPaste){
    var brief=document.getElementById('f-brief').value.trim();
    if(!brief){showNotif('Paste client brief first','error');if(btn){btn.disabled=false;btn.innerHTML=FB_SAVE_LABEL;}return;}
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
    if(!clientName){showNotif('Client name required','error');if(btn){btn.disabled=false;btn.innerHTML=FB_SAVE_LABEL;}return;}
    product=document.getElementById('f-product')?.value?.trim()||'';
    emphasize=document.getElementById('f-emphasize')?.value||'';
    script=document.getElementById('f-script')?.value||'';
  }
  var{data,error}=await sb.from('projects').insert({
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
    duration:document.getElementById('f-duration')?.value||'',
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
  }).select();
  if(btn){btn.disabled=false;btn.innerHTML=FB_SAVE_LABEL;}
  if(error){showNotif('Error: '+error.message,'error');return;}
  showNotif('Client saved! Nakalista na sa All Projects.','success');
  // ── HISTORY LOG — kasama ang freebies count + video editor ──
  var logFreebies=parseInt(document.getElementById('f-freebies-count')?.value,10)||0;
  var logVeditorName=(document.getElementById('fb-veditor-label')?.textContent||'').trim();
  if(logVeditorName==='Unassigned') logVeditorName='';
  var logDetails=clientName+' — '+logFreebies+' freebies'+(logVeditorName?(' | Editor: '+logVeditorName):'');
  logActivity('CLIENT_SAVED',logDetails);
  if (typeof fbCreateForUploadRow === 'function') { await fbCreateForUploadRow(data && data[0] && data[0].id, clientName); fbResetForm(); }
  var videoEditorId=document.getElementById('f-assign-to')?.value||'';
  if(videoEditorId){ await notifyEditorAssigned(videoEditorId, clientName); }
  // Clear form
  ['f-client','f-biztype','f-product','f-pain','f-usp','f-audience','f-goal','f-emphasize','f-brief','f-script','f-fb','f-website','f-color1','f-color2','f-gdrive','f-moodboard','f-sample-video','f-client-extra'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var fa=document.getElementById('f-assign-to'); if(fa) fa.value='';
  selectedToneVal='';
  document.querySelectorAll('.tone-opt').forEach(function(t){t.classList.remove('selected');});
  if(typeof fbValidateSubmit==='function') fbValidateSubmit();
  showPage('all-projects');
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
  var dashDf=document.getElementById('dash-date-from')?.value||'';
  var dashDt=document.getElementById('dash-date-to')?.value||'';
  var recentList=allProjects;
  if(dashDf||dashDt){
    recentList=allProjects.filter(function(p){
      var activityDate=p.updated_at||p.created_at;
      var matchDF=!dashDf||new Date(activityDate)>=new Date(dashDf+'T00:00:00');
      var matchDT=!dashDt||new Date(activityDate)<=new Date(dashDt+'T23:59:59');
      return matchDF&&matchDT;
    });
  } else {
    recentList=allProjects.slice(0,10);
  }
  document.getElementById('recent-projects-body').innerHTML=recentList.map(p=>`
    <div class="table-row projects-cols" onclick="openModal('${p.id}')">
      <div><div class="row-name">${p.client_name}</div><div class="row-sub">${p.video_size||''} · ${p.language||''} · ${p.goal||''} ${getDeadlineStatus(p.deadline)}</div></div>
      <div class="row-meta">${p.business_type||'—'}</div>
      <div>${statusBadge(p.status)}</div>
      <div class="row-date">${fmtDate(p.updated_at||p.created_at)}</div>
    </div>`).join('')||'<div class="table-empty"><div class="table-empty-icon">📋</div><div>No projects yet</div><div style="font-size:11px;margin-top:6px;color:var(--text3)">Click + New project to get started</div></div>';
}


// ══════════════════════════════════════════════
// SKELETON LOADERS + EMPTY STATE ILLUSTRATIONS
// ══════════════════════════════════════════════
function skelRows(containerId, count){
  var box=document.getElementById(containerId);
  if(!box) return;
  var widths=['18%','30%','14%','12%','10%','16%'];
  var row='<div class="skel-row">'+widths.map(function(w){return '<div class="skel-bar" style="width:'+w+'"></div>';}).join('')+'</div>';
  box.innerHTML=row.repeat(count||4);
}
function skelCards(containerId, count){
  var box=document.getElementById(containerId);
  if(!box) return;
  var card='<div class="skel-card"><div class="skel-bar" style="width:55%;height:12px"></div><div class="skel-bar" style="width:35%;height:9px"></div></div>';
  box.innerHTML=card.repeat(count||3);
}
function emptyState(iconSvg, title, sub){
  return '<div class="empty-state"><div class="empty-state-icon">'+iconSvg+'</div>'
    + '<div class="empty-state-title">'+escapeHtml(title)+'</div>'
    + (sub?'<div class="empty-state-sub">'+escapeHtml(sub)+'</div>':'')
    + '</div>';
}
var ICO_INBOX='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>';
var ICO_MEGAPHONE='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/></svg>';
var ICO_SEND='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

// ══════════════════════════════════════════════
// FREEBIES ASSIGNMENT — New project → For Upload
// ══════════════════════════════════════════════
var fbEditors = [];

function fbInitials(name){
  var p = String(name||'').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p.length === 1 ? p[0].slice(0,2) : p[0][0] + p[1][0]).toUpperCase();
}

function fbStep(delta){
  var el = document.getElementById('f-freebies-count');
  if (!el) return;
  var v = Math.max(0, Math.min(99, (parseInt(el.value,10) || 0) + delta));
  el.value = v;
  el.classList.remove('fb-bump'); void el.offsetWidth; el.classList.add('fb-bump');
  fbSyncSummary();
}

function fbDdToggle(id){
  var dd = document.getElementById(id);
  if (!dd) return;
  var wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.fb-dd.open').forEach(function(d){ d.classList.remove('open'); });
  if (!wasOpen) dd.classList.add('open');
}

document.addEventListener('click', function(e){
  if (!e.target.closest || !e.target.closest('.fb-dd')) {
    document.querySelectorAll('.fb-dd.open').forEach(function(d){ d.classList.remove('open'); });
  }
});

function fbPickDest(dest, color, el){
  var dd = document.getElementById('fb-dd-dest');
  if (dd){
    dd.querySelectorAll('.fb-dd-item').forEach(function(x){ x.classList.remove('active'); });
    if (el) el.classList.add('active');
    dd.classList.remove('open');
  }
  var lbl = document.getElementById('fb-dest-label');
  var dot = document.getElementById('fb-dest-dot');
  var h = document.getElementById('f-freebies-dest');
  if (lbl) lbl.textContent = dest;
  if (dot) dot.style.background = color;
  if (h) h.value = dest;
  fbSyncSummary();
}

function fbPickEditor(id, name, el){
  var dd = document.getElementById('fb-dd-editor');
  if (dd){
    dd.querySelectorAll('.fb-dd-item').forEach(function(x){ x.classList.remove('active'); });
    if (el) el.classList.add('active');
    dd.classList.remove('open');
  }
  var lbl = document.getElementById('fb-editor-label');
  var av = document.getElementById('fb-editor-av');
  var h = document.getElementById('f-freebies-editor');
  if (lbl) lbl.textContent = name || 'Walang assign';
  if (h) h.value = id || '';
  if (av){
    av.innerHTML = id
      ? escapeHtml(fbInitials(name))
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  }
  // Kung may napiling editor pero 0 pa rin ang freebies count, i-set sa 1
  // para siguradong may magagawang task — hindi maiiwan na parang walang assignment.
  var countEl = document.getElementById('f-freebies-count');
  if (id && countEl && (parseInt(countEl.value,10)||0) <= 0){
    countEl.value = 1;
    countEl.classList.remove('fb-bump'); void countEl.offsetWidth; countEl.classList.add('fb-bump');
  }
  fbSyncSummary();
}

async function fbLoadEditors(){
  var menu = document.getElementById('fb-editor-menu');
  if (!menu) return;
  var res = await sb.from('profiles').select('id,name,email').eq('role','editor').order('name');
  fbEditors = res.data || [];
  var html = '<div class="fb-dd-item active" onclick="fbPickEditor(\'\',\'\',this)">'
    + '<span class="fb-av"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>Walang assign</div>';
  html += fbEditors.map(function(e){
    var nm = e.name || e.email || 'Editor';
    return '<div class="fb-dd-item" onclick="fbPickEditor(\''+e.id+'\',\''+escapeHtml(nm).replace(/'/g,"\\'")+'\',this)">'
      + '<span class="fb-av">'+escapeHtml(fbInitials(nm))+'</span>'+escapeHtml(nm)+'</div>';
  }).join('');
  if (!fbEditors.length) html += '<div class="fb-dd-empty">Walang editor na naka-register</div>';
  menu.innerHTML = html;

  // DEFAULT: auto-pick Romulo bilang Image creator + set count to 30
  // (default lang — pwede pa ring palitan kada project)
  var hEd = document.getElementById('f-freebies-editor');
  var cnt = document.getElementById('f-freebies-count');
  if (hEd && !hEd.value){
    var romulo = fbEditors.find(function(e){
      var nm = (e.name || e.email || '').toLowerCase();
      return nm.indexOf('romulo') >= 0;
    });
    if (romulo){
      var nm = romulo.name || romulo.email;
      var lbl = document.getElementById('fb-editor-label');
      var av = document.getElementById('fb-editor-av');
      if (lbl) lbl.textContent = nm;
      if (av) av.innerHTML = escapeHtml(fbInitials(nm));
      hEd.value = romulo.id;
      // i-highlight ang tamang item sa menu
      menu.querySelectorAll('.fb-dd-item').forEach(function(x){
        x.classList.toggle('active', x.textContent.trim() === nm);
      });
    }
  }
  if (cnt && (parseInt(cnt.value,10) || 0) === 0){ cnt.value = 30; }

  // Populate din ang Video editor menu (same editors list)
  var vmenu = document.getElementById('fb-veditor-menu');
  if (vmenu){
    var vhtml = '<div class="fb-dd-item active" onclick="fbPickVEditor(\'\',\'\',this)">'
      + '<span class="fb-av"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>Walang assign</div>';
    vhtml += fbEditors.map(function(e){
      var nm = e.name || e.email || 'Editor';
      return '<div class="fb-dd-item" onclick="fbPickVEditor(\''+e.id+'\',\''+escapeHtml(nm).replace(/'/g,"\\'")+'\',this)">'
        + '<span class="fb-av">'+escapeHtml(fbInitials(nm))+'</span>'+escapeHtml(nm)+'</div>';
    }).join('');
    if (!fbEditors.length) vhtml += '<div class="fb-dd-empty">Walang editor na naka-register</div>';
    vmenu.innerHTML = vhtml;
  }
}

function fbPickVEditor(id, name, el){
  var dd = document.getElementById('fb-dd-veditor');
  if (dd){
    dd.querySelectorAll('.fb-dd-item').forEach(function(x){ x.classList.remove('active'); });
    if (el) el.classList.add('active');
    dd.classList.remove('open');
  }
  var lbl = document.getElementById('fb-veditor-label');
  var av = document.getElementById('fb-veditor-av');
  var h = document.getElementById('f-freebies-veditor');
  if (lbl) lbl.textContent = name || 'Unassigned';
  if (h) h.value = id || '';
  if (av){
    av.innerHTML = id ? escapeHtml(fbInitials(name))
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  }
  // I-sync sa main Video editor assign dropdown para talagang ma-assign ang project
  var mainSel = document.getElementById('f-assign-to');
  if (mainSel){ mainSel.value = id || ''; }
  if(typeof fbValidateSubmit==='function') fbValidateSubmit();
}

function fbSyncSummary(){
  var n = parseInt(document.getElementById('f-freebies-count')?.value, 10) || 0;
  var dest = document.getElementById('f-freebies-dest')?.value || '';
  var editorId = document.getElementById('f-freebies-editor')?.value || '';
  var box = document.getElementById('fb-summary');
  var txt = document.getElementById('fb-summary-text');
  if (!box || !txt) return;

  if (n <= 0){
    box.classList.remove('fb-on');
    txt.textContent = 'Set ka ng bilang para makagawa ng freebies row sa For Upload.';
    return;
  }
  var ed = fbEditors.find(function(e){ return e.id === editorId; });
  var who = ed ? (ed.name || ed.email) : null;
  box.classList.add('fb-on');
  txt.innerHTML = 'Gagawa ng <b style="color:#facc15">1 row</b> na may <b style="color:#facc15">'
    + n + ' freebies</b> sa <b style="color:#b9a5fc">' + escapeHtml(dest) + '</b>'
    + (who ? ', naka-assign kay <b style="color:#f2f0ea">' + escapeHtml(who) + '</b>' : ', walang assigned editor');
}

// Gumawa/mag-update ng freebies row sa For Upload (tinatawag ng save + generate)
async function fbCreateForUploadRow(projectId, clientName){
  var n = parseInt(document.getElementById('f-freebies-count')?.value, 10) || 0;
  var editorId = document.getElementById('f-freebies-editor')?.value || null;
  // Kung may napiling Image creator pero 0 ang bilang, huwag hayaang mawala
  // ang assignment nang tahimik — i-set sa 1 para may talagang magagawang task.
  if (editorId && n <= 0) n = 1;
  if (n <= 0) return;
  var dest = document.getElementById('f-freebies-dest')?.value || 'Viral clients freebies images';
  var label = (clientName || 'Freebies') + ' — ' + n + ' freebies';

  // Kunin ang pangalan ng napiling editor (owner_name ang gamit ng table)
  var ed = fbEditors.find(function(e){ return e.id === editorId; });
  var ownerId = editorId || currentUser?.id || null;
  var ownerName = ed ? (ed.name || ed.email) : (currentUser?.email || 'Unknown');
  if (!ed && currentUser?.id){
    try {
      var pr = await sb.from('profiles').select('name').eq('id', currentUser.id).maybeSingle();
      if (pr?.data?.name) ownerName = pr.data.name;
    } catch(e){}
  }

  var payload = {
    owner_id: ownerId,
    owner_name: ownerName,
    project_name: label,
    client_name: clientName || null,
    gender: 'All',
    content_type: 'VIRAL UGC',
    category: dest,
    freebies_count: n,
    is_freebies: true,
    is_direct_client: false,
    project_id: projectId || null,
    status: 'Unpublished'
  };

  try {
    var existing = null;
    if (projectId){
      var q = await sb.from('creatives_upload').select('id').eq('project_id', projectId).eq('is_freebies', true).limit(1);
      existing = (q.data || [])[0] || null;
    }
    var res;
    if (existing){
      res = await sb.from('creatives_upload').update(payload).eq('id', existing.id);
    } else {
      res = await sb.from('creatives_upload').insert(payload);
    }
    if (res && res.error) throw res.error;
    showNotif(n + ' freebies naipasa sa ' + dest, 'success');
    if (ownerId){
      await sb.from('notifications').insert({
        user_id: ownerId,
        message: 'You\'ve been assigned '+n+' freebies for "'+(clientName||'a client')+'" — check For Upload ('+dest+')!',
        type: 'assignment',
        is_read: false
      }).then(function(){},function(){});
    }
  } catch(err){
    console.error('freebies row error', err);
    showNotif('Hindi nagawa ang freebies row: ' + (err.message || err.hint || err), 'error');
  }
}

function fbResetForm(){
  var c = document.getElementById('f-freebies-count'); if (c) c.value = 0;
  var h = document.getElementById('f-freebies-editor'); if (h) h.value = '';
  var lbl = document.getElementById('fb-editor-label'); if (lbl) lbl.textContent = 'Walang assign';
  var av = document.getElementById('fb-editor-av');
  if (av) av.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  var menu = document.getElementById('fb-editor-menu');
  if (menu) menu.querySelectorAll('.fb-dd-item').forEach(function(x,i){ x.classList.toggle('active', i===0); });
  fbSyncSummary();
}

// ══════════════════════════════════════════════════════════
// ORDERS INBOX — auto-synced orders galing sa VIRAL ORDER FORM
// Right panel sa New Project. Auto-refresh, expand, confirm-fill,
// In progress badge, at done animation pag na-submit.
// ══════════════════════════════════════════════════════════
var npOrders = [];
var npOpenId = null;
var npPollTimer = null;

async function npLoadOrders(){
  var list = document.getElementById('npo-list');
  if (!list) return;
  try {
    var res = await sb.from('synced_orders')
      .select('*')
      .in('status', ['new','inprogress'])
      .order('created_at', { ascending:false })
      .limit(300);
    var raw = res.data || [];
    // Itago ang mga junk/incomplete rows — dapat may client name AT
    // kahit isang tunay na detalye (goal/voice/video type)
    npOrders = raw.filter(function(o){
      var name = (o.client_name || '').trim();
      var hasName = name && name.toLowerCase() !== 'walang pangalan';
      var hasDetail = (o.goal || o.voice || o.video_type || o.language || o.video_size || '').trim();
      return hasName && hasDetail;
    });
  } catch(e){ npOrders = []; }
  npRenderOrders();
}

function npFmtDate(ts){
  if (!ts) return '';
  var d = new Date(ts);
  if (isNaN(d)) return String(ts);
  return d.toLocaleDateString('en-PH',{month:'short',day:'numeric'}) + ' · ' +
         d.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'});
}

function npRenderOrders(){
  var list = document.getElementById('npo-list');
  var cnt = document.getElementById('npo-count');
  if (!list) return;
  if (cnt) cnt.textContent = npOrders.length;
  if (!npOrders.length){
    list.innerHTML = '<div class="npo-empty">'
      + '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.5A2 2 0 0016.76 4H7.24a2 2 0 00-1.74 1.5z"/></svg>'
      + '<div style="font-size:14px;font-weight:600;color:var(--text2)">Walang bagong order</div>'
      + '<div style="font-size:12px;margin-top:5px;max-width:230px;line-height:1.6">Auto-lalabas dito ang orders galing sa order form.</div>'
      + '</div>';
    return;
  }
  list.innerHTML = npOrders.map(function(o){
    var isOpen = o.id === npOpenId;
    var inprog = o.status === 'inprogress';
    var rows = [
      ['Goal', o.goal], ['Voice', o.voice], ['Language', o.language],
      ['Size', o.video_size], ['Type', o.video_type], ['Contact', o.contact]
    ].filter(function(r){ return r[1]; }).map(function(r){
      return '<div class="npo-row"><span class="npo-k">'+r[0]+'</span><span class="npo-v">'+escapeHtml(r[1])+'</span></div>';
    }).join('');
    return '<div class="npo-card '+(isOpen?'open':'')+' '+(inprog?'inprog':'')+'" id="npo-card-'+o.id+'" onclick="npToggle(\''+o.id+'\')">'
      + '<div class="npo-cardhead">'
        + '<div class="npo-cardtop">'
          + '<span class="npo-name"><span class="npo-dot"></span>'+escapeHtml(o.client_name||'Walang pangalan')
            + '<span class="npo-check"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span></span>'
          + '<svg class="npo-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
        + '</div>'
        + '<div class="npo-meta"><span class="npo-date">'+npFmtDate(o.order_ts||o.created_at)+'</span>'
          + (inprog?'<span class="npo-badge"><span class="npo-spin"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M21 12a9 9 0 11-6.2-8.5"/></svg></span>In progress</span>':'')
        + '</div>'
      + '</div>'
      + '<div class="npo-body">'
        + '<div class="npo-fields">'+rows+'</div>'
        + '<div class="npo-actions">'
          + (inprog
              ? '<button class="yellow-btn npo-fill" onclick="event.stopPropagation();npSubmit(\''+o.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Submit as project</button>'
              : '<button class="yellow-btn npo-fill" onclick="event.stopPropagation();npFill(\''+o.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Confirm &amp; fill</button>')
          + '<button class="ghost-btn" onclick="event.stopPropagation();npDismiss(\''+o.id+'\')" style="padding:9px 12px" aria-label="Dismiss"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
        + '</div>'
      + '</div>'
    + '</div>';
  }).join('');
}

function npToggle(id){ npOpenId = npOpenId === id ? null : id; npRenderOrders(); }

// Buuin ang formatted brief text mula sa order
function npBuildBrief(o){
  var lines = [];
  if (o.client_name) lines.push('Client Name: ' + o.client_name);
  if (o.fb_page) lines.push('FB Page: ' + o.fb_page);
  if (o.goal) lines.push('Goal: ' + o.goal);
  if (o.voice) lines.push('Voice Actor/Avatar: ' + o.voice);
  if (o.language) lines.push('Language: ' + o.language);
  if (o.video_size) lines.push('Video Size: ' + o.video_size);
  if (o.video_type) lines.push('Video Type: ' + o.video_type);
  if (o.avatar_details) lines.push('Model/Avatar: ' + o.avatar_details);
  if (o.emphasize) lines.push('Emphasize: ' + o.emphasize);
  if (o.tone) lines.push('Tone: ' + o.tone);
  if (o.attire) lines.push('Attire/Requests: ' + o.attire);
  if (o.outfit) lines.push('Outfit: ' + o.outfit);
  if (o.raw_materials) lines.push('Raw Materials: ' + o.raw_materials);
  if (o.contact) lines.push('Contact: ' + o.contact);
  return lines.join('\n');
}

// Confirm & fill → papasok sa brief textbox + mark In progress (nananatili sa list)
async function npFill(id){
  var o = npOrders.find(function(x){ return x.id === id; });
  if (!o) return;
  // Lumipat sa Paste tab tapos i-fill ang textarea
  if (typeof switchTab === 'function') switchTab('paste');
  var ta = document.getElementById('f-brief');
  if (ta){ ta.value = npBuildBrief(o); ta.dispatchEvent(new Event('input')); }
  var cli = document.getElementById('f-client');
  if (cli && o.client_name && !cli.value) cli.value = o.client_name;
  // Mark as inprogress sa DB + local
  o.status = 'inprogress';
  try { await sb.from('synced_orders').update({ status:'inprogress' }).eq('id', id); } catch(e){}
  npRenderOrders();
  if (typeof showNotif === 'function') showNotif('Nailagay sa brief — I-submit na para maging project', 'success');
}

// Submit as project → done animation → mawawala sa list
async function npSubmit(id){
  var o = npOrders.find(function(x){ return x.id === id; });
  if (!o) return;
  var card = document.getElementById('npo-card-'+id);
  // I-save muna bilang project (gamit ang existing saveProject kung meron)
  var projectId = null;
  try {
    var ins = await sb.from('projects').insert({
      client_name: o.client_name || 'Order',
      status: 'New Input',
      assigned_to: currentUser ? currentUser.id : null
    }).select().maybeSingle();
    if (ins && ins.data) projectId = ins.data.id;
  } catch(e){}
  try {
    await sb.from('synced_orders').update({ status:'done', project_id: projectId }).eq('id', id);
  } catch(e){}
  if (typeof logActivity === 'function') logActivity('ORDER_SUBMITTED', o.client_name || '');
  // Done animation → tanggalin sa list
  if (card){
    card.classList.remove('open');
    card.classList.add('done');
    setTimeout(function(){
      npOrders = npOrders.filter(function(x){ return x.id !== id; });
      npOpenId = null;
      npRenderOrders();
      if (typeof loadAllProjects === 'function') loadAllProjects();
    }, 1650);
  } else {
    npOrders = npOrders.filter(function(x){ return x.id !== id; });
    npRenderOrders();
  }
  if (typeof showNotif === 'function') showNotif('Project created from order ✓', 'success');
}

async function npDismiss(id){
  try { await sb.from('synced_orders').update({ status:'dismissed' }).eq('id', id); } catch(e){}
  npOrders = npOrders.filter(function(x){ return x.id !== id; });
  if (npOpenId === id) npOpenId = null;
  npRenderOrders();
}

// 24/7 feel: mag-poll kada 20s habang nasa New Project page
function npStartPolling(){
  npLoadOrders();
  if (npPollTimer) clearInterval(npPollTimer);
  npPollTimer = setInterval(function(){
    var pg = document.getElementById('page-new-project');
    if (pg && pg.classList.contains('active')) npLoadOrders();
  }, 20000);
}

async function loadAssignDropdown(){
  var sel=document.getElementById('f-assign-to');
  if(!sel)return;
  var{data}=await sb.from('profiles').select('id,name,email').eq('role','editor').order('name');
  sel.innerHTML='<option value="">Unassigned (assign later)</option>'+(data||[]).map(function(e){
    return '<option value="'+e.id+'">'+(e.name||e.email)+'</option>';
  }).join('');
  if (typeof fbLoadEditors === 'function') { await fbLoadEditors(); fbSyncSummary(); }
}
// ALL PROJECTS
async function loadAllProjects(){
  const{data}=await sb.from('projects').select('*').order('created_at',{ascending:false});
  allProjects=data||[];
  var df=document.getElementById('proj-date-from');
  var dt=document.getElementById('proj-date-to');
  if(df && dt && !df.value && !dt.value){
    var monthPill=document.querySelector('.proj-preset-pill[onclick*="\'month\'"]');
    projDatePreset('month',monthPill);
  } else {
    renderProjectsTable(allProjects);
    updateProjRangeLabel();
  }
}

function projFmtDate(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function computeDatePresetRange(kind){
  var now=new Date();
  var nDaysMatch=/^(\d+)d$/.exec(kind);
  if(kind==='today'){
    return{from:projFmtDate(now),to:projFmtDate(now)};
  } else if(kind==='yesterday'){
    var y=new Date(now); y.setDate(now.getDate()-1);
    return{from:projFmtDate(y),to:projFmtDate(y)};
  } else if(nDaysMatch){
    var n=parseInt(nDaysMatch[1],10);
    var start=new Date(now); start.setDate(now.getDate()-(n-1));
    return{from:projFmtDate(start),to:projFmtDate(now)};
  } else if(kind==='month'){
    var start2=new Date(now.getFullYear(),now.getMonth(),1);
    var end2=new Date(now.getFullYear(),now.getMonth()+1,0);
    return{from:projFmtDate(start2),to:projFmtDate(end2)};
  } else if(kind==='lastmonth'){
    var start3=new Date(now.getFullYear(),now.getMonth()-1,1);
    var end3=new Date(now.getFullYear(),now.getMonth(),0);
    return{from:projFmtDate(start3),to:projFmtDate(end3)};
  }
  return{from:'',to:''};
}

function projDatePreset(kind,btnEl){
  var df=document.getElementById('proj-date-from');
  var dt=document.getElementById('proj-date-to');
  if(!df||!dt) return;
  var range=computeDatePresetRange(kind);
  df.value=range.from; dt.value=range.to;
  document.querySelectorAll('#proj-date-presets .proj-preset-pill').forEach(function(p){ p.classList.remove('active'); });
  if(btnEl) btnEl.classList.add('active');
  updateProjRangeLabel();
  filterProjects();
}

function outputsDatePreset(kind,btnEl){
  var df=document.getElementById('outputs-date-from');
  var dt=document.getElementById('outputs-date-to');
  if(!df||!dt) return;
  var range=computeDatePresetRange(kind);
  df.value=range.from; dt.value=range.to;
  document.querySelectorAll('#outputs-date-presets .proj-preset-pill').forEach(function(p){ p.classList.remove('active'); });
  if(btnEl) btnEl.classList.add('active');
  updateOutputsRangeLabel();
  loadOutputsTable();
}

function dashDatePreset(kind,btnEl){
  var df=document.getElementById('dash-date-from');
  var dt=document.getElementById('dash-date-to');
  if(!df||!dt) return;
  var range=computeDatePresetRange(kind);
  df.value=range.from; dt.value=range.to;
  document.querySelectorAll('#dash-date-presets .proj-preset-pill').forEach(function(p){ p.classList.remove('active'); });
  if(btnEl) btnEl.classList.add('active');
  updateDashRangeLabel();
  loadDashboard();
}

function clearDashboardFilters(){
  document.getElementById('dash-date-from').value='';
  document.getElementById('dash-date-to').value='';
  document.querySelectorAll('#dash-date-presets .proj-preset-pill').forEach(function(p){ p.classList.remove('active'); });
  var allPill=document.querySelector('#dash-date-presets .proj-preset-pill[onclick*="\'all\'"]');
  if(allPill) allPill.classList.add('active');
  updateDashRangeLabel();
  loadDashboard();
}

function finDatePreset(kind,btnEl){
  var df=document.getElementById('fin-date-from');
  var dt=document.getElementById('fin-date-to');
  if(!df||!dt) return;
  var range=computeDatePresetRange(kind);
  df.value=range.from; dt.value=range.to;
  document.querySelectorAll('#fin-date-presets .proj-preset-pill').forEach(function(p){ p.classList.remove('active'); });
  if(btnEl) btnEl.classList.add('active');
  updateFinRangeLabel();
  loadFinancePage();
}

function updateRangeLabel(fromId,toId,labelId){
  var df=document.getElementById(fromId)?.value||'';
  var dt=document.getElementById(toId)?.value||'';
  var el=document.getElementById(labelId);
  if(!el) return;
  if(!df&&!dt){ el.textContent='All time'; return; }
  var from=df||dt, to=dt||df;
  var days=Math.round((new Date(to+'T00:00:00')-new Date(from+'T00:00:00'))/86400000)+1;
  var fmt=function(s){ var d=new Date(s+'T00:00:00'); return d.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}); };
  el.textContent=(from===to?fmt(from):fmt(from)+' → '+fmt(to))+' ('+days+'d)';
}

function updateProjRangeLabel(){
  updateRangeLabel('proj-date-from','proj-date-to','proj-range-label');
}

function updateOutputsRangeLabel(){
  updateRangeLabel('outputs-date-from','outputs-date-to','outputs-range-label');
}

function updateDashRangeLabel(){
  updateRangeLabel('dash-date-from','dash-date-to','dash-range-label');
}

function updateFinRangeLabel(){
  updateRangeLabel('fin-date-from','fin-date-to','fin-range-label');
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
    var activityDate=p.updated_at||p.created_at;
    var matchDF=!df||new Date(activityDate)>=new Date(df+'T00:00:00');
    var matchDT=!dt||new Date(activityDate)<=new Date(dt+'T23:59:59');
    return matchQ&&matchS&&matchP&&matchDF&&matchDT;
  }));
  if(document.getElementById('ap-outputs-body'))loadApOutputsTable();
}

function clearProjectFilters(){
  ['search-projects','proj-date-from','proj-date-to'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('filter-status').value='';
  document.getElementById('filter-priority').value='';
  document.querySelectorAll('#proj-date-presets .proj-preset-pill').forEach(function(p){ p.classList.remove('active'); });
  var allPill=document.querySelector('#proj-date-presets .proj-preset-pill[onclick*="\'all\'"]');
  if(allPill) allPill.classList.add('active');
  updateProjRangeLabel();
  filterProjects();
}

// ═══════════════════════════════════════
// CUSTOM DATE RANGE MODAL (calendar picker)
// Shared by All Projects and Outputs pages — DR_TARGETS keys which
// inputs/label/preset-group/reload-fn to use for each context.
// ═══════════════════════════════════════
var drState={left:{y:0,m:0},right:{y:0,m:0},from:null,to:null,target:'projects'};
var DR_MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
var DR_TARGETS={
  projects:{from:'proj-date-from',to:'proj-date-to',label:'proj-range-label',customPill:'proj-preset-custom',presetSelector:'#proj-date-presets .proj-preset-pill',reload:function(){filterProjects();}},
  outputs:{from:'outputs-date-from',to:'outputs-date-to',label:'outputs-range-label',customPill:'outputs-preset-custom',presetSelector:'#outputs-date-presets .proj-preset-pill',reload:function(){loadOutputsTable();}},
  dashboard:{from:'dash-date-from',to:'dash-date-to',label:'dash-range-label',customPill:'dash-preset-custom',presetSelector:'#dash-date-presets .proj-preset-pill',reload:function(){loadDashboard();}},
  finance:{from:'fin-date-from',to:'fin-date-to',label:'fin-range-label',customPill:'fin-preset-custom',presetSelector:'#fin-date-presets .proj-preset-pill',reload:function(){loadFinancePage();}}
};

function openDateRangeModal(target){
  drState.target=target||'projects';
  var cfg=DR_TARGETS[drState.target];
  var df=document.getElementById(cfg.from)?.value||'';
  var dt=document.getElementById(cfg.to)?.value||'';
  var base=df?new Date(df+'T00:00:00'):new Date();
  drState.from=df||null;
  drState.to=dt||null;
  drState.left={y:base.getFullYear(),m:base.getMonth()};
  var rb=new Date(drState.left.y,drState.left.m+1,1);
  drState.right={y:rb.getFullYear(),m:rb.getMonth()};
  var yr=new Date().getFullYear();
  ['q1','q2','q3','q4'].forEach(function(q,i){
    var b=document.getElementById('dr-'+q+'-btn');
    if(b) b.textContent=q.toUpperCase()+' '+yr;
  });
  renderDrAll();
  document.getElementById('daterange-modal').classList.add('open');
}

function closeDateRangeModal(){
  document.getElementById('daterange-modal').classList.remove('open');
}

function drNavMonth(delta){
  function shift(o){ var d=new Date(o.y,o.m+delta,1); o.y=d.getFullYear(); o.m=d.getMonth(); }
  shift(drState.left); shift(drState.right);
  renderDrAll();
}

function drSetMonth(which,val){ drState[which].m=parseInt(val,10); renderDrAll(); }
function drSetYear(which,val){ drState[which].y=parseInt(val,10); renderDrAll(); }

function drYearOptions(selectedY){
  var nowY=new Date().getFullYear();
  var opts='';
  for(var y=nowY-4;y<=nowY+1;y++){
    opts+='<option value="'+y+'" '+(y===selectedY?'selected':'')+'>'+y+'</option>';
  }
  return opts;
}

function drPickDay(dateStr){
  if(!drState.from||(drState.from&&drState.to)){
    drState.from=dateStr; drState.to=null;
  } else if(dateStr<drState.from){
    drState.to=drState.from; drState.from=dateStr;
  } else {
    drState.to=dateStr;
  }
  renderDrAll();
}

function drQuickSelect(kind){
  var now=new Date();
  var y=now.getFullYear();
  var from,to;
  if(kind==='thisyear'){ from=y+'-01-01'; to=projFmtDate(now); }
  else if(kind==='lastyear'){ from=(y-1)+'-01-01'; to=(y-1)+'-12-31'; }
  else if(kind==='2years'){ from=(y-2)+'-01-01'; to=projFmtDate(now); }
  else if(kind==='last6m'){ var d=new Date(now); d.setMonth(d.getMonth()-6); from=projFmtDate(d); to=projFmtDate(now); }
  else if(kind==='q1'){ from=y+'-01-01'; to=y+'-03-31'; }
  else if(kind==='q2'){ from=y+'-04-01'; to=y+'-06-30'; }
  else if(kind==='q3'){ from=y+'-07-01'; to=y+'-09-30'; }
  else if(kind==='q4'){ from=y+'-10-01'; to=y+'-12-31'; }
  else return;
  drState.from=from; drState.to=to;
  var base=new Date(from+'T00:00:00');
  drState.left={y:base.getFullYear(),m:base.getMonth()};
  var rb=new Date(drState.left.y,drState.left.m+1,1);
  drState.right={y:rb.getFullYear(),m:rb.getMonth()};
  renderDrAll();
}

function renderDrCalendar(containerId,y,m,side){
  var dows=['Su','Mo','Tu','We','Th','Fr','Sa'];
  var first=new Date(y,m,1).getDay();
  var days=new Date(y,m+1,0).getDate();
  var navLeft=side==='left'?'<button type="button" class="dr-cal-nav" onclick="drNavMonth(-1)">‹</button>':'<span class="dr-cal-nav dr-cal-nav-spacer">‹</span>';
  var navRight=side==='right'?'<button type="button" class="dr-cal-nav" onclick="drNavMonth(1)">›</button>':'<span class="dr-cal-nav dr-cal-nav-spacer">›</span>';
  var html='<div class="dr-cal-head">'+navLeft
    +'<select class="dr-cal-select" onchange="drSetMonth(\''+side+'\',this.value)">'
    +DR_MONTH_NAMES.map(function(mn,i){ return '<option value="'+i+'" '+(i===m?'selected':'')+'>'+mn+'</option>'; }).join('')
    +'</select>'
    +'<select class="dr-cal-select" onchange="drSetYear(\''+side+'\',this.value)">'+drYearOptions(y)+'</select>'
    +navRight+'</div>';
  html+='<div class="dr-cal-grid">'+dows.map(function(dw){ return '<div class="dr-cal-dow">'+dw+'</div>'; }).join('');
  for(var i=0;i<first;i++) html+='<div class="dr-cal-day other-month"></div>';
  for(var d=1;d<=days;d++){
    var dateStr=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var cls='dr-cal-day';
    if(drState.from&&dateStr===drState.from) cls+=' range-start';
    if(drState.to&&dateStr===drState.to) cls+=' range-end';
    if(drState.from&&drState.to&&dateStr>drState.from&&dateStr<drState.to) cls+=' in-range';
    html+='<div class="'+cls+'" onclick="drPickDay(\''+dateStr+'\')">'+d+'</div>';
  }
  html+='</div>';
  document.getElementById(containerId).innerHTML=html;
}

function renderDrSummary(){
  var fl=document.getElementById('dr-from-label'),tl=document.getElementById('dr-to-label'),dl=document.getElementById('dr-days-label');
  var fmt=function(s){ var d=new Date(s+'T00:00:00'); return d.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}); };
  if(fl) fl.textContent=drState.from?fmt(drState.from):'—';
  if(tl) tl.textContent=drState.to?fmt(drState.to):(drState.from?fmt(drState.from):'—');
  if(dl){
    if(drState.from){
      var to=drState.to||drState.from;
      var days=Math.round((new Date(to+'T00:00:00')-new Date(drState.from+'T00:00:00'))/86400000)+1;
      dl.textContent=days+' day'+(days===1?'':'s');
    } else dl.textContent='';
  }
}

function renderDrAll(){
  renderDrCalendar('dr-cal-left',drState.left.y,drState.left.m,'left');
  renderDrCalendar('dr-cal-right',drState.right.y,drState.right.m,'right');
  renderDrSummary();
}

function applyDateRangeModal(){
  if(!drState.from){ showNotif('Pick a date range first','error'); return; }
  var to=drState.to||drState.from;
  var cfg=DR_TARGETS[drState.target||'projects'];
  document.getElementById(cfg.from).value=drState.from;
  document.getElementById(cfg.to).value=to;
  document.querySelectorAll(cfg.presetSelector).forEach(function(p){ p.classList.remove('active'); });
  var customPill=document.getElementById(cfg.customPill);
  if(customPill) customPill.classList.add('active');
  updateRangeLabel(cfg.from,cfg.to,cfg.label);
  closeDateRangeModal();
  cfg.reload();
}

function renderProjectsTable(projects){
  var isAdmin=currentUserRole==='admin';
  document.getElementById('all-projects-body').innerHTML=projects.length?projects.map(p=>`
    <div class="table-row" style="grid-template-columns:32px 2fr 1fr 1.2fr 0.8fr 80px 32px" onclick="openModal('${p.id}')">
      <div onclick="toggleSelect('${p.id}',event)" style="display:flex;align-items:center;justify-content:center">
        <input type="checkbox" id="cb-${p.id}" class="proj-checkbox" style="cursor:pointer;width:14px;height:14px;accent-color:var(--yellow)" ${selectedProjects.has(p.id)?'checked':''}/>
      </div>
      <div><div class="row-name">${p.client_name ? escapeHtml(p.client_name) : '<span style="color:#8a8a95;font-style:italic">Unnamed client</span>'} ${priorityBadge(p.priority)}</div><div class="row-sub">${p.video_size||''} · ${p.language||''}</div></div>
      <div class="row-meta">${p.business_type||'—'}</div>
      <div>${statusBadge(p.status)}</div>
      <div class="row-date" title="Created: ${fmtDate(p.created_at)}">${fmtDate(p.updated_at||p.created_at)}</div>
      <div class="row-date">${p.deadline?getDeadlineStatus(p.deadline):'<span style="color:#7a7a85">—</span>'}</div>
      ${isAdmin?`<div onclick="deleteProjectRow('${p.id}',event)" class="proj-row-del" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </div>`:'<div></div>'}
    </div>`).join(''):'<div class="table-empty"><div class="table-empty-icon">🔍</div>No projects found.</div>';
}

async function deleteProjectRow(id,event){
  if(event) event.stopPropagation();
  if(currentUserRole!=='admin'){ showNotif('Admin only — editors can\'t delete client tasks.','error'); return; }
  if(!confirm('Delete this project permanently?'))return;
  try{
    var r=await sb.from('projects').delete().eq('id',id).select();
    if(r.error) throw r.error;
    if(!r.data || r.data.length===0){
      showNotif('Delete blocked — check database permissions (RLS) on the projects table','error');
      console.error('deleteProjectRow: 0 rows affected, likely RLS blocking delete for id:',id);
      return;
    }
    // I-clean din ang mga kaugnay na freebies/creative rows para hindi maiwan sa staff
    await sb.from('creatives_upload').delete().eq('project_id', id);
    showNotif('Project deleted','success');
    if(selectedProjects.has(id)){ selectedProjects.delete(id); updateBulkBar(); }
    await loadAllProjects();
    loadDashboard();
  }catch(err){ showNotif('Delete failed: '+(err.message||err),'error'); }
}

// ═══════════════════════════════════════
// SUBMIT COMPLETED OUTPUT — All Projects page panel
// (same idea as My Tasks' panel, but with its own project picker
// since it's not scoped to one already-open project)
// ═══════════════════════════════════════
async function loadApSubmitProjectSelect(){
  var sel=document.getElementById('ap-submit-project-select');
  if(!sel)return;
  var{data}=await sb.from('projects').select('id,client_name,status')
    .neq('status','Approved / Done')
    .order('client_name');
  sel.innerHTML='<option value="">Select project...</option>'
    +'<option value="__new__">+ New client (not listed / type name)</option>'
    +(data||[]).map(function(p){
    return '<option value="'+p.id+'">'+p.client_name+' ('+p.status+')</option>';
  }).join('');
}

// Task 1 — modern custom business type dropdown (Add done output form)
function apBizToggle(e){
  if(e) e.stopPropagation();
  var dd=document.getElementById('ap-biz-dd');
  if(dd) dd.classList.toggle('open');
}
function apBizSetActive(el){
  var menu=document.querySelector('#ap-biz-dd .ob-dd-menu');
  if(menu) menu.querySelectorAll('.ob-dd-item').forEach(function(i){ i.classList.remove('active'); });
  if(el) el.classList.add('active');
}
function apBizPick(value, label, el){
  document.getElementById('ap-submit-biztype').value=value;
  var lbl=document.getElementById('ap-biz-label'); if(lbl){ lbl.textContent=label; lbl.style.color='#f2f0ea'; }
  // kopyahin ang icon ng napiling item papunta sa button
  var iconWrap=document.getElementById('ap-biz-icon');
  if(iconWrap && el){ var svg=el.querySelector('svg'); if(svg) iconWrap.innerHTML=svg.outerHTML; iconWrap.style.color=value?'#facc15':'#8a8a95'; }
  var custom=document.getElementById('ap-submit-biztype-custom');
  if(custom){ custom.style.display='none'; custom.value=''; }
  apBizSetActive(el);
  var dd=document.getElementById('ap-biz-dd'); if(dd) dd.classList.remove('open');
}
function apBizPickCustom(el){
  document.getElementById('ap-submit-biztype').value='__custom__';
  var lbl=document.getElementById('ap-biz-label'); if(lbl){ lbl.textContent='Custom'; lbl.style.color='#f2f0ea'; }
  var iconWrap=document.getElementById('ap-biz-icon');
  if(iconWrap && el){ var svg=el.querySelector('svg'); if(svg) iconWrap.innerHTML=svg.outerHTML; iconWrap.style.color='#facc15'; }
  apBizSetActive(el);
  var dd=document.getElementById('ap-biz-dd'); if(dd) dd.classList.remove('open');
  var custom=document.getElementById('ap-submit-biztype-custom');
  if(custom){ custom.style.display='block'; custom.focus(); }
}
// isara pag nag-click sa labas
document.addEventListener('click', function(e){
  if(!e.target.closest('#ap-biz-dd')){
    var dd=document.getElementById('ap-biz-dd'); if(dd) dd.classList.remove('open');
  }
});

async function loadApSubmitClientDetails(){
  var sel=document.getElementById('ap-submit-project-select');
  var newNameInput=document.getElementById('ap-submit-new-client-name');
  var detailsEl=document.getElementById('ap-submit-client-details');
  if(!sel)return;
  if(sel.value==='__new__'){
    window._currentApSubmitProject=null;
    if(newNameInput){ newNameInput.style.display='block'; newNameInput.focus(); }
    if(detailsEl) detailsEl.style.display='none';
    return;
  }
  if(newNameInput){ newNameInput.style.display='none'; newNameInput.value=''; }
  if(!sel.value)return;
  var{data}=await sb.from('projects').select('*').eq('id',sel.value).maybeSingle();
  if(!data)return;
  window._currentApSubmitProject=data;
  var el=document.getElementById('ap-submit-client-details');
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

function apToggleClientDetails(){
  var el=document.getElementById('ap-submit-client-details');
  if(!el)return;
  if(el.style.display==='none'||!el.style.display){
    if(!window._currentApSubmitProject){showNotif('Select a project first','error');return;}
    el.style.display='block';
    document.getElementById('ap-view-client-btn').textContent='🙈';
  } else {
    el.style.display='none';
    document.getElementById('ap-view-client-btn').textContent='👁';
  }
}

async function submitApAndMarkDone(){
  await submitApOutput(true);
}

async function submitApOutput(markDone){
  var submitBtn=document.getElementById('ap-submit-output-btn');
  var doneBtn=document.getElementById('ap-submit-mark-done-btn');
  if(submitBtn&&submitBtn.disabled) return; // already submitting — ignore extra clicks
  var projectId=document.getElementById('ap-submit-project-select')?.value;
  var newClientName=document.getElementById('ap-submit-new-client-name')?.value?.trim()||'';
  var url=document.getElementById('ap-submit-output-url')?.value?.trim();
  var sheetUrl=document.getElementById('ap-submit-output-sheet')?.value?.trim()||'';
  var type=document.getElementById('ap-submit-output-type')?.value||'video';
  var notes=document.getElementById('ap-submit-output-notes')?.value?.trim()||'';
  if(!projectId){showNotif('Select a project first','error');return;}
  if(projectId==='__new__'&&!newClientName){showNotif('Type the new client / project name','error');return;}
  if(!url){showNotif('Paste the Google Drive / Video link','error');return;}

  var submitBtnHtml=submitBtn?submitBtn.innerHTML:'';
  var doneBtnHtml=doneBtn?doneBtn.innerHTML:'';
  if(submitBtn){submitBtn.disabled=true;doneBtn&&(doneBtn.disabled=true);submitBtn.innerHTML='<span class="spinner"></span> Submitting...';}
  else if(doneBtn){doneBtn.disabled=true;doneBtn.innerHTML='<span class="spinner"></span> Submitting...';}

  // Task 1 — kunin ang business type (hidden input mula sa modern dropdown)
  var bizSel=document.getElementById('ap-submit-biztype')?.value||'';
  var bizType=bizSel==='__custom__'?(document.getElementById('ap-submit-biztype-custom')?.value?.trim()||''):(bizSel||'');

  try{
    // "+ New client" — create a minimal project row first so this output
    // (and the client) shows up properly across All Projects / analytics
    if(projectId==='__new__'){
      var{data:newProj,error:newProjErr}=await sb.from('projects').insert({
        client_name:newClientName,
        business_type:bizType||null,
        status:'New Input',
        assigned_to:currentUser.id
      }).select().maybeSingle();
      if(newProjErr){showNotif('Error creating client: '+newProjErr.message,'error');return;}
      projectId=newProj.id;
      logActivity('PROJECT_CREATED',newClientName+' (via Submit Output)');
    }
    var{data:project}=await sb.from('projects').select('*').eq('id',projectId).maybeSingle();
    // Task 1 — kung may pinili/tinype na business type at existing project, i-update lang kung wala pang laman
    if(bizType && project && !project.business_type){
      try{ await sb.from('projects').update({business_type:bizType}).eq('id',projectId); }catch(e){}
    }
    var typeLabels={video:'Video output',image:'Image output',blueprint:'Blueprint PDF',other:'File'};
    var label=typeLabels[type]||'Output';
    if(notes)label=label+' — '+notes.substring(0,30);
    var{error}=await sb.from('project_outputs').insert({
      project_id:projectId,
      user_id:currentUser.id,
      url:url,
      type:type,
      label:label
    });
    if(error){showNotif('Error: '+error.message,'error');return;}
    if(sheetUrl && sheetUrl!==url){
      try{
        await sb.from('project_outputs').insert({
          project_id:projectId,
          user_id:currentUser.id,
          url:sheetUrl,
          type:'other',
          label:'📊 Excel / Sheet'+(notes?' — '+notes.substring(0,20):'')
        });
      }catch(e){}
    }
    logActivity('OUTPUT_SUBMITTED',(project?.client_name||'Project')+' — '+type+(sheetUrl?' + Sheet':''));
    if(markDone){
      await sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',projectId);
      showNotif('Output submitted + marked Done! ✅','success');
    } else {
      await sb.from('projects').update({updated_at:new Date().toISOString()}).eq('id',projectId);
      showNotif('Output submitted! ✓','success');
    }
    try{
      await sb.from('notifications').insert({
        user_id:null,
        message:'New output submitted: "'+(project?.client_name||'Project')+'" — '+type+(sheetUrl?' + Sheet link':''),
        type:'output',
        project_id:projectId,
        is_read:false
      });
    }catch(e){}
    document.getElementById('ap-submit-output-url').value='';
    document.getElementById('ap-submit-output-sheet').value='';
    document.getElementById('ap-submit-output-notes').value='';
    var bizSelEl=document.getElementById('ap-submit-biztype'); if(bizSelEl)bizSelEl.value='';
    var bizCustomEl=document.getElementById('ap-submit-biztype-custom'); if(bizCustomEl){bizCustomEl.style.display='none';bizCustomEl.value='';}
    var bizLbl=document.getElementById('ap-biz-label'); if(bizLbl){bizLbl.textContent='None';bizLbl.style.color='';}
    var bizIcon=document.getElementById('ap-biz-icon'); if(bizIcon){bizIcon.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';bizIcon.style.color='#8a8a95';}
    var bizMenu=document.querySelector('#ap-biz-dd .ob-dd-menu'); if(bizMenu){bizMenu.querySelectorAll('.ob-dd-item').forEach(function(i,ix){i.classList.toggle('active',ix===0);});}
    document.getElementById('ap-submit-client-details').style.display='none';
    document.getElementById('ap-view-client-btn').textContent='👁';
    window._currentApSubmitProject=null;
    document.getElementById('ap-submit-project-select').value='';
    var newNameEl=document.getElementById('ap-submit-new-client-name');
    if(newNameEl){ newNameEl.style.display='none'; newNameEl.value=''; }
    loadApSubmitProjectSelect();
    loadApOutputsTable();
    loadAllProjects();
    if(currentUserRole==='admin')loadDashboard();
    apToggleForm(true); // collapse the form back closed after a successful submit
  } catch(err){
    showNotif('Error: '+(err?.message||err),'error');
  } finally {
    if(submitBtn){submitBtn.disabled=false;submitBtn.innerHTML=submitBtnHtml;}
    if(doneBtn){doneBtn.disabled=false;doneBtn.innerHTML=doneBtnHtml;}
  }
}

// Toggle the "Add done output" collapsible form open/closed (matches the
// For Upload "+ Add creative" pattern). Pass forceClose=true to always close.
var apFormOpen=false;
function apToggleForm(forceClose){
  apFormOpen = forceClose ? false : !apFormOpen;
  var wrap=document.getElementById('ap-form-wrap');
  var btn=document.getElementById('ap-toggle-btn');
  if(!wrap) return;
  if(apFormOpen){
    wrap.style.maxHeight='900px'; wrap.style.opacity='1'; wrap.style.marginBottom='16px';
    if(btn) btn.style.opacity='0.55';
    // pagkatapos ng open animation, i-visible ang overflow para hindi maputol ang dropdown
    setTimeout(function(){ if(apFormOpen) wrap.style.overflow='visible'; }, 320);
  } else {
    wrap.style.overflow='hidden'; // ibalik bago mag-collapse
    wrap.style.maxHeight='0'; wrap.style.opacity='0'; wrap.style.marginBottom='0';
    if(btn) btn.style.opacity='1';
  }
}

// Table of done-output submissions on the All Projects page —
// #, Client Name, FB Page, Link, Date Submitted (same format as the
// admin Output tracker), sourced straight from project_outputs.
async function loadApOutputsEditorFilter(){
  var sel=document.getElementById('ap-outputs-editor-filter');
  if(!sel||sel.options.length>1) return; // already loaded once
  var{data}=await sb.from('profiles').select('id,name,email').order('name');
  sel.innerHTML='<option value="">All editors</option>'+(data||[]).map(function(p){
    return '<option value="'+p.id+'">'+(p.name||p.email)+'</option>';
  }).join('');
}

async function loadApOutputsTable(){
  var bodyEl=document.getElementById('ap-outputs-body');
  if(!bodyEl) return;
  var isAdmin=currentUserRole==='admin';
  if(isAdmin) loadApOutputsEditorFilter();
  var editorFilter=isAdmin?(document.getElementById('ap-outputs-editor-filter')?.value||''):currentUser.id;
  var df=document.getElementById('proj-date-from')?.value||'';
  var dt=document.getElementById('proj-date-to')?.value||'';
  // NOTE: fetch project_outputs on its own (no embedded join) — if RLS
  // blocks reading the related project/profile row (e.g. a project not
  // assigned to this editor), an embedded select can silently drop the
  // whole output row. Fetching separately guarantees the editor's own
  // submissions always show, even if client/FB page can't be resolved.
  var query=sb.from('project_outputs')
    .select('*')
    .order('created_at',{ascending:false})
    .limit(300);
  if(editorFilter) query=query.eq('user_id',editorFilter);
  if(df) query=query.gte('created_at',df+'T00:00:00');
  if(dt) query=query.lte('created_at',dt+'T23:59:59');
  var{data,error}=await query;
  if(error){ bodyEl.innerHTML='<div class="table-empty"><div class="table-empty-icon">⚠️</div>Couldn\'t load: '+error.message+'</div>'; return; }
  var outputs=data||[];

  // Batch-fetch related project + profile info separately (best-effort —
  // if some rows can't be resolved due to permissions, show "—" instead
  // of hiding the row entirely)
  var projectIds=[...new Set(outputs.map(function(o){return o.project_id;}).filter(Boolean))];
  var userIds=[...new Set(outputs.map(function(o){return o.user_id;}).filter(Boolean))];
  var projectsById={},profilesById={};
  if(projectIds.length){
    try{
      var{data:projs}=await sb.from('projects').select('id,client_name,fb_page').in('id',projectIds);
      (projs||[]).forEach(function(p){projectsById[p.id]=p;});
    }catch(e){}
  }
  if(userIds.length){
    try{
      var{data:profs}=await sb.from('profiles').select('id,name,email').in('id',userIds);
      (profs||[]).forEach(function(p){profilesById[p.id]=p;});
    }catch(e){}
  }
  outputs.forEach(function(o){
    o.projects=projectsById[o.project_id]||null;
    o.profiles=profilesById[o.user_id]||null;
  });

  // ── Stat cards: total/video/image (own totals for editors, everyone's for admin) ──
  var totalVideo=outputs.filter(function(o){return o.type==='video';}).length;
  var totalImage=outputs.filter(function(o){return o.type==='image';}).length;
  document.getElementById('ap-stat-total').textContent=outputs.length;
  document.getElementById('ap-stat-video').textContent=totalVideo;
  document.getElementById('ap-stat-image').textContent=totalImage;
  var perEditorEl=document.getElementById('ap-stat-per-editor');
  if(isAdmin){
    var perEditor={};
    outputs.forEach(function(o){
      var name=o.profiles?.name||o.profiles?.email||'Unknown';
      perEditor[name]=perEditor[name]||{count:0,id:o.user_id};
      perEditor[name].count++;
    });
    var editorNames=Object.keys(perEditor).sort(function(a,b){return perEditor[b].count-perEditor[a].count;});
    perEditorEl.innerHTML=editorNames.map(function(name){
      var e=perEditor[name];
      return '<div onclick="openUserStatsModal(\''+e.id+'\')" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:12px" title="View '+name+'\'s full stats">'
        +'<span style="font-size:13px;font-weight:700;color:var(--text)">'+e.count+'</span>'
        +'<span style="font-size:10px;color:#9a9aa5">'+name+'</span>'
        +'</div>';
    }).join('');
  } else {
    perEditorEl.innerHTML='';
  }

  if(!outputs.length){
    bodyEl.innerHTML='<div class="table-empty"><div class="table-empty-icon">📦</div>No done outputs '+((isAdmin&&editorFilter)||df||dt?'match this filter.':'submitted yet.')+'</div>';
    return;
  }
  var typeIcons={video:'🎬',image:'🖼️',blueprint:'📄',other:'📎'};
  bodyEl.innerHTML=outputs.map(function(o,i){
    var date=new Date(o.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
    var client=o.projects?.client_name||'—';
    var fbPage=o.projects?.fb_page||'';
    var editor=o.profiles?.name||o.profiles?.email||'Unknown';
    var icon=typeIcons[o.type]||'📎';
    var shortUrl=o.url.length>40?o.url.substring(0,40)+'...':o.url;
    var rowNum=outputs.length-i;
    return '<div class="table-row" style="grid-template-columns:0.4fr 1.4fr 1.3fr 1.7fr 0.9fr 1.1fr 32px">'
      +'<div style="color:var(--text3);font-size:11px">'+rowNum+'</div>'
      +'<div><div class="row-name">'+client+'</div><div class="row-sub">'+icon+' '+o.type+'</div></div>'
      +'<div>'+(fbPage?'<a href="'+fbPage+'" target="_blank" style="font-size:11px;color:var(--yellow);word-break:break-all">'+fbPage+'</a>':'<span style="color:var(--text3);font-size:11px">—</span>')+'</div>'
      +'<div><a href="'+o.url+'" target="_blank" style="font-size:11px;color:var(--yellow);word-break:break-all">'+shortUrl+'</a></div>'
      +'<div class="row-date">'+date+'</div>'
      +'<div onclick="openUserStatsModal(\''+(o.user_id||'')+'\')" style="cursor:pointer;font-size:11px;color:var(--text2);text-decoration:underline;text-decoration-color:transparent" onmouseover="this.style.textDecorationColor=\'var(--yellow)\';this.style.color=\'var(--yellow)\'" onmouseout="this.style.textDecorationColor=\'transparent\';this.style.color=\'var(--text2)\'" title="View '+editor+'\'s full stats">'+editor+'</div>'
      +((currentUserRole==='admin'||o.user_id===currentUser.id)?'<div class="proj-row-del" title="Delete" onclick="deleteOutputRow(\''+o.id+'\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></div>':'<div></div>')
      +'</div>';
  }).join('');
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
  loadEditorFreebiesTasks();
}

async function loadEditorFreebiesTasks(){
  var box=document.getElementById('editor-freebies-body');
  if(!box) return;
  var query;
  if(currentUserRole==='editor'||currentUserRole==='brand_intern'){
    query=sb.from('creatives_upload').select('*,projects(fb_page)').eq('owner_id',currentUser.id).eq('is_freebies',true).order('created_at',{ascending:false});
  } else {
    query=sb.from('creatives_upload').select('*,projects(fb_page)').eq('is_freebies',true).order('created_at',{ascending:false});
  }
  var{data}=await query;
  var items=data||[];
  if(!items.length){
    box.innerHTML='<div class="table-empty"><div class="table-empty-icon">'+ICO_MEGAPHONE+'</div><div>No freebies tasks yet</div><div style="font-size:11px;margin-top:4px;color:var(--text3)">Assigned freebies from new projects will show up here</div></div>';
    return;
  }
  box.innerHTML=items.map(function(c,i){
    var isDone=c.status==='Done'||c.status==='Published';
    var fbPage=c.projects?.fb_page||'';
    var rowNum=items.length-i;
    var clientLabel=c.client_name||c.project_name||'—';
    var dateStr=isDone?fmtDate(c.created_at):'—';
    var linkCell=isDone
      ? '<a href="'+(c.file_link||'#')+'" target="_blank" style="font-size:11px;color:var(--yellow);word-break:break-all">'+(c.file_link?'Open':'—')+'</a>'
      : '<div style="display:flex;gap:6px;align-items:center">'
        + '<input class="form-input" id="fbtask-link-'+c.id+'" placeholder="Paste file link..." value="'+(c.file_link?escapeHtml(c.file_link):'')+'" style="font-size:11px;padding:6px 8px"/>'
        + '</div>';
    var statusCell=isDone
      ? '<span style="background:rgba(74,222,128,0.14);color:#4ade80;font-size:10px;font-weight:650;padding:4px 10px;border-radius:20px;white-space:nowrap">✓ Done</span>'
      : '<button class="yellow-btn" style="font-size:11px;padding:5px 10px;white-space:nowrap" onclick="freebiesQuickSubmit(\''+c.id+'\')">Submit</button>'
        + '<span style="display:block;margin-top:4px;background:rgba(250,204,21,0.14);color:#facc15;font-size:9px;font-weight:650;padding:2px 8px;border-radius:20px;text-align:center">Pending</span>';
    return '<div class="table-row" style="grid-template-columns:0.4fr 1.6fr 1.6fr 2fr 1fr 1.2fr;align-items:center">'
      +'<div style="color:var(--text3);font-size:11px">'+rowNum+'</div>'
      +'<div><div class="row-name">'+escapeHtml(clientLabel)+'</div><div class="row-sub">'+(c.freebies_count||0)+' freebies</div></div>'
      +'<div>'+(fbPage?'<a href="'+fbPage+'" target="_blank" style="font-size:11px;color:var(--yellow);word-break:break-all">'+fbPage+'</a>':'<span style="color:var(--text3);font-size:11px">—</span>')+'</div>'
      +'<div>'+linkCell+'</div>'
      +'<div class="row-date">'+dateStr+'</div>'
      +'<div>'+statusCell+'</div>'
      +'</div>';
  }).join('');
}

async function freebiesQuickSubmit(id){
  var input=document.getElementById('fbtask-link-'+id);
  var link=input?input.value.trim():'';
  if(!link){ showNotif('Paste the file link first','error'); return; }
  try{
    var{data:task}=await sb.from('creatives_upload').select('*').eq('id',id).maybeSingle();
    await sb.from('creatives_upload').update({file_link:link,status:'Done'}).eq('id',id);
    // Also record this as a done output so it flows into Done Output Submissions,
    // the admin Output tracker, and per-editor stats — same as regular Submit Output
    if(task?.project_id){
      try{
        await sb.from('project_outputs').insert({
          project_id:task.project_id,
          user_id:currentUser.id,
          url:link,
          type:'image',
          label:'🎁 Freebies — '+(task.client_name||task.project_name||'')
        });
        await sb.from('projects').update({updated_at:new Date().toISOString()}).eq('id',task.project_id);
      }catch(e){}
    }
    // Notify admin
    try{
      var editorLabel=(await sb.from('profiles').select('name,email').eq('id',currentUser.id).maybeSingle()).data;
      await sb.from('notifications').insert({
        user_id:null,
        message:(editorLabel?.name||editorLabel?.email||'An editor')+' finished a freebies task: "'+(task?.client_name||task?.project_name||'Freebies')+'"',
        type:'output',
        project_id:task?.project_id||null,
        is_read:false
      });
    }catch(e){}
    showNotif('Marked as Done! ✓','success');
    loadEditorFreebiesTasks();
  }catch(err){ showNotif('Error: '+(err?.message||err),'error'); }
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
    <div class="table-row user-table-cols" style="cursor:pointer" onclick="openUserStatsModal('${u.id}')" title="View output stats">
      <div><div class="row-name">${u.name||'—'}</div><div class="row-sub">${u.email||''}</div></div>
      <div><span class="user-role-badge ${u.role==='admin'?'role-admin':'role-editor'}">${u.role}</span></div>
      <div class="row-date">${fmtDate(u.created_at)}</div>
      <div><button class="ghost-btn" style="font-size:11px;padding:4px 10px;color:var(--red);border-color:rgba(239,68,68,0.2)" onclick="event.stopPropagation();deleteUser('${u.id}')">Remove</button></div>
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
  if(typeof fbValidateSubmit==='function') setTimeout(fbValidateSubmit,0);
  // Ipakita ang Orders panel sa Paste tab lang (hindi sa Manual form)
  var op=document.getElementById('np-orders');
  if(op) op.style.display = (tab==='paste') ? 'flex' : 'none';
  var lay=document.querySelector('.np-layout');
  if(lay) lay.style.gridTemplateColumns = (tab==='paste') ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)';
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
  const{data,error}=await sb.from('projects').insert({
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
    duration:document.getElementById('f-duration')?.value||'',
    language:document.getElementById('f-lang').value,
    emphasize,tone:isPaste?(pTone||selectedToneVal):selectedToneVal,
    status:'New Input',blueprint:blueprint||null,
    assigned_to:document.getElementById('f-assign-to')?.value||null,
    created_by:currentUser?.id,
    gdrive_link:document.getElementById('f-gdrive')?.value?.trim()||null,
    moodboard_link:document.getElementById('f-moodboard')?.value?.trim()||null,
    sample_video_link:document.getElementById('f-sample-video')?.value?.trim()||null,
    client_extra:document.getElementById('f-client-extra')?.value?.trim()||null
  }).select();
  btn.disabled=false;btn.innerHTML=FB_SEND_LABEL;
  if(error){showNotif('Save error: '+error.message,'error');return;}
  showNotif('Project saved! Ready for editor','success');
  if (typeof fbCreateForUploadRow === 'function') { await fbCreateForUploadRow(data && data[0] && data[0].id, clientName); fbResetForm(); }
  var videoEditorId=document.getElementById('f-assign-to')?.value||'';
  if(videoEditorId){ await notifyEditorAssigned(videoEditorId, clientName); }
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
function copyClientDetails(){
  var text=window.currentModalPlainText||'';
  if(!text){ showNotif('Wala pang details na makokopya','error'); return; }
  navigator.clipboard.writeText(text).then(function(){
    showNotif('Nakopya ang client details!','success');
  }).catch(function(){
    showNotif('Hindi na-copy — subukan mo mano-mano','error');
  });
}

async function openModal(id){
  var p=allProjects.find(x=>x.id===id);
  if(!p){
    var r=await sb.from('projects').select('*').eq('id',id).maybeSingle();
    p=r.data;
    if(p) allProjects.push(p);
  }
  if(!p)return;
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
  var gdriveHtml=p.gdrive_link?'<a href="'+p.gdrive_link+'" target="_blank" style="color:var(--yellow)">'+p.gdrive_link+'</a>':'—';
  var moodHtml=p.moodboard_link?'<a href="'+p.moodboard_link+'" target="_blank" style="color:var(--yellow)">'+p.moodboard_link+'</a>':'—';
  var sampleHtml=p.sample_video_link?'<a href="'+p.sample_video_link+'" target="_blank" style="color:var(--yellow)">'+p.sample_video_link+'</a>':'—';
  var colorsHtml=(p.color_primary||p.color_secondary)
    ? [p.color_primary,p.color_secondary].filter(Boolean).join(' / ')
    : '—';
  var detailLines=[
    ['Client',p.client_name],['Business type',p.business_type],
    ['FB Page',p.fb_page?('<a href="'+p.fb_page+'" target="_blank" style="color:var(--yellow)">'+p.fb_page+'</a>'):'—'],
    ['Website',p.website?('<a href="'+p.website+'" target="_blank" style="color:var(--yellow)">'+p.website+'</a>'):'—'],
    ['Goal',p.goal],['Language',p.language],
    ['Video size',p.video_size],['Duration',p.duration],
    ['Tone',p.tone],['Brand colors',colorsHtml],
    ['Audience',p.audience],['Assigned to',assignedName],
    ['Pain point',p.pain_point],['USP',p.usp],
    ['Product / Service',p.product],
    ['Script / Emphasis',p.emphasize],
    ['GDrive Materials',gdriveHtml],
    ['Moodboard',moodHtml],
    ['Sample Video',sampleHtml]
  ];
  if(p.client_extra) detailLines.push(['Extra Notes',p.client_extra]);
  document.getElementById('modal-detail-grid').innerHTML=detailLines.map(function(pair){
    return '<span class="db-line"><span class="db-label">'+pair[0]+':</span> '+(pair[1]||'—')+'</span>';
  }).join('');
  // I-save ang plain-text version (walang HTML tags) para sa Copy button
  window.currentModalPlainText=detailLines.map(function(pair){
    var v=String(pair[1]||'—').replace(/<[^>]*>/g,'');
    return pair[0]+': '+v;
  }).join('\n');
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
    video_size:p.video_size,duration:p.duration,language:p.language,voice_actor:p.voice_actor,
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
async function loadClientAnalytics(){
  var box=document.getElementById('analytics-clients');
  if(!box) return;
  box.innerHTML='<div style="padding:20px;color:#8a8a95;font-size:11.5px">Loading...</div>';

  var[{data:outputs},{data:projects}]=await Promise.all([
    sb.from('project_outputs').select('project_id,type,created_at'),
    sb.from('projects').select('id,client_name')
  ]);
  outputs=outputs||[]; projects=projects||[];

  var clientMap={};
  projects.forEach(function(p){ clientMap[p.id]=p.client_name||'Unnamed client'; });

  var stats={}; // stats[clientName] = {video, image, total, last}
  outputs.forEach(function(o){
    var name=clientMap[o.project_id]||'Unknown client';
    if(!stats[name]) stats[name]={video:0,image:0,total:0,last:null};
    stats[name].total++;
    if(o.type==='video') stats[name].video++;
    if(o.type==='image') stats[name].image++;
    if(!stats[name].last || new Date(o.created_at)>new Date(stats[name].last)) stats[name].last=o.created_at;
  });

  var names=Object.keys(stats).sort(function(a,b){ return stats[b].total-stats[a].total; });
  if(!names.length){
    box.innerHTML='<div class="table-empty"><div class="table-empty-icon">📊</div>No client outputs yet.</div>';
    return;
  }
  box.innerHTML=names.map(function(name){
    var s=stats[name];
    var lastStr=s.last?new Date(s.last).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}):'—';
    return '<div class="table-row" style="grid-template-columns:2fr 0.8fr 0.8fr 0.8fr 1fr">'
      + '<div><div class="row-name">'+escapeHtml(name)+'</div></div>'
      + '<div style="text-align:center;color:var(--purple)">'+s.video+'</div>'
      + '<div style="text-align:center;color:var(--green)">'+s.image+'</div>'
      + '<div style="text-align:center;color:var(--yellow);font-weight:700">'+s.total+'</div>'
      + '<div class="row-date">'+lastStr+'</div>'
      + '</div>';
  }).join('');
}

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

  loadClientAnalytics();

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
  if(currentUserRole!=='admin'){ showNotif('Admin only — editors can\'t delete client tasks.','error'); return; }
  if(!selectedProjects.size)return;
  if(!confirm(`Delete ${selectedProjects.size} projects permanently?`))return;
  var ids=[...selectedProjects];
  var results=await Promise.all(ids.map(id=>
    sb.from('projects').delete().eq('id',id).select()
  ));
  var deletedCount=results.filter(r=>r.data&&r.data.length>0).length;
  var blockedCount=results.length-deletedCount;
  // I-clean din ang mga kaugnay na freebies/creative rows
  await Promise.all(ids.map(id=>sb.from('creatives_upload').delete().eq('project_id',id)));
  if(blockedCount>0){
    showNotif(deletedCount+' deleted, '+blockedCount+' blocked (check RLS permissions)','error');
  } else {
    showNotif(`${deletedCount} projects deleted.`,'success');
  }
  selectedProjects.clear();updateBulkBar();loadDashboard();loadAllProjects();
}

function clearSelection(){
  selectedProjects.clear();
  updateBulkBar();
  document.querySelectorAll('.proj-checkbox').forEach(cb=>cb.checked=false);
}

// EXPORT CSV
function exportCSV(){
  const headers=['Client','Business Type','Goal','Status','Language','Video Size','Tone','Priority','Date Created','Last Activity'];
  const rows=allProjects.map(p=>[
    p.client_name||'',p.business_type||'',p.goal||'',p.status||'',
    p.language||'',p.video_size||'',p.tone||'',p.priority||'',
    p.created_at?new Date(p.created_at).toLocaleDateString('en-PH'):'',
    (p.updated_at||p.created_at)?new Date(p.updated_at||p.created_at).toLocaleDateString('en-PH'):''
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
  try{
    await sb.from('project_history').insert({
      project_id:projectId,
      user_id:currentUser?.id,
      old_status:oldStatus,
      new_status:newStatus,
      changed_at:new Date().toISOString()
    });
  }catch(e){}
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
  var joinedEl=document.getElementById('profile-joined-display');
  var statsEl=document.getElementById('profile-stats');
  var recentEl=document.getElementById('profile-recent-outputs');
  var displayName=profile.name||currentUser.email||'';
  if(nameEl)nameEl.value=displayName;
  if(emailEl)emailEl.textContent=currentUser.email||'';
  if(roleEl)roleEl.textContent=currentUserRole==='admin'?'Super Admin':'Editor';
  if(joinedEl&&profile.created_at) joinedEl.textContent='Member since '+fmtDate(profile.created_at);
  // Fix profile display
  var nameDisplay=document.getElementById('profile-name-display');
  var avatarEl=document.getElementById('profile-avatar');
  if(nameDisplay)nameDisplay.textContent=displayName||'—';
  if(avatarEl)avatarEl.textContent=(displayName[0]||'?').toUpperCase();

  // Load stats — pulls from actual delivered output (project_outputs +
  // For Upload creatives), same data source as the admin's per-editor view,
  // so what you see here matches what admin sees when they check on you.
  if(statsEl){
    var[{data:assignedProjects},{data:outputs},{data:uploads}]=await Promise.all([
      sb.from('projects').select('status,assigned_to').eq('assigned_to',currentUser.id),
      sb.from('project_outputs').select('type,created_at').eq('user_id',currentUser.id),
      sb.from('creatives_upload').select('is_freebies,status,file_link').eq('owner_id',currentUser.id)
    ]);
    var all=assignedProjects||[];
    var done=all.filter(function(p){return p.status==='Approved / Done';}).length;
    var inProd=all.filter(function(p){return p.status==='In Production';}).length;
    outputs=outputs||[];
    var delivered=(uploads||[]).filter(function(u){return u.file_link;});
    var totalOutputs=outputs.length+delivered.length;
    var totalVideo=outputs.filter(function(o){return o.type==='video';}).length;
    var totalImage=outputs.filter(function(o){return o.type==='image';}).length+delivered.length;
    var freebies=(uploads||[]).filter(function(u){return u.is_freebies;});
    var freebiesDone=freebies.filter(function(f){return f.status==='Done'||f.status==='Published';}).length;
    statsEl.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">'
      +'<div class="stat-card c-yellow" style="text-align:center"><div class="stat-label">Total outputs</div><div class="stat-val">'+totalOutputs+'</div></div>'
      +'<div class="stat-card c-purple" style="text-align:center"><div class="stat-label">Videos</div><div class="stat-val" style="color:var(--purple)">'+totalVideo+'</div></div>'
      +'<div class="stat-card c-green" style="text-align:center"><div class="stat-label">Images</div><div class="stat-val" style="color:var(--green)">'+totalImage+'</div></div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">'
      +'<div class="stat-card c-amber" style="text-align:center"><div class="stat-label">Assigned</div><div class="stat-val" style="color:var(--amber)">'+all.length+'</div></div>'
      +'<div class="stat-card c-amber" style="text-align:center"><div class="stat-label">In prod</div><div class="stat-val" style="color:var(--amber)">'+inProd+'</div></div>'
      +'<div class="stat-card c-green" style="text-align:center"><div class="stat-label">Completed</div><div class="stat-val" style="color:var(--green)">'+done+'</div></div>'
      +'</div>'
      +(freebies.length?'<div style="margin-top:10px;font-size:11px;color:var(--text2)">🎁 Freebies done: <strong style="color:#4ade80">'+freebiesDone+' / '+freebies.length+'</strong></div>':'');
  }

  // Recent submissions — quick self-service access to your own last few outputs
  if(recentEl){
    var[{data:recentOutputs},{data:recentUploads}]=await Promise.all([
      sb.from('project_outputs').select('*,projects(client_name)').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(20),
      sb.from('creatives_upload').select('*').eq('owner_id',currentUser.id).not('file_link','is',null).order('created_at',{ascending:false}).limit(20)
    ]);
    var typeIcons={video:'🎬',image:'🖼️',blueprint:'📄',other:'📎'};
    var combined=(recentOutputs||[]).map(function(o){
      return{created_at:o.created_at,icon:typeIcons[o.type]||'📎',label:o.projects?.client_name||'—',url:o.url};
    }).concat((recentUploads||[]).map(function(u){
      return{created_at:u.created_at,icon:u.is_freebies?'🎁':'🖼️',label:u.client_name||u.project_name||'—',url:u.file_link};
    })).sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);}).slice(0,5);
    recentEl.innerHTML=combined.length?combined.map(function(r){
      var date=new Date(r.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:0.5px solid var(--border);font-size:12px">'
        +'<span>'+r.icon+'</span>'
        +'<span style="flex:1;color:var(--text)">'+r.label+'</span>'
        +'<a href="'+r.url+'" target="_blank" style="color:var(--yellow);font-size:11px">Open</a>'
        +'<span style="color:var(--text3);font-size:11px;white-space:nowrap">'+date+'</span>'
        +'</div>';
    }).join(''):'<div style="color:var(--text3);font-size:12px">No submissions yet.</div>';
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
  // Announcements — editor read-only. Re-verify the role fresh from the
  // database (instead of trusting the possibly-stale currentUserRole
  // global) so a real admin never gets incorrectly locked out.
  if(info&&info.adminOnly&&currentUser?.id){
    try{
      var{data:freshProfile}=await sb.from('profiles').select('role').eq('id',currentUser.id).maybeSingle();
      if(freshProfile?.role) currentUserRole=freshProfile.role;
    }catch(e){}
  }
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
    try{
      var{data:freshProfile}=await sb.from('profiles').select('role').eq('id',currentUser.id).maybeSingle();
      if(freshProfile?.role) currentUserRole=freshProfile.role;
    }catch(e){}
  }
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
  var clean=String(msg||'').replace(/^[\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF\uD800-\uDFFF\s]+/,'').trim();
  var icons={
    success:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>',
    error:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    '':'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  n.innerHTML=(icons[type]||icons[''])+'<span>'+escapeHtml(clean)+'</span>';
  n.className='notif show '+(type||'');
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
  var submitBtn=document.getElementById('submit-output-btn');
  var doneBtn=document.getElementById('submit-mark-done-btn');
  if(submitBtn&&submitBtn.disabled) return; // already submitting — ignore extra clicks
  var projectId=document.getElementById('submit-project-select')?.value;
  var url=document.getElementById('submit-output-url')?.value?.trim();
  var sheetUrl=document.getElementById('submit-output-sheet')?.value?.trim()||'';
  var type=document.getElementById('submit-output-type')?.value||'video';
  var notes=document.getElementById('submit-output-notes')?.value?.trim()||'';
  if(!projectId){showNotif('Select a project first','error');return;}
  if(!url){showNotif('Paste the Google Drive / Video link','error');return;}

  var submitBtnOrigHtml=submitBtn?submitBtn.innerHTML:'';
  var doneBtnOrigHtml=doneBtn?doneBtn.innerHTML:'';
  if(submitBtn){submitBtn.disabled=true;doneBtn&&(doneBtn.disabled=true);submitBtn.innerHTML='<span class="spinner"></span> Submitting...';}
  else if(doneBtn){doneBtn.disabled=true;doneBtn.innerHTML='<span class="spinner"></span> Submitting...';}

  try{
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
    if(sheetUrl && sheetUrl!==url){
      try{
        await sb.from('project_outputs').insert({
          project_id:projectId,
          user_id:currentUser.id,
          url:sheetUrl,
          type:'other',
          label:'📊 Excel / Sheet'+(notes?' — '+notes.substring(0,20):'')
        });
      }catch(e){}
    }
    // Log activity
    logActivity('OUTPUT_SUBMITTED',(project?.client_name||'Project')+' — '+type+(sheetUrl?' + Sheet':''));
    // Mark done if requested — otherwise still touch updated_at so this shows up
    // in the admin's "All Projects" list/date-filter as fresh activity today
    if(markDone){
      await sb.from('projects').update({status:'Approved / Done',updated_at:new Date().toISOString()}).eq('id',projectId);
      showNotif('Output submitted + marked Done! ✅','success');
    } else {
      await sb.from('projects').update({updated_at:new Date().toISOString()}).eq('id',projectId);
      showNotif('Output submitted! ✓','success');
    }
    // Notify admin
    try{
      await sb.from('notifications').insert({
        user_id:null,
        message:'New output from editor: "'+(project?.client_name||'Project')+'" — '+type+(sheetUrl?' + Sheet link':''),
        type:'output',
        project_id:projectId,
        is_read:false
      });
    }catch(e){}
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
  } catch(err){
    showNotif('Error: '+(err?.message||err),'error');
  } finally {
    if(submitBtn){submitBtn.disabled=false;submitBtn.innerHTML=submitBtnOrigHtml;}
    if(doneBtn){doneBtn.disabled=false;doneBtn.innerHTML=doneBtnOrigHtml;}
  }
}

async function submitAndMarkDone(){
  await submitEditorOutput(true);
}

// ═══════════════════════════════════════
// ADMIN OUTPUTS TABLE
// ═══════════════════════════════════════

function getLast6MonthsList(){
  var now=new Date();
  var months=[];
  for(var i=5;i>=0;i--){
    var d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleString('en-PH',{month:'short'})});
  }
  return months;
}

async function loadMonthlyOutputSummary(){
  var box=document.getElementById('monthly-output-table');
  if(!box) return;
  box.innerHTML='<div style="padding:20px;color:#8a8a95;font-size:11.5px">Loading...</div>';

  var[{data:eds},{data:allOutputs}]=await Promise.all([
    sb.from('profiles').select('id,name,email').eq('role','editor').order('name'),
    sb.from('project_outputs').select('user_id,type,created_at')
  ]);
  eds=eds||[]; allOutputs=allOutputs||[];

  // Bumuo ng last 6 months rolling papuntang kasalukuyan (halimbawa: Mar–Aug)
  var months=getLast6MonthsList();

  // I-group ang outputs kada editor kada buwan (kasama video/image breakdown)
  var grid={}; // grid[editorId][monthKey] = {total,video,image}
  allOutputs.forEach(function(o){
    if(!o.user_id||!o.created_at) return;
    var d=new Date(o.created_at);
    var mk=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    grid[o.user_id]=grid[o.user_id]||{};
    grid[o.user_id][mk]=grid[o.user_id][mk]||{total:0,video:0,image:0};
    grid[o.user_id][mk].total++;
    if(o.type==='video') grid[o.user_id][mk].video++;
    if(o.type==='image') grid[o.user_id][mk].image++;
  });

  if(!eds.length){
    box.innerHTML='<div class="table-empty"><div class="table-empty-icon">📊</div>No editors yet.</div>';
    return;
  }

  var headCells=months.map(function(m){ return '<span style="text-align:center">'+m.label+'</span>'; }).join('');
  var head='<div class="table-head" style="grid-template-columns:1.6fr repeat(6,0.7fr) 0.7fr">'
    + '<span>Editor</span>'+headCells+'<span style="text-align:center">Total</span></div>';

  var rows=eds.map(function(e){
    var perMonth=grid[e.id]||{};
    var total=0,totalVideo=0,totalImage=0;
    var cells=months.map(function(m){
      var c=perMonth[m.key]||{total:0,video:0,image:0};
      total+=c.total; totalVideo+=c.video; totalImage+=c.image;
      var tip='🎬 '+c.video+' video · 🖼️ '+c.image+' image';
      return '<div title="'+tip+'" style="text-align:center;cursor:default;color:'+(c.total>0?'#f2f0ea':'#7a7a85')+';font-weight:'+(c.total>0?'650':'400')+'">'+c.total+'</div>';
    }).join('');
    return '<div class="table-row" style="grid-template-columns:1.6fr repeat(6,0.7fr) 0.7fr">'
      + '<div><div class="row-name" style="cursor:pointer;text-decoration:underline;text-decoration-color:transparent" onmouseover="this.style.textDecorationColor=\'var(--yellow)\'" onmouseout="this.style.textDecorationColor=\'transparent\'" onclick="openUserStatsModal(\''+e.id+'\')">'+escapeHtml(e.name||e.email)+'</div></div>'
      + cells
      + '<div style="text-align:center;color:var(--yellow);font-weight:700" title="🎬 '+totalVideo+' video · 🖼️ '+totalImage+' image">'+total+'</div>'
      + '</div>';
  }).join('');

  box.innerHTML=head+rows;
}

// ═══════════════════════════════════════
// PER-EDITOR STATS MODAL — click an editor/graphics team member
// (Team members page, or Monthly output summary name) to see their
// personal total output, monthly breakdown, and recent submissions.
// ═══════════════════════════════════════
async function openUserStatsModal(userId){
  var modal=document.getElementById('user-stats-modal');
  if(!modal) return;
  modal.classList.add('open');
  document.getElementById('us-name').textContent='Loading...';
  document.getElementById('us-role-badge').textContent='';
  document.getElementById('us-stats-cards').innerHTML='';
  document.getElementById('us-monthly-table').innerHTML='<div style="padding:16px;color:var(--text3);font-size:11.5px">Loading...</div>';
  document.getElementById('us-recent-list').innerHTML='';

  var[{data:profile},{data:outputs},{data:uploads}]=await Promise.all([
    sb.from('profiles').select('*').eq('id',userId).maybeSingle(),
    sb.from('project_outputs').select('*,projects(client_name,fb_page)').eq('user_id',userId).order('created_at',{ascending:false}).limit(300),
    sb.from('creatives_upload').select('*').eq('owner_id',userId).order('created_at',{ascending:false}).limit(300)
  ]);
  outputs=outputs||[];
  uploads=uploads||[];
  if(!profile){ document.getElementById('us-name').textContent='Team member not found'; return; }

  // Freebies task rows (assignment placeholders, may or may not have a file yet)
  var freebies=uploads.filter(function(u){return u.is_freebies;});
  var pendingFreebies=freebies.filter(function(f){return !f.file_link;}).length;

  // For Upload submissions that actually have a delivered file/link — this is
  // the image creatives team's real output (freebies or otherwise), same idea
  // as "Submit output" but done through For Upload instead. Freebies aren't a
  // separate bucket from Images — for this team they're the same work, so we
  // fold them into one Images number instead of showing two conflicting counts.
  var delivered=uploads.filter(function(u){return u.file_link;});

  document.getElementById('us-name').textContent=profile.name||profile.email||'—';
  document.getElementById('us-role-badge').innerHTML='<span class="user-role-badge '+(profile.role==='admin'?'role-admin':'role-editor')+'">'+(profile.role||'')+'</span>';

  var totalVideo=outputs.filter(function(o){return o.type==='video';}).length;
  var totalImage=outputs.filter(function(o){return o.type==='image';}).length+delivered.length;
  var totalProjects=new Set(outputs.map(function(o){return o.project_id;}).concat(delivered.map(function(u){return u.project_id;}))).size;
  var grandTotal=outputs.length+delivered.length;
  document.getElementById('us-stats-cards').innerHTML=
    '<div class="stat-card c-yellow"><div class="stat-label">Total outputs</div><div class="stat-val" title="'+outputs.length+' via Submit output + '+delivered.length+' via For Upload">'+grandTotal+'</div></div>'
    +'<div class="stat-card c-purple"><div class="stat-label">Videos</div><div class="stat-val" style="color:var(--purple)">'+totalVideo+'</div></div>'
    +'<div class="stat-card c-green"><div class="stat-label">Images'+(freebies.length?' / Freebies':'')+'</div><div class="stat-val" style="color:var(--green)">'+totalImage+'</div>'
    +(pendingFreebies?'<div style="font-size:9px;color:var(--text3);margin-top:2px">+'+pendingFreebies+' freebies task'+(pendingFreebies===1?'':'s')+' pending</div>':'')+'</div>'
    +'<div class="stat-card c-amber"><div class="stat-label">Projects</div><div class="stat-val" style="color:var(--amber)">'+totalProjects+'</div></div>';

  // Monthly breakdown (last 6 months) — merges both sources
  var months=getLast6MonthsList();
  var perMonth={};
  function bumpMonth(dateStr,type){
    if(!dateStr) return;
    var d=new Date(dateStr);
    var mk=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    perMonth[mk]=perMonth[mk]||{total:0,video:0,image:0};
    perMonth[mk].total++;
    if(type==='video') perMonth[mk].video++;
    if(type==='image') perMonth[mk].image++;
  }
  outputs.forEach(function(o){ bumpMonth(o.created_at,o.type); });
  delivered.forEach(function(u){ bumpMonth(u.created_at,'image'); });
  var mHead='<div class="table-head" style="grid-template-columns:repeat(6,1fr)">'
    +months.map(function(m){ return '<span style="text-align:center">'+m.label+'</span>'; }).join('')+'</div>';
  var mRow='<div class="table-row" style="grid-template-columns:repeat(6,1fr)">'
    +months.map(function(m){
      var c=perMonth[m.key]||{total:0,video:0,image:0};
      var tip='🎬 '+c.video+' video · 🖼️ '+c.image+' image';
      return '<div title="'+tip+'" style="text-align:center;color:'+(c.total>0?'#f2f0ea':'#7a7a85')+';font-weight:'+(c.total>0?'650':'400')+'">'+c.total+'</div>';
    }).join('')+'</div>';
  document.getElementById('us-monthly-table').innerHTML=mHead+mRow;

  // Recent submissions (last 10) — merged + sorted, each with an Open link
  var typeIcons={video:'🎬',image:'🖼️',blueprint:'📄',other:'📎'};
  var combined=outputs.map(function(o){
    return{created_at:o.created_at,icon:typeIcons[o.type]||'📎',label:o.projects?.client_name||'—',url:o.url};
  }).concat(delivered.map(function(u){
    return{created_at:u.created_at,icon:u.is_freebies?'🎁':'🖼️',label:u.client_name||u.project_name||'—',url:u.file_link};
  })).sort(function(a,b){ return new Date(b.created_at)-new Date(a.created_at); });
  var recent=combined.slice(0,10);
  document.getElementById('us-recent-list').innerHTML=recent.length?recent.map(function(r){
    var date=new Date(r.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:0.5px solid var(--border);font-size:12px">'
      +'<span>'+r.icon+'</span>'
      +'<span style="flex:1;color:var(--text)">'+escapeHtml(r.label)+'</span>'
      +'<a href="'+r.url+'" target="_blank" style="color:var(--yellow);font-size:11px">Open</a>'
      +'<span style="color:var(--text3);font-size:11px;white-space:nowrap">'+date+'</span>'
      +'</div>';
  }).join(''):'<div style="padding:12px 0;color:var(--text3);font-size:11.5px">No submissions yet.</div>';
}

function closeUserStatsModal(){
  document.getElementById('user-stats-modal').classList.remove('open');
}

async function loadOutputsTable(){
  var editorFilter=document.getElementById('outputs-editor-filter')?.value||'';
  var typeFilter=document.getElementById('outputs-type-filter')?.value||'';
  var dateFrom=document.getElementById('outputs-date-from')?.value||'';
  var dateTo=document.getElementById('outputs-date-to')?.value||'';
  updateOutputsRangeLabel();

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
    .select('*,profiles(name,email),projects(client_name,status,fb_page)')
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
  bodyEl.innerHTML=outputs.map(function(o,i){
    var date=new Date(o.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
    var editor=o.profiles?.name||o.profiles?.email||'Unknown';
    var client=o.projects?.client_name||'—';
    var projStatus=o.projects?.status||'';
    var fbPage=o.projects?.fb_page||'';
    var icon=typeIcons[o.type]||'📎';
    var shortUrl=o.url.length>40?o.url.substring(0,40)+'...':o.url;
    var rowNum=outputs.length-i; // number ascending from oldest = 1
    return '<div class="table-row" style="grid-template-columns:0.4fr 1.6fr 1.6fr 2fr 1fr 32px">'
      +'<div style="color:var(--text3);font-size:11px">'+rowNum+'</div>'
      +'<div><div class="row-name">'+client+'</div><div class="row-sub">'+icon+' '+o.type+' · '+editor+(projStatus?' · '+projStatus:'')+'</div></div>'
      +'<div>'+(fbPage?'<a href="'+fbPage+'" target="_blank" style="font-size:11px;color:var(--yellow);word-break:break-all">'+fbPage+'</a>':'<span style="color:var(--text3);font-size:11px">—</span>')+'</div>'
      +'<div><a href="'+o.url+'" target="_blank" style="font-size:11px;color:var(--yellow);word-break:break-all">'+shortUrl+'</a>'
      +(o.label?'<div style="font-size:10px;color:var(--text3)">'+o.label+'</div>':'')+'</div>'
      +'<div class="row-date">'+date+'</div>'
      +'<div class="proj-row-del" title="Delete (e.g. accidental duplicate)" onclick="deleteOutputRow(\''+o.id+'\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></div>'
      +'</div>';
  }).join('');
}

async function deleteOutputRow(id){
  try{
    var{data:row}=await sb.from('project_outputs').select('user_id').eq('id',id).maybeSingle();
    if(currentUserRole!=='admin' && row?.user_id!==currentUser.id){
      showNotif('You can only delete your own submissions.','error'); return;
    }
  }catch(e){}
  if(!confirm('Delete this output entry? (Use this to remove accidental duplicate submissions.)'))return;
  try{
    await sb.from('project_outputs').delete().eq('id',id);
    showNotif('Output entry deleted.','success');
    loadOutputsTable();
    loadMonthlyOutputSummary();
    if(typeof loadApOutputsTable==='function')loadApOutputsTable();
  }catch(err){ showNotif('Delete failed: '+(err?.message||err),'error'); }
}

// ═══════════════════════════════════════
// SALES & EXPENSES (FINANCE) — admin-only
// ═══════════════════════════════════════
var finActiveTab='sales';
var finPHP=function(n){ return '₱'+Number(n||0).toLocaleString('en-PH',{maximumFractionDigits:2}); };

function finApplySalesSearch(salesArr){
  var q=(document.getElementById('fin-sales-search')?.value||'').trim().toLowerCase();
  if(!q) return salesArr;
  return salesArr.filter(function(o){
    return (o.client_name||'').toLowerCase().includes(q)
      || (o.business||'').toLowerCase().includes(q)
      || (o.contact||'').toLowerCase().includes(q)
      || (o.email||'').toLowerCase().includes(q);
  });
}

function finFilterSales(){
  renderFinSalesTable(finApplySalesSearch(window._finSalesCache||[]));
}

function renderFinAdsTable(adsLog){
  var body=document.getElementById('fin-ads-body');
  if(!body) return;
  body.innerHTML=adsLog.length?adsLog.map(function(a,i){
    return '<div class="table-row" style="grid-template-columns:0.4fr 1.2fr 1fr 1fr 1.6fr 32px">'
      +'<div style="color:var(--text3);font-size:11px">'+(adsLog.length-i)+'</div>'
      +'<div class="row-date">'+fmtDate(a.spend_date)+'</div>'
      +'<div style="font-weight:650;color:var(--purple)">'+finPHP(a.total_ads_spent)+'</div>'
      +'<div style="font-size:11px;color:var(--text2)">'+(a.cost_per_message?finPHP(a.cost_per_message):'—')+'</div>'
      +'<div style="font-size:11px;color:var(--text2)">'+(a.total_messages||0)+' msgs'+(a.notes?' · '+a.notes:'')+'</div>'
      +'<div class="proj-row-del" title="Delete" onclick="deleteAdsSpend(\''+a.id+'\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></div>'
      +'</div>';
  }).join(''):'<div class="table-empty"><div class="table-empty-icon">📈</div>No ads spend logged in this period yet.</div>';
}

function renderFinSalesTable(sales){
  var salesBody=document.getElementById('fin-sales-body');
  if(!salesBody) return;
  salesBody.innerHTML=sales.length?sales.map(function(o,i){
    var statusColors={Paid:'#4ade80',Balance:'#facc15',Pending:'#fb923c',Refunded:'#f87171'};
    var sc=statusColors[o.paid_status]||'#9a9aa5';
    var subParts=[o.business||o.contact,o.notes].filter(Boolean);
    return '<div class="table-row" style="grid-template-columns:0.4fr 0.9fr 1.6fr 1fr 1fr 1fr 1fr 32px 32px">'
      +'<div style="color:var(--text3);font-size:11px">'+(sales.length-i)+'</div>'
      +'<div class="row-date">'+fmtDate(o.order_date)+'</div>'
      +'<div><div class="row-name">'+(o.client_name||'—')+'</div><div class="row-sub">'+subParts.join(' · ')+'</div></div>'
      +'<div style="font-size:11px;color:var(--text2)">'+(o.order_package||'—')+'</div>'
      +'<div style="font-weight:650;color:var(--green)">'+finPHP(o.sales_amount)+'</div>'
      +'<div style="font-size:11px;color:var(--text2)">'+(o.va_name||'—')+'</div>'
      +'<div><span style="font-size:10px;font-weight:650;padding:3px 9px;border-radius:20px;background:'+sc+'22;color:'+sc+'">'+(o.paid_status||'—')+'</span></div>'
      +'<div class="proj-row-del" title="Generate Invoice" onclick="openInvoiceModal(\''+o.id+'\')" style="color:var(--yellow)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg></div>'
      +'<div class="proj-row-del" title="Delete" onclick="deleteSale(\''+o.id+'\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></div>'
      +'</div>';
  }).join(''):'<div class="table-empty"><div class="table-empty-icon">💵</div>No sales match'+(document.getElementById('fin-sales-search')?.value?' your search.':' in this period yet.')+'</div>';
}

async function promptFinTarget(){
  var{data:row}=await sb.from('app_settings').select('value').eq('key','monthly_sales_target').maybeSingle();
  var current=row?row.value:'';
  var input=prompt('Set your sales target for the currently selected date range (₱):',current||'');
  if(input===null) return;
  var val=parseFloat(input);
  if(isNaN(val)||val<0){ showNotif('Enter a valid number','error'); return; }
  try{
    await sb.from('app_settings').upsert({key:'monthly_sales_target',value:String(val),updated_at:new Date().toISOString()});
    showNotif('Target updated! ✓','success');
    loadFinancePage();
  }catch(err){ showNotif('Error: '+(err?.message||err),'error'); }
}

function finSwitchTab(tab){
  finActiveTab=tab;
  document.getElementById('fin-sales-tab').style.display=tab==='sales'?'block':'none';
  document.getElementById('fin-expenses-tab').style.display=tab==='expenses'?'block':'none';
  document.getElementById('fin-ads-tab').style.display=tab==='ads'?'block':'none';
  document.getElementById('fin-daily-tab').style.display=tab==='daily'?'block':'none';
  document.getElementById('fin-tab-sales-btn').classList.toggle('active',tab==='sales');
  document.getElementById('fin-tab-expenses-btn').classList.toggle('active',tab==='expenses');
  document.getElementById('fin-tab-ads-btn').classList.toggle('active',tab==='ads');
  document.getElementById('fin-tab-daily-btn').classList.toggle('active',tab==='daily');
}

function finToggleSalesForm(forceClose){
  var wrap=document.getElementById('fin-sales-form-wrap');
  var isOpen=wrap.style.maxHeight&&wrap.style.maxHeight!=='0px'&&wrap.style.maxHeight!=='0';
  var open=forceClose?false:!isOpen;
  if(open){
    wrap.style.maxHeight='900px'; wrap.style.opacity='1'; wrap.style.marginBottom='16px';
    var dateEl=document.getElementById('fin-sale-date');
    if(dateEl&&!dateEl.value) dateEl.value=new Date().toISOString().slice(0,10);
  } else {
    wrap.style.maxHeight='0'; wrap.style.opacity='0'; wrap.style.marginBottom='0';
  }
}

function finToggleExpenseForm(forceClose){
  var wrap=document.getElementById('fin-expense-form-wrap');
  var isOpen=wrap.style.maxHeight&&wrap.style.maxHeight!=='0px'&&wrap.style.maxHeight!=='0';
  var open=forceClose?false:!isOpen;
  if(open){
    wrap.style.maxHeight='700px'; wrap.style.opacity='1'; wrap.style.marginBottom='16px';
    var dateEl=document.getElementById('fin-exp-date');
    if(dateEl&&!dateEl.value) dateEl.value=new Date().toISOString().slice(0,10);
  } else {
    wrap.style.maxHeight='0'; wrap.style.opacity='0'; wrap.style.marginBottom='0';
  }
}

function finToggleAdsForm(forceClose){
  var wrap=document.getElementById('fin-ads-form-wrap');
  var isOpen=wrap.style.maxHeight&&wrap.style.maxHeight!=='0px'&&wrap.style.maxHeight!=='0';
  var open=forceClose?false:!isOpen;
  if(open){
    wrap.style.maxHeight='700px'; wrap.style.opacity='1'; wrap.style.marginBottom='16px';
    var dateEl=document.getElementById('fin-ads-date');
    if(dateEl&&!dateEl.value) dateEl.value=new Date().toISOString().slice(0,10);
  } else {
    wrap.style.maxHeight='0'; wrap.style.opacity='0'; wrap.style.marginBottom='0';
  }
}

async function submitAdsSpend(){
  var btn=document.getElementById('fin-ads-submit-btn');
  if(btn&&btn.disabled) return;
  var payload={
    spend_date:document.getElementById('fin-ads-date')?.value||new Date().toISOString().slice(0,10),
    total_ads_spent:parseFloat(document.getElementById('fin-ads-spent')?.value)||0,
    cost_per_message:parseFloat(document.getElementById('fin-ads-cpm')?.value)||0,
    total_messages:parseInt(document.getElementById('fin-ads-msgs')?.value)||0,
    notes:document.getElementById('fin-ads-notes')?.value?.trim()||null,
    created_by:currentUser.id
  };
  var origHtml=btn?btn.innerHTML:'';
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Saving...'; }
  try{
    var{error}=await sb.from('ads_spend_log').insert(payload);
    if(error){ showNotif('Error: '+error.message,'error'); return; }
    showNotif('Ads spend saved! ✓','success');
    ['fin-ads-spent','fin-ads-cpm','fin-ads-msgs','fin-ads-notes'].forEach(function(id){
      var el=document.getElementById(id); if(el)el.value='';
    });
    finToggleAdsForm(true);
    loadFinancePage();
  }catch(err){ showNotif('Error: '+(err?.message||err),'error'); }
  finally{ if(btn){ btn.disabled=false; btn.innerHTML=origHtml; } }
}

async function deleteAdsSpend(id){
  if(!confirm('Delete this ads spend entry?'))return;
  try{
    await sb.from('ads_spend_log').delete().eq('id',id);
    showNotif('Entry deleted.','success');
    loadFinancePage();
  }catch(err){ showNotif('Delete failed: '+(err?.message||err),'error'); }
}

// ── Client autocomplete for Add Sale — pulls from previous sales so you
// don't have to retype details for a client you've already sold to ──
var _finClientLookup={};
function finPopulateClientDatalist(){
  var dl=document.getElementById('fin-client-datalist');
  if(!dl) return;
  var salesCache=window._finAllSalesEver||[];
  _finClientLookup={};
  salesCache.forEach(function(o){
    if(o.client_name) _finClientLookup[o.client_name]=o; // last one wins = most recent
  });
  dl.innerHTML=Object.keys(_finClientLookup).sort().map(function(name){
    return '<option value="'+name.replace(/"/g,'&quot;')+'">';
  }).join('');
}
function finAutofillClient(){
  var name=document.getElementById('fin-sale-client')?.value;
  var match=_finClientLookup[name];
  if(!match) return;
  var c=document.getElementById('fin-sale-contact'); if(c&&!c.value) c.value=match.contact||'';
  var b=document.getElementById('fin-sale-business'); if(b&&!b.value) b.value=match.business||'';
  var e=document.getElementById('fin-sale-email'); if(e&&!e.value) e.value=match.email||'';
  showNotif('Filled in from a previous sale for '+name,'success');
}

async function submitSale(){
  var btn=document.getElementById('fin-sale-submit-btn');
  if(btn&&btn.disabled) return;
  var payload={
    order_date:document.getElementById('fin-sale-date')?.value||new Date().toISOString().slice(0,10),
    client_name:document.getElementById('fin-sale-client')?.value?.trim(),
    contact:document.getElementById('fin-sale-contact')?.value?.trim()||null,
    business:document.getElementById('fin-sale-business')?.value?.trim()||null,
    email:document.getElementById('fin-sale-email')?.value?.trim()||null,
    order_package:document.getElementById('fin-sale-package')?.value||null,
    video_type:document.getElementById('fin-sale-videotype')?.value?.trim()||null,
    sales_amount:parseFloat(document.getElementById('fin-sale-amount')?.value)||0,
    va_name:document.getElementById('fin-sale-va')?.value?.trim()||null,
    paid_status:document.getElementById('fin-sale-paid')?.value||'Balance',
    notes:document.getElementById('fin-sale-notes')?.value?.trim()||null,
    created_by:currentUser.id
  };
  if(!payload.client_name){ showNotif('Client name is required','error'); return; }
  var origHtml=btn?btn.innerHTML:'';
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Saving...'; }
  try{
    var{error}=await sb.from('sales_orders').insert(payload);
    if(error){ showNotif('Error: '+error.message,'error'); return; }
    showNotif('Sale saved! ✓','success');
    ['fin-sale-client','fin-sale-contact','fin-sale-business','fin-sale-email','fin-sale-videotype','fin-sale-amount','fin-sale-va','fin-sale-notes'].forEach(function(id){
      var el=document.getElementById(id); if(el)el.value='';
    });
    finToggleSalesForm(true);
    loadFinancePage();
  }catch(err){ showNotif('Error: '+(err?.message||err),'error'); }
  finally{ if(btn){ btn.disabled=false; btn.innerHTML=origHtml; } }
}

async function submitExpense(){
  var btn=document.getElementById('fin-exp-submit-btn');
  if(btn&&btn.disabled) return;
  var payload={
    expense_date:document.getElementById('fin-exp-date')?.value||new Date().toISOString().slice(0,10),
    category:document.getElementById('fin-exp-category')?.value||'Other',
    item_name:document.getElementById('fin-exp-item')?.value?.trim(),
    amount:parseFloat(document.getElementById('fin-exp-amount')?.value)||0,
    notes:document.getElementById('fin-exp-notes')?.value?.trim()||null,
    created_by:currentUser.id
  };
  if(!payload.item_name){ showNotif('Item / description is required','error'); return; }
  var origHtml=btn?btn.innerHTML:'';
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Saving...'; }
  try{
    var{error}=await sb.from('business_expenses').insert(payload);
    if(error){ showNotif('Error: '+error.message,'error'); return; }
    showNotif('Expense saved! ✓','success');
    ['fin-exp-item','fin-exp-amount','fin-exp-notes'].forEach(function(id){
      var el=document.getElementById(id); if(el)el.value='';
    });
    finToggleExpenseForm(true);
    loadFinancePage();
  }catch(err){ showNotif('Error: '+(err?.message||err),'error'); }
  finally{ if(btn){ btn.disabled=false; btn.innerHTML=origHtml; } }
}

async function deleteSale(id){
  if(!confirm('Delete this sale entry?'))return;
  try{
    await sb.from('sales_orders').delete().eq('id',id);
    showNotif('Sale deleted.','success');
    loadFinancePage();
  }catch(err){ showNotif('Delete failed: '+(err?.message||err),'error'); }
}

async function deleteExpense(id){
  if(!confirm('Delete this expense entry?'))return;
  try{
    await sb.from('business_expenses').delete().eq('id',id);
    showNotif('Expense deleted.','success');
    loadFinancePage();
  }catch(err){ showNotif('Delete failed: '+(err?.message||err),'error'); }
}

async function loadFinancePage(){
  var salesBody=document.getElementById('fin-sales-body');
  var expBody=document.getElementById('fin-expenses-body');
  if(!salesBody||!expBody) return;
  var dfEl=document.getElementById('fin-date-from');
  var dtEl=document.getElementById('fin-date-to');
  if(dfEl && dtEl && !dfEl.value && !dtEl.value){
    var monthPill=document.querySelector('#fin-date-presets .proj-preset-pill[onclick*="\'month\'"]');
    finDatePreset('month',monthPill);
    return;
  }
  updateFinRangeLabel();
  var df=dfEl?.value||'';
  var dt=dtEl?.value||'';

  var salesQuery=sb.from('sales_orders').select('*').order('order_date',{ascending:false}).limit(500);
  if(df) salesQuery=salesQuery.gte('order_date',df);
  if(dt) salesQuery=salesQuery.lte('order_date',dt);
  var expQuery=sb.from('business_expenses').select('*').order('expense_date',{ascending:false}).limit(500);
  if(df) expQuery=expQuery.gte('expense_date',df);
  if(dt) expQuery=expQuery.lte('expense_date',dt);
  var adsQuery=sb.from('ads_spend_log').select('*').order('spend_date',{ascending:false}).limit(500);
  if(df) adsQuery=adsQuery.gte('spend_date',df);
  if(dt) adsQuery=adsQuery.lte('spend_date',dt);

  var[{data:sales,error:salesErr},{data:expenses,error:expErr},{data:adsLog,error:adsErr}]=await Promise.all([salesQuery,expQuery,adsQuery]);

  // Client lookup for autofill — pulls from ALL sales ever (not just this
  // date range) so past clients are always found regardless of filter
  sb.from('sales_orders').select('client_name,contact,business,email').order('created_at',{ascending:true}).limit(1000)
    .then(function(res){ window._finAllSalesEver=res.data||[]; finPopulateClientDatalist(); });

  if(salesErr){
    salesBody.innerHTML='<div class="table-empty"><div class="table-empty-icon">⚠️</div>Couldn\'t load sales — make sure the <code>sales_orders</code> table exists in Supabase (see setup SQL).</div>';
  }
  if(expErr){
    expBody.innerHTML='<div class="table-empty"><div class="table-empty-icon">⚠️</div>Couldn\'t load expenses — make sure the <code>business_expenses</code> table exists in Supabase (see setup SQL).</div>';
  }
  sales=sales||[]; expenses=expenses||[]; adsLog=adsLog||[];
  if(adsErr){
    var adsBodyErr=document.getElementById('fin-ads-body');
    if(adsBodyErr) adsBodyErr.innerHTML='<div class="table-empty"><div class="table-empty-icon">⚠️</div>Couldn\'t load ads spend — make sure the <code>ads_spend_log</code> table exists in Supabase (see setup SQL).</div>';
  }

  // ── Stats ──
  var totalSales=sales.reduce(function(s,o){return s+(Number(o.sales_amount)||0);},0);
  var totalExpenses=expenses.reduce(function(s,e){return s+(Number(e.amount)||0);},0);
  var totalAds=adsLog.reduce(function(s,a){return s+(Number(a.total_ads_spent)||0);},0);
  var totalMsgs=adsLog.reduce(function(s,a){return s+(Number(a.total_messages)||0);},0);
  var cpmEntries=adsLog.filter(function(a){return Number(a.cost_per_message)>0;});
  var avgCpm=cpmEntries.length?cpmEntries.reduce(function(s,a){return s+Number(a.cost_per_message);},0)/cpmEntries.length:0;
  var net=totalSales-totalExpenses;
  var elS=document.getElementById('fin-stat-sales'); if(elS)elS.textContent=finPHP(totalSales);
  var elE=document.getElementById('fin-stat-expenses'); if(elE)elE.textContent=finPHP(totalExpenses);
  var elN=document.getElementById('fin-stat-net'); if(elN){ elN.textContent=finPHP(net); elN.style.color=net>=0?'var(--green)':'#f87171'; }
  var elA=document.getElementById('fin-stat-ads'); if(elA)elA.textContent=finPHP(totalAds);
  var elCpm=document.getElementById('fin-stat-cpm'); if(elCpm)elCpm.textContent=finPHP(avgCpm);
  var elMsgs=document.getElementById('fin-stat-msgs'); if(elMsgs)elMsgs.textContent=totalMsgs;
  var elO=document.getElementById('fin-stat-orders'); if(elO)elO.textContent=sales.length;

  // ── Ads Spend table ──
  if(!adsErr){
    renderFinAdsTable(adsLog);
  }


  // ── Sales Target / Gap ──
  try{
    var{data:targetRow}=await sb.from('app_settings').select('value').eq('key','monthly_sales_target').maybeSingle();
    var target=targetRow?parseFloat(targetRow.value):0;
    var gapLabelEl=document.getElementById('fin-target-label');
    var gapValEl=document.getElementById('fin-stat-gap');
    if(target>0){
      var gap=target-totalSales;
      if(gapLabelEl) gapLabelEl.textContent='(of '+finPHP(target)+')';
      if(gapValEl){
        gapValEl.textContent=gap>0?finPHP(gap)+' to go':'Target hit! +'+finPHP(-gap);
        gapValEl.style.color=gap>0?'#facc15':'#4ade80';
        gapValEl.style.fontSize='16px';
        gapValEl.style.textDecoration='none';
      }
    } else {
      if(gapLabelEl) gapLabelEl.textContent='';
      if(gapValEl){ gapValEl.textContent='+ Set target'; gapValEl.style.color='var(--yellow)'; gapValEl.style.fontSize='13px'; gapValEl.style.textDecoration='underline'; gapValEl.style.textDecorationStyle='dotted'; }
    }
  }catch(e){}

  // ── Top VA Performers ──
  var vaBoard=document.getElementById('fin-va-leaderboard');
  if(vaBoard){
    var perVa={};
    sales.forEach(function(o){
      var name=(o.va_name||'').trim();
      if(!name) return;
      perVa[name]=perVa[name]||{sales:0,orders:0};
      perVa[name].sales+=Number(o.sales_amount)||0;
      perVa[name].orders++;
    });
    var vaNames=Object.keys(perVa).sort(function(a,b){return perVa[b].sales-perVa[a].sales;});
    vaBoard.innerHTML=vaNames.length?vaNames.map(function(name,i){
      var v=perVa[name];
      var medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:'+(i===0?'rgba(250,204,21,0.08)':'var(--bg3)')+';border:0.5px solid '+(i===0?'rgba(250,204,21,0.3)':'var(--border2)')+';border-radius:12px">'
        +'<span style="font-size:18px">'+(medal||'👤')+'</span>'
        +'<div><div style="font-size:12px;font-weight:700;color:var(--text)">'+name+'</div>'
        +'<div style="font-size:11px;color:var(--green);font-weight:650">'+finPHP(v.sales)+'</div>'
        +'<div style="font-size:10px;color:var(--text3)">'+v.orders+' order'+(v.orders===1?'':'s')+'</div></div>'
        +'</div>';
    }).join(''):'<div style="font-size:11.5px;color:var(--text3)">No VA-tagged sales in this period yet.</div>';
  }

  // ── Daily Breakdown ──
  var dailyBody=document.getElementById('fin-daily-body');
  if(dailyBody){
    if(!df||!dt){
      dailyBody.innerHTML='<div class="table-empty"><div class="table-empty-icon">📆</div>Pick a specific date range above to see the daily breakdown.</div>';
    } else {
      var start=new Date(df+'T00:00:00'), end=new Date(dt+'T00:00:00');
      var spanDays=Math.round((end-start)/86400000)+1;
      if(spanDays>62){
        dailyBody.innerHTML='<div class="table-empty"><div class="table-empty-icon">📆</div>Range is over 2 months — narrow it down (e.g. This Month) for a readable daily list.</div>';
      } else {
        var byDate={};
        sales.forEach(function(o){
          byDate[o.order_date]=byDate[o.order_date]||{total:0,count:0};
          byDate[o.order_date].total+=Number(o.sales_amount)||0;
          byDate[o.order_date].count++;
        });
        var rows=[];
        for(var d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
          var key=d.toISOString().slice(0,10);
          var info=byDate[key]||{total:0,count:0};
          var hasSale=info.count>0;
          rows.push('<div class="table-row" style="grid-template-columns:1.2fr 1fr 1fr 1fr">'
            +'<div class="row-date">'+fmtDate(key)+'</div>'
            +'<div style="font-size:11px;color:var(--text2)">'+info.count+'</div>'
            +'<div style="font-weight:650;color:'+(hasSale?'var(--green)':'var(--text3)')+'">'+finPHP(info.total)+'</div>'
            +'<div><span style="font-size:10px;font-weight:650;padding:3px 9px;border-radius:20px;background:'+(hasSale?'rgba(74,222,128,0.14);color:#4ade80':'rgba(239,68,68,0.1);color:#f87171')+'">'+(hasSale?'Has Sale':'No Sale')+'</span></div>'
            +'</div>');
        }
        dailyBody.innerHTML=rows.reverse().join('');
      }
    }
  }

  // ── Sales table ──
  window._finSalesCache=sales;
  if(!salesErr){
    renderFinSalesTable(finApplySalesSearch(sales));
  }

  // ── Expenses table ──
  if(!expErr){
    expBody.innerHTML=expenses.length?expenses.map(function(e,i){
      return '<div class="table-row" style="grid-template-columns:0.4fr 0.9fr 1.2fr 1.6fr 1fr 1.4fr 32px">'
        +'<div style="color:var(--text3);font-size:11px">'+(expenses.length-i)+'</div>'
        +'<div class="row-date">'+fmtDate(e.expense_date)+'</div>'
        +'<div style="font-size:11px;color:var(--text2)">'+(e.category||'—')+'</div>'
        +'<div class="row-name">'+(e.item_name||'—')+'</div>'
        +'<div style="font-weight:650;color:#f87171">'+finPHP(e.amount)+'</div>'
        +'<div style="font-size:11px;color:var(--text3)">'+(e.notes||'—')+'</div>'
        +'<div class="proj-row-del" title="Delete" onclick="deleteExpense(\''+e.id+'\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></div>'
        +'</div>';
    }).join(''):'<div class="table-empty"><div class="table-empty-icon">🧾</div>No expenses in this period yet.</div>';
  }
}

async function exportFinanceCSV(){
  var df=document.getElementById('fin-date-from')?.value||'';
  var dt=document.getElementById('fin-date-to')?.value||'';
  var salesQuery=sb.from('sales_orders').select('*').order('order_date',{ascending:false});
  if(df) salesQuery=salesQuery.gte('order_date',df);
  if(dt) salesQuery=salesQuery.lte('order_date',dt);
  var expQuery=sb.from('business_expenses').select('*').order('expense_date',{ascending:false});
  if(df) expQuery=expQuery.gte('expense_date',df);
  if(dt) expQuery=expQuery.lte('expense_date',dt);
  var adsQuery=sb.from('ads_spend_log').select('*').order('spend_date',{ascending:false});
  if(df) adsQuery=adsQuery.gte('spend_date',df);
  if(dt) adsQuery=adsQuery.lte('spend_date',dt);
  var[{data:sales},{data:expenses},{data:adsLog}]=await Promise.all([salesQuery,expQuery,adsQuery]);
  var esc=function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  var rows=['SALES','Date,Client,Contact,Business,Email,Package,Video Type,Sales,VA,Status,Notes'];
  (sales||[]).forEach(function(o){
    rows.push([o.order_date,o.client_name,o.contact,o.business,o.email,o.order_package,o.video_type,o.sales_amount,o.va_name,o.paid_status,o.notes].map(esc).join(','));
  });
  rows.push('');
  rows.push('EXPENSES');
  rows.push('Date,Category,Item,Amount,Notes');
  (expenses||[]).forEach(function(e){
    rows.push([e.expense_date,e.category,e.item_name,e.amount,e.notes].map(esc).join(','));
  });
  rows.push('');
  rows.push('ADS SPEND');
  rows.push('Date,Total Ads Spent,Cost Per Message,Total Messages,Notes');
  (adsLog||[]).forEach(function(a){
    rows.push([a.spend_date,a.total_ads_spent,a.cost_per_message,a.total_messages,a.notes].map(esc).join(','));
  });
  var blob=new Blob([rows.join('\n')],{type:'text/csv'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url; a.download='sales-expenses-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════
// INVOICE GENERATOR — replicates the Adgenius Service Invoice layout.
// Business header is fixed here to match the letterhead; ask Claude to
// update BIZ_INFO below if the company details ever change.
// ═══════════════════════════════════════
var BIZ_INFO={
  name:'ADGENIUS DIGITAL MARKETING SERVICES',
  prop:'REODEL A. BASALAN - Prop.',
  tinLine:'NONVAT Reg. TIN: 375-724-693-00000',
  address:'42 C. Vizcara St., Purok 1 New Lower Bicutan, City of Taguig NCR, Second District Philippines'
};
var _invCurrentSale=null;

async function openInvoiceModal(saleId){
  var{data:sale}=await sb.from('sales_orders').select('*').eq('id',saleId).maybeSingle();
  if(!sale){ showNotif('Could not load this sale','error'); return; }
  _invCurrentSale=sale;
  var{count}=await sb.from('sales_orders').select('id',{count:'exact',head:true});
  var suggestedNum=String((count||1)).padStart(4,'0');
  document.getElementById('inv-number').value=suggestedNum;
  document.getElementById('inv-sale-type').value=sale.paid_status==='Paid'?'Cash Sales':'Charge Sales';
  document.getElementById('inv-client-name').value=sale.client_name||'';
  document.getElementById('inv-tin').value='';
  document.getElementById('inv-address').value=sale.business||'';
  document.getElementById('inv-item-desc').value=[sale.order_package,sale.video_type].filter(Boolean).join(' — ')||'Service';
  document.getElementById('inv-qty').value=1;
  document.getElementById('inv-unit-price').value=sale.sales_amount||0;
  document.getElementById('inv-discount').value=0;
  document.getElementById('inv-wtax').value=0;
  document.getElementById('inv-preview-summary').innerHTML='<strong style="color:var(--yellow)">'+(sale.client_name||'—')+'</strong> · '+fmtDate(sale.order_date)+' · '+finPHP(sale.sales_amount)+'<br>Review the details below, then generate the PDF.';
  document.getElementById('invoice-modal').classList.add('open');
}

function closeInvoiceModal(){
  document.getElementById('invoice-modal').classList.remove('open');
}

function generateInvoicePDF(){
  if(typeof window.jspdf==='undefined'){ showNotif('PDF library failed to load — check your connection and try again.','error'); return; }
  var{jsPDF}=window.jspdf;
  var doc=new jsPDF({unit:'pt',format:'a5'});
  var pw=doc.internal.pageSize.getWidth();
  var margin=28;
  var y=margin;

  var invNo=document.getElementById('inv-number').value||'0001';
  var saleType=document.getElementById('inv-sale-type').value;
  var clientName=document.getElementById('inv-client-name').value||'—';
  var tin=document.getElementById('inv-tin').value||'';
  var address=document.getElementById('inv-address').value||'';
  var itemDesc=document.getElementById('inv-item-desc').value||'Service';
  var qty=parseFloat(document.getElementById('inv-qty').value)||1;
  var unitPrice=parseFloat(document.getElementById('inv-unit-price').value)||0;
  var discount=parseFloat(document.getElementById('inv-discount').value)||0;
  var wtax=parseFloat(document.getElementById('inv-wtax').value)||0;
  var amount=qty*unitPrice;
  var totalSales=amount;
  var totalDue=totalSales-discount-wtax;
  var dateStr=_invCurrentSale?new Date(_invCurrentSale.order_date).toLocaleDateString('en-PH',{month:'2-digit',day:'2-digit',year:'2-digit'}):'';
  var peso=function(n){ return 'P '+Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}); };

  // Outer border
  doc.setDrawColor(0); doc.setLineWidth(1.2);
  doc.rect(margin-10,margin-10,pw-2*(margin-10),doc.internal.pageSize.getHeight()-2*(margin-10));

  // Header
  doc.setFont('helvetica','bold'); doc.setFontSize(15);
  doc.text(BIZ_INFO.name,margin,y+10);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  doc.text(BIZ_INFO.prop,margin,y+24);
  doc.text(BIZ_INFO.tinLine,margin,y+35);
  doc.text(BIZ_INFO.address,margin,y+46,{maxWidth:pw-2*margin-90});

  doc.setFont('helvetica','bold'); doc.setFontSize(10);
  doc.text('SERVICE',pw-margin,y+10,{align:'right'});
  doc.text('INVOICE',pw-margin,y+22,{align:'right'});
  doc.setFontSize(9);
  doc.text('No.',pw-margin-55,y+38);
  doc.setTextColor(200,0,0);
  doc.text(invNo,pw-margin,y+38,{align:'right'});
  doc.setTextColor(0,0,0);

  y+=58;
  doc.setFontSize(8.5);
  doc.text((saleType==='Cash Sales'?'☑':'☐')+' CASH SALES',margin,y);
  doc.text((saleType==='Charge Sales'?'☑':'☐')+' CHARGE SALES',margin,y+11);
  doc.rect(pw-margin-95,y-9,95,12);
  doc.text('DATE: '+dateStr,pw-margin-90,y);

  y+=26;
  doc.setLineWidth(0.7); doc.line(margin,y,pw-margin,y);
  y+=13;
  doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text('SOLD TO:',margin,y);
  y+=13;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  doc.text('Registered Name:',margin,y);
  doc.setFont('helvetica','bold');
  doc.text(clientName,margin+90,y);
  y+=14;
  doc.setFont('helvetica','normal');
  doc.text('TIN:',margin,y);
  doc.text(tin,margin+30,y);
  y+=14;
  doc.text('Business Address:',margin,y);
  doc.text(address,margin+95,y,{maxWidth:pw-2*margin-95});
  y+=18;
  doc.line(margin,y,pw-margin,y);

  // Item table
  y+=4;
  var col1=margin,col2=margin+180,col3=margin+240,col4=pw-margin;
  doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('Item Description/Nature of Service',col1+2,y+10);
  doc.text('Qty',col2+2,y+10);
  doc.text('Unit Price',col3+2,y+10);
  doc.text('Amount',col4-2,y+10,{align:'right'});
  doc.rect(margin,y,pw-2*margin,16);
  doc.line(col2,y,col2,y+16); doc.line(col3,y,col3,y+16);
  y+=16;
  var rowH=16, tableTop=y;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  doc.rect(margin,y,pw-2*margin,rowH);
  doc.line(col2,y,col2,y+rowH); doc.line(col3,y,col3,y+rowH);
  doc.text(itemDesc,col1+2,y+11,{maxWidth:col2-col1-4});
  doc.text(String(qty),col2+2,y+11);
  doc.text(peso(unitPrice),col3+2,y+11);
  doc.text(peso(amount),col4-2,y+11,{align:'right'});
  y+=rowH;
  // a few empty rows for the physical-invoice look
  for(var r=0;r<4;r++){
    doc.rect(margin,y,pw-2*margin,rowH);
    doc.line(col2,y,col2,y+rowH); doc.line(col3,y,col3,y+rowH);
    y+=rowH;
  }

  // Totals box
  var totBoxW=170, totBoxX=pw-margin-totBoxW;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  function totRow(label,val,bold){
    doc.rect(totBoxX,y,totBoxW-60,16); doc.rect(totBoxX+totBoxW-60,y,60,16);
    doc.setFont('helvetica',bold?'bold':'normal');
    doc.text(label,totBoxX+4,y+11);
    doc.text(peso(val),totBoxX+totBoxW-4,y+11,{align:'right'});
    y+=16;
  }
  totRow('Total Sales',totalSales,false);
  totRow('Less: Discount',discount,false);
  totRow('Less: Withholding Tax',wtax,false);
  totRow('TOTAL AMOUNT DUE',totalDue,true);

  y+=26;
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.rect(margin,y-10,10,10);
  doc.text('Received the amount of',margin+14,y-2);
  y+=14;
  doc.line(margin,y+8,margin+120,y+8);
  doc.setFont('helvetica','bold'); doc.text(peso(totalDue),margin,y+6);

  y+=30;
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
  doc.text('"THIS DOCUMENT IS',margin,y);
  doc.text('NOT VALID FOR CLAIM',margin,y+11);
  doc.text('OF INPUT TAXES"',margin,y+22);

  doc.line(pw-margin-140,y+20,pw-margin,y+20);
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
  doc.text('Signature',pw-margin-140,y+29);

  doc.save('Invoice-'+invNo+'-'+clientName.replace(/[^a-z0-9]/gi,'')+'.pdf');
  closeInvoiceModal();
  showNotif('Invoice generated! 🧾','success');
}


function exportOutputsCSV(){
  var rows=document.querySelectorAll('#outputs-table-body .table-row');
  var csvRows=['"Editor","Client","Type","Status","URL","Label","Date"'];
  rows.forEach(function(row){
    var cells=row.querySelectorAll('div.row-name,div.row-sub,span,a,div.row-date');
    // Better approach - re-fetch from table data
  });
  // Export from current data
  sb.from('project_outputs').select('*,profiles(name,email),projects(client_name,status,fb_page)').order('created_at',{ascending:false}).limit(500)
    .then(function({data}){
      var outputs=data||[];
      var csv=['"#","Client Name","FB Page","Link","Type","Editor","Date Submitted"'].concat(
        outputs.map(function(o,i){
          return [
            outputs.length-i,
            o.projects?.client_name||'',
            o.projects?.fb_page||'',
            o.url||'',
            o.type||'',
            o.profiles?.name||o.profiles?.email||'',
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
  try{
    await sb.from('notifications').insert({
      user_id:editorId,
      message:'New project assigned to you: "'+(proj?.client_name||'Project')+'" — check My Tasks!',
      type:'assignment',
      project_id:projectId,
      is_read:false
    });
  }catch(e){}
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
- Performance over aesthetics. Message-first always.

PREMIUM QUALITY STANDARD (critical — the output must look like a real agency ad, NOT a cheap AI image):
- Direct like a professional photographer: soft diffused natural or golden-hour light, shallow depth of field, clean intentional composition, editorial quality. NOT a flat, harsh, or random snapshot.
- Realistic Filipino model with natural skin texture and a genuine, believable expression. Premium product staging with clean accurate packaging.
- Reserve clean negative space for text so it never overlaps the face or product label.

TEXT ACCURACY (most important — prevents garbled/misspelled text):
- In every imagePrompt, spell out each on-image text element inside quotes and explicitly instruct that it be rendered with PERFECT, CORRECT SPELLING in clean modern sans-serif typography.
- Keep total on-image text minimal and legible. Fewer words = cleaner render.
- Always include a negative instruction against misspelled/garbled text, clutter, harsh lighting, and cheap stock staging.

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
  "imagePrompt": "A complete, premium-grade image generation prompt for a 1080x1080 square Facebook/Instagram static ad. STRUCTURE the prompt in this order: (1) PHOTOGRAPHY — describe a professional editorial-quality photo, NOT a cheap snapshot: specify soft diffused natural window light or warm golden-hour light, shallow depth of field as if shot on a 50mm lens, clean intentional composition with clear negative space reserved for text, realistic Filipino model with natural skin texture and genuine expression, premium product staging with accurate clean packaging and realistic reflections. (2) LAYOUT — describe exactly where text sits and where the model/product sits so text never overlaps faces or product labels; reserve a clean band (top or bottom third) for text. (3) TEXT TO RENDER — you MUST spell out each text element in quotes with an instruction to render it with PERFECT, CORRECT SPELLING and clean modern sans-serif typography, e.g. render the headline text exactly and correctly spelled: '<tagline>' as the largest element; render the sub-line exactly: '<subheadline>'; render these benefit lines exactly and correctly spelled: '<bullet1>', '<bullet2>', '<bullet3>'; render the button text exactly: '<cta>'. Keep total text minimal and legible. Small brand name in one corner only. (4) BRAND — apply the specified brand colors consistently across background, text, and accents for a cohesive premium look. (5) NEGATIVE — end with: 'Avoid: misspelled or garbled text, cluttered layout, harsh flat lighting, oversaturation, cheap stock-photo staging, plastic-looking product, watermark, distorted hands or faces.' The whole thing must look like a real professional agency ad, Meta Ads compliant, no misleading claims, no guaranteed results, no before-and-after."
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
      type: 'imagecreative',        // hindi 'scene' para di mag-require ng face-lock avatar
      model: 'gpt-image-2',         // PREMIUM: latest flagship, medium quality (~$0.04/img)
      sceneIndex: idx,
      size: '1024x1024',
      clientName: document.getElementById('ic-brand').value.trim() || 'client'
    })
  });

  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Generation failed');
  // FIX: ang backend ay nagbabalik ng `url`, hindi `imageUrl`
  var imageUrl = data.url || data.imageUrl;
  if (!imageUrl) throw new Error('No image URL returned');

  return imageUrl;
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

var forUploadState = { items: [], filtered: [], formOpen: false, allStaff: [], showArchive: false };

function fuToggleForm(){
  forUploadState.formOpen = !forUploadState.formOpen;
  var wrap = document.getElementById('fu-form-wrap');
  var btn = document.getElementById('fu-toggle-btn');
  if (!wrap) return;
  if (forUploadState.formOpen){
    wrap.style.maxHeight = '640px'; wrap.style.opacity = '1'; wrap.style.marginBottom = '20px';
    if (btn) btn.style.opacity = '0.55';
    if (typeof fuSyncFormCategory === 'function') fuSyncFormCategory();
    fuLoadClientOptions();
    // pagkatapos ng open animation, i-visible ang overflow para hindi maputol
    // ang form kapag lumaki (hal. pag custom client name ang pinili)
    setTimeout(function(){ if(forUploadState.formOpen) wrap.style.overflow='visible'; }, 380);
  } else {
    wrap.style.overflow = 'hidden'; // ibalik bago mag-collapse
    wrap.style.maxHeight = '0'; wrap.style.opacity = '0'; wrap.style.marginBottom = '0';
    if (btn) btn.style.opacity = '1';
  }
}

// Populate the custom Client dropdown with real clients/projects so freebies
// submissions link back to the correct project instead of free-typed text
var fuClientOptions = [];
async function fuLoadClientOptions(){
  var list = document.getElementById('fu-client-dd-list');
  if (!list || fuClientOptions.length) { fuRenderClientDd(); return; } // load once
  try {
    var { data:projs } = await sb.from('projects').select('id,client_name').order('client_name');
    var seen = {};
    fuClientOptions = (projs||[]).filter(function(p){
      if (!p.client_name) return false;
      var k = p.client_name.trim().toLowerCase();
      if (seen[k]) return false; seen[k] = 1; return true;
    }).map(function(p){ return { id:p.id, name:p.client_name.trim() }; });
  } catch(e){ fuClientOptions = []; }
  fuRenderClientDd();
}
function fuRenderClientDd(filter){
  var list = document.getElementById('fu-client-dd-list');
  if (!list) return;
  var f = (filter||'').trim().toLowerCase();
  var items = fuClientOptions.filter(function(o){ return !f || o.name.toLowerCase().indexOf(f)>=0; });
  if (!items.length){
    list.innerHTML = '<div style="padding:10px 11px;font-size:12px;color:#7a7a85">No match — use \'Type new\' below</div>';
    return;
  }
  list.innerHTML = items.map(function(o){
    return '<div class="fu-dd-item" onclick="fuClientDdPick(\''+o.id+'\', \''+o.name.replace(/'/g,"\\'").replace(/"/g,'&quot;')+'\')">'
      + '<span class="fu-dd-dot" style="background:rgba(255,255,255,0.2)"></span>'
      + escapeHtml(o.name) + '</div>';
  }).join('');
}
function fuClientDdToggle(){
  var dd = document.getElementById('fu-dd-client');
  if (!dd) return;
  var wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.fu-dd.open').forEach(function(x){ x.classList.remove('open'); });
  if (!wasOpen){
    dd.classList.add('open');
    fuRenderClientDd('');
    var srch = document.getElementById('fu-client-search');
    if (srch){ srch.value=''; setTimeout(function(){ srch.focus(); }, 40); }
  }
}
function fuClientDdFilter(v){ fuRenderClientDd(v); }
function fuClientDdSetLabel(text, isPlaceholder){
  var dd = document.getElementById('fu-dd-client');
  var lbl = dd ? dd.querySelector('[data-label]') : null;
  if (lbl){ lbl.textContent = text; lbl.style.color = isPlaceholder ? '#8a8a95' : '#f2f2f5'; }
}
function fuClientDdPick(pid, name){
  document.getElementById('fu-client-select').value = pid;      // real project id
  document.getElementById('fu-client-project-id').value = pid;
  var nameInput = document.getElementById('fu-client-name');
  if (nameInput){ nameInput.style.display='none'; nameInput.value = name; }
  fuClientDdSetLabel(name, false);
  var dd = document.getElementById('fu-dd-client'); if (dd) dd.classList.remove('open');
}
function fuClientDdPickCustom(){
  document.getElementById('fu-client-select').value = '__custom__';
  document.getElementById('fu-client-project-id').value = '';
  var nameInput = document.getElementById('fu-client-name');
  if (nameInput){ nameInput.style.display='block'; nameInput.value=''; nameInput.focus(); }
  fuClientDdSetLabel('Type new / not listed', false);
  var dd = document.getElementById('fu-dd-client'); if (dd) dd.classList.remove('open');
  // siguraduhing hindi maputol ang form
  var wrap = document.getElementById('fu-form-wrap');
  if (wrap){ wrap.style.overflow='visible'; wrap.style.maxHeight='760px'; }
}

function fuClientSelectChange(){
  var sel = document.getElementById('fu-client-select');
  var nameInput = document.getElementById('fu-client-name');
  var pidInput = document.getElementById('fu-client-project-id');
  if (!sel) return;
  var wrap = document.getElementById('fu-form-wrap');
  if (sel.value === '__custom__'){
    if (nameInput){ nameInput.style.display = 'block'; nameInput.value = ''; nameInput.focus(); }
    if (pidInput) pidInput.value = '';
    if (wrap){ wrap.style.overflow='visible'; wrap.style.maxHeight='760px'; }
  } else if (sel.value === ''){
    if (nameInput){ nameInput.style.display = 'none'; nameInput.value = ''; }
    if (pidInput) pidInput.value = '';
  } else {
    var label = sel.options[sel.selectedIndex].textContent;
    if (nameInput){ nameInput.style.display = 'none'; nameInput.value = label; }
    if (pidInput) pidInput.value = sel.value;
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

// ══════════════════════════════════════════════
// FOR UPLOAD — List / History tabs
// Same behavior as Own Brand Creatives history: logs
// every publish/unpublish/status action with actor + date
// ══════════════════════════════════════════════
var fuHistoryItems=[];

function fuSwitchView(view){
  var listV=document.getElementById('fu-view-list');
  var histV=document.getElementById('fu-view-history');
  var tabL=document.getElementById('fu-tab-list');
  var tabH=document.getElementById('fu-tab-history');
  if(view==='history'){
    if(listV) listV.style.display='none';
    if(histV) histV.style.display='';
    if(tabL) tabL.classList.remove('active');
    if(tabH) tabH.classList.add('active');
    loadFuHistory();
  } else {
    if(histV) histV.style.display='none';
    if(listV) listV.style.display='';
    if(tabH) tabH.classList.remove('active');
    if(tabL) tabL.classList.add('active');
  }
}

async function loadFuHistory(){
  var box=document.getElementById('fu-history-body');
  if(!box) return;
  skelRows('fu-history-body', 4);
  try{
    var r=await sb.from('creatives_upload_log').select('*').order('created_at',{ascending:false}).limit(200);
    fuHistoryItems=r.data||[];
  }catch(e){ fuHistoryItems=[]; }
  if(!fuHistoryItems.length){
    box.innerHTML=emptyState(ICO_INBOX,'No history yet','Publish, unpublish, and status changes will be logged here.');
    return;
  }
  box.innerHTML=fuHistoryItems.map(function(h){
    var act=(h.action||'').toLowerCase();
    var conf={
      'published':{bg:'rgba(94,234,212,0.14)',c:'#5eead4',t:'Published'},
      'unpublished':{bg:'rgba(251,146,60,0.15)',c:'#fb923c',t:'Unpublished'},
      'done':{bg:'rgba(250,204,21,0.14)',c:'#facc15',t:'Done'},
      'uploaded':{bg:'rgba(96,165,250,0.14)',c:'#7db4fb',t:'Uploaded'}
    };
    var cf=conf[act]||{bg:'rgba(255,255,255,0.06)',c:'#c8c8d0',t:(h.action||'\u2014')};
    var badge='<span style="background:'+cf.bg+';color:'+cf.c+';font-size:10px;font-weight:650;padding:3px 9px;border-radius:20px">'+cf.t+'</span>';
    var when=h.created_at?new Date(h.created_at).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'\u2014';
    return '<div class="ob-hist-row">'
      + '<div class="ob-hist-name">'+escapeHtml(h.page_name||h.project_name||'\u2014')+'</div>'
      + '<div>'+badge+'</div>'
      + '<div class="ob-hist-actor">'+escapeHtml(h.actor_name||'Someone')+'</div>'
      + '<div class="ob-hist-date">'+when+'</div>'
      + '</div>';
  }).join('');
}

// Same as obLogHistory — tinatawag tuwing may status change
async function fuLogHistory(creative, action){
  try{
    var actorName=(currentUser && (currentUser.user_metadata && currentUser.user_metadata.name || currentUser.email)) || 'Someone';
    await sb.from('creatives_upload_log').insert({
      creative_id: creative && creative.id || null,
      project_name: creative && creative.project_name || null,
      page_name: (creative && creative.content_type) || (creative && creative.project_name) || null,
      action: action,
      actor_id: currentUser && currentUser.id || null,
      actor_name: actorName
    });
  }catch(e){ console.error('fuLogHistory failed:', e); }
}

async function loadForUpload(){
  skelRows('fu-table-body', 5);
  var nowIso = new Date().toISOString();
  // ARCHIVE (hindi na delete): kapag lampas na sa 48h ang published creative,
  // itatago na lang sa main list pero mananatili sa database para sa tracking.
  // Admin lang ang makakakita nito sa Archive tab.
  try {
    await sb.from('creatives_upload')
      .update({ archived: true })
      .lt('expires_at', nowIso)
      .not('expires_at','is',null)
      .neq('archived', true);
  } catch(e){ console.log('Archive skip:', e.message); }

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
  var freebiesDone = forUploadState.items.filter(function(c){ return c.is_freebies && c.status === 'Done'; }).length;
  var wEl = document.getElementById('fu-waiting-count');
  var pEl = document.getElementById('fu-published-count');
  var fdEl = document.getElementById('fu-freebies-done-count');
  if (wEl) wEl.textContent = waiting;
  if (pEl) pEl.textContent = published;
  if (fdEl) fdEl.textContent = freebiesDone;

  filterForUpload();
}

function filterForUpload(){
  var q = (document.getElementById('fu-search')?.value || '').toLowerCase();
  var owner = document.getElementById('fu-owner-filter')?.value || '';
  var status = document.getElementById('fu-status-filter')?.value || '';
  var pageF = document.getElementById('fu-page-filter')?.value || '';
  var catF = (typeof fuActiveCat !== 'undefined' && fuActiveCat)
    ? fuActiveCat
    : (document.getElementById('fu-cat-filter')?.value || '');
  var archiveView = forUploadState.showArchive === true;
  if (typeof fuUpdateCatCounts === 'function') fuUpdateCatCounts();
  forUploadState.filtered = forUploadState.items.filter(function(c){
    // Archive view = archived lang; Main view = hindi archived
    var isArchived = c.archived === true;
    if (archiveView !== isArchived) return false;
    var matchQ = !q ||
      (c.project_name||'').toLowerCase().includes(q) ||
      (c.owner_name||'').toLowerCase().includes(q) ||
      (c.headline||'').toLowerCase().includes(q) ||
      (c.ad_copy||'').toLowerCase().includes(q) ||
      (c.client_name||'').toLowerCase().includes(q);
    var matchOwner = !owner || c.owner_name === owner;
    var matchStatus = !status || c.status === status;
    var matchPage = !pageF || c.content_type === pageF;
    var matchCat = !catF || c.category === catF;
    return matchQ && matchOwner && matchStatus && matchPage && matchCat;
  });
  renderForUpload();
}

// ═══════════════════════════════════════════
// API CONNECTORS (BYOK) — Settings page
// ═══════════════════════════════════════════
var CONNECTORS = [
  {
    id: 'openai', name: 'OpenAI', sub: 'GPT Image 2 — static ad creatives',
    icon: '◉', iconBg: 'rgba(74,222,128,0.1)', iconColor: '#6ee7a0',
    placeholder: 'sk-...', keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: 'platform.openai.com', available: true
  },
  {
    id: 'grok', name: 'Grok — xAI', sub: 'Image at text generation',
    icon: '𝕏', iconBg: 'rgba(255,255,255,0.06)', iconColor: '#e8e8ec',
    placeholder: 'xai-...', keyUrl: 'https://console.x.ai',
    keyUrlLabel: 'console.x.ai', available: true
  },
  {
    id: 'gemini', name: 'Google Gemini / Veo', sub: 'Image at video generation',
    icon: '◆', iconBg: 'rgba(96,165,250,0.12)', iconColor: '#7db4fb',
    placeholder: 'AIza...', keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: 'aistudio.google.com', available: true
  },
  {
    id: 'flow', name: 'Google Flow', sub: 'Walang public API — hindi maikokonekta',
    icon: '▶', iconBg: 'rgba(255,255,255,0.04)', iconColor: '#8a8a95',
    available: false,
    note: 'Ang Flow ay consumer app lang — walang API na pwedeng tawagin mula dito. Para magamit ang Flow account mo, kailangan ng browser extension (AdFlow), hindi sa loob ng AI Creatives.'
  }
];

var connectorState = {};

async function loadConnectors(){
  var wrap = document.getElementById('conn-list');
  if (!wrap) return;
  try {
    var r = await sb.from('api_connectors').select('provider,status,last_tested_at,api_key');
    connectorState = {};
    (r.data || []).forEach(function(row){
      connectorState[row.provider] = {
        status: row.status,
        lastTested: row.last_tested_at,
        masked: maskKey(row.api_key)
      };
    });
  } catch(e){ connectorState = {}; }
  renderConnectors();
}

function maskKey(k){
  if (!k) return '';
  if (k.length <= 10) return k.slice(0,3) + '••••';
  return k.slice(0,4) + '••••••••••••••••' + k.slice(-4);
}

function renderConnectors(){
  var wrap = document.getElementById('conn-list');
  if (!wrap) return;
  wrap.innerHTML = CONNECTORS.map(function(c){
    if (!c.available){
      return '<div class="conn-card unavailable">'
        + '<div class="conn-top">'
        +   '<div class="conn-ico" style="background:'+c.iconBg+';color:'+c.iconColor+'">'+c.icon+'</div>'
        +   '<div style="flex:1"><div class="conn-name" style="color:#8a8a95">'+c.name+'</div><div class="conn-sub">'+c.sub+'</div></div>'
        +   '<span class="conn-badge" style="background:rgba(255,255,255,0.04);color:#8a8a95;border:0.5px solid rgba(255,255,255,0.08)">Unavailable</span>'
        + '</div>'
        + '<div class="conn-body"><div class="conn-note" style="margin-top:0">'+c.note+'</div></div>'
        + '</div>';
    }

    var st = connectorState[c.id];
    var isConn = st && st.masked;
    var badge = isConn
      ? '<span class="conn-badge" style="background:rgba(74,222,128,0.16);color:#6ee7a0;border:0.5px solid rgba(74,222,128,0.35)">● Connected</span>'
      : '<span class="conn-badge" style="background:rgba(255,255,255,0.05);color:#8a8a95;border:0.5px solid rgba(255,255,255,0.1)">Not connected</span>';

    var body;
    if (isConn){
      var tested = '';
      if (st.status === 'working') tested = 'Huling na-test: <b style="color:#6ee7a0">gumagana</b>';
      else if (st.status === 'failed') tested = 'Huling na-test: <b style="color:#f87171">hindi gumana</b>';
      else tested = 'Hindi pa na-test';
      if (st.lastTested) tested += ' · ' + new Date(st.lastTested).toLocaleString('en-PH', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

      body = '<div class="conn-body">'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        +   '<span style="font-family:ui-monospace,monospace;font-size:12px;color:#9a9aa5;flex:1;min-width:180px">'+st.masked+'</span>'
        +   '<button class="conn-btn ghost" onclick="testConnector(\''+c.id+'\')" id="conn-test-'+c.id+'">Test</button>'
        +   '<button class="conn-btn" onclick="disconnectConnector(\''+c.id+'\')" style="background:rgba(239,68,68,0.12);color:#f87171;border:0.5px solid rgba(239,68,68,0.3)">Disconnect</button>'
        + '</div>'
        + '<div class="conn-note">'+tested+'</div>'
        + '</div>';
    } else {
      body = '<div class="conn-body">'
        + '<input class="conn-in" id="conn-key-'+c.id+'" placeholder="'+c.placeholder+'" autocomplete="off"/>'
        + '<div style="display:flex;gap:9px;margin-top:10px">'
        +   '<button class="conn-btn" onclick="saveConnector(\''+c.id+'\')" style="background:var(--yellow,#facc15);color:#111" id="conn-save-'+c.id+'">Connect</button>'
        + '</div>'
        + '<div class="conn-note">Kunin ang key sa <a class="conn-link" href="'+c.keyUrl+'" target="_blank" rel="noopener">'+c.keyUrlLabel+'</a> — kailangan ng billing account.</div>'
        + '</div>';
    }

    return '<div class="conn-card'+(isConn?' connected':'')+'">'
      + '<div class="conn-top">'
      +   '<div class="conn-ico" style="background:'+c.iconBg+';color:'+c.iconColor+'">'+c.icon+'</div>'
      +   '<div style="flex:1"><div class="conn-name">'+c.name+'</div><div class="conn-sub">'+c.sub+'</div></div>'
      +   badge
      + '</div>'
      + body
      + '</div>';
  }).join('');
}

async function saveConnector(provider){
  var input = document.getElementById('conn-key-' + provider);
  var key = input ? input.value.trim() : '';
  if (!key){ showNotif('Ilagay muna ang API key', 'error'); return; }

  var btn = document.getElementById('conn-save-' + provider);
  if (btn){ btn.disabled = true; btn.textContent = 'Connecting...'; }

  try {
    var u = await sb.auth.getUser();
    var uid = u?.data?.user?.id;
    if (!uid) throw new Error('Not signed in');

    var r = await sb.from('api_connectors').upsert({
      user_id: uid,
      provider: provider,
      api_key: key,
      status: 'untested',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,provider' });

    if (r.error) throw new Error(r.error.message);

    showNotif('Connected ✓ — i-test mo para masiguro', 'success');
    await loadConnectors();
    testConnector(provider);
  } catch(e){
    showNotif('Hindi na-save: ' + e.message, 'error');
    if (btn){ btn.disabled = false; btn.textContent = 'Connect'; }
  }
}

async function testConnector(provider){
  var btn = document.getElementById('conn-test-' + provider);
  if (btn){ btn.disabled = true; btn.textContent = 'Testing...'; }
  try {
    var key = await getUserApiKey(provider);
    if (!key) throw new Error('Walang naka-save na key');

    var res = await fetch('/api/test-connector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: provider, apiKey: key })
    });
    var d = await res.json();
    var ok = d.ok === true;

    var u = await sb.auth.getUser();
    var uid = u?.data?.user?.id;
    if (uid){
      await sb.from('api_connectors')
        .update({ status: ok ? 'working' : 'failed', last_tested_at: new Date().toISOString() })
        .eq('user_id', uid).eq('provider', provider);
    }
    showNotif(ok ? 'Gumagana ang key ✓' : ('Hindi gumana: ' + (d.error || 'invalid key')), ok ? 'success' : 'error');
    await loadConnectors();
  } catch(e){
    showNotif('Test failed: ' + e.message, 'error');
    if (btn){ btn.disabled = false; btn.textContent = 'Test'; }
  }
}

async function disconnectConnector(provider){
  if (!confirm('Tanggalin ang key na ito?')) return;
  try {
    var u = await sb.auth.getUser();
    var uid = u?.data?.user?.id;
    if (!uid) throw new Error('Not signed in');
    var r = await sb.from('api_connectors').delete().eq('user_id', uid).eq('provider', provider);
    if (r.error) throw new Error(r.error.message);
    showNotif('Disconnected', 'success');
    await loadConnectors();
  } catch(e){
    showNotif('Hindi natanggal: ' + e.message, 'error');
  }
}

// Kunin ang user key para sa isang provider (ginagamit sa generation)
async function getUserApiKey(provider){
  try {
    var r = await sb.from('api_connectors').select('api_key,status').eq('provider', provider).maybeSingle();
    if (r.data && r.data.api_key) return r.data.api_key;
  } catch(e){}
  return null;
}

// ── TAGS (Freebies / Direct client) ──
var fuTags = { freebies: false, direct: false };
function fuToggleTag(which){
  fuTags[which] = !fuTags[which];
  var el = document.getElementById(which === 'freebies' ? 'fu-tag-freebies' : 'fu-tag-direct');
  if (el) el.classList.toggle('on', fuTags[which]);
}
function fuResetTags(){
  fuTags = { freebies: false, direct: false };
  ['fu-tag-freebies','fu-tag-direct'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.classList.remove('on');
  });
}

// ── ARCHIVE TOGGLE (admin only) ──
function fuToggleArchive(){
  if (currentUserRole !== 'admin'){ showNotif('Admin only', 'error'); return; }
  forUploadState.showArchive = !forUploadState.showArchive;
  var btn = document.getElementById('fu-archive-btn');
  if (btn){
    if (forUploadState.showArchive){
      btn.style.background = 'rgba(250,204,21,0.16)';
      btn.style.color = 'var(--yellow)';
      btn.style.borderColor = 'rgba(250,204,21,0.45)';
      btn.innerHTML = "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' style='vertical-align:-2px;margin-right:6px'><rect x='2' y='4' width='20' height='5' rx='1'/><path d='M4 9v9a2 2 0 002 2h12a2 2 0 002-2V9'/><line x1='10' y1='13' x2='14' y2='13'/></svg>Viewing Archive — back to Active";
    } else {
      btn.style.background = 'var(--bg2,#17171b)';
      btn.style.color = 'var(--text2,#c8c8d0)';
      btn.style.borderColor = 'rgba(255,255,255,0.09)';
      btn.innerHTML = "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' style='vertical-align:-2px;margin-right:6px'><rect x='2' y='4' width='20' height='5' rx='1'/><path d='M4 9v9a2 2 0 002 2h12a2 2 0 002-2V9'/><line x1='10' y1='13' x2='14' y2='13'/></svg>Archive (tracking)";
    }
  }
  filterForUpload();
}

function fuCountdown(expiresAt){
  if (!expiresAt) return '';
  var ms = new Date(expiresAt) - new Date();
  if (ms <= 0) return '<span style="font-size:9px;color:var(--text3)">Archiving...</span>';
  var h = Math.floor(ms / (1000*60*60));
  var m = Math.floor((ms % (1000*60*60)) / (1000*60));
  var label = h > 0 ? ('Archives in ' + h + 'h') : ('Archives in ' + m + 'm');
  return '<div style="font-size:9px;color:#f5a623;margin-top:4px;font-weight:600;display:flex;align-items:center;gap:3px"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + label + '</div>';
}

function fuPageBadge(page){
  if (!page) return '<span style="color:#8a8a95">—</span>';
  var styles = {
    'VIRAL UGC':       { bg:'rgba(167,139,250,0.16)', c:'#b9a5fc', bd:'rgba(167,139,250,0.4)' },
    'HCSI':            { bg:'rgba(250,204,21,0.16)',  c:'#fbd94f', bd:'rgba(250,204,21,0.4)' },
    'AI UNIVERSITY':   { bg:'rgba(96,165,250,0.16)',  c:'#7db4fb', bd:'rgba(96,165,250,0.4)' },
    'MERCH CREATIVES': { bg:'rgba(74,222,128,0.16)',  c:'#6ee7a0', bd:'rgba(74,222,128,0.4)' },
    'BATIK MALONG':    { bg:'rgba(244,114,182,0.16)', c:'#f792c4', bd:'rgba(244,114,182,0.4)' },
    'BATIK BAG':       { bg:'rgba(251,146,60,0.16)',  c:'#fcae72', bd:'rgba(251,146,60,0.4)' }
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
  var head = document.getElementById('fu-table-head');
  if (head){
    head.style.gridTemplateColumns = '1fr 1.5fr 1fr 0.9fr 0.9fr 0.6fr 0.65fr 1.1fr 1fr 1.1fr';
    head.innerHTML = '<span>Staff</span><span>Project name</span><span>New client</span><span>Page</span><span>Tags</span><span>Ad copy</span><span>File link</span><span>Headline</span><span>Date uploaded</span><span>Status</span>';
  }

  var items = forUploadState.filtered;
  if (!items.length){
    body.innerHTML = '<div class="table-empty"><div class="table-empty-icon">'
      + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8a95" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
      + '</div>No creatives yet in <b style="color:#facc15">'+escapeHtml(fuActiveCat)+'</b>. Click "Add creative" above!</div>';
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
      : '<span style="color:#8a8a95">—</span>';
    var fileLink = c.file_link ? '<a href="'+c.file_link+'" target="_blank" style="color:var(--yellow);font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>Open</a>' : '<span style="color:#8a8a95">—</span>';
    var headline = c.headline
      ? '<button class="fu-headline-btn" data-headline="'+escapeHtml(c.headline)+'" title="Click to copy" style="cursor:pointer;background:none;border:none;color:#d4d4dc;font-size:11px;text-align:left;padding:0;display:inline-flex;align-items:center;gap:5px">'+escapeHtml(c.headline.substring(0,26))+(c.headline.length>26?'…':'')+'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8a95" stroke-width="2" style="flex-shrink:0"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>'
      : '<span style="color:#8a8a95">—</span>';

    // ── CAPSULE STATUS DROPDOWN ──
    var isDone = c.status === 'Done';
    var pillText  = isPublished ? '#4ade80' : (isDone ? '#facc15' : '#f87171');
    var pillBorder= isPublished ? 'rgba(34,197,94,0.45)' : (isDone ? 'rgba(250,204,21,0.45)' : 'rgba(239,68,68,0.45)');
    var pillBg    = isPublished ? 'linear-gradient(180deg,rgba(34,197,94,0.22),rgba(34,197,94,0.12))' : (isDone ? 'linear-gradient(180deg,rgba(250,204,21,0.22),rgba(250,204,21,0.12))' : 'linear-gradient(180deg,rgba(239,68,68,0.22),rgba(239,68,68,0.12))');
    var statusCell =
      '<div class="fu-status-dd" id="fu-sdd-'+c.id+'">'
      + '<button class="fu-status-pill" onclick="fuStatusToggle(\''+c.id+'\')" style="background:'+pillBg+';color:'+pillText+';border:0.5px solid '+pillBorder+'">'
      +   '<span class="fu-pill-dot" style="background:'+pillText+'"></span>'
      +   '<span>'+c.status+'</span>'
      +   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</button>'
      + '<div class="fu-status-menu">'
      +   '<div class="fu-status-opt" onclick="fuStatusPick(\''+c.id+'\',\'Unpublished\')"><span class="fu-pill-dot" style="background:#f87171"></span>Unpublished</div>'
      +   '<div class="fu-status-opt" onclick="fuStatusPick(\''+c.id+'\',\'Done\')"><span class="fu-pill-dot" style="background:#facc15"></span>Done</div>'
      +   '<div class="fu-status-opt" onclick="fuStatusPick(\''+c.id+'\',\'Published\')"><span class="fu-pill-dot" style="background:#4ade80"></span>Published</div>'
      + '</div>'
      + (isPublished ? fuCountdown(c.expires_at) : '')
      + '</div>';

    var namingTag = '';
    var newClientCell = c.client_name
      ? '<div class="fu-newclient">'
        + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        + '<span>'+escapeHtml(c.client_name)+'</span></div>'
      : '<span style="color:#7a7a85;font-size:11px">—</span>';
    var tagsCell = '';
    if (c.is_freebies) tagsCell += '<span class="fu-row-tag" style="background:rgba(74,222,128,0.14);color:#6ee7a0;border:0.5px solid rgba(74,222,128,0.3)">Freebies</span>';
    if (c.is_direct_client) tagsCell += '<span class="fu-row-tag" style="background:rgba(96,165,250,0.14);color:#7db4fb;border:0.5px solid rgba(96,165,250,0.3)">Direct client</span>';
    if (!tagsCell) tagsCell = '<span style="color:#7a7a85;font-size:11px">—</span>';

    return '<div class="table-row fu-row" style="grid-template-columns:1fr 1.5fr 1fr 0.9fr 0.9fr 0.6fr 0.65fr 1.1fr 1fr 1.1fr;align-items:center">'
      + '<div>'+fuStaffChip(c.owner_name)+'</div>'
      + '<div><div class="row-name" style="font-weight:600;color:#f4f4f7">'+escapeHtml(c.project_name||'—')+'</div>'+namingTag+fuFreebiesTag(c)+'</div>'
      + '<div>'+newClientCell+'</div>'
      + '<div>'+fuPageBadge(c.content_type)+'</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:3px">'+tagsCell+'</div>'
      + '<div>'+adCopy+'</div>'
      + '<div>'+fileLink+'</div>'
      + '<div>'+headline+'</div>'
      + '<div><div style="font-size:12px;font-weight:600;color:#e8e8ec">'+dateMain+'</div><div style="font-size:9px;color:#7a7a85;margin-top:1px">'+dateYear+' · '+dateTime+'</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px">'+statusCell
      +   (currentUserRole==='admin'?'<button class="fu-del-btn" data-id="'+c.id+'" style="background:none;border:none;color:#8a8a95;cursor:pointer;font-size:12px">✕</button>':'')
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
async function fuSetStatus(id, status){
  // ── OPTIMISTIC UPDATE: agad baguhin sa UI bago pa mag-database ──
  var item = forUploadState.items.find(function(x){ return x.id === id; });
  var prevSnapshot = item ? { status:item.status, published_at:item.published_at, expires_at:item.expires_at } : null;

  var update = { status: status };
  if (status === 'Published'){
    var now = new Date();
    var expires = new Date(now.getTime() + 48*60*60*1000); // +48 hours
    update.published_at = now.toISOString();
    update.expires_at = expires.toISOString();
  } else {
    update.published_at = null;
    update.expires_at = null;
  }

  // Instant: i-apply agad sa local state + re-render (walang hintay)
  if (item){
    item.status = update.status;
    item.published_at = update.published_at;
    item.expires_at = update.expires_at;
    // update rin ang counts sa header
    var waiting = forUploadState.items.filter(function(c){ return c.status !== 'Published'; }).length;
    var published = forUploadState.items.filter(function(c){ return c.status === 'Published'; }).length;
    var freebiesDone = forUploadState.items.filter(function(c){ return c.is_freebies && c.status === 'Done'; }).length;
    var wEl = document.getElementById('fu-waiting-count');
    var pEl = document.getElementById('fu-published-count');
    var fdEl = document.getElementById('fu-freebies-done-count');
    if (wEl) wEl.textContent = waiting;
    if (pEl) pEl.textContent = published;
    if (fdEl) fdEl.textContent = freebiesDone;
    filterForUpload();
  }

  // Sa likod: i-sync sa Supabase
  var { error } = await sb.from('creatives_upload').update(update).eq('id', id);
  if (error){
    // Kung nag-fail, ibalik sa dati
    if (item && prevSnapshot){
      item.status = prevSnapshot.status;
      item.published_at = prevSnapshot.published_at;
      item.expires_at = prevSnapshot.expires_at;
      filterForUpload();
    }
    showNotif('Error: '+error.message, 'error');
    return;
  }
  showNotif(status === 'Published' ? 'Published! Auto-removes in 48h ✓' : 'Set to Unpublished ✓', 'success');
  if (typeof logActivity === 'function') logActivity('CREATIVE_'+status.toUpperCase(), id);
  // Log sa History (same as Own Brand Creatives)
  if (typeof fuLogHistory === 'function') fuLogHistory(item, status.toLowerCase());
  var histV=document.getElementById('fu-view-history');
  if(histV && histV.style.display!=='none' && typeof loadFuHistory==='function') loadFuHistory();
}
// isara ang status dropdown pag nag-click sa labas
document.addEventListener('click', function(e){
  if (!e.target.closest('.fu-status-dd')) {
    document.querySelectorAll('.fu-status-dd.open').forEach(function(x){ x.classList.remove('open'); });
  }
});

async function fuAddCreative(){
  var projectName = document.getElementById('fu-project-name')?.value?.trim();
  if (!projectName){ showNotif('Project name required', 'error'); return; }
  var customPage = document.getElementById('fu-page-custom');
  if (customPage && customPage.style.display !== 'none' && !customPage.value.trim()){
    showNotif('Type the custom page name', 'error'); return;
  }
  var btn = document.getElementById('fu-add-btn');
  if (btn){ btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Adding...'; }

  var ownerName = currentUser?.email || 'Unknown';
  try {
    var { data:prof } = await sb.from('profiles').select('name').eq('id', currentUser.id).maybeSingle();
    if (prof?.name) ownerName = prof.name;
  } catch(e){}

  // If a brand-new client name was typed (not picked from the list), create
  // a real project for it first so it registers team-wide — shows up in
  // All Projects, and becomes selectable in every other client dropdown
  // (Add done output, My Freebies Tasks, etc.) for every editor/admin.
  var fuClientSel = document.getElementById('fu-client-select');
  var fuTypedClientName = document.getElementById('fu-client-name')?.value?.trim() || '';
  var fuResolvedProjectId = document.getElementById('fu-client-project-id')?.value || null;
  if (fuClientSel?.value === '__custom__' && fuTypedClientName && !fuResolvedProjectId) {
    try{
      var { data:newProj, error:newProjErr } = await sb.from('projects').insert({
        client_name: fuTypedClientName,
        status: 'New Input',
        assigned_to: currentUser.id
      }).select().maybeSingle();
      if (!newProjErr && newProj) {
        fuResolvedProjectId = newProj.id;
        logActivity('PROJECT_CREATED', fuTypedClientName+' (via Add creative)');
      }
    }catch(e){}
  }

  var { error } = await sb.from('creatives_upload').insert({
    owner_id: currentUser?.id,
    owner_name: ownerName,
    project_name: projectName,
    gender: 'All',
    content_type: document.getElementById('fu-page')?.value || 'VIRAL UGC',
    ad_copy: document.getElementById('fu-ad-copy')?.value?.trim() || null,
    client_name: document.getElementById('fu-client-name')?.value?.trim() || null,
    project_id: fuResolvedProjectId || null,
    category: (typeof fuActiveCat !== 'undefined' && fuActiveCat) ? fuActiveCat : (document.getElementById('fu-category')?.value || null),
    is_freebies: fuTags.freebies,
    is_direct_client: fuTags.direct,
    file_link: document.getElementById('fu-file-link')?.value?.trim() || null,
    headline: document.getElementById('fu-headline')?.value?.trim() || null,
    status: 'Unpublished'
  });

  if (btn){ btn.disabled = false; btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-2px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add creative'; }
  if (error){ showNotif('Error: '+error.message, 'error'); return; }
  showNotif('Creative added! ✓', 'success');
  if (typeof logActivity === 'function') logActivity('CREATIVE_ADDED', projectName);
  try{
    await sb.from('notifications').insert({
      user_id:null,
      message:ownerName+' added a creative: "'+projectName+'"'+(fuTags.freebies?' (freebies)':''),
      type:'output',
      project_id:fuResolvedProjectId||null,
      is_read:false
    });
  }catch(e){}

  // If this creative is linked to a real project and already has a file,
  // also record it as a done output so it flows into Done Output
  // Submissions / Output tracker / per-editor stats (same pipeline as
  // regular Submit Output and the My Freebies Tasks quick-submit).
  var fuFileLink = document.getElementById('fu-file-link')?.value?.trim() || null;
  var fuClientLabel = fuTypedClientName || document.getElementById('fu-client-name')?.value?.trim() || projectName;
  if (fuResolvedProjectId && fuFileLink) {
    try{
      await sb.from('project_outputs').insert({
        project_id: fuResolvedProjectId,
        user_id: currentUser.id,
        url: fuFileLink,
        type: 'image',
        label: (fuTags.freebies?'🎁 Freebies':'📦 Creative')+' — '+fuClientLabel
      });
      await sb.from('projects').update({updated_at:new Date().toISOString()}).eq('id',fuResolvedProjectId);
    }catch(e){}
  }

  fuResetTags();
  fuResetCategory();
  var cp = document.getElementById('fu-page-custom');
  if (cp){ cp.style.display = 'none'; cp.value = ''; }
  ['fu-project-name','fu-ad-copy','fu-file-link','fu-headline','fu-client-name'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var clientSel = document.getElementById('fu-client-select');
  if (clientSel) clientSel.value = '';
  var clientPid = document.getElementById('fu-client-project-id');
  if (clientPid) clientPid.value = '';
  var clientNameEl = document.getElementById('fu-client-name');
  if (clientNameEl) clientNameEl.style.display = 'none';
  if (typeof fuClientDdSetLabel === 'function') fuClientDdSetLabel('Select client', true);
  fuToggleForm();
  loadForUpload();
}

async function fuDelete(id){
  if (currentUserRole!=='admin'){ showNotif('Admin only — editors can\'t delete client tasks.', 'error'); return; }
  if (!confirm('Delete this creative?')) return;
  await sb.from('creatives_upload').delete().eq('id', id);
  showNotif('Deleted.', 'success');
  loadForUpload();
}
// ══════════════════════════════════════════════
// CATEGORY TABS — 5 sections, per-tab upload
// ══════════════════════════════════════════════
// Icon labels (walang emoji)
var FB_SAVE_LABEL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save details only';
var FB_SEND_LABEL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Save &amp; send to editor';

// Badge kapag freebies row (galing New project)
function fuFreebiesTag(c){
  var n = parseInt(c && c.freebies_count, 10) || 0;
  if (!n) return '';
  return '<div style="display:inline-flex;align-items:center;gap:5px;margin-top:5px;font-size:9.5px;font-weight:650;'
    + 'padding:3px 9px;border-radius:20px;background:rgba(250,204,21,0.12);color:#facc15;border:0.5px solid rgba(250,204,21,0.28)">'
    + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
    + '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>'
    + '<path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>'
    + n + ' freebies</div>';
}

var FU_CATS = [
  'Video editor team',
  'Viral clients freebies images',
  'Viral direct video',
  "Dell's direct client outputs"
];
var fuActiveCat = FU_CATS[0];

// Pindutin ang tab — pumapalit ng view AT ng auto-category ng upload form
function fuCatTab(cat){
  if (FU_CATS.indexOf(cat) === -1) return;
  fuActiveCat = cat;

  var tabs = document.getElementById('fu-cat-tabs');
  if (tabs){
    tabs.querySelectorAll('.fu-cat-tab').forEach(function(t){
      t.classList.toggle('active', t.getAttribute('data-cat') === cat);
    });
  }

  var f = document.getElementById('fu-cat-filter');
  if (f) f.value = cat;

  fuSyncFormCategory();
  filterForUpload();
}

// I-sync ang locked "Section" field ng form sa active tab
function fuSyncFormCategory(){
  var hidden = document.getElementById('fu-category');
  var lbl = document.getElementById('fu-formcat-label');
  if (hidden) hidden.value = fuActiveCat;
  if (lbl) lbl.textContent = fuActiveCat;
}

// Backward-compat — tinawag pa rin pagkatapos mag-add
function fuResetCategory(){ fuSyncFormCategory(); }

// Bilang ng items kada tab (hindi kasama ang archived)
function fuUpdateCatCounts(){
  var items = (forUploadState && forUploadState.items) || [];
  FU_CATS.forEach(function(cat, i){
    var n = items.filter(function(c){
      return c.archived !== true && c.category === cat;
    }).length;
    var el = document.getElementById('fu-cnt-'+i);
    if (el) el.textContent = n;
  });
}

function fuCatBadge(cat){
  if (!cat) return '<span style="color:#7a7a85;font-size:11px">—</span>';
  var styles = {
    'Video editor team':             { bg:'rgba(250,204,21,0.16)',  c:'#facc15', bd:'rgba(250,204,21,0.4)',  short:'Video editor team' },
    'Viral clients freebies images': { bg:'rgba(167,139,250,0.16)', c:'#b9a5fc', bd:'rgba(167,139,250,0.4)', short:'Viral clients freebies' },
    'Viral direct video':            { bg:'rgba(74,222,128,0.16)',  c:'#6ee7a0', bd:'rgba(74,222,128,0.4)',  short:'Viral direct video' },
    "Dell's direct client outputs":  { bg:'rgba(96,165,250,0.16)',  c:'#7db4fb', bd:'rgba(96,165,250,0.4)',  short:"Dell's direct outputs" }
  };
  var s = styles[cat] || { bg:'rgba(255,255,255,0.06)', c:'#9a9aa5', bd:'rgba(255,255,255,0.1)', short:cat };
  return '<span title="'+escapeHtml(cat)+'" style="display:inline-block;font-size:9.5px;font-weight:600;padding:4px 10px;border-radius:20px;background:'+s.bg+';color:'+s.c+';border:0.5px solid '+s.bd+';white-space:nowrap">'+escapeHtml(s.short)+'</span>';
}

function fuFormPagePick(page, color, itemEl){
  var dd = document.getElementById('fu-dd-formpage');
  var hidden = document.getElementById('fu-page');
  var dot = document.getElementById('fu-formpage-dot');
  var custom = document.getElementById('fu-page-custom');
  if (custom){ custom.style.display = 'none'; custom.value = ''; }
  if (dd){
    var lbl = dd.querySelector('[data-label]');
    if (lbl) lbl.textContent = page;
    dd.querySelectorAll('.fu-dd-item').forEach(function(x){ x.classList.remove('active'); });
    if (itemEl) itemEl.classList.add('active');
    dd.classList.remove('open');
  }
  if (hidden) hidden.value = page;
  if (dot) dot.style.background = color;
}

// Custom page — pwedeng mag-type ng ibang page, hindi nase-save sa listahan
function fuFormPageCustom(itemEl){
  var dd = document.getElementById('fu-dd-formpage');
  var hidden = document.getElementById('fu-page');
  var dot = document.getElementById('fu-formpage-dot');
  var custom = document.getElementById('fu-page-custom');
  if (dd){
    var lbl = dd.querySelector('[data-label]');
    if (lbl) lbl.textContent = 'Custom page';
    dd.querySelectorAll('.fu-dd-item').forEach(function(x){ x.classList.remove('active'); });
    if (itemEl) itemEl.classList.add('active');
    dd.classList.remove('open');
  }
  if (dot) dot.style.background = 'rgba(255,255,255,0.25)';
  if (hidden) hidden.value = '';
  if (custom){ custom.style.display = 'block'; custom.focus(); }
}

// ══════════════════════════════════════════════
// SOCIAL POSTING — compose, schedule, planner
// (UI + Supabase muna; aktwal na pag-post kapag konektado na ang Meta API)
// ══════════════════════════════════════════════
var spPlatforms = { fb:true, ig:false };
var spType = 'feed';
var spCalDate = new Date();
var spPosts = [];

function spSwitchView(view){
  var c=document.getElementById('sp-view-compose');
  var pl=document.getElementById('sp-view-planner');
  var tc=document.getElementById('sp-tab-compose');
  var tp=document.getElementById('sp-tab-planner');
  if(view==='planner'){
    c.style.display='none'; pl.style.display='';
    tc.classList.remove('active'); tp.classList.add('active');
    spRenderCalendar();
  } else {
    c.style.display=''; pl.style.display='none';
    tp.classList.remove('active'); tc.classList.add('active');
  }
}

function spToggleChip(plat){
  spPlatforms[plat]=!spPlatforms[plat];
  var el=document.getElementById('sp-plat-'+plat);
  if(el) el.classList.toggle('active', spPlatforms[plat]);
  // IG note
  var note=document.getElementById('sp-ig-note');
  if(note) note.style.display = spPlatforms.ig ? 'flex' : 'none';
}

function spSetType(t){
  spType=t;
  document.getElementById('sp-type-feed').classList.toggle('active', t==='feed');
  document.getElementById('sp-type-story').classList.toggle('active', t==='story');
}

async function loadSocial(){
  // populate page dropdown from clients/pages
  var sel=document.getElementById('sp-page');
  if(sel && sel.options.length<=1){
    try{
      var r=await sb.from('clients').select('id,name').order('name');
      (r.data||[]).forEach(function(c){
        var o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o);
      });
    }catch(e){}
  }
  await spLoadPosts();
}

async function spLoadPosts(){
  skelCards('sp-list', 3);
  try{
    var r=await sb.from('scheduled_posts').select('*').order('scheduled_at',{ascending:true});
    spPosts=r.data||[];
  }catch(e){ spPosts=[]; }
  spRenderList();
}

function spPlatLabel(p){
  var arr=[];
  if(p.platforms && p.platforms.indexOf('fb')!==-1) arr.push('FB');
  if(p.platforms && p.platforms.indexOf('ig')!==-1) arr.push('IG');
  return arr.join('+')||'—';
}

function spRenderList(){
  var box=document.getElementById('sp-list');
  if(!box) return;
  if(!spPosts.length){ box.innerHTML=emptyState(ICO_SEND,'No posts scheduled yet','Compose one on the left and pick a date to see it here.'); return; }
  box.innerHTML=spPosts.map(function(p){
    var st=p.status||'scheduled';
    var badge = st==='posted'?'sp-b-posted':(st==='failed'?'sp-b-failed':'sp-b-sched');
    var when = p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
    var typeTag = p.post_type==='story' ? ' · Story' : '';
    return '<div class="sp-item">'
      + '<div class="sp-item-top">'
      +   '<span class="sp-item-title">'+escapeHtml((p.content||'(walang caption)').slice(0,42))+'</span>'
      +   '<span class="sp-badge '+badge+'">'+st.toUpperCase()+'</span>'
      + '</div>'
      + '<div class="sp-item-top">'
      +   '<span class="sp-item-meta"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
      +   escapeHtml(spPlatLabel(p))+typeTag+' · '+when+'</span>'
      +   '<button class="sp-item-del" onclick="spDeletePost(\''+p.id+'\')" title="Burahin"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function spCollectPost(){
  var plats=[];
  if(spPlatforms.fb) plats.push('fb');
  if(spPlatforms.ig) plats.push('ig');
  var content=(document.getElementById('sp-content')?.value||'').trim();
  var media=(document.getElementById('sp-media')?.value||'').trim();
  var pageSel=document.getElementById('sp-page');
  var pageId=pageSel?.value||null;
  var pageName=pageSel?(pageSel.options[pageSel.selectedIndex]?.text||''):'';
  var dt=document.getElementById('sp-datetime')?.value||'';

  if(!plats.length){ showNotif('Select a platform (Facebook or Instagram)','error'); return null; }
  if(!content && !media){ showNotif('Add content or media','error'); return null; }
  if(spPlatforms.ig && !media){ showNotif('Instagram requires media','error'); return null; }
  return {
    platforms:plats, post_type:spType, content:content, media_url:media||null,
    page_id:pageId, page_name:pageName||null,
    scheduled_at: dt? new Date(dt).toISOString() : null
  };
}

async function spSchedule(){
  var post=spCollectPost();
  if(!post) return;
  if(!post.scheduled_at){ showNotif('Select a date and time','error'); return; }
  post.status='scheduled';
  try{
    var r=await sb.from('scheduled_posts').insert(post).select();
    if(r.error) throw r.error;
    showNotif('Post scheduled!','success');
    spResetForm();
    await spLoadPosts();
  }catch(err){ showNotif('Error: '+(err.message||err),'error'); }
}

async function spPostNow(){
  var post=spCollectPost();
  if(!post) return;
  post.scheduled_at=new Date().toISOString();
  post.status='scheduled'; // magiging 'posted' kapag konektado na ang API
  try{
    var r=await sb.from('scheduled_posts').insert(post).select();
    if(r.error) throw r.error;
    showNotif('Queued — this will post once Facebook/Instagram is connected','success');
    spResetForm();
    await spLoadPosts();
  }catch(err){ showNotif('Error: '+(err.message||err),'error'); }
}

async function spDeletePost(id){
  try{
    await sb.from('scheduled_posts').delete().eq('id',id);
    await spLoadPosts();
    if(document.getElementById('sp-view-planner').style.display!=='none') spRenderCalendar();
  }catch(e){ showNotif('Delete failed','error'); }
}

// ── MEDIA UPLOAD (direct file → Supabase Storage) ──
async function spHandleFile(input){
  var file=input.files&&input.files[0];
  if(!file) return;
  var empty=document.getElementById('sp-upload-empty');
  var prev=document.getElementById('sp-upload-preview');
  var prog=document.getElementById('sp-upload-progress');
  var img=document.getElementById('sp-preview-img');
  var vid=document.getElementById('sp-preview-vid');
  var nm=document.getElementById('sp-preview-name');
  var isVideo=(file.type||'').startsWith('video');

  // local preview agad
  var localUrl=URL.createObjectURL(file);
  if(empty) empty.style.display='none';
  if(prog) prog.style.display='flex';
  if(prev) prev.style.display='none';

  try{
    var ext=(file.name.split('.').pop()||(isVideo?'mp4':'png')).toLowerCase();
    var path='social/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
    var upl=await sb.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:true});
    if(upl.error) throw upl.error;
    var urlData=sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    var publicUrl=urlData?.data?.publicUrl||null;
    document.getElementById('sp-media').value=publicUrl||'';

    if(prog) prog.style.display='none';
    if(prev) prev.style.display='block';
    if(nm) nm.textContent=file.name;
    if(isVideo){
      if(vid){ vid.src=localUrl; vid.style.display='block'; vid.setAttribute('controls','controls'); }
      if(img) img.style.display='none';
    } else {
      if(img){ img.src=localUrl; img.style.display='block'; }
      if(vid) vid.style.display='none';
    }
  }catch(err){
    if(prog) prog.style.display='none';
    if(empty) empty.style.display='flex';
    showNotif('Upload failed: '+(err.message||err),'error');
  }
}

function spRemoveFile(ev){
  if(ev) ev.stopPropagation();
  document.getElementById('sp-media').value='';
  document.getElementById('sp-file').value='';
  var empty=document.getElementById('sp-upload-empty');
  var prev=document.getElementById('sp-upload-preview');
  var prog=document.getElementById('sp-upload-progress');
  if(empty) empty.style.display='flex';
  if(prev) prev.style.display='none';
  if(prog) prog.style.display='none';
}

function spResetForm(){
  var c=document.getElementById('sp-content'); if(c) c.value='';
  var m=document.getElementById('sp-media'); if(m) m.value='';
  var d=document.getElementById('sp-datetime'); if(d) d.value='';
  spRemoveFile();
}

function spCalMove(delta){
  spCalDate.setMonth(spCalDate.getMonth()+delta);
  spRenderCalendar();
}

function spRenderCalendar(){
  var grid=document.getElementById('sp-cal-grid');
  var title=document.getElementById('sp-cal-title');
  if(!grid) return;
  var y=spCalDate.getFullYear(), m=spCalDate.getMonth();
  title.textContent=spCalDate.toLocaleString('en-PH',{month:'long',year:'numeric'});
  var first=new Date(y,m,1), startDow=first.getDay();
  var daysInMonth=new Date(y,m+1,0).getDate();
  var prevDays=new Date(y,m,0).getDate();
  var today=new Date(); var todayStr=today.toDateString();

  // group posts by date
  var byDay={};
  spPosts.forEach(function(p){
    if(!p.scheduled_at) return;
    var d=new Date(p.scheduled_at);
    if(d.getFullYear()===y && d.getMonth()===m){
      var k=d.getDate();
      (byDay[k]=byDay[k]||[]).push(p);
    }
  });

  var cells='';
  for(var i=0;i<startDow;i++){
    cells+='<div class="sp-cell sp-other"><span class="sp-cell-num">'+(prevDays-startDow+1+i)+'</span></div>';
  }
  for(var d=1;d<=daysInMonth;d++){
    var isToday=(new Date(y,m,d).toDateString()===todayStr);
    var evs=(byDay[d]||[]).map(function(p){
      var cls = p.post_type==='story' ? 'sp-ev-story' : (p.platforms&&p.platforms.indexOf('ig')!==-1&&p.platforms.indexOf('fb')===-1?'sp-ev-ig':'sp-ev-fb');
      var t=new Date(p.scheduled_at).toLocaleString('en-PH',{hour:'numeric',minute:'2-digit'});
      return '<div class="sp-ev '+cls+'">'+t+' · '+escapeHtml(spPlatLabel(p))+'</div>';
    }).join('');
    cells+='<div class="sp-cell'+(isToday?' sp-today':'')+'"><span class="sp-cell-num">'+d+'</span>'+evs+'</div>';
  }
  var totalCells=startDow+daysInMonth;
  var trail=(7-(totalCells%7))%7;
  for(var t=1;t<=trail;t++){
    cells+='<div class="sp-cell sp-other"><span class="sp-cell-num">'+t+'</span></div>';
  }
  grid.innerHTML=cells;
}

// ══════════════════════════════════════════════
// OWN BRAND CREATIVES — AI Creatives' own content, permanent (no auto-archive)
// ══════════════════════════════════════════════
var obItems = [];

function obToggleForm(){
  var wrap=document.getElementById('ob-form');
  var btn=document.getElementById('ob-toggle-btn');
  var lbl=document.getElementById('ob-toggle-label');
  var isOpen=wrap.style.maxHeight && wrap.style.maxHeight!=='0px';
  if(isOpen){
    wrap.style.maxHeight='0'; wrap.style.opacity='0'; wrap.style.marginBottom='0';
    if(btn) btn.style.opacity='1';
    if(lbl) lbl.textContent='Add creative';
  } else {
    wrap.style.maxHeight='560px'; wrap.style.opacity='1'; wrap.style.marginBottom='20px';
    if(btn) btn.style.opacity='0.55';
    if(lbl) lbl.textContent='Close form';
  }
}

function obDdToggle(id){
  var dd=document.getElementById(id);
  if(!dd) return;
  var wasOpen=dd.classList.contains('open');
  document.querySelectorAll('.ob-dd.open').forEach(function(d){ d.classList.remove('open'); });
  if(!wasOpen) dd.classList.add('open');
}
document.addEventListener('click', function(e){
  if(!e.target.closest || !e.target.closest('.ob-dd')){
    document.querySelectorAll('.ob-dd.open').forEach(function(d){ d.classList.remove('open'); });
  }
});
function obTagColor(tag){
  var presets={'Brand promo':'#facc15','Announcement':'#60a5fa','Recruitment':'#a78bfa','Testimonial':'#4ade80','Behind the scenes':'#f472b6'};
  if(presets[tag]) return presets[tag];
  var palette=['#facc15','#60a5fa','#a78bfa','#4ade80','#f472b6','#fb923c','#22d3ee','#c084fc'];
  var h=0; for(var i=0;i<tag.length;i++){ h=(h*31+tag.charCodeAt(i))>>>0; }
  return palette[h%palette.length];
}
function obTagBadge(tag){
  if(!tag) return '<span style="color:#7a7a85">—</span>';
  var c=obTagColor(tag);
  return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:'+c+'"><span style="width:6px;height:6px;border-radius:50%;background:'+c+';display:inline-block"></span>'+escapeHtml(tag)+'</span>';
}

async function loadBrandCreatives(){
  skelRows('ob-rows', 4);
  try{
    var r=await sb.from('brand_creatives').select('*').order('created_at',{ascending:false});
    if(r.error) throw r.error;
    obItems=r.data||[];
  }catch(e){ obItems=[]; console.error('loadBrandCreatives error:',e); }
  obRenderRows();
}

function obRenderRows(){
  var box=document.getElementById('ob-rows');
  if(!box) return;
  if(!obItems.length){ box.innerHTML=emptyState(ICO_MEGAPHONE,'No own brand creatives yet','Click "Add creative" above to log the first one.'); return; }
  var isAdmin=currentUserRole==='admin';
  box.innerHTML=obItems.map(function(c){
    var link=c.link_url?('<a href="'+c.link_url+'" target="_blank" style="color:var(--yellow);font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px">Open<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg></a>'):'<span style="color:#7a7a85">—</span>';
    var date=c.created_at?new Date(c.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}):'—';
    var st=c.status||'Pending approval';
    var stColors={
      'Pending approval':{bg:'rgba(251,146,60,0.15)',c:'#fb923c'},
      'Draft':{bg:'rgba(138,135,129,0.15)',c:'#a6a39c'},
      'Approved':{bg:'rgba(96,165,250,0.15)',c:'#7db4fb'},
      'Scheduled':{bg:'rgba(250,204,21,0.14)',c:'#facc15'},
      'Published':{bg:'rgba(94,234,212,0.14)',c:'#5eead4'}
    };
    var sc=stColors[st]||stColors['Pending approval'];
    var approveBtn = (isAdmin && st==='Pending approval')
      ? '<button class="ob-approve-btn" onclick="obApprove(\''+c.id+'\')" title="Approve">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>'
        + 'Approve</button>'
      : '';
    var publishBtn = (st==='Approved')
      ? '<button class="ob-publish-btn" onclick="obPublish(\''+c.id+'\')" title="Mark as published">'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
        + 'Publish</button>'
      : (st==='Published')
      ? '<button class="ob-unpublish-btn" onclick="obUnpublish(\''+c.id+'\')" title="Mark as unpublished">'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>'
        + 'Unpublish</button>'
      : '';
    return '<div class="ob-row">'
      + '<div class="ob-name">'+escapeHtml(c.page_name||'—')+'</div>'
      + '<div class="ob-copy" title="'+escapeHtml(c.ad_copy||'')+'">'+escapeHtml(c.ad_copy||'—')+'</div>'
      + '<div>'+obTagBadge(c.tag)+'</div>'
      + '<div>'+link+'</div>'
      + '<div style="color:#8a8781">'+date+'</div>'
      + '<div class="ob-status-dd" id="ob-sdd-'+c.id+'">'
      +   '<button class="ob-status-pill" onclick="obStatusToggle(\''+c.id+'\')" style="background:'+sc.bg+';color:'+sc.c+';border:0.5px solid '+sc.c+'44;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:10.5px;font-weight:650;cursor:pointer">'
      +     st
      +     '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
      +   '</button>'
      +   '<div class="ob-status-menu" style="display:none;position:absolute;margin-top:4px;background:#16161a;border:0.5px solid rgba(255,255,255,0.1);border-radius:9px;padding:4px;z-index:50;min-width:140px">'
      +     '<div onclick="obStatusPick(\''+c.id+'\',\'Pending approval\')" style="padding:7px 10px;border-radius:6px;font-size:11px;color:#c9c6be;cursor:pointer">Pending approval</div>'
      +     '<div onclick="obStatusPick(\''+c.id+'\',\'Approved\')" style="padding:7px 10px;border-radius:6px;font-size:11px;color:#c9c6be;cursor:pointer">Approved</div>'
      +     '<div onclick="obStatusPick(\''+c.id+'\',\'Scheduled\')" style="padding:7px 10px;border-radius:6px;font-size:11px;color:#c9c6be;cursor:pointer">Scheduled</div>'
      +     '<div onclick="obStatusPick(\''+c.id+'\',\'Published\')" style="padding:7px 10px;border-radius:6px;font-size:11px;color:#c9c6be;cursor:pointer">Published</div>'
      +   '</div>'
      + '</div>'
      + approveBtn
      + publishBtn
      + '<button class="ob-del-btn" onclick="obDeleteCreative(\''+c.id+'\')" title="Burahin">'
      +   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'
      + '</button>'
      + '</div>';
  }).join('');
}

async function obApprove(id){
  try{
    await sb.from('brand_creatives').update({status:'Approved'}).eq('id',id);
    showNotif('Creative approved','success');
    await loadBrandCreatives();
  }catch(e){ showNotif('Approve failed','error'); }
}

async function obLogHistory(creativeId, pageName, action){
  try{
    var actorName=(currentUser && (currentUser.user_metadata?.name || currentUser.email)) || 'Someone';
    await sb.from('brand_creatives_log').insert({
      creative_id: creativeId, page_name: pageName, action: action,
      actor_id: currentUser?.id || null, actor_name: actorName
    });
  }catch(e){ console.error('obLogHistory failed:', e); }
}

async function obPublish(id){
  try{
    var item=obItems.find(function(x){ return x.id===id; });
    await sb.from('brand_creatives').update({status:'Published', published_at:new Date().toISOString()}).eq('id',id);
    await obLogHistory(id, item?item.page_name:'', 'published');
    showNotif('Marked as published','success');
    await loadBrandCreatives();
  }catch(e){ showNotif('Publish failed','error'); }
}

async function obUnpublish(id){
  try{
    var item=obItems.find(function(x){ return x.id===id; });
    await sb.from('brand_creatives').update({status:'Approved'}).eq('id',id);
    await obLogHistory(id, item?item.page_name:'', 'unpublished');
    showNotif('Marked as unpublished','success');
    await loadBrandCreatives();
  }catch(e){ showNotif('Unpublish failed','error'); }
}

var obHistoryItems=[];

function obSwitchView(view){
  var listV=document.getElementById('ob-view-list');
  var histV=document.getElementById('ob-view-history');
  var tabL=document.getElementById('ob-tab-list');
  var tabH=document.getElementById('ob-tab-history');
  if(view==='history'){
    listV.style.display='none'; histV.style.display='';
    tabL.classList.remove('active'); tabH.classList.add('active');
    loadObHistory();
  } else {
    histV.style.display='none'; listV.style.display='';
    tabH.classList.remove('active'); tabL.classList.add('active');
  }
}

async function loadObHistory(){
  var box=document.getElementById('ob-history-body');
  if(!box) return;
  skelRows('ob-history-body', 4);
  try{
    var r=await sb.from('brand_creatives_log').select('*').order('created_at',{ascending:false}).limit(200);
    obHistoryItems=r.data||[];
  }catch(e){ obHistoryItems=[]; }
  if(!obHistoryItems.length){
    box.innerHTML=emptyState(ICO_MEGAPHONE,'No publish history yet','Publish or unpublish actions will be logged here.');
    return;
  }
  box.innerHTML=obHistoryItems.map(function(h){
    var isPub=h.action==='published';
    var badge=isPub
      ? '<span style="background:rgba(94,234,212,0.14);color:#5eead4;font-size:10px;font-weight:650;padding:3px 9px;border-radius:20px">Published</span>'
      : '<span style="background:rgba(251,146,60,0.15);color:#fb923c;font-size:10px;font-weight:650;padding:3px 9px;border-radius:20px">Unpublished</span>';
    var when=h.created_at?new Date(h.created_at).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'—';
    return '<div class="ob-hist-row">'
      + '<div class="ob-hist-name">'+escapeHtml(h.page_name||'—')+'</div>'
      + '<div>'+badge+'</div>'
      + '<div class="ob-hist-actor">'+escapeHtml(h.actor_name||'Someone')+'</div>'
      + '<div class="ob-hist-date">'+when+'</div>'
      + '</div>';
  }).join('');
}

async function obDeleteCreative(id){
  try{
    await sb.from('brand_creatives').delete().eq('id',id);
    await loadBrandCreatives();
    showNotif('Creative deleted','success');
  }catch(e){ showNotif('Delete failed','error'); }
}

function obStatusToggle(id){
  var menu=document.querySelector('#ob-sdd-'+id+' .ob-status-menu');
  document.querySelectorAll('.ob-status-menu').forEach(function(m){ if(m!==menu) m.style.display='none'; });
  if(menu) menu.style.display = (menu.style.display==='none'||!menu.style.display) ? 'block' : 'none';
}
document.addEventListener('click', function(e){
  if(!e.target.closest || !e.target.closest('.ob-status-dd')){
    document.querySelectorAll('.ob-status-menu').forEach(function(m){ m.style.display='none'; });
  }
});

async function obStatusPick(id, status){
  try{
    await sb.from('brand_creatives').update({status:status}).eq('id',id);
    await loadBrandCreatives();
  }catch(e){ showNotif('Hindi na-update ang status','error'); }
}

async function obHandleFile(input){
  var file=input.files&&input.files[0];
  if(!file) return;
  var empty=document.getElementById('ob-upload-empty');
  var prev=document.getElementById('ob-upload-preview');
  var prog=document.getElementById('ob-upload-progress');
  var img=document.getElementById('ob-preview-img');
  var vid=document.getElementById('ob-preview-vid');
  var nm=document.getElementById('ob-preview-name');
  var isVideo=(file.type||'').startsWith('video');
  var localUrl=URL.createObjectURL(file);

  if(empty) empty.style.display='none';
  if(prog) prog.style.display='flex';
  if(prev) prev.style.display='none';

  try{
    var ext=(file.name.split('.').pop()||(isVideo?'mp4':'png')).toLowerCase();
    var path='brand/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
    var upl=await sb.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:true});
    if(upl.error) throw upl.error;
    var urlData=sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    var publicUrl=urlData?.data?.publicUrl||null;
    var linkInput=document.getElementById('ob-link');
    if(linkInput && !linkInput.value) linkInput.value=publicUrl||'';

    if(prog) prog.style.display='none';
    if(prev) prev.style.display='block';
    if(nm) nm.textContent=file.name;
    if(isVideo){ if(vid){ vid.src=localUrl; vid.style.display='block'; vid.setAttribute('controls','controls'); } if(img) img.style.display='none'; }
    else { if(img){ img.src=localUrl; img.style.display='block'; } if(vid) vid.style.display='none'; }
  }catch(err){
    if(prog) prog.style.display='none';
    if(empty) empty.style.display='flex';
    showNotif('Upload failed: '+(err.message||err),'error');
  }
}

function obRemoveFile(ev){
  if(ev) ev.stopPropagation();
  document.getElementById('ob-file').value='';
  var empty=document.getElementById('ob-upload-empty');
  var prev=document.getElementById('ob-upload-preview');
  var prog=document.getElementById('ob-upload-progress');
  if(empty) empty.style.display='flex';
  if(prev) prev.style.display='none';
  if(prog) prog.style.display='none';
}

async function obAddCreative(){
  var page=(document.getElementById('ob-page')?.value||'').trim();
  var adcopy=(document.getElementById('ob-adcopy')?.value||'').trim();
  var link=(document.getElementById('ob-link')?.value||'').trim();
  if(!page){ showNotif('Enter a page name','error'); return; }
  try{
    var tag=(document.getElementById('ob-tag')?.value||'').trim()||null;
    var r=await sb.from('brand_creatives').insert({page_name:page, ad_copy:adcopy||null, link_url:link||null, tag:tag, status:'Pending approval'});
    if(r.error) throw r.error;
    showNotif('Brand creative added!','success');
    document.getElementById('ob-page').value='';
    document.getElementById('ob-adcopy').value='';
    document.getElementById('ob-link').value='';
    document.getElementById('ob-tag').value='';
    obRemoveFile();
    obToggleForm();
    await loadBrandCreatives();
  }catch(err){ showNotif('Error: '+(err.message||err),'error'); console.error('obAddCreative error:',err); }
}
