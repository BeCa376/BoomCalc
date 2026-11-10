const MODELS = {
  TM130: {
    label:"TM 130", sub:"Lança 5,9–12,4 m · pé direito baixo",
    minLen:5.9, maxLen:12.4, minAngle:0, maxAngle:70,
    baseHeight:1.6, baseOffset:1.2, capNominal:26000, approx:false, jib:false,
    zones:{
      frontal:{points:[[0,3000],[10,3100],[20,3200],[30,3300],[35,3500],[55,3800],[70,3800]]},
      lateral:{points:[[0,2100],[10,2150],[20,2200],[30,2300],[35,2550],[40,2700],[45,2900],[50,3300],[55,3500],[60,3700],[65,3700],[70,3800]]}
    },
    info:[["Capacidade máx. (5 m)","26.000 kgf"],["Alcance hidráulico horizontal máx.","12,4 m"],
          ["Ângulo máximo de elevação","70°"],["Ângulo de giro","120°"],["Peso total","25.500 kg"]]
  },
  MD300L: {
    label:"MD 300L", sub:"Lança 10,5–32,1 m · com JIB",
    minLen:10.5, maxLen:32.1, minAngle:0, maxAngle:82,
    baseHeight:2.0, baseOffset:1.5, capNominal:30000, approx:true, jib:true, jibLances:[9,15,20],
    capFn:function(length, radius, quad){
      const anchors={10.5:[3.0,30000],14.1:[3.5,20000],17.7:[4.0,16000],21.3:[4.5,12000],24.9:[6.0,11500],28.5:[7.0,9000],32.1:[8.0,7000]};
      const lens=Object.keys(anchors).map(Number).sort((a,b)=>a-b);
      let lo=lens[0], hi=lens[lens.length-1];
      for(let i=0;i<lens.length-1;i++){ if(length>=lens[i] && length<=lens[i+1]){lo=lens[i]; hi=lens[i+1]; break;} }
      const t = hi===lo?0:(length-lo)/(hi-lo);
      const rmin = anchors[lo][0]*(1-t)+anchors[hi][0]*t;
      const cap0 = anchors[lo][1]*(1-t)+anchors[hi][1]*t;
      const rmax = length*0.99;
      let r = Math.max(radius, rmin);
      if(r>=rmax) return 50;
      const frac=(r-rmin)/(rmax-rmin);
      let cap = cap0*Math.pow(0.012, frac);
      if(quad==="lateral") cap*=0.78;
      return Math.max(50, Math.round(cap));
    },
    info:[["Capacidade máxima","30 t a 3.000 mm"],["Comprimento lança estendida","32,1 m"],
          ["Comprimento com JIB","52,1 m"],["Ângulo máximo de elevação","~82°"],["Peso total","29.000 kg"]]
  }
};

let current="TM130", angle=45, len=8, slew=0, jibLance=9, jibPin=10, dragging=false;

/* Furos de montagem do JIB: o JIB trava por pino em 10°, 25° ou 40° ABAIXO
   do eixo da lança principal — não existe posição contínua entre eles. */
const JIB_PINS=[10,25,40];
function jibAbsRad(boomRad){ return boomRad - jibPin*Math.PI/180; }
/* Com JIB, a lança não pode ficar abaixo do ângulo do furo — senão a ponta
   do JIB apontaria para baixo da horizontal (e para dentro do solo). */
function minAngleCur(){
  const m=MODELS[current];
  const jibOn=m.jib && document.getElementById("useJib").checked;
  return jibOn ? Math.max(m.minAngle, jibPin) : m.minAngle;
}

const svg=document.getElementById("craneSvg");
const angleSlider=document.getElementById("angleSlider");
const lenSlider=document.getElementById("lenSlider");
const slewSlider=document.getElementById("slewSlider");

function fmt(n,d=1){ return Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}); }

/* ---------- tabs ---------- */
document.querySelectorAll(".tabbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tabbtn").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-"+btn.dataset.tab).classList.add("active");
    if(btn.dataset.tab==="sim" && viewMode==="3d"){
      requestAnimationFrame(()=>{ resize3D(); update3D(); render3D(); });
    }
  });
});

/* ---------- 2D / 3D toggle ---------- */
let viewMode="2d";
document.querySelectorAll("#viewToggle button").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    viewMode = btn.dataset.view;
    document.querySelectorAll("#viewToggle button").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const is3d = viewMode==="3d";
    document.getElementById("stage2d").style.display = is3d ? "none" : "flex";
    document.getElementById("stage3d").style.display = is3d ? "block" : "none";
    document.getElementById("viewBtnRow").style.display = is3d ? "flex" : "none";
    document.getElementById("dragHint").textContent = is3d
      ? "Arraste o gancho para mudar ângulo/comprimento · arraste o fundo para girar a câmera · roda do mouse para zoom."
      : "Arraste o ponto na ponta da lança no desenho, ou use os controles acima — ambos ficam sincronizados.";
    if(is3d){
      const first = !three3d;
      init3D();
      requestAnimationFrame(()=>{ resize3D(); if(first) frame3D(); update3D(); render3D(); });
    }
  });
});

/* ---------- model switch ---------- */
function buildModelSwitch(){
  const row=document.getElementById("modelSwitch");
  row.innerHTML="";
  Object.keys(MODELS).forEach(key=>{
    const b=document.createElement("button");
    b.textContent=MODELS[key].label;
    if(key===current) b.classList.add("active");
    b.onclick=()=>{ current=key; onModelChange(); };
    row.appendChild(b);
  });
}

function onModelChange(){
  const m=MODELS[current];
  angleSlider.min=m.minAngle; angleSlider.max=m.maxAngle;
  angle=Math.min(angle,m.maxAngle);
  len=m.minLen+(m.maxLen-m.minLen)*0.4;
  slew=0;
  jibLance=MODELS[current].jib ? MODELS[current].jibLances[0] : 0;
  jibPin=JIB_PINS[0];
  syncAccessoryControls();
  buildModelSwitch();
  renderSpec();
  syncSliders();
  hideReverse();
  update();
  if(three3d){ frame3D(); render3D(); }
}

function syncAccessoryControls(){
  const m=MODELS[current];
  const jibBox=document.getElementById("useJib");
  const jibRow=document.getElementById("jibRow");
  const jibLabel=jibRow.querySelector("label");
  let hint=jibRow.querySelector(".hint");
  if(!m.jib){
    jibBox.checked=false;
    jibBox.disabled=true;
    jibRow.classList.add("unavailable");
    const text="indisponível no "+m.label;
    jibBox.title=text;
    jibLabel.title=text;
    if(!hint){
      hint=document.createElement("span");
      hint.className="hint";
      jibRow.appendChild(hint);
    }
    hint.textContent=text;
  } else {
    jibBox.disabled=false;
    jibBox.title="";
    jibLabel.title="";
    jibRow.classList.remove("unavailable");
    if(hint) hint.remove();
  }
  document.getElementById("useBalancim").disabled=false;
  document.getElementById("loadBalancim").disabled=false;
}

function renderSpec(){
  const m=MODELS[current];
  let html="";
  m.info.forEach(([k,v])=>{ html+=`<div class="specRow"><span class="l">${k}</span><span class="r">${v}</span></div>`; });
  document.getElementById("specGrid").innerHTML=html;
  document.getElementById("approxNote").innerHTML = m.approx
    ? `<div class="approxNote">Tabela de capacidade aproximada — validar célula a célula com o catálogo oficial completo antes de qualquer uso fora do ambiente acadêmico.</div>`
    : "";
}

function lenToPct(l){ const m=MODELS[current]; return ((l-m.minLen)/(m.maxLen-m.minLen))*100; }
function pctToLen(p){ const m=MODELS[current]; return m.minLen+(m.maxLen-m.minLen)*(p/100); }
/* JIB: comprimento do lance escolhido (9, 15 ou 20 m), ou 0 se o JIB estiver desligado */
function jibLenCur(){
  const m=MODELS[current];
  const on=document.getElementById("useJib").checked && m.jib;
  return on ? jibLance : 0;
}
function syncSliders(){ angleSlider.value=angle; lenSlider.value=lenToPct(len); slewSlider.value=slew; }

function hideReverse(){
  document.getElementById("reverseResult").style.display="none";
  document.getElementById("reverseNone").style.display="none";
  document.getElementById("reverseWeight").value="";
}

function interp(points,x){
  points=points.slice().sort((a,b)=>a[0]-b[0]);
  if(x<=points[0][0]) return points[0][1];
  if(x>=points[points.length-1][0]) return points[points.length-1][1];
  for(let i=0;i<points.length-1;i++){
    const [x0,y0]=points[i], [x1,y1]=points[i+1];
    if(x>=x0 && x<=x1){ const t=(x-x0)/(x1-x0); return y0+(y1-y0)*t; }
  }
  return points[points.length-1][1];
}

/* ---------- carga: dimensões e pontos de pega ----------
   Distância vertical entre a ponta da lança/JIB e o gancho (moitão + cabo). */
const HOOK_DROP_M=0.8;
const LIMITE_VENTO_MS=12.5; // mesmo valor padrão de config.py (RN08)
let lastRig=null; // última lingada calculada (usada ao reabrir o 3D)
const SLING_MIN_ANGLE=45; // ângulo mínimo recomendado da linga com a horizontal

function readRigging(){
  const num=id=>Math.max(0, Number(document.getElementById(id).value)||0);
  return { C:num("dimC"), L:num("dimL"), A:num("dimA"),
           n:Number(document.getElementById("rigPernas").value)||1,
           d:num("rigDist"), Ls:num("rigLinga") };
}

/* Geometria da lingada: a partir da altura da ponta (tipHeight) e do peso
   pendurado, calcula ângulo das pernas, tração por perna e onde a carga fica. */
function computeRigging(tipHeight, peso){
  const r=readRigging();
  const out={...r, ok:true, problems:[], warnings:[]};
  if(r.C<=0 || r.L<=0 || r.A<=0 || (peso<=0 && !attachedObj())){ out.ok=false; out.show=false; return out; }
  out.show=true;
  // distância horizontal do gancho até cada ponto de pega
  const horiz = r.n===1 ? 0 : r.n===2 ? r.d/2 : Math.hypot(r.d/2, r.L/2);
  if(r.n>1 && r.d>r.C) out.problems.push(`Distância entre pegas (${fmt(r.d)} m) maior que o comprimento da carga (${fmt(r.C)} m).`);
  if(r.Ls<=horiz){
    out.problems.push(`Linga curta demais: precisa ter mais que ${fmt(horiz,2)} m para alcançar os pontos de pega.`);
    out.drop=0; out.angle=0; out.tension=Infinity;
  } else {
    out.drop=Math.sqrt(r.Ls*r.Ls-horiz*horiz);
    out.angle = r.n===1 ? 90 : Math.asin(out.drop/r.Ls)*180/Math.PI;
    // divisão ideal do peso entre as pernas: T = P / (n · sen θ)
    out.tension = peso/(r.n*Math.sin(out.angle*Math.PI/180));
    if(r.n>1 && out.angle<SLING_MIN_ANGLE) out.warnings.push(`Ângulo da linga ${fmt(out.angle,0)}° abaixo de ${SLING_MIN_ANGLE}°: a tração nas pernas cresce muito. Use linga mais longa ou aproxime as pegas.`);
  }
  out.hookHeight=tipHeight-HOOK_DROP_M;
  out.topHeight=out.hookHeight-(out.drop||0);
  out.bottomHeight=out.topHeight-r.A;
  if(out.bottomHeight<0) out.warnings.push(`A carga não sai do solo nesta posição (fundo a ${fmt(out.bottomHeight)} m). Aumente o ângulo da lança.`);
  if(out.problems.length) out.ok=false;
  return out;
}

