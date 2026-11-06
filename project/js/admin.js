/* Tela de cadastros do administrador: usuários, acessórios, guindastes e
   pontos da tabela de capacidade. Todas as permissões são checadas na API. */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (n, d=2) => n===null || n===undefined ? "–" : Number(n).toLocaleString("pt-BR", {minimumFractionDigits:0, maximumFractionDigits:d});
let EU = null, GUINDASTES = [];

async function api(url, opts={}){
  const r = await fetch(url, {headers:{"Content-Type":"application/json"}, ...opts});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.erro || ("HTTP "+r.status));
  return j;
}
const send = (url, method, body) => api(url, {method, body: JSON.stringify(body)});

function toast(msg, ok=true){
  const t = $("#toast"); t.textContent = msg; t.className = "toast "+(ok?"ok":"err"); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(()=>{ t.hidden = true; }, 3000);
}
function formData(form){
  const d = {};
  new FormData(form).forEach((v,k)=>{ d[k] = v; });
  return d;
}
function fillForm(form, obj){
  Object.entries(obj).forEach(([k,v])=>{
    const el = form.elements[k]; if(!el) return;
    el.value = typeof v === "boolean" ? (v ? "1" : "0") : (v ?? "");
  });
}

/* ------------------------------------------------------------ login / acesso */
async function start(){
  EU = await api("api/auth/me").catch(()=>null);
  const box = $("#userBox");
  if(EU){
    box.innerHTML = `<b>${esc(EU.nome)}</b> · <a href="./">Simulador</a> · <button id="sair">Sair</button>`;
    $("#sair").onclick = async ()=>{ await fetch("api/auth/logout",{method:"POST"}); location.reload(); };
  } else box.innerHTML = `<a href="./">Simulador</a>`;

  const ok = EU && EU.papel === "administrador";
  $("#gate").hidden = ok;
  $("#adminTabs").hidden = !ok;
  if(EU && !ok){
    $("#gErr").textContent = "Seu usuário não é administrador. Entre com um administrador.";
  }
  if(!ok) return;
  GUINDASTES = await api("api/guindastes");
  ["#gSel","#tSel"].forEach(sel=>{ $(sel).innerHTML = GUINDASTES.map(g=>`<option value="${g.id}">${esc(g.modelo)}</option>`).join(""); });
  showTab("usuarios");
}
$("#gateForm").addEventListener("submit", async e=>{
  e.preventDefault();
  try{
    await send("api/auth/login", "POST", {login: $("#gUser").value, senha: $("#gPass").value});
    $("#gPass").value = ""; $("#gErr").textContent = "";
    start();
  }catch(err){ $("#gErr").textContent = err.message; }
});

