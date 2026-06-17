
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

function loadUserRole(user){
  const email=user?.email||'';
  currentUserRole=email==='admin@aicreatives.com'?'admin':'editor';
  document.getElementById('user-email-label').textContent=email;
  document.getElementById('user-role-label').textContent=currentUserRole==='admin'?'Super Admin':'Editor';
  applyRoleUI();
  sb.from('profiles').select('role').eq('id',user.id).maybeSingle().then(({data})=>{
    if(data?.role&&email!=='admin@aicreatives.com'){
      currentUserRole=data.role;
      document.getElementById('user-role-label').textContent=currentUserRole==='admin'?'Super Admin':'Editor';
      applyRoleUI();
    }
  }).catch(()=>{});
}

function applyRoleUI(){
  const isAdmin=currentUserRole==='admin';
  document.querySelectorAll('.admin-only').forEach(el=>el.style.display=isAdmin?'':'none');
  if(!isAdmin)showPage('editor-portal');
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
  if(currentUserRole==='admin'){loadDashboard();loadNotifications();}else loadEditorPortal();
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+page);if(pg)pg.classList.add('active');
  const nv=document.getElementById('nav-'+page);if(nv)nv.classList.add('active');
  const titles={dashboard:'Dashboard','new-project':'New project','all-projects':'All projects','editor-portal':'My tasks',users:'Team members',analytics:'Analytics',submission:'Client form',settings:'Settings'};
  document.getElementById('topbar-title').textContent=titles[page]||page;
  if(page==='all-projects')loadAllProjects();
  if(page==='editor-portal')loadEditorPortal();
  if(page==='users')loadUsers();
  if(page==='dashboard')loadDashboard();
  if(page==='analytics')loadAnalytics();
  if(page==='settings'){loadSettings();}
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

// DASHBOARD
async function loadDashboard(){
  const{data}=await sb.from('projects').select('*').order('created_at',{ascending:false});
  allProjects=data||[];
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
      return '<div class="pipe-card" onclick="openModal(\''+p.id+'\')">'+'<div class="pipe-card-name">'+p.client_name+'</div>'+'<div class="pipe-card-type">'+(p.business_type||"")+'</div>'+approveBtn+'</div>';
    }).join(""):"<div class=\"pipe-empty\">—</div>";
  });
  document.getElementById('recent-projects-body').innerHTML=allProjects.slice(0,10).map(p=>`
    <div class="table-row projects-cols" onclick="openModal('${p.id}')">
      <div><div class="row-name">${p.client_name}</div><div class="row-sub">${p.video_size||''} · ${p.language||''} · ${p.goal||''} ${getDeadlineStatus(p.deadline)}</div></div>
      <div class="row-meta">${p.business_type||'—'}</div>
      <div>${statusBadge(p.status)}</div>
      <div class="row-date">${fmtDate(p.created_at)}</div>
    </div>`).join('')||'<div class="table-empty"><div class="table-empty-icon">📋</div>No projects yet — create your first one!</div>';
}

// ALL PROJECTS
async function loadAllProjects(){
  const{data}=await sb.from('projects').select('*').order('created_at',{ascending:false});
  allProjects=data||[];renderProjectsTable(allProjects);
}

function filterProjects(){
  const q=document.getElementById('search-projects').value.toLowerCase();
  const s=document.getElementById('filter-status').value;
  const pr=document.getElementById('filter-priority')?.value||'';
  renderProjectsTable(allProjects.filter(p=>{
    const matchQ=!q||
      p.client_name?.toLowerCase().includes(q)||
      p.business_type?.toLowerCase().includes(q)||
      p.goal?.toLowerCase().includes(q)||
      p.language?.toLowerCase().includes(q)||
      p.status?.toLowerCase().includes(q)||
      p.product?.toLowerCase().includes(q);
    const matchS=!s||p.status===s;
    const matchP=!pr||p.priority===pr;
    return matchQ&&matchS&&matchP;
  }));
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
  const{data}=await sb.from('projects').select('*').eq('status','Ready for Editor').order('created_at',{ascending:false});
  const projects=data||[];
  const tb=document.getElementById('tasks-badge');
  tb.textContent=projects.length;tb.style.display=projects.length>0?'':'none';
  document.getElementById('editor-projects-body').innerHTML=projects.length?projects.map(p=>`
    <div class="editor-card">
      <div class="editor-card-top">
        <div>
          <div class="editor-card-name">${p.client_name}</div>
          <div class="editor-card-meta">${p.business_type||''} · ${p.goal||''} · ${p.video_size||''} · ${p.language||''}</div>
        </div>
        ${statusBadge(p.status)}
      </div>
      ${p.emphasize?`<div style="font-size:12px;color:var(--text2);margin-bottom:12px">${p.emphasize}</div>`:''}
      <div class="editor-card-actions">
        <button class="ghost-btn" onclick="openModal('${p.id}')">📄 View blueprint</button>
        <button class="yellow-btn" onclick="markInProduction('${p.id}')">🎬 Mark in production</button>
      </div>
    </div>`).join(''):'<div class="table-empty"><div class="table-empty-icon">✅</div>No projects ready yet.</div>';
}