function quadrantFromSlew(s){ return Math.abs(s)<=16 ? "frontal" : "lateral"; }

function computeGeometry(){
  const m=MODELS[current];
  const rad=angle*Math.PI/180;
  const jl=jibLenCur();
  const jibOn=jl>0;
  let radius=m.baseOffset+len*Math.cos(rad);
  let height=m.baseHeight+len*Math.sin(rad);
  if(jibOn){
    const jRad=jibAbsRad(rad);
    radius+=jl*Math.cos(jRad); height+=jl*Math.sin(jRad);
  }
  return {radius,height,jibOn,jibLen:jl};
}

/* Acessórios marcados (vêm do banco): somam massa na carga quando não estão
   já inclusos na tabela e reduzem a capacidade pelo fator de redução (RN07). */
let ACESSORIOS = [];
function accessoryEffect(){
  let massa=0, fator=1; const ids=[];
  document.querySelectorAll("#accRow input[data-acc]:checked").forEach(cb=>{
    const a=ACESSORIOS.find(x=>x.id===Number(cb.dataset.acc)); if(!a) return;
    ids.push(a.id); if(a.soma_na_carga) massa+=a.massa_kg; fator*=a.fator_reducao;
  });
  return {massa, fator, ids};
}

function computeCapacity(){
  const m=MODELS[current];
  const quad=quadrantFromSlew(slew);
  const geo=computeGeometry();
  let cap;
  if(current==="TM130"){ cap=interp(m.zones[quad].points, angle); }
  else{ cap=m.capFn(len, geo.radius, quad); }
  return {cap: cap*accessoryEffect().fator, quad, geo};
}

function update(){
  const m=MODELS[current];
  syncAttachedFromFields();
  const jibActive=document.getElementById("useJib").checked && m.jib;
  angleSlider.min=minAngleCur();
  if(angle<minAngleCur()) angle=minAngleCur();
  angleSlider.value=angle;
  document.getElementById("angleVal").textContent=angle.toFixed(0)+"°";
  document.getElementById("lenVal").textContent=fmt(len)+" m";
  document.getElementById("slewVal").textContent=slew.toFixed(0)+"°";
  document.getElementById("jibCtl").style.display = jibActive ? "" : "none";
  document.querySelector(".controlsRow").classList.toggle("withJib", jibActive);
  document.getElementById("jibAngleVal").textContent = jibActive ? jibPin+"°" : "–";
  document.querySelectorAll("#jibPins button").forEach(b=>b.classList.toggle("active", Number(b.dataset.pin)===jibPin));
  document.getElementById("jibVal").textContent = !jibActive ? "–" : jibLance+" m";
  document.querySelectorAll("#jibLances button").forEach(b=>b.classList.toggle("active", Number(b.dataset.lance)===jibLance));

  const {cap, quad, geo}=computeCapacity();
  const carga=Number(document.getElementById("loadCarga").value)||0;
  const lingada=Number(document.getElementById("loadLingada").value)||0;
  const cabo=Number(document.getElementById("loadCabo").value)||0;
  const balOn=document.getElementById("useBalancim").checked;
  const bal=balOn ? (Number(document.getElementById("loadBalancim").value)||0) : 0;
  const acc=accessoryEffect();
  const sum=carga+lingada+cabo+bal+acc.massa;
  const pct=cap>0 ? (sum/cap)*100 : 0;
  /* Carga acima da capacidade nominal do equipamento não é uma operação
     "insegura": é um dado irreal (ex.: 250 t num guindaste de 30 t). */
  const irreal=sum>m.capNominal;
  const ventoTxt=document.getElementById("loadVento").value;
  const vento = ventoTxt==="" ? null : Number(ventoTxt);
  const ventoAlto = vento!==null && vento>LIMITE_VENTO_MS;
  const rig=computeRigging(geo.height, carga);
  lastRig=rig;
  document.getElementById("rigAngleOut").textContent = rig.show && rig.drop ? fmt(rig.angle,0)+"°" : "–";
  document.getElementById("rigTensionOut").textContent = rig.show && isFinite(rig.tension) && carga>0 ? fmt(rig.tension,0)+" kg" : "–";
  document.getElementById("rigBottomOut").textContent = rig.show ? fmt(rig.bottomHeight)+" m" : "–";
  const note=document.getElementById("rigNote");
  const msgs = rig.show ? [...rig.problems, ...rig.warnings] : [];
  if(document.getElementById("terreno").value==="mole")
    msgs.push("Terreno mole: apoie as patolas em pranchões/placas e confirme a capacidade do solo (regra de redução ainda não definida).");
  note.style.display = msgs.length ? "" : "none";
  note.className = "rigNote "+(rig.show && rig.problems.length ? "danger" : "warn");
  note.innerHTML = msgs.map(t=>"• "+t).join("<br>");
  document.getElementById("loadCarga").classList.toggle("invalid", irreal);

  document.getElementById("quadTagOut").innerHTML = quad==="frontal"
    ? `<span class="quadPill f">FRONTAL</span>` : `<span class="quadPill l">LATERAL/TRAS.</span>`;
  document.getElementById("radiusOut").textContent=fmt(geo.radius)+" m";
  document.getElementById("lenOut").textContent=fmt(len)+" m"+(geo.jibOn?" + JIB "+geo.jibLen+" m":"");
  document.getElementById("angleOut").textContent=angle.toFixed(0)+"°";
  document.getElementById("heightOut").textContent=fmt(geo.height)+" m";
  document.getElementById("sumOut").textContent=fmt(sum,0)+" kg";
  document.getElementById("capOut").textContent=fmt(cap,0)+" kg"+(m.approx?" (aprox.)":"");

  let color, dot, label, sub, barColor;
  if(sum<=0){
    color="var(--muted-dim)"; label="Aguardando dados"; sub="Informe o peso da carga para calcular"; barColor="var(--line)";
  } else if(ventoAlto){
    color="var(--danger)"; label="Operação insegura"; sub=`Vento de ${fmt(vento)} m/s acima do limite de ${fmt(LIMITE_VENTO_MS)} m/s.`; barColor="var(--danger)";
  } else if(irreal){
    color="var(--danger)"; label="Carga fora da realidade"; sub=`A soma das cargas (${fmt(sum/1000,1)} t) passa da capacidade nominal do ${m.label} (${fmt(m.capNominal/1000,0)} t). Confira o peso informado.`; barColor="var(--danger)";
  } else if(pct<=80){
    color="var(--safe)"; label="Operação segura"; sub=`Usando ${pct.toFixed(1)}% da capacidade disponível`; barColor="var(--safe)";
  } else if(pct<=100){
    color="var(--warn)"; label="Próximo do limite"; sub=`Usando ${pct.toFixed(1)}% da capacidade — revise a operação`; barColor="var(--warn)";
  } else {
    color="var(--danger)"; label="Operação insegura"; sub=`Carga excede a capacidade em ${(pct-100).toFixed(1)}% — risco de tombamento ou dano estrutural`; barColor="var(--danger)";
  }
  const statusBox=document.getElementById("statusBox");
  statusBox.style.borderColor = sum<=0 ? "var(--line)" : color;
  statusBox.style.background = sum<=0 ? "var(--panel)" : (irreal||ventoAlto) ? "var(--danger-bg)" : (pct<=80?"var(--safe-bg)":pct<=100?"var(--warn-bg)":"var(--danger-bg)");
  document.getElementById("statusDot").style.background=color;
  document.getElementById("statusMain").textContent=label;
  document.getElementById("statusMain").style.color = sum<=0 ? "var(--text)" : color;
  document.getElementById("statusSub").textContent=sub;
  document.getElementById("barFill").style.width=Math.min(pct,130)+"%";
  document.getElementById("barFill").style.background=barColor;

  const gs=document.getElementById("globalStatus");
  gs.innerHTML = `<span class="dot" style="background:${color}"></span>${label}`;

  drawCrane(geo, quad, rig);
  update3D(rig);
  afterSceneUpdate();
  scheduleApiCheck();
  render3D();
}