document.querySelectorAll("#adminTabs .tabbtn").forEach(b=>b.addEventListener("click", ()=>showTab(b.dataset.tab)));
function showTab(tab){
  document.querySelectorAll("#adminTabs .tabbtn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  document.querySelectorAll(".adminPanel").forEach(p=>{ p.hidden = p.id !== "p-"+tab; });
  ({usuarios:loadUsuarios, acessorios:loadAcessorios, guindastes:loadGuindaste, tabela:loadTabela})[tab]();
}

/* ------------------------------------------------------------ usuários */
async function loadUsuarios(){
  const lista = await api("api/admin/usuarios");
  $("#tUsuarios").innerHTML = `<tr><th>Nome</th><th>Login</th><th>Papel</th><th></th></tr>` + lista.map(u=>`
    <tr><td class="txt">${esc(u.nome)}</td><td>${esc(u.login)}</td><td class="txt">${u.papel==="administrador"?"Administrador":"Operador"}</td>
    <td><button data-edit="${u.id}">Editar</button>${u.id!==EU.id?`<button class="del" data-del="${u.id}">Remover</button>`:""}</td></tr>`).join("");
  $("#tUsuarios").onclick = async e=>{
    const id = Number(e.target.dataset.edit || e.target.dataset.del); if(!id) return;
    const u = lista.find(x=>x.id===id);
    if(e.target.dataset.edit){ fillForm($("#fUsuario"), {...u, senha:""}); return; }
    if(!confirm(`Remover o usuário ${u.login}?`)) return;
    try{ await send("api/admin/usuarios/"+id, "DELETE"); toast("Usuário removido."); loadUsuarios(); }catch(err){ toast(err.message, false); }
  };
}
$("#fUsuario").addEventListener("submit", async e=>{
  e.preventDefault();
  const d = formData(e.target);
  try{
    if(d.id) await send("api/admin/usuarios/"+d.id, "PUT", d); else await send("api/admin/usuarios", "POST", d);
    toast("Usuário salvo."); e.target.reset(); e.target.elements.id.value = ""; loadUsuarios();
  }catch(err){ toast(err.message, false); }
});
$("#fUsuario").addEventListener("reset", e=>{ setTimeout(()=>{ e.target.elements.id.value = ""; }); });

/* ------------------------------------------------------------ acessórios */
async function loadAcessorios(){
  const lista = await api("api/acessorios");
  $("#tAcessorios").innerHTML = `<tr><th>Nome</th><th>Massa</th><th>Fator</th><th>Soma na carga</th><th>Observações</th><th></th></tr>` + lista.map(a=>`
    <tr><td class="txt">${esc(a.nome)}</td><td>${fmt(a.massa_kg)} kg</td><td>${fmt(a.fator_reducao,3)}</td>
    <td class="txt">${a.soma_na_carga?"Sim":"Não"}</td><td class="txt">${esc(a.observacoes||"")}</td>
    <td><button data-edit="${a.id}">Editar</button><button class="del" data-del="${a.id}">Remover</button></td></tr>`).join("");
  $("#tAcessorios").onclick = async e=>{
    const id = Number(e.target.dataset.edit || e.target.dataset.del); if(!id) return;
    const a = lista.find(x=>x.id===id);
    if(e.target.dataset.edit){ fillForm($("#fAcessorio"), a); return; }
    if(!confirm(`Remover o acessório ${a.nome}?`)) return;
    try{ await send("api/admin/acessorios/"+id, "DELETE"); toast("Acessório removido."); loadAcessorios(); }catch(err){ toast(err.message, false); }
  };
}
$("#fAcessorio").addEventListener("submit", async e=>{
  e.preventDefault();
  const d = formData(e.target);
  d.soma_na_carga = d.soma_na_carga === "1";
  try{
    if(d.id) await send("api/admin/acessorios/"+d.id, "PUT", d); else await send("api/admin/acessorios", "POST", d);
    toast("Acessório salvo."); e.target.reset(); e.target.elements.id.value = ""; loadAcessorios();
  }catch(err){ toast(err.message, false); }
});
$("#fAcessorio").addEventListener("reset", e=>{ setTimeout(()=>{ e.target.elements.id.value = ""; }); });

/* ------------------------------------------------------------ guindastes */
async function loadGuindaste(){
  const g = await api("api/guindastes/"+$("#gSel").value);
  fillForm($("#fGuindaste"), g);
}
$("#gSel").addEventListener("change", loadGuindaste);
$("#fGuindaste").addEventListener("submit", async e=>{
  e.preventDefault();
  const d = formData(e.target);
  d.possui_jib = d.possui_jib === "1";
  try{
    await send("api/admin/guindastes/"+$("#gSel").value, "PUT", d);
    GUINDASTES = await api("api/guindastes");
    toast("Guindaste salvo.");
  }catch(err){ toast(err.message, false); }
});

/* ------------------------------------------------------------ tabela de capacidade */
let tipoEixo = "raio";
async function loadTabela(){
  const gid = $("#tSel").value;
  const linhas = await api(`api/admin/guindastes/${gid}/tabela`);
  if(linhas.length) tipoEixo = linhas[0].angulo_graus !== null ? "angulo" : "raio";
  else tipoEixo = GUINDASTES.find(g=>String(g.id)===gid)?.modelo.includes("TM") ? "angulo" : "raio";
  $("#lblEixo").textContent = tipoEixo === "angulo" ? "Ângulo (°)" : "Raio (m)";
  const q = $("#tQuad").value;
  const vis = linhas.filter(l=>!q || l.quadrante===q);
  const porQuad = linhas.reduce((acc,l)=>{ acc[l.quadrante]=(acc[l.quadrante]||0)+1; return acc; }, {});
  $("#tCount").textContent = `${linhas.length} pontos · frontal: ${porQuad.frontal||0} · lateral/traseira: ${porQuad.lateral_traseira||0}`;
  $("#tLinhas").innerHTML = `<tr><th>Quadrante</th><th>Lança</th><th>${tipoEixo==="angulo"?"Ângulo":"Raio"}</th><th>Capacidade</th><th></th></tr>` +
    (vis.length ? vis.map(l=>`<tr><td class="txt">${l.quadrante==="frontal"?"Frontal":"Lateral/traseira"}</td><td>${fmt(l.comprimento_lanca_m)} m</td>
      <td>${tipoEixo==="angulo" ? fmt(l.angulo_graus,1)+"°" : fmt(l.raio_m)+" m"}</td><td>${fmt(l.capacidade_kg,0)} kg</td>
      <td><button class="del" data-del="${l.id}">Remover</button></td></tr>`).join("")
      : `<tr><td class="txt" colspan="5">Nenhum ponto cadastrado${q?" neste quadrante":""}.</td></tr>`);
  $("#tLinhas").onclick = async e=>{
    const id = Number(e.target.dataset.del); if(!id) return;
    try{ await send("api/admin/tabela/"+id, "DELETE"); toast("Ponto removido."); loadTabela(); }catch(err){ toast(err.message, false); }
  };
}
$("#tSel").addEventListener("change", loadTabela);
$("#tQuad").addEventListener("change", loadTabela);
$("#fLinha").addEventListener("submit", async e=>{
  e.preventDefault();
  const d = formData(e.target);
  const body = { quadrante:d.quadrante, comprimento_lanca_m:d.comprimento_lanca_m, capacidade_kg:d.capacidade_kg };
  body[tipoEixo==="angulo" ? "angulo_graus" : "raio_m"] = d.eixo;
  try{
    await send(`api/admin/guindastes/${$("#tSel").value}/tabela`, "POST", body);
    toast("Ponto adicionado."); e.target.elements.eixo.value = ""; e.target.elements.capacidade_kg.value = ""; e.target.elements.eixo.focus();
    loadTabela();
  }catch(err){ toast(err.message, false); }
});

start();