async function markInProduction(id){
  await sb.from('projects').update({status:'In Production',updated_at:new Date().toISOString()}).eq('id',id);
  showNotif('Marked as In Production! 🎬','success');loadEditorPortal();
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
  status.textContent='AI is building your blueprint...';
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
    status.textContent='✓ Blueprint ready — review and save!';
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
    // Try multiple patterns to extract client name
    const nm=brief.match(/(?:client\s*name|business\s*name|brand\s*name|company|client)[\s]*[:\-][\s]*([^\n]+)/i);
    if(nm)clientName=nm[1].trim().replace(/[*_]/g,'').trim();
    else clientName='Client '+new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    product=brief.substring(0,500);
    emphasize=document.getElementById('f-script').value||'';
  } else {
    clientName=document.getElementById('f-client').value.trim()||'Client '+new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    product=document.getElementById('f-product').value.trim();
    emphasize=document.getElementById('f-emphasize').value||'';
  }
  const{error}=await sb.from('projects').insert({
    client_name:clientName,
    business_type:isPaste?'':document.getElementById('f-biztype').value,
    product,
    color_primary:isPaste?'':document.getElementById('f-color1').value,
    color_secondary:isPaste?'':document.getElementById('f-color2').value,
    audience:isPaste?'':document.getElementById('f-audience').value,
    pain_point:isPaste?'':document.getElementById('f-pain').value.trim(),
    usp:isPaste?'':document.getElementById('f-usp').value.trim(),
    goal:isPaste?'':document.getElementById('f-goal').value,
    video_size:document.getElementById('f-size').value,
    language:document.getElementById('f-lang').value,
    voice_actor:isPaste?'':document.getElementById('f-voice').value,
    avatar_desc:isPaste?'':document.getElementById('f-avatar').value,
    emphasize,tone:selectedToneVal,
    status:'Ready for Editor',blueprint,
    assigned_to:null,
    created_by:currentUser?.id
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
  document.getElementById('modal-detail-grid').innerHTML=[
    ['FB Page',p.fb_page],['Website',p.website],
    ['Goal',p.goal],['Language',p.language],
    ['Video size',p.video_size],['Tone',p.tone],
    ['Audience',p.audience],['Colors',(p.color_primary||'')+(p.color_secondary?' / '+p.color_secondary:'')],
    ['Pain point',p.pain_point],['USP',p.usp]
  ].map(([l,v])=>`<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-val">${v||'—'}</div></div>`).join('');
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
  if(p.blueprint)renderBlueprintScenes(p.blueprint,'modal-scenes');
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
  const d=new Date(deadline);const now=new Date();
  const diff=Math.ceil((d-now)/(1000*60*60*24));
  if(diff<0)return'<span style="color:var(--red);font-size:10px;font-weight:600">⚠ OVERDUE</span>';
  if(diff<=3)return`<span style="color:var(--amber);font-size:10px;font-weight:600">⚡ ${diff}d left</span>`;
  return`<span style="color:var(--text3);font-size:10px">${diff}d left</span>`;
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
  showNotif(assignedTo?'Assigned! ✓':'Unassigned.','success');
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
  const[{data:projects},{data:members}]=await Promise.all([
    sb.from('projects').select('*').order('created_at',{ascending:false}),
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

  // Per-editor stats
  const editorStats=eds.map(e=>{
    const assigned=all.filter(p=>p.assigned_to===e.id);
    const edDone=assigned.filter(p=>p.status==='Approved / Done').length;
    const edProd=assigned.filter(p=>p.status==='In Production').length;
    const edReady=assigned.filter(p=>p.status==='Ready for Editor').length;
    return`<div style="padding:12px 16px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;gap:12px">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--yellow-dim);border:0.5px solid var(--yellow);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--yellow);flex-shrink:0">${(e.name||e.email||'?')[0].toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:12px;color:var(--text);font-weight:600">${e.name||e.email}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${assigned.length} assigned · ${edProd} in prod · ${edDone} done</div>
      </div>
      <div style="display:flex;gap:6px">
        <span style="font-size:9px;padding:2px 7px;border-radius:20px;background:var(--green-dim);color:var(--green);font-weight:600">${edReady} ready</span>
        <span style="font-size:9px;padding:2px 7px;border-radius:20px;background:var(--amber-dim);color:var(--amber);font-weight:600">${edProd} active</span>
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
// TOOL SETTINGS
// ═══════════════════════════════════════

function saveToolSetting(key, val){
  localStorage.setItem('ace_'+key, val);
}

function getToolSetting(key, def){
  return localStorage.getItem('ace_'+key)||def||'';
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
  toggleToolMode('grok', getToolSetting('grok-mode','api'));
  toggleToolMode('veo', getToolSetting('veo-mode','api'));
  toggleToolMode('higgs', getToolSetting('higgs-mode','account'));
}

function toggleToolMode(tool, mode){
  var apiField=document.getElementById(tool+'-api-field');
  if(apiField)apiField.style.display=mode==='api'?'flex':'none';
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
  var mode=getToolSetting(tool+'-mode', tool==='higgsfield'?'account':'api');
  
  if(mode==='account'){
    // Copy prompt + open tool
    navigator.clipboard.writeText(prompt).catch(function(){});
    var urls={
      higgsfield:'https://higgsfield.ai/create',
      grok:'https://grok.com',
      veo:'https://flow.google.com'
    };
    window.open(urls[tool]||'https://'+tool+'.ai','_blank');
    showNotif('Prompt copied! Paste it in '+tool+' ✓','success');
    return;
  }

  // API mode
  var apiKey=getToolSetting(tool+'-api-key');
  if(!apiKey){
    showNotif('No API key set for '+tool+'. Go to Settings!','error');
    showPage('settings');
    return;
  }

  showNotif('Generating with '+tool+'... ⚡','success');

  if(tool==='grok'){
    generateGrok(prompt, apiKey, type);
  } else if(tool==='veo'){
    generateVeo(prompt, apiKey, type);
  }
}

async function generateGrok(prompt, apiKey, type){
  try{
    var model=getToolSetting('grok-model','grok-imagine-video-1.5-preview');
    var duration=parseInt(getToolSetting('grok-duration','8'));
    var res=await fetch('/api/grok-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt,apiKey,model,duration,type})
    });
    var d=await res.json();
    if(d.url){
      showNotif('Video ready! ✓','success');
      window.open(d.url,'_blank');
    } else {
      showNotif('Error: '+(d.error||'Generation failed'),'error');
    }
  }catch(e){
    showNotif('Grok error: '+e.message,'error');
  }
}

async function generateVeo(prompt, apiKey, type){
  try{
    var model=getToolSetting('veo-model','veo-3');
    var duration=parseInt(getToolSetting('veo-duration','8'));
    var res=await fetch('/api/veo-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt,apiKey,model,duration,type})
    });
    var d=await res.json();
    if(d.url){
      showNotif('Video ready! ✓','success');
      window.open(d.url,'_blank');
    } else {
      showNotif('Error: '+(d.error||'Generation failed'),'error');
    }
  }catch(e){
    showNotif('Veo error: '+e.message,'error');
  }
}

// Parse blueprint and extract scenes with prompts
function parseBlueprint(blueprintText){
  var scenes=[];
  var scenePattern=/SCENE\s+(\d+)[^]*?(?=SCENE\s+\d+|$)/gi;
  var imagePattern=/IMAGE PROMPT[:\s]+([^\n]+)/i;
  var videoPattern=/VIDEO PROMPT[:\s]+([^\n]+)/i;
  var voPattern=/VOICEOVER[:\s]+([^\n]+)/i;
  var visualPattern=/VISUAL[:\s]+([^\n]+)/i;

  var matches=blueprintText.match(/SCENE\s+\d+[^]*?(?=SCENE\s+\d+|(?:PRODUCTION|═{5}|$))/gi)||[];
  matches.forEach(function(block){
    var numMatch=block.match(/SCENE\s+(\d+)/i);
    var nameMatch=block.match(/SCENE\s+\d+\s*[-\u2014]\s*([^\n(]+)/i);
    var imgMatch=block.match(imagePattern);
    var vidMatch=block.match(videoPattern);
    var voMatch=block.match(voPattern);
    var visMatch=block.match(visualPattern);
    scenes.push({
      num:numMatch?numMatch[1]:'?',
      name:nameMatch?nameMatch[1].trim():'Scene',
      imagePrompt:imgMatch?imgMatch[1].trim():'',
      videoPrompt:vidMatch?vidMatch[1].trim():'',
      voiceover:voMatch?voMatch[1].trim():'',
      visual:visMatch?visMatch[1].trim():''
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