function drawCrane(geo, quad, rig){
  const m=MODELS[current];
  const W=640,H=380, groundY=320, baseX=110, scale=7.6;
  const pivotX=baseX, pivotY=groundY-m.baseHeight*scale;
  const rad=angle*Math.PI/180;
  const tipX=pivotX+len*scale*Math.cos(rad), tipY=pivotY-len*scale*Math.sin(rad);
  let jibTipX=tipX, jibTipY=tipY;
  if(geo.jibOn){
    const jRad=jibAbsRad(rad);
    jibTipX=tipX+geo.jibLen*scale*Math.cos(jRad); jibTipY=tipY-geo.jibLen*scale*Math.sin(jRad);
  }
  const quadColor = quad==="frontal" ? "#5b9bd1" : "#f2a900";
  const lineDim="#3a434e";

  svg.innerHTML=`
    <line x1="16" y1="${groundY}" x2="${W-16}" y2="${groundY}" stroke="${lineDim}" stroke-width="1.5"/>
    <text x="20" y="${groundY+16}" fill="#5c6774" font-size="10" font-family="IBM Plex Mono">SOLO</text>

    <line x1="${pivotX}" y1="${groundY+8}" x2="${tipX}" y2="${groundY+8}" stroke="${quadColor}" stroke-width="1.5" stroke-dasharray="4 3"/>
    <line x1="${pivotX}" y1="${groundY+3}" x2="${pivotX}" y2="${groundY+13}" stroke="${quadColor}" stroke-width="1.5"/>
    <line x1="${tipX}" y1="${groundY+3}" x2="${tipX}" y2="${groundY+13}" stroke="${quadColor}" stroke-width="1.5"/>
    <text x="${(pivotX+tipX)/2-34}" y="${groundY+27}" fill="${quadColor}" font-size="11" font-family="IBM Plex Mono" font-weight="600">${fmt(geo.radius)} m</text>

    <rect x="${baseX-90}" y="${groundY-42}" width="140" height="42" rx="2" fill="#3a434e"/>
    <rect x="${baseX-90}" y="${groundY-62}" width="50" height="24" rx="2" fill="#828d99"/>
    <circle cx="${baseX-65}" cy="${groundY}" r="14" fill="#0e1114" stroke="#4a535e" stroke-width="3"/>
    <circle cx="${baseX+25}" cy="${groundY}" r="14" fill="#0e1114" stroke="#4a535e" stroke-width="3"/>
    <circle cx="${baseX+48}" cy="${groundY}" r="14" fill="#0e1114" stroke="#4a535e" stroke-width="3"/>

    <line x1="${baseX-90}" y1="${groundY}" x2="${baseX-112}" y2="${groundY}" stroke="#4a535e" stroke-width="5"/>
    <line x1="${baseX+48}" y1="${groundY}" x2="${baseX+74}" y2="${groundY}" stroke="#4a535e" stroke-width="5"/>

    <circle cx="${pivotX}" cy="${pivotY}" r="8" fill="#828d99"/>
    <line x1="${pivotX}" y1="${pivotY}" x2="${tipX}" y2="${tipY}" stroke="${quadColor}" stroke-width="7" stroke-linecap="round"/>
    ${geo.jibOn?`<line x1="${tipX}" y1="${tipY}" x2="${jibTipX}" y2="${jibTipY}" stroke="#828d99" stroke-width="4.5" stroke-linecap="round"/>`:""}

    <path d="M ${pivotX+36} ${pivotY} A 36 36 0 0 0 ${pivotX+36*Math.cos(rad)} ${pivotY-36*Math.sin(rad)}" fill="none" stroke="#5c6774" stroke-width="1"/>
    <text x="${pivotX+42}" y="${pivotY-8}" fill="#5c6774" font-size="10" font-family="IBM Plex Mono">${angle.toFixed(0)}°</text>

    ${drawLoad2D(jibTipX, jibTipY, scale, quadColor, rig)}

    <circle id="dragHandle" cx="${jibTipX}" cy="${jibTipY}" r="13" fill="${quadColor}" fill-opacity="0.18" stroke="${quadColor}" stroke-width="1.5" style="cursor:grab;"/>

    <line x1="${W-46}" y1="${groundY}" x2="${W-46}" y2="${jibTipY}" stroke="#3a434e" stroke-width="1" stroke-dasharray="2 3"/>
    <text x="${W-44}" y="${(groundY+tipY)/2}" fill="#5c6774" font-size="10" font-family="IBM Plex Mono">${fmt(geo.height)} m</text>
  `;

  const handle=document.getElementById("dragHandle");
  handle.addEventListener("pointerdown", e=>{ dragging=true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener("pointermove", e=>{
    if(!dragging) return;
    const box=svg.getBoundingClientRect();
    const scaleX=W/box.width, scaleY=H/box.height;
    const x=(e.clientX-box.left)*scaleX, y=(e.clientY-box.top)*scaleY;
    const dx=x-pivotX, dy=pivotY-y;
    let newAngle=Math.atan2(dy,dx)*180/Math.PI;
    newAngle=Math.max(minAngleCur(), Math.min(m.maxAngle, newAngle));
    let newLen=Math.sqrt(dx*dx+dy*dy)/scale;
    newLen=Math.max(m.minLen, Math.min(m.maxLen, newLen));
    angle=newAngle; len=newLen;
    syncSliders(); update();
  });
  handle.addEventListener("pointerup", ()=>{ dragging=false; });
}

/* Gancho, pernas da linga e a carga (vista lateral: comprimento no eixo x). */
function drawLoad2D(tx, ty, scale, color, rig){
  const hookY=ty+HOOK_DROP_M*scale;
  let s=`<line x1="${tx}" y1="${ty}" x2="${tx}" y2="${hookY}" stroke="#5c6774" stroke-width="1.5"/>
    <circle cx="${tx}" cy="${hookY}" r="4" fill="#0e1114" stroke="${color}" stroke-width="1.5"/>`;
  if(!rig || !rig.show) return s;
  const bad=rig.problems.length>0;
  const slingColor = bad ? "#e5484d" : (rig.warnings.length ? "#f2a900" : "#c9d1d9");
  const drop=(rig.drop||Math.max(rig.Ls,0.5))*scale;
  const topY=hookY+drop;
  const half = rig.n===1 ? 0 : Math.min(rig.d, rig.C)/2*scale;
  const pegas = rig.n===1 ? [tx] : [tx-half, tx+half];
  pegas.forEach(px=>{
    s+=`<line x1="${tx}" y1="${hookY}" x2="${px}" y2="${topY}" stroke="${slingColor}" stroke-width="1.3"${bad?' stroke-dasharray="3 2"':""}/>
      <circle cx="${px}" cy="${topY}" r="2.5" fill="${slingColor}"/>`;
  });
  const w=rig.C*scale, h=rig.A*scale;
  s+=`<rect x="${tx-w/2}" y="${topY}" width="${w}" height="${h}" fill="rgba(242,169,0,0.18)" stroke="#f2a900" stroke-width="1.2"/>
    <text x="${tx}" y="${topY+h+11}" fill="#f2a900" font-size="9" font-family="IBM Plex Mono" text-anchor="middle">${fmt(rig.C)}×${fmt(rig.L)}×${fmt(rig.A)} m</text>`;
  if(rig.n>1 && rig.drop) s+=`<text x="${tx+half+4}" y="${hookY+drop/2}" fill="${slingColor}" font-size="9" font-family="IBM Plex Mono">${fmt(rig.angle,0)}°</text>`;
  return s;
}

/* ---------- reverse calc ---------- */
function solveMaxRadiusForWeight(weight){
  const m=MODELS[current];
  const quad=quadrantFromSlew(slew);
  let best=null;
  const step=0.25;
  for(let a=minAngleCur(); a<=m.maxAngle; a+=step){
    const radAngle=a*Math.PI/180;
    const jl=jibLenCur();
    const jibOn=jl>0;
    let radius=m.baseOffset+len*Math.cos(radAngle);
    let height=m.baseHeight+len*Math.sin(radAngle);
    if(jibOn){
      const jRad=jibAbsRad(radAngle);
      radius+=jl*Math.cos(jRad); height+=jl*Math.sin(jRad);
    }
    let cap = (current==="TM130" ? interp(m.zones[quad].points, a) : m.capFn(len, radius, quad)) * accessoryEffect().fator;
    if(cap>=weight){ if(!best || radius>best.radius){ best={angle:a, radius, height, cap}; } }
  }
  return best;
}

const NONE_MSG=document.getElementById("reverseNone").textContent.trim();
document.getElementById("reverseBtn").addEventListener("click", ()=>{
  const w=Number(document.getElementById("reverseWeight").value)||0;
  const resBox=document.getElementById("reverseResult"), noneBox=document.getElementById("reverseNone");
  if(w<=0){ resBox.style.display="none"; noneBox.style.display="none"; return; }
  const m=MODELS[current];
  if(w>m.capNominal){
    resBox.style.display="none"; noneBox.style.display="block";
    noneBox.textContent=`${fmt(w/1000,1)} t passa da capacidade nominal do ${m.label} (${fmt(m.capNominal/1000,0)} t). Confira o peso informado.`;
    return;
  }
  noneBox.textContent=NONE_MSG;
  apiReverse(w);
  const best=solveMaxRadiusForWeight(w);
  if(!best){ resBox.style.display="none"; noneBox.style.display="block"; return; }
  noneBox.style.display="none"; resBox.style.display="block";
  document.getElementById("revRadius").textContent=fmt(best.radius)+" m";
  document.getElementById("revAngle").textContent=best.angle.toFixed(1)+"°";
  document.getElementById("revHeight").textContent=fmt(best.height)+" m";
  document.getElementById("revCap").textContent=fmt(best.cap,0)+" kg";
  document.getElementById("revGoBtn").onclick=()=>{
    angle=best.angle; syncSliders();
    document.getElementById("loadCarga").value=w;
    document.getElementById("loadLingada").value=0;
    document.getElementById("loadCabo").value=0;
    document.getElementById("useBalancim").checked=false;
    document.getElementById("loadBalancim").value=0;
    document.querySelector('.tabbtn[data-tab="sim"]').click();
    update();
  };
});
document.getElementById("reverseWeight").addEventListener("input", ()=>{
  document.getElementById("reverseResult").style.display="none";
  document.getElementById("reverseNone").style.display="none";
});

/* ---------- wiring ---------- */
angleSlider.addEventListener("input", ()=>{ angle=Number(angleSlider.value); update(); });
lenSlider.addEventListener("input", ()=>{ len=pctToLen(Number(lenSlider.value)); hideReverse(); update(); });
slewSlider.addEventListener("input", ()=>{ slew=Number(slewSlider.value); hideReverse(); update(); });
["loadCarga","loadLingada","loadCabo","loadVento","dimC","dimL","dimA","rigDist","rigLinga"].forEach(id=>document.getElementById(id).addEventListener("input", update));
document.getElementById("rigPernas").addEventListener("change", update);
document.getElementById("terreno").addEventListener("change", update);
document.getElementById("accRow").addEventListener("change", update);
document.getElementById("loadBalancim").addEventListener("input", ()=>{
  const v=Number(document.getElementById("loadBalancim").value)||0;
  if(v>0) document.getElementById("useBalancim").checked=true;
  update();
});
document.querySelectorAll("#jibPins button").forEach(b=>b.addEventListener("click", ()=>{
  const pin=Number(b.dataset.pin);
  if(!JIB_PINS.includes(pin)) return;
  jibPin=pin; hideReverse(); update();
}));
/* Lances padronizados do JIB treliçado: só 9, 15 ou 20 m. */
document.querySelectorAll("#jibLances button").forEach(b=>b.addEventListener("click", ()=>{
  const l=Number(b.dataset.lance);
  if(!MODELS[current].jib || !MODELS[current].jibLances.includes(l)) return;
  jibLance=l; hideReverse(); update();
}));
document.getElementById("useJib").addEventListener("change", ()=>{ hideReverse(); update(); });
document.getElementById("useBalancim").addEventListener("change", ()=>{
  const box=document.getElementById("useBalancim");
  const input=document.getElementById("loadBalancim");
  if(!box.checked) input.value=0;
  else { input.focus(); input.select(); }
  update();
});

let three3d = null;
let orbit3d = { theta: Math.PI/4, phi: Math.PI/3, radius: 24, target: new THREE.Vector3(0,2,0) };
let dragging3d = false, last3dX=0, last3dY=0, draggingObj3D = null;

function init3D(){
  if(three3d) return;
  const canvas = document.getElementById("crane3dCanvas");
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.95); sun.position.set(12,22,10); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x5b9bd1, 0.25); fill.position.set(-10,6,-10); scene.add(fill);

  scene.add(new THREE.GridHelper(60, 30, 0x3a434e, 0x232a32));

  const chassisMat = new THREE.MeshStandardMaterial({color:0x3a434e, roughness:0.6, metalness:0.2});
  const cabMat     = new THREE.MeshStandardMaterial({color:0x828d99, roughness:0.5});
  const wheelMat   = new THREE.MeshStandardMaterial({color:0x0e1114, roughness:0.9});
  const boomMat    = new THREE.MeshStandardMaterial({color:0x5b9bd1, roughness:0.35, metalness:0.35});
  const jibMat     = new THREE.MeshStandardMaterial({color:0x828d99, roughness:0.4, metalness:0.25});
  const hookMat    = new THREE.MeshStandardMaterial({color:0xf2a900, roughness:0.3, metalness:0.5});

  const truck = new THREE.Group();
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(6,1.1,2.4), chassisMat);
  chassis.position.set(0,0.85,0); truck.add(chassis);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6,1.2,2.2), cabMat);
  cab.position.set(-3.4,1.5,0); truck.add(cab);
  const wheelGeo = new THREE.CylinderGeometry(0.55,0.55,0.5,20);
  [[-2.2,-1.35],[-2.2,1.35],[1.6,-1.35],[1.6,1.35],[2.6,-1.35],[2.6,1.35]].forEach(([x,z])=>{
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI/2;
    wheel.position.set(x,0.55,z);
    truck.add(wheel);
  });
  scene.add(truck);

  const turret = new THREE.Group();
  turret.position.set(SLEW_AXIS_X, TURRET_Y, 0);
  truck.add(turret);
  const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,0.55,24), chassisMat);
  turretBase.position.y=0.28; turret.add(turretBase);

  const boomPivot = new THREE.Group();
  boomPivot.position.set(0, 0.65, 0);
  turret.add(boomPivot);

  const boomGeo = new THREE.BoxGeometry(1,0.32,0.32);
  boomGeo.translate(0.5,0,0);
  const boom = new THREE.Mesh(boomGeo, boomMat);
  boomPivot.add(boom);

  const jibPivot = new THREE.Group();
  boomPivot.add(jibPivot);
  const jibGeo = new THREE.BoxGeometry(1,0.16,0.16);
  jibGeo.translate(0.5,0,0);
  const jib = new THREE.Mesh(jibGeo, jibMat);
  jibPivot.add(jib);

  const hookAnchor = new THREE.Group();
  jibPivot.add(hookAnchor);
  const hook = new THREE.Mesh(new THREE.SphereGeometry(0.32,16,16), hookMat);
  hook.position.y = -0.35;
  hookAnchor.add(hook);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.35,8), wheelMat);
  cable.position.y = -0.17;
  hookAnchor.add(cable);

  /* carga pendurada: fica na cena (não no JIB) para sempre pender na vertical */
  const loadGroup = new THREE.Group();
  scene.add(loadGroup);
  const loadBox = new THREE.Mesh(new THREE.BoxGeometry(1,1,1),
    new THREE.MeshStandardMaterial({color:0xf2a900, roughness:0.6, transparent:true, opacity:0.55}));
  loadGroup.add(loadBox);
  loadBox.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),
    new THREE.LineBasicMaterial({color:0xf2a900})));
  loadBox.userData.forma = null; // a geometria certa entra no primeiro updateLoad3D
  const slingGeo = new THREE.BufferGeometry();
  slingGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(30).fill(0), 3));
  const slings = new THREE.LineSegments(slingGeo, new THREE.LineBasicMaterial({color:0xc9d1d9}));
  loadGroup.add(slings);

  cable.visible = false; // o cabo agora é desenhado na vertical junto com a carga

  /* objetos da cena e "radar" no chão: anel do raio atual e anel do alcance máximo */
  const objectsGroup = new THREE.Group();
  scene.add(objectsGroup);
  const decorGroup = new THREE.Group();
  scene.add(decorGroup);
  const circlePts = [];
  for(let i=0;i<=96;i++){ const t=i/96*Math.PI*2; circlePts.push(new THREE.Vector3(Math.cos(t),0,Math.sin(t))); }
  const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePts);
  const radiusRing = new THREE.Line(circleGeo, new THREE.LineBasicMaterial({color:0x5b9bd1}));
  const reachRing = new THREE.Line(circleGeo, new THREE.LineDashedMaterial({color:0x5c6774, dashSize:0.6, gapSize:0.4}));
  radiusRing.position.set(SLEW_AXIS_X, 0.03, 0); reachRing.position.set(SLEW_AXIS_X, 0.02, 0);
  scene.add(radiusRing); scene.add(reachRing);
  const hookMarker = new THREE.Mesh(new THREE.RingGeometry(0.25,0.4,24), new THREE.MeshBasicMaterial({color:0xf2a900, side:THREE.DoubleSide}));
  hookMarker.rotation.x = -Math.PI/2;
  scene.add(hookMarker);

  three3d = {renderer, scene, camera, turret, boomPivot, boom, jibPivot, jib, hookAnchor, hook, loadGroup, loadBox, slings,
             objectsGroup, objMeshes:{}, decorGroup, objDecor:{}, radiusRing, reachRing, hookMarker};

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let draggingHook3D = false;

  function ndcFromEvent(e){
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX-rect.left)/rect.width)*2-1;
    ndc.y = -((e.clientY-rect.top)/rect.height)*2+1;
  }

  function dragBoomTo(e){
    ndcFromEvent(e);
    raycaster.setFromCamera(ndc, camera);
    const normal = new THREE.Vector3(0,0,1).applyQuaternion(turret.getWorldQuaternion(new THREE.Quaternion()));
    const pivotWorld = new THREE.Vector3();
    boomPivot.getWorldPosition(pivotWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pivotWorld);
    const hit = new THREE.Vector3();
    if(!raycaster.ray.intersectPlane(plane, hit)) return;
    const local = turret.worldToLocal(hit.clone());
    const dx = local.x - boomPivot.position.x;
    const dy = local.y - boomPivot.position.y;
    const m = MODELS[current];
    let newAngle = Math.atan2(dy,dx)*180/Math.PI;
    newAngle = Math.max(minAngleCur(), Math.min(m.maxAngle, newAngle));
    let newLen = Math.sqrt(dx*dx+dy*dy);
    newLen = Math.max(m.minLen, Math.min(m.maxLen, newLen));
    angle = newAngle; len = newLen;
    syncSliders(); hideReverse(); update();
  }

  canvas.addEventListener("pointerdown", e=>{
    ndcFromEvent(e);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(three3d.hook, false);
    const objHits = raycaster.intersectObjects(three3d.objectsGroup.children, false);
    if(hits.length){
      draggingHook3D = true;
    } else if(objHits.length){
      // clicou num objeto: seleciona e começa a arrastar pelo chão
      const id = objHits[0].object.userData.objId;
      selectObj(id);
      const o = sceneObjects.find(x=>x.id===id);
      const p = objHits[0].point;
      draggingObj3D = { id, dx:o.x-p.x, dz:o.z-p.z };
    } else {
      dragging3d=true; last3dX=e.clientX; last3dY=e.clientY;
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e=>{
    if(draggingHook3D){ dragBoomTo(e); return; }
    if(draggingObj3D){
      ndcFromEvent(e);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if(raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), 0), hit)){
        const o = sceneObjects.find(x=>x.id===draggingObj3D.id);
        if(o){ o.x = hit.x+draggingObj3D.dx; o.z = hit.z+draggingObj3D.dz; persistObj(o); update(); }
      }
      return;
    }
    if(!dragging3d) return;
    const dx=e.clientX-last3dX, dy=e.clientY-last3dY;
    last3dX=e.clientX; last3dY=e.clientY;
    orbit3d.theta -= dx*0.008;
    orbit3d.phi = Math.max(0.08, Math.min(Math.PI-0.08, orbit3d.phi - dy*0.008));
    updateCamera3D(); render3D();
  });
  canvas.addEventListener("pointerup", ()=>{ dragging3d=false; draggingHook3D=false; draggingObj3D=null; });
  canvas.addEventListener("pointerleave", ()=>{ dragging3d=false; draggingHook3D=false; draggingObj3D=null; });
  canvas.addEventListener("wheel", e=>{
    e.preventDefault();
    orbit3d.radius = Math.max(7, Math.min(160, orbit3d.radius*(1+e.deltaY*0.001)));
    updateCamera3D(); render3D();
  }, {passive:false});

  document.querySelectorAll(".viewBtnRow button").forEach(b=>{
    b.addEventListener("click", ()=>{
      frame3D(b.dataset.camview);
      render3D();
    });
  });

  window.addEventListener("resize", ()=>{ if(viewMode==="3d"){ resize3D(); render3D(); } });

  updateCamera3D();
}

/* Enquadra o guindaste inteiro (caminhão, lança, JIB e carga) na vista pedida.
   Sem isso, lança longa + JIB saem da tela na câmera fixa. */
const CAM_PRESETS = {
  iso:  {theta:Math.PI/4, phi:Math.PI/3},
  front:{theta:0,         phi:Math.PI/2.15},
  side: {theta:Math.PI/2, phi:Math.PI/2.15},
  top:  {theta:Math.PI/4, phi:0.18},
};
function frame3D(view="iso"){
  if(!three3d) return;
  update3D();
  const {scene, jibPivot, hookAnchor, loadGroup, loadBox, camera} = three3d;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3(new THREE.Vector3(-4.5,0,-1.5), new THREE.Vector3(3.5,2.5,1.5)); // caminhão
  const v = new THREE.Vector3();
  box.expandByPoint(jibPivot.getWorldPosition(v));
  box.expandByPoint(hookAnchor.getWorldPosition(v));
  if(loadBox.visible){
    const lb = new THREE.Box3().setFromObject(loadBox);
    box.union(lb);
  }
  sceneObjects.forEach(o=>{ if(o.id!==attachedObjId) box.expandByPoint(new THREE.Vector3(o.x, o.A, o.z)); });
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const fitH = (size.y/2) / Math.tan(camera.fov*Math.PI/360);
  const fitW = (Math.max(size.x,size.z)/2) / (Math.tan(camera.fov*Math.PI/360)*Math.max(camera.aspect,0.5));
  Object.assign(orbit3d, CAM_PRESETS[view] || CAM_PRESETS.iso);
  orbit3d.target.copy(center);
  orbit3d.radius = Math.min(160, Math.max(10, Math.max(fitH, fitW)*1.25 + Math.max(size.x,size.z)/2));
  updateCamera3D();
}

function updateCamera3D(){
  if(!three3d) return;
  const {theta, phi, radius, target} = orbit3d;
  const x = target.x + radius*Math.sin(phi)*Math.sin(theta);
  const y = target.y + radius*Math.cos(phi);
  const z = target.z + radius*Math.sin(phi)*Math.cos(theta);
  three3d.camera.position.set(x,y,z);
  three3d.camera.lookAt(target);
}

function resize3D(){
  if(!three3d) return;
  const el = document.getElementById("stage3d");
  const w = el.clientWidth, h = el.clientHeight;
  if(w===0||h===0) return;
  three3d.camera.aspect = w/h;
  three3d.camera.updateProjectionMatrix();
  three3d.renderer.setSize(w,h,false);
}

function update3D(rig=lastRig){
  if(!three3d) return;
  const m = MODELS[current];
  const jl = jibLenCur();
  const jibOn = jl>0;
  three3d.turret.rotation.y = -slew*Math.PI/180;
  // pé da lança na mesma posição usada no cálculo do raio/altura
  three3d.boomPivot.position.set(m.baseOffset, m.baseHeight-TURRET_Y, 0);
  three3d.boomPivot.rotation.z = angle*Math.PI/180;
  three3d.boom.scale.x = len;
  three3d.jibPivot.position.x = len;
  if(jibOn){
    three3d.jib.visible = true;
    three3d.jibPivot.rotation.z = -jibPin*Math.PI/180;
    three3d.jib.scale.x = jl;
    three3d.hookAnchor.position.x = jl;
  } else {
    three3d.jib.visible = false;
    three3d.jibPivot.rotation.z = 0;
    three3d.hookAnchor.position.x = 0;
  }
  updateLoad3D(rig);
}

function updateLoad3D(rig){
  const {scene, hookAnchor, loadGroup, loadBox, slings} = three3d;
  scene.updateMatrixWorld(true);
  const anchor = new THREE.Vector3();
  hookAnchor.getWorldPosition(anchor);
  loadGroup.position.set(anchor.x, anchor.y-HOOK_DROP_M, anchor.z);
  loadGroup.rotation.y = three3d.turret.rotation.y;
  // gancho sempre na vertical abaixo da ponta, onde começam as pernas da linga
  three3d.hook.position.copy(hookAnchor.worldToLocal(new THREE.Vector3(anchor.x, anchor.y-HOOK_DROP_M, anchor.z)));
  const pos = slings.geometry.attributes.position;
  pos.array.fill(0);
  pos.setXYZ(0, 0, HOOK_DROP_M, 0); pos.setXYZ(1, 0, 0, 0); // cabo do gancho
  if(!rig || !rig.show){ loadBox.visible=false; pos.needsUpdate=true; slings.geometry.setDrawRange(0,2); return; }
  const drop = rig.drop || Math.max(rig.Ls,0.5);
  loadBox.visible = true;
  const ao = attachedObj();
  setMeshShape(loadBox, ao ? ao.forma : "caixa");
  loadBox.material.color.set(ao ? ao.cor : 0xf2a900);
  loadBox.material.opacity = ao ? 0.9 : 0.55;
  loadBox.children[0].material.color.set(ao ? 0xffffff : 0xf2a900);
  loadBox.scale.set(rig.C, rig.A, rig.L);
  loadBox.position.set(0, -drop-rig.A/2, 0);
  const hx = rig.n===1 ? 0 : Math.min(rig.d, rig.C)/2;
  const pegas = rig.n===1 ? [[0,0]] : rig.n===2 ? [[-hx,0],[hx,0]] : [[-hx,-rig.L/2],[-hx,rig.L/2],[hx,-rig.L/2],[hx,rig.L/2]];
  pegas.forEach(([x,z],i)=>{ pos.setXYZ(2+i*2, 0,0,0); pos.setXYZ(3+i*2, x,-drop,z); });
  slings.material.color.set(rig.problems.length ? 0xe5484d : rig.warnings.length ? 0xf2a900 : 0xc9d1d9);
  slings.geometry.setDrawRange(0, 2+pegas.length*2);
  pos.needsUpdate = true;
}

function render3D(){
  if(!three3d) return;
  const el = document.getElementById("stage3d");
  if(el.clientWidth===0) return;
  three3d.renderer.render(three3d.scene, three3d.camera);
}

/* ---------- integração com a API (Flask) ----------
   Se a página for servida pelo app.py, as rotas /api/* respondem: os limites
   de cada guindaste vêm do banco, cada mudança é validada pelo servidor
   (RN01–RN08) e dá para salvar a simulação e ver o histórico. Sem servidor
   (ex.: abrir o index.html direto), tudo continua funcionando só no local. */
const API = { online:false, ids:{}, labels:{}, user:null };
const API_MODEL_KEYS = { "TM 130":"TM130", "MD 300L":"MD300L" };
const STATUS_LABEL = { seguro:"seguro", proximo_limite:"próximo do limite", inseguro:"inseguro" };

async function apiInit(){
  try{
    const r = await fetch("api/guindastes");
    if(!r.ok) throw new Error(r.status);
    const lista = await r.json();
    lista.forEach(g=>{
      const k = API_MODEL_KEYS[g.modelo];
      API.labels[g.id] = g.modelo;
      if(!k) return;
      API.ids[k] = g.id;
      const m = MODELS[k];
      m.capNominal = g.capacidade_maxima_kg;
      m.minLen = g.comprimento_lanca_min_m; m.maxLen = g.comprimento_lanca_max_m;
      m.minAngle = g.angulo_min_graus;      m.maxAngle = g.angulo_max_graus;
    });
    API.online = true;
  }catch(e){
    API.online = false;
  }
  if(API.online){
    try{ ACESSORIOS = await (await fetch("api/acessorios")).json(); }catch(e){ ACESSORIOS = []; }
    try{ API.user = await (await fetch("api/auth/me")).json(); }catch(e){ API.user = null; }
  }
  renderAccessories();
  onModelChange();
  onAuthChange();
}

function renderAccessories(){
  const row = document.getElementById("accRow");
  if(!API.online){ row.innerHTML = `<span class="hint">Acessórios: disponíveis com o servidor rodando.</span>`; return; }
  row.innerHTML = `<span>Acessórios:</span>` + ACESSORIOS.map(a=>{
    const info = [a.soma_na_carga ? `${fmt(a.massa_kg,0)} kg` : "já incluso na tabela", a.fator_reducao<1 ? `capacidade ×${fmt(a.fator_reducao,3)}` : ""].filter(Boolean).join(", ");
    return `<label title="${(a.observacoes||"").replace(/"/g,"&quot;")}"><input type="checkbox" data-acc="${a.id}">${a.nome} <span class="hint">(${info})</span></label>`;
  }).join("");
}

/* ---- login ---- */
function onAuthChange(){
  const box = document.getElementById("userBox");
  const u = API.user;
  if(!API.online){ box.innerHTML = ""; }
  else if(!u){ box.innerHTML = `<button id="loginOpen">Entrar</button>`; document.getElementById("loginOpen").onclick = openLogin; }
  else {
    box.innerHTML = `<b>${u.nome}</b>${u.papel==="administrador" ? ` · <a href="admin">Cadastros</a>` : ""} · <button id="logoutBtn">Sair</button>`;
    document.getElementById("logoutBtn").onclick = async ()=>{
      await fetch("api/auth/logout", {method:"POST"});
      API.user = null; forgetServerObjects(); onAuthChange();
    };
  }
  const save = document.getElementById("saveBtn");
  save.disabled = !(API.online && u);
  save.title = !API.online ? "Servidor offline" : !u ? "Entre para salvar simulações" : "";
  loadHistory();
  if(API.online && u) loadObjectsFromServer();
  scheduleApiCheck();
}
function openLogin(){
  document.getElementById("loginErr").textContent = "";
  document.getElementById("loginModal").hidden = false;
  document.getElementById("loginUser").focus();
}
document.getElementById("loginCancel").addEventListener("click", ()=>{ document.getElementById("loginModal").hidden = true; });
document.getElementById("loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  try{
    API.user = await postJSON("api/auth/login", { login: document.getElementById("loginUser").value, senha: document.getElementById("loginPass").value });
    document.getElementById("loginPass").value = "";
    document.getElementById("loginModal").hidden = true;
    onAuthChange();
  }catch(err){
    document.getElementById("loginErr").textContent = err.message;
  }
});

function apiPayload(salvar){
  const m = MODELS[current];
  const num = id => Number(document.getElementById(id).value)||0;
  const ventoTxt = document.getElementById("loadVento").value;
  const rig = readRigging();
  return {
    guindaste_id: API.ids[current],
    comprimento_lanca_m: +len.toFixed(2),
    angulo_graus: +angle.toFixed(2),
    angulo_giro_graus: slew,
    raio_operacao_m: +computeGeometry().radius.toFixed(2),
    peso_carga_kg: num("loadCarga"),
    massa_lingada_kg: num("loadLingada"),
    massa_cabo_kg: num("loadCabo"),
    usa_balancim: document.getElementById("useBalancim").checked,
    massa_balancim_kg: num("loadBalancim"),
    velocidade_vento_ms: ventoTxt==="" ? null : Number(ventoTxt),
    usa_jib: m.jib && document.getElementById("useJib").checked,
    comprimento_carga_m: rig.C || null, largura_carga_m: rig.L || null, altura_carga_m: rig.A || null,
    acessorio_ids: accessoryEffect().ids,
    condicao_terreno: document.getElementById("terreno").value,
    salvar: !!salvar,
  };
}

async function postJSON(url, body){
  const r = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.erro || ("HTTP "+r.status));
  return j;
}

function setApiLine(el, text, cls){ el.textContent = text; el.className = "apiLine "+cls; }

let apiTimer = null, apiSeq = 0;
function scheduleApiCheck(){ clearTimeout(apiTimer); apiTimer = setTimeout(apiCheck, 250); }

async function apiCheck(){
  const line = document.getElementById("apiLine");
  if(!API.online){ setApiLine(line, "Servidor offline — validação só local.", "off"); return; }
  if(!API.ids[current]){ setApiLine(line, `${MODELS[current].label} não está cadastrado no banco.`, "danger"); return; }
  if((Number(document.getElementById("loadCarga").value)||0) <= 0){ setApiLine(line, "Servidor conectado — informe o peso da carga.", "off"); return; }
  const seq = ++apiSeq;
  try{
    const j = await postJSON("api/simular", apiPayload(false));
    if(seq !== apiSeq) return; // chegou uma resposta mais nova
    const avisos = (j.avisos||[]).length ? " Aviso: "+j.avisos.join(" ") : "";
    setApiLine(line, `Servidor: ${STATUS_LABEL[j.status]} — ${fmt(j.percentual_utilizado,1)}% de ${fmt(j.capacidade_disponivel_kg,0)} kg. ${j.mensagem}${avisos}`, j.status);
  }catch(e){
    if(seq === apiSeq) setApiLine(line, "Servidor: "+e.message, "danger");
  }
}

document.getElementById("saveBtn").addEventListener("click", async ()=>{
  const line = document.getElementById("apiLine");
  if((Number(document.getElementById("loadCarga").value)||0) <= 0){ setApiLine(line, "Informe o peso da carga antes de salvar.", "danger"); return; }
  try{
    const j = await postJSON("api/simular", apiPayload(true));
    setApiLine(line, `Simulação #${j.simulacao_id} salva (${STATUS_LABEL[j.status]}).`, j.status);
    loadHistory();
  }catch(e){
    setApiLine(line, "Não foi possível salvar: "+e.message, "danger");
  }
});

async function apiReverse(peso){
  const line = document.getElementById("revApiLine");
  if(!API.online || !API.ids[current]){ line.style.display="none"; return; }
  line.style.display = "";
  try{
    const j = await postJSON("api/simular/alcance-maximo", {
      guindaste_id: API.ids[current], comprimento_lanca_m: +len.toFixed(2), angulo_giro_graus: slew, peso_kg: peso });
    if(!j.encontrado){ setApiLine(line, "Servidor: "+j.mensagem, "danger"); return; }
    const p = j.ponto;
    const onde = p.raio_m!==null ? `raio ${fmt(p.raio_m)} m` : `ângulo ${fmt(p.angulo_graus,0)}°`;
    setApiLine(line, `Servidor (tabela do banco): maior alcance com ${onde}, capacidade ${fmt(p.capacidade_kg,0)} kg.`, "seguro");
  }catch(e){
    setApiLine(line, "Servidor: "+e.message, "danger");
  }
}

async function loadHistory(){
  const table = document.getElementById("histTable"), note = document.getElementById("histNote");
  if(!API.online){ table.innerHTML = ""; note.textContent = "Histórico disponível apenas com o servidor rodando (python app.py)."; return; }
  if(!API.user){ table.innerHTML = ""; note.textContent = "Entre (canto superior direito) para salvar simulações e ver o seu histórico."; return; }
  try{
    const r = await fetch("api/historico");
    const lista = await r.json();
    if(!r.ok) throw new Error(lista.erro || r.status);
    note.textContent = lista.length ? "" : "Nenhuma simulação salva ainda — use \"Salvar simulação\" na aba Simulação.";
    table.innerHTML = lista.length ? `<tr><th>#</th><th>Data</th><th>Guindaste</th><th>Lança</th><th>Ângulo</th><th>Raio</th><th>Quadrante</th><th>Uso</th><th>Status</th><th>Relatório</th></tr>` +
      lista.map(s=>`<tr><td>${s.id}</td><td>${s.data_simulacao ? new Date(s.data_simulacao).toLocaleString("pt-BR") : "–"}</td>
        <td>${API.labels[s.guindaste_id]||s.guindaste_id}</td><td>${fmt(s.comprimento_lanca_m)} m</td><td>${fmt(s.angulo_graus,0)}°</td>
        <td>${fmt(s.raio_operacao_m)} m</td><td>${s.quadrante==="frontal"?"frontal":"lateral/tras."}</td>
        <td>${s.percentual_utilizado!=null ? fmt(s.percentual_utilizado,1)+"%" : "–"}</td><td>${STATUS_LABEL[s.status]||"–"}</td>
        <td><a href="api/simulacoes/${s.id}/relatorio?formato=pdf" download>PDF</a><a href="api/simulacoes/${s.id}/relatorio?formato=csv" download>CSV</a></td></tr>`).join("") : "";
  }catch(e){
    note.textContent = "Erro ao carregar o histórico: "+e.message;
  }
}

/* ---------- objetos da cena, içamento e radar ----------
   O operador cadastra objetos no chão (peso + dimensões + posição). O guindaste
   pode ir até um objeto e içá-lo ("Içar"): gira, ajusta lança e ângulo para o
   gancho ficar sobre ele e passa a carregá-lo. "Soltar aqui" deposita o objeto
   no chão, sob o gancho. O radar mostra, visto de cima, o alcance e as zonas de
   capacidade da configuração atual, a lança e os objetos. */
const SLEW_AXIS_X = -1.0;   // eixo de giro da torre no mundo 3D (x, z = 0)
const TURRET_Y = 1.4;       // altura da base da torre no modelo 3D
const STATE_COLORS = { ok:"#3fb87f", warn:"#f2a900", bad:"#e2483d", far:"#5c6774" };

let sceneObjects = [], selectedObjId = null, attachedObjId = null, nextObjId = 1;

function attachedObj(){ return sceneObjects.find(o=>o.id===attachedObjId) || null; }
function selectedObj(){ return sceneObjects.find(o=>o.id===selectedObjId) || null; }

/* posição polar em relação ao eixo de giro: raio (m) e direção (°, igual ao giro) */
function objPolar(o){
  const dx = o.x - SLEW_AXIS_X, dz = o.z;
  return { R: Math.hypot(dx, dz), az: Math.atan2(dz, dx)*180/Math.PI };
}
function setObjPolar(o, R, az){
  const t = az*Math.PI/180;
  o.x = SLEW_AXIS_X + R*Math.cos(t); o.z = R*Math.sin(t);
}

const OBJ_COLORS = ["#5b9bd1","#e07b39","#8e6cc9","#3fa7a0","#c9a227","#d1557a","#6f8f3a","#9aa5b1"];
const FORMA_LABEL = { caixa:"Caixa", cilindro:"Cilindro", tubo:"Tubo" };

/* cilindro em pé: largura = diâmetro (= comprimento); tubo deitado: altura = diâmetro (= largura) */
function normalizeShape(o){
  if(o.forma==="cilindro") o.L = o.C;
  else if(o.forma==="tubo") o.A = o.L;
}
function objVolume(o){
  if(o.forma==="cilindro") return Math.PI*(o.C/2)**2*o.A;
  if(o.forma==="tubo") return Math.PI*(o.L/2)**2*o.C;
  return o.C*o.L*o.A;
}
/* pontos de pega no objeto (coordenadas locais x = comprimento, z = largura) */
function pickPoints(o){
  const hx = Math.min(o.dist||0, o.C)/2;
  if(o.pernas===1) return [[0,0]];
  if(o.pernas===2) return [[-hx,0],[hx,0]];
  return [[-hx,-o.L/2],[-hx,o.L/2],[hx,-o.L/2],[hx,o.L/2]];
}

/* ângulo da linga e tração por perna do objeto: T = P / (n · sen θ) */
function slingFor(o){
  const d = o.dist||0, horiz = o.pernas===1 ? 0 : o.pernas===2 ? d/2 : Math.hypot(d/2, o.L/2);
  if((o.linga||0) <= horiz) return { angle:null, tension:null };
  const angle = o.pernas===1 ? 90 : Math.asin(Math.sqrt(o.linga**2-horiz**2)/o.linga)*180/Math.PI;
  return { angle, tension: o.peso/(o.pernas*Math.sin(angle*Math.PI/180)) };
}

function addObj(props){
  const n = nextObjId;
  const o = { id: nextObjId++, nome:"Objeto "+n, peso:1000, C:3, L:1.5, A:1.2, x:0, z:0, rot:0,
              forma:"caixa", cor:OBJ_COLORS[(n-1)%OBJ_COLORS.length], pernas:2, dist:null, linga:3, ...props };
  if(o.dist===null) o.dist = +(o.C*0.6).toFixed(2);
  if(props.R!==undefined){ setObjPolar(o, props.R, props.az||0); o.rot = props.az||0; }
  delete o.R; delete o.az;
  normalizeShape(o);
  sceneObjects.push(o);
  return o;
}

/* ---- geometria / capacidade para uma configuração qualquer (sem mexer na atual) ---- */
function geoFor(L, a){
  const m = MODELS[current], rad = a*Math.PI/180, jl = jibLenCur();
  let radius = m.baseOffset + L*Math.cos(rad), height = m.baseHeight + L*Math.sin(rad);
  if(jl>0){ const j = jibAbsRad(rad); radius += jl*Math.cos(j); height += jl*Math.sin(j); }
  return { radius, height };
}
function capFor(L, a, quad){
  const m = MODELS[current];
  const cap = current==="TM130" ? interp(m.zones[quad].points, a) : m.capFn(L, geoFor(L,a).radius, quad);
  return cap * accessoryEffect().fator;
}
/* ângulo da lança que leva o gancho ao raio R com comprimento L (o raio cai com o ângulo) */
function solveAngleForRadius(L, R){
  const m = MODELS[current];
  let lo = minAngleCur(), hi = m.maxAngle;
  if(R > geoFor(L, lo).radius + 1e-6 || R < geoFor(L, hi).radius - 1e-6) return null;
  for(let i=0;i<40;i++){
    const mid = (lo+hi)/2;
    if(geoFor(L, mid).radius > R) lo = mid; else hi = mid;
  }
  return (lo+hi)/2;
}

function rigMasses(){
  const num = id => Number(document.getElementById(id).value)||0;
  return num("loadLingada") + num("loadCabo") + (document.getElementById("useBalancim").checked ? num("loadBalancim") : 0) + accessoryEffect().massa;
}

/* melhor configuração para içar o objeto: mantém a lança atual se der; senão
   procura o comprimento com menor uso de capacidade */
function bestConfigFor(o){
  const m = MODELS[current];
  const {R, az} = objPolar(o);
  const quad = quadrantFromSlew(az);
  const W = o.peso + rigMasses();
  const tryLen = L => { const a = solveAngleForRadius(L, R); if(a===null) return null;
                        const cap = capFor(L, a, quad); return { L, a, cap, pct: cap>0 ? W/cap*100 : Infinity }; };
  const atual = tryLen(len);
  if(atual && atual.pct<=100) return { ...atual, R, az, W };
  let best = atual;
  for(let L=m.minLen; L<=m.maxLen+1e-9; L+=0.25){
    const c = tryLen(L);
    if(c && (!best || c.pct < best.pct - 1e-9 || (Math.abs(c.pct-best.pct)<1e-9 && Math.abs(L-len)<Math.abs(best.L-len)))) best = c;
  }
  return best ? { ...best, R, az, W } : { R, az, W, unreachable:true };
}

function objState(o){
  const m = MODELS[current];
  const cfg = bestConfigFor(o);
  if(cfg.W > m.capNominal) return { state:"bad", cfg, text:`${fmt(cfg.W/1000,1)} t passa da capacidade nominal do ${m.label} (${fmt(m.capNominal/1000,0)} t).` };
  if(cfg.unreachable) return { state:"far", cfg, text:`Fora do alcance do ${m.label} (raio ${fmt(cfg.R)} m). Aproxime o objeto.` };
  const conf = `lança ${fmt(cfg.L)} m, ângulo ${fmt(cfg.a,0)}°`;
  if(cfg.pct<=80)  return { state:"ok",   cfg, text:`Pode içar: ${fmt(cfg.pct,0)}% da capacidade (${conf}).` };
  if(cfg.pct<=100) return { state:"warn", cfg, text:`Próximo do limite: ${fmt(cfg.pct,0)}% da capacidade (${conf}).` };
  return { state:"bad", cfg, text:`Não dá para içar com segurança: ${fmt(cfg.pct,0)}% da capacidade mesmo na melhor configuração.` };
}

/* posição do gancho no chão (mundo 3D) */
function hookGround(){
  const R = computeGeometry().radius, t = slew*Math.PI/180;
  return { x: SLEW_AXIS_X + R*Math.cos(t), z: R*Math.sin(t), R };
}

/* ---- campos da carga <-> objeto içado ---- */
function syncAttachedFromFields(){
  const o = attachedObj(); if(!o) return;
  const num = id => Number(document.getElementById(id).value)||0;
  const novo = { peso:num("loadCarga"), C:num("dimC")||o.C, L:num("dimL")||o.L, A:num("dimA")||o.A,
                 pernas:Number(document.getElementById("rigPernas").value)||2, dist:num("rigDist"), linga:num("rigLinga") };
  if(Object.keys(novo).some(k=>novo[k]!==o[k])){
    Object.assign(o, novo); normalizeShape(o);
    if(o.L!==novo.L || o.A!==novo.A){ document.getElementById("dimL").value = o.L; document.getElementById("dimA").value = o.A; }
    persistObj(o);
  }
}
function writeFieldsFromObj(o){
  document.getElementById("loadCarga").value = o.peso;
  document.getElementById("dimC").value = o.C;
  document.getElementById("dimL").value = o.L;
  document.getElementById("dimA").value = o.A;
  document.getElementById("rigPernas").value = String(o.pernas);
  document.getElementById("rigDist").value = o.dist;
  document.getElementById("rigLinga").value = o.linga;
}

/* ---- içar / soltar ---- */
let animId = 0;
function animateTo(target, done){
  const id = ++animId, from = { slew, len, angle }, t0 = performance.now(), dur = 700;
  let ds = target.slew - from.slew; if(ds>180) ds-=360; if(ds<-180) ds+=360; // menor caminho de giro
  const step = now=>{
    if(id!==animId) return;
    const k = Math.min(1, (now-t0)/dur), e = k<0.5 ? 2*k*k : 1-Math.pow(-2*k+2,2)/2;
    slew = from.slew + ds*e; len = from.len + (target.len-from.len)*e; angle = from.angle + (target.angle-from.angle)*e;
    if(k>=1){ slew = target.slew; len = target.len; angle = target.angle; }
    syncSliders(); update();
    if(k<1 && !document.hidden) requestAnimationFrame(step);
    else { animId++; slew = target.slew; len = target.len; angle = target.angle; syncSliders(); update(); done && done(); }
  };
  requestAnimationFrame(step);
  if(document.hidden) step(t0+dur); // aba em segundo plano: sem animação
}

function pickObj(o){
  const st = objState(o);
  const status = document.getElementById("objStatus");
  if(st.state==="far" || st.cfg.unreachable){ status.textContent = st.text; status.className = "objStatus bad"; return; }
  if(attachedObjId && attachedObjId!==o.id) dropObj(); // larga o que estava carregando
  hideReverse();
  animateTo({ slew: Math.round(st.cfg.az), len: st.cfg.L, angle: st.cfg.a }, ()=>{
    attachedObjId = o.id;
    writeFieldsFromObj(o);
    update();
  });
}

function dropObj(){
  const o = attachedObj(); if(!o) return;
  const h = hookGround();
  o.x = h.x; o.z = h.z; o.rot = slew;
  attachedObjId = null;
  persistObj(o, true);
  document.getElementById("loadCarga").value = 0;
  update();
}

function selectObj(id){ selectedObjId = id; refreshObjUI(true); }

/* ---- UI: lista de objetos + editor ---- */
function refreshObjUI(fillFields){
  const chips = document.getElementById("objChips");
  chips.innerHTML = "";
  sceneObjects.forEach(o=>{
    const st = o.id===attachedObjId ? { state:"ok" } : objState(o);
    const b = document.createElement("button");
    b.className = "objChip"+(o.id===selectedObjId?" active":"");
    b.innerHTML = `<span class="dot" style="background:${STATE_COLORS[st.state]}"></span><span class="sw" style="background:${o.cor}"></span>`;
    b.append(o.nome + (o.id===attachedObjId ? " · no gancho" : ""));
    b.onclick = ()=>selectObj(o.id);
    chips.appendChild(b);
  });
  const o = selectedObj();
  const ed = document.getElementById("objEditor");
  ed.style.display = o ? "" : "none";
  if(!o) return;
  const carregando = o.id===attachedObjId;
  const {R, az} = carregando ? { R: hookGround().R, az: slew } : objPolar(o);
  const vals = { objNome:o.nome, objForma:o.forma, objCor:o.cor, objPeso:o.peso, objC:o.C, objL:o.L, objA:o.A,
                 objR:+R.toFixed(2), objAz:Math.round(az), objPernas:String(o.pernas), objDist:o.dist, objLinga:o.linga };
  Object.entries(vals).forEach(([id,v])=>{
    const el = document.getElementById(id);
    if(fillFields || document.activeElement!==el) el.value = v;
  });
  const lbl = { caixa:["Comprimento (m)","Largura (m)","Altura (m)"], cilindro:["Diâmetro (m)","Largura = diâmetro","Altura (m)"],
                tubo:["Comprimento (m)","Diâmetro (m)","Altura = diâmetro"] }[o.forma];
  ["lblObjC","lblObjL","lblObjA"].forEach((id,i)=>{ document.getElementById(id).textContent = lbl[i]; });
  document.getElementById("objL").disabled = o.forma==="cilindro";
  document.getElementById("objA").disabled = o.forma==="tubo";
  document.getElementById("objDist").disabled = o.pernas===1;
  const lc = slingFor(o);
  document.getElementById("objInfo").innerHTML =
    `Volume <b>${fmt(objVolume(o),2)} m³</b> · ` +
    (lc.angle===null ? `<span style="color:var(--danger)">linga curta para essas pegas</span>`
      : `linga a <b>${fmt(lc.angle,0)}°</b>, <b>${fmt(lc.tension,0)} kg</b> por perna` +
        (o.pernas>1 && lc.angle<SLING_MIN_ANGLE ? ` <span style="color:var(--warn)">(abaixo de ${SLING_MIN_ANGLE}°)</span>` : ""));
  document.getElementById("objR").disabled = carregando;
  document.getElementById("objAz").disabled = carregando;
  document.getElementById("objPick").disabled = carregando;
  document.getElementById("objDrop").disabled = !carregando;
  const status = document.getElementById("objStatus");
  if(carregando){ status.textContent = "No gancho. Mova a lança e use \"Soltar aqui\" para deixar o objeto sob o gancho."; status.className = "objStatus ok"; }
  else { const st = objState(o); status.textContent = st.text; status.className = "objStatus "+(st.state==="far"?"bad":st.state); }
}

/* ---- persistência dos objetos (logado: salvos no banco, por usuário) ---- */
const objTimers = {};
function objToApi(o){
  return { nome:o.nome, peso:o.peso, C:o.C, L:o.L, A:o.A, x:+o.x.toFixed(2), z:+o.z.toFixed(2), rot:+(o.rot||0).toFixed(1),
           forma:o.forma, cor:o.cor, pernas:o.pernas, dist:+(o.dist||0).toFixed(2), linga:+(o.linga||0).toFixed(2) };
}
function persistObj(o, imediato){
  if(!API.online || !API.user || !o) return;
  clearTimeout(objTimers[o.id]);
  const run = async ()=>{
    try{
      if(!o.dbId){
        if(!o._post) o._post = postJSON("api/objetos", objToApi(o)).then(r=>{ o.dbId = r.id; });
        await o._post;
      }
      const r = await fetch("api/objetos/"+o.dbId, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(objToApi(o))});
      if(!r.ok) throw new Error((await r.json().catch(()=>({}))).erro || r.status);
    }catch(e){
      const st = document.getElementById("objStatus");
      st.textContent = "Não foi possível salvar o objeto: "+e.message; st.className = "objStatus bad";
    }
  };
  if(imediato) run(); else objTimers[o.id] = setTimeout(run, 500);
}
async function loadObjectsFromServer(){
  try{
    const r = await fetch("api/objetos"); if(!r.ok) return;
    const lista = await r.json();
    if(lista.length){
      attachedObjId = null;
      sceneObjects = lista.map(d=>({ ...d, id: nextObjId++, dbId: d.id }));
      selectedObjId = sceneObjects[0].id;
    } else {
      sceneObjects.forEach(o=>{ o.dbId = null; o._post = null; persistObj(o, true); }); // primeira vez: salva os exemplos
    }
    update(); refreshObjUI(true);
  }catch(e){ /* sem servidor: segue só na tela */ }
}
function forgetServerObjects(){ sceneObjects.forEach(o=>{ o.dbId = null; o._post = null; }); }

function onObjFieldInput(){
  const o = selectedObj(); if(!o) return;
  const num = (id,min=0) => Math.max(min, Number(document.getElementById(id).value)||0);
  o.nome = document.getElementById("objNome").value || "Objeto";
  o.peso = num("objPeso"); o.C = num("objC",0.1); o.L = num("objL",0.1); o.A = num("objA",0.1);
  o.forma = document.getElementById("objForma").value;
  o.cor = document.getElementById("objCor").value;
  o.pernas = Number(document.getElementById("objPernas").value)||2;
  o.dist = num("objDist"); o.linga = num("objLinga");
  normalizeShape(o);
  if(o.id===attachedObjId) writeFieldsFromObj(o);
  else setObjPolar(o, num("objR"), Number(document.getElementById("objAz").value)||0);
  persistObj(o);
  update();
}
["objNome","objPeso","objC","objL","objA","objR","objAz","objDist","objLinga","objCor"].forEach(id=>document.getElementById(id).addEventListener("input", onObjFieldInput));
["objForma","objPernas"].forEach(id=>document.getElementById(id).addEventListener("change", ()=>{ onObjFieldInput(); refreshObjUI(true); }));
document.getElementById("objAdd").addEventListener("click", ()=>{
  // novo objeto num ponto livre dentro do alcance atual
  const R = Math.max(4, Math.min(geoFor(len, minAngleCur()).radius*0.7, 10));
  const o = addObj({ nome:"Objeto "+nextObjId, R, az: (sceneObjects.length*47)%360-180 });
  persistObj(o, true);
  selectObj(o.id); update();
});
document.getElementById("objDel").addEventListener("click", ()=>{
  const o = selectedObj(); if(!o) return;
  if(o.id===attachedObjId){ attachedObjId = null; document.getElementById("loadCarga").value = 0; }
  if(o.dbId && API.user) fetch("api/objetos/"+o.dbId, {method:"DELETE"});
  sceneObjects = sceneObjects.filter(x=>x.id!==o.id);
  selectedObjId = sceneObjects.length ? sceneObjects[0].id : null;
  update(); refreshObjUI(true);
});
document.getElementById("objPick").addEventListener("click", ()=>{ const o = selectedObj(); if(o) pickObj(o); });
document.getElementById("objDrop").addEventListener("click", dropObj);

/* ---- 3D: objetos no chão (forma, cor, pegas) + anéis ---- */
const SHAPE_GEO = {};
function shapeGeo(forma){
  if(!SHAPE_GEO[forma]){
    const g = forma==="cilindro" ? new THREE.CylinderGeometry(0.5,0.5,1,32)
            : forma==="tubo" ? new THREE.CylinderGeometry(0.5,0.5,1,32).rotateZ(Math.PI/2)
            : new THREE.BoxGeometry(1,1,1);
    SHAPE_GEO[forma] = { body:g, edges:new THREE.EdgesGeometry(g, 20),
                         foot: forma==="cilindro" ? new THREE.CircleGeometry(0.5,32) : new THREE.PlaneGeometry(1,1) };
  }
  return SHAPE_GEO[forma];
}
/* troca a geometria de uma malha (corpo + arestas) quando a forma muda */
function setMeshShape(mesh, forma){
  if(mesh.userData.forma===forma) return;
  const g = shapeGeo(forma);
  mesh.geometry = g.body; mesh.children[0].geometry = g.edges;
  mesh.userData.forma = forma;
}

function syncObjects3D(){
  if(!three3d) return;
  const {objectsGroup, objMeshes} = three3d;
  const ids = new Set(sceneObjects.map(o=>o.id));
  const decor = three3d.objDecor;
  Object.keys(objMeshes).forEach(id=>{ if(!ids.has(+id)){
    objectsGroup.remove(objMeshes[id]); three3d.decorGroup.remove(decor[id]); delete objMeshes[id]; delete decor[id]; } });
  sceneObjects.forEach(o=>{
    let mesh = objMeshes[o.id], dec = decor[o.id];
    if(!mesh){
      mesh = new THREE.Mesh(shapeGeo("caixa").body, new THREE.MeshStandardMaterial({roughness:0.55, metalness:0.1, transparent:true, opacity:0.92}));
      mesh.add(new THREE.LineSegments(shapeGeo("caixa").edges, new THREE.LineBasicMaterial({color:0xffffff})));
      mesh.userData = { objId:o.id, forma:"caixa" };
      objectsGroup.add(mesh); objMeshes[o.id] = mesh;
      // decoração (sem escala): contorno no chão com a cor do estado + marcadores das pegas
      dec = new THREE.Group();
      const foot = new THREE.Mesh(shapeGeo("caixa").foot, new THREE.MeshBasicMaterial({transparent:true, opacity:0.5, side:THREE.DoubleSide, depthWrite:false}));
      foot.rotation.x = -Math.PI/2; foot.position.y = 0.015;
      dec.add(foot);
      const pegMat = new THREE.MeshBasicMaterial({color:0xf2a900});
      for(let i=0;i<4;i++){ const m = new THREE.Mesh(new THREE.SphereGeometry(0.13,12,12), pegMat); dec.add(m); }
      three3d.decorGroup.add(dec); decor[o.id] = dec;
    }
    const noGancho = o.id===attachedObjId; // no gancho, quem aparece é a carga pendurada
    mesh.visible = dec.visible = !noGancho;
    setMeshShape(mesh, o.forma);
    mesh.scale.set(o.C, o.A, o.L);
    mesh.position.set(o.x, o.A/2, o.z);
    mesh.rotation.y = -o.rot*Math.PI/180;
    mesh.material.color.set(o.cor);
    mesh.children[0].material.color.set(o.id===selectedObjId ? 0xffffff : 0x0e1114);
    const st = objState(o).state;
    dec.position.set(o.x, 0, o.z); dec.rotation.y = mesh.rotation.y;
    const foot = dec.children[0];
    foot.geometry = shapeGeo(o.forma).foot;
    foot.scale.set(o.C+0.6, o.L+0.6, 1);
    foot.material.color.set(STATE_COLORS[st]);
    const pts = pickPoints(o);
    for(let i=0;i<4;i++){
      const m = dec.children[1+i];
      m.visible = i<pts.length;
      if(m.visible) m.position.set(pts[i][0], o.A+0.1, pts[i][1]);
    }
  });
  const h = hookGround();
  three3d.radiusRing.scale.setScalar(Math.max(h.R, 0.01));
  three3d.reachRing.scale.setScalar(geoFor(MODELS[current].maxLen, minAngleCur()).radius);
  three3d.reachRing.computeLineDistances();
  three3d.hookMarker.position.set(h.x, 0.04, h.z);
}

/* ---- radar (vista de cima) ---- */
function currentWeight(){
  const carga = Number(document.getElementById("loadCarga").value)||0;
  if(carga>0) return carga + rigMasses();
  const o = selectedObj();
  return o ? o.peso + rigMasses() : 0;
}

/* desenha o radar no canvas da tela ou, com opts.size, numa imagem maior
   (com nomes dos objetos) para o relatório */
function drawRadar(target, opts={}){
  const offscreen = !!opts.size;
  const cv = target || document.getElementById("radarCanvas");
  const size = offscreen ? opts.size : cv.clientWidth; if(!size) return;
  const dpr = offscreen ? 1 : (window.devicePixelRatio||1);
  if(cv.width!==Math.round(size*dpr)){ cv.width = cv.height = Math.round(size*dpr); }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,size,size);
  const u = offscreen ? size/190 : 1; // escala de traços e textos
  if(offscreen){ ctx.fillStyle="#0e1114"; ctx.fillRect(0,0,size,size); }
  const m = MODELS[current];
  const reachMax = geoFor(m.maxLen, minAngleCur()).radius;
  const farObj = Math.max(0, ...sceneObjects.map(o=>objPolar(o).R + Math.hypot(o.C,o.L)/2));
  const range = Math.max(reachMax, farObj, 5)*1.08;
  const cx = size/2, cy = size/2, k = (size/2-4*u)/range;
  const P = (x,z)=>[cx+(x-SLEW_AXIS_X)*k, cy+z*k];
  if(!offscreen){
    radarView = { cx, cy, k, range };
    document.getElementById("radarRange").textContent = "máx. "+fmt(reachMax,1)+" m";
  }

  ctx.beginPath(); ctx.arc(cx,cy,range*k,0,Math.PI*2); ctx.fillStyle="rgba(20,24,29,0.9)"; ctx.fill();

  // zonas de capacidade com a lança atual (verde ≤80%, amarelo ≤100%, vermelho acima)
  const W = currentWeight();
  const step = range/48;
  const F = 16*Math.PI/180;
  [["frontal",-F,F],["lateral",F,2*Math.PI-F]].forEach(([quad,a0,a1])=>{
    for(let r=step/2; r<range; r+=step){
      const a = solveAngleForRadius(len, r); if(a===null) continue;
      const cap = capFor(len, a, quad);
      let col;
      if(W<=0) col = "rgba(91,155,209,0.22)";
      else { const p = W/cap; col = p<=0.8 ? "rgba(63,184,127,0.35)" : p<=1 ? "rgba(242,169,0,0.38)" : "rgba(226,72,61,0.30)"; }
      ctx.beginPath(); ctx.arc(cx,cy,(r+step/2)*k,a0,a1); ctx.arc(cx,cy,Math.max(0,(r-step/2))*k,a1,a0,true); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    }
  });

  // anéis de distância
  const ringStep = range>30 ? 10 : 5;
  ctx.strokeStyle="rgba(135,147,161,0.35)"; ctx.fillStyle="rgba(135,147,161,0.8)"; ctx.lineWidth=1*u;
  ctx.font=`${8*u}px IBM Plex Mono, monospace`;
  for(let r=ringStep; r<range; r+=ringStep){
    ctx.beginPath(); ctx.arc(cx,cy,r*k,0,Math.PI*2); ctx.stroke();
    // rótulo em cima do anel (fora do setor frontal, para não cobrir a lança)
    ctx.fillText(r+"m", cx+2*u, cy-r*k-2*u);
  }
  // limites do setor frontal (±16°)
  ctx.setLineDash([3*u,3*u]);
  [-F,F].forEach(t=>{ ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(t)*range*k, cy+Math.sin(t)*range*k); ctx.stroke(); });
  ctx.setLineDash([]);

  // caminhão
  const [tx0,tz0] = P(-4.2,-1.2), [tx1,tz1] = P(3.0,1.2);
  ctx.fillStyle="#3a434e"; ctx.fillRect(tx0,tz0,tx1-tx0,tz1-tz0);

  // objetos: forma vista de cima, preenchida com a cor do estado e contorno na cor do objeto
  const shapePath = (o, w, h)=>{
    ctx.beginPath();
    if(o.forma==="cilindro") ctx.arc(0,0,w/2,0,Math.PI*2); else ctx.rect(-w/2,-h/2,w,h);
  };
  const labels = [];
  sceneObjects.forEach(o=>{
    if(o.id===attachedObjId) return;
    const [ox,oz] = P(o.x,o.z);
    ctx.save(); ctx.translate(ox,oz); ctx.rotate(o.rot*Math.PI/180);
    const w = Math.max(3*u,o.C*k), h = Math.max(3*u,o.L*k);
    shapePath(o, w, h);
    ctx.fillStyle = STATE_COLORS[objState(o).state]; ctx.fill();
    ctx.strokeStyle = o.cor; ctx.lineWidth = 1.6*u; ctx.stroke();
    if(o.id===selectedObjId && !offscreen){ ctx.strokeStyle="#ffffff"; ctx.lineWidth=1.2; shapePath(o, w+4, h+4); ctx.stroke(); }
    ctx.restore();
    labels.push([o.nome, ox, oz + Math.max(w,h)/2 + 9*u]);
  });

  // lança + gancho
  const hk = hookGround();
  const [hx,hz] = P(hk.x,hk.z);
  ctx.strokeStyle = quadrantFromSlew(slew)==="frontal" ? "#5b9bd1" : "#f2a900"; ctx.lineWidth=2.5*u;
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(hx,hz); ctx.stroke();
  const ao = attachedObj();
  if(ao){
    ctx.save(); ctx.translate(hx,hz); ctx.rotate(slew*Math.PI/180);
    ctx.fillStyle = ao.cor; ctx.globalAlpha = 0.9;
    const w = Math.max(3*u,ao.C*k), h = Math.max(3*u,ao.L*k);
    ctx.beginPath(); if(ao.forma==="cilindro") ctx.arc(0,0,w/2,0,Math.PI*2); else ctx.rect(-w/2,-h/2,w,h);
    ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = STATE_COLORS.ok; ctx.lineWidth = 1.5*u; ctx.stroke(); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(hx,hz,3.5*u,0,Math.PI*2); ctx.fillStyle="#f2a900"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,3*u,0,Math.PI*2); ctx.fillStyle="#828d99"; ctx.fill();
  if(offscreen){
    ctx.font=`500 ${7.5*u}px IBM Plex Sans, sans-serif`; ctx.textAlign="center";
    labels.forEach(([t,x,y])=>{ ctx.lineWidth=3*u; ctx.strokeStyle="#0e1114"; ctx.strokeText(t,x,y); ctx.fillStyle="#e6edf3"; ctx.fillText(t,x,y); });
    if(ao){ const t = ao.nome+" (no gancho)"; ctx.strokeText(t,hx,hz-8*u); ctx.fillText(t,hx,hz-8*u); }
    ctx.textAlign="left";
  }
}

let radarView = null;
document.getElementById("radarCanvas").addEventListener("click", e=>{
  if(!radarView) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const {cx, cy, k} = radarView;
  const x = SLEW_AXIS_X + ((e.clientX-rect.left)-cx)/k, z = ((e.clientY-rect.top)-cy)/k;
  // clicou perto de um objeto: seleciona
  let hit = null, best = Infinity;
  sceneObjects.forEach(o=>{
    if(o.id===attachedObjId) return;
    const d = Math.hypot(o.x-x, o.z-z), lim = Math.max(1.5, Math.hypot(o.C,o.L)/2);
    if(d<lim && d<best){ best = d; hit = o; }
  });
  if(hit){ selectObj(hit.id); update(); return; }
  // clicou num espaço vazio: move o objeto selecionado até lá
  const o = selectedObj();
  if(o && o.id!==attachedObjId){ o.x = x; o.z = z; persistObj(o); update(); refreshObjUI(true); }
});
window.addEventListener("resize", ()=>drawRadar());

/* ---- relatório da cena: todos os objetos + radar + vista 3D (PDF ou CSV) ---- */
/* desenho 2D (vista lateral em escala) como PNG para o relatório */
function svgToPng(svgEl, w, h){
  return new Promise(resolve=>{
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("width", w); clone.setAttribute("height", h);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], {type:"image/svg+xml"}));
    const img = new Image();
    img.onload = ()=>{
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#14181d"; ctx.fillRect(0,0,w,h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/png"));
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function sceneReportPayload(formato){
  const base = apiPayload(false);
  const objetos = sceneObjects.map(o=>{
    let R, az, L = null, a = null;
    if(o.id===attachedObjId){ R = hookGround().R; az = slew; L = len; a = angle; }
    else {
      const cfg = objState(o).cfg; R = cfg.R; az = cfg.az;
      if(!cfg.unreachable){ L = cfg.L; a = cfg.a; }
    }
    return { nome:o.nome, forma:o.forma, cor:o.cor, peso:o.peso, C:o.C, L:o.L, A:o.A,
             pernas:o.pernas, dist:o.dist, linga:o.linga, raio_m:+R.toFixed(2), direcao_graus:Math.round(az),
             comprimento_lanca_m: L===null ? null : +L.toFixed(2), angulo_graus: a===null ? null : +a.toFixed(2) };
  });
  const m = MODELS[current], geo = computeGeometry();
  const payload = { formato, objetos, configuracao: {
    comprimento_lanca_m:+len.toFixed(2), angulo_graus:+angle.toFixed(1), giro_graus:Math.round(slew),
    quadrante: quadrantFromSlew(slew)==="frontal" ? "frontal" : "lateral_traseira",
    raio_m:+geo.radius.toFixed(2), altura_ponta_m:+geo.height.toFixed(2),
    usa_jib:geo.jibOn, jib_lance_m:geo.jibOn ? geo.jibLen : null, jib_pino_graus:geo.jibOn ? jibPin : null,
    alcance_max_m:+geoFor(m.maxLen, minAngleCur()).radius.toFixed(2),
    altura_max_m:+geoFor(m.maxLen, m.maxAngle).height.toFixed(2) } };
  ["guindaste_id","acessorio_ids","massa_lingada_kg","massa_cabo_kg","usa_balancim","massa_balancim_kg",
   "velocidade_vento_ms","condicao_terreno"].forEach(k=>{ payload[k] = base[k]; });
  if(formato==="pdf"){
    const cv = document.createElement("canvas");
    drawRadar(cv, { size:900 });
    payload.imagem_radar = cv.toDataURL("image/png");
    payload.imagem_2d = await svgToPng(document.getElementById("craneSvg"), 1280, 760);
    // vista 3D: renderiza agora e copia o quadro na mesma hora (o WebGL limpa o buffer depois)
    if(three3d && document.getElementById("stage3d").clientWidth>0){
      render3D();
      payload.imagem_3d = three3d.renderer.domElement.toDataURL("image/jpeg", 0.9);
    }
  }
  return payload;
}

async function sceneReport(formato){
  const status = document.getElementById("objStatus");
  const say = (t, cls)=>{ status.textContent = t; status.className = "objStatus "+cls; };
  if(!API.online){ say("O relatório da cena precisa do servidor (rode o app.py).", "bad"); return; }
  if(!API.user){ say("Entre com seu usuário para gerar o relatório da cena.", "warn"); openLogin(); return; }
  if(!sceneObjects.length){ say("Adicione pelo menos um objeto na cena.", "warn"); return; }
  const btns = document.querySelectorAll(".reportBtns button");
  btns.forEach(b=>b.disabled = true);
  say("Gerando relatório…", "");
  try{
    const r = await fetch("api/cena/relatorio", {method:"POST", headers:{"Content-Type":"application/json"},
                                                  body:JSON.stringify(await sceneReportPayload(formato))});
    if(!r.ok) throw new Error((await r.json().catch(()=>({}))).erro || ("HTTP "+r.status));
    const nome = (r.headers.get("Content-Disposition")||"").match(/filename="?([^";]+)"?/)?.[1] || ("relatorio_cena."+formato);
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a"); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 10000);
    say(`Relatório baixado: ${nome}`, "ok");
  }catch(e){
    say("Não foi possível gerar o relatório: "+e.message, "bad");
  }finally{
    btns.forEach(b=>b.disabled = false);
  }
}
document.getElementById("sceneReportPdf").addEventListener("click", ()=>sceneReport("pdf"));
document.getElementById("sceneReportCsv").addEventListener("click", ()=>sceneReport("csv"));

function afterSceneUpdate(){
  syncObjects3D();
  drawRadar();
  refreshObjUI(false);
}

// objetos de exemplo
addObj({ nome:"Contêiner", peso:2000, C:6, L:2.4, A:2.6, R:9, az:20, pernas:4, dist:5.4, linga:4.5 });
addObj({ nome:"Viga metálica", peso:800, C:8, L:0.4, A:0.6, R:7, az:-60, dist:5, linga:4 });
addObj({ nome:"Tanque", forma:"cilindro", peso:1500, C:1.8, A:2.2, R:8, az:110, pernas:1, linga:1.5 });
selectedObjId = 1;


onModelChange();
apiInit();