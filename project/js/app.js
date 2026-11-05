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
      init3D();
      requestAnimationFrame(()=>{ resize3D(); update3D(); render3D(); });
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
  if(r.C<=0 || r.L<=0 || r.A<=0){ out.ok=false; out.show=false; return out; }
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

function quadrantFromSlew(s){ return s<=16 ? "frontal" : "lateral"; }

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

function computeCapacity(){
  const m=MODELS[current];
  const quad=quadrantFromSlew(slew);
  const geo=computeGeometry();
  let cap;
  if(current==="TM130"){ cap=interp(m.zones[quad].points, angle); }
  else{ cap=m.capFn(len, geo.radius, quad); }
  return {cap, quad, geo};
}

function update(){
  const m=MODELS[current];
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
  const sum=carga+lingada+cabo+bal;
  const pct=cap>0 ? (sum/cap)*100 : 0;
  /* Carga acima da capacidade nominal do equipamento não é uma operação
     "insegura": é um dado irreal (ex.: 250 t num guindaste de 30 t). */
  const irreal=sum>m.capNominal;
  const rig=computeRigging(geo.height, carga);
  lastRig=rig;
  document.getElementById("rigAngleOut").textContent = rig.show && rig.drop ? fmt(rig.angle,0)+"°" : "–";
  document.getElementById("rigTensionOut").textContent = rig.show && isFinite(rig.tension) && carga>0 ? fmt(rig.tension,0)+" kg" : "–";
  document.getElementById("rigBottomOut").textContent = rig.show ? fmt(rig.bottomHeight)+" m" : "–";
  const note=document.getElementById("rigNote");
  const msgs=[...rig.problems, ...rig.warnings];
  note.style.display = rig.show && msgs.length ? "" : "none";
  note.className = "rigNote "+(rig.problems.length ? "danger" : "warn");
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
  statusBox.style.background = sum<=0 ? "var(--panel)" : irreal ? "var(--danger-bg)" : (pct<=80?"var(--safe-bg)":pct<=100?"var(--warn-bg)":"var(--danger-bg)");
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
    let cap = current==="TM130" ? interp(m.zones[quad].points, a) : m.capFn(len, radius, quad);
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
["loadCarga","loadLingada","loadCabo","dimC","dimL","dimA","rigDist","rigLinga"].forEach(id=>document.getElementById(id).addEventListener("input", update));
document.getElementById("rigPernas").addEventListener("change", update);
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
let dragging3d = false, last3dX=0, last3dY=0;

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
  turret.position.set(-1.0, 1.4, 0);
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
  const slingGeo = new THREE.BufferGeometry();
  slingGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(30).fill(0), 3));
  const slings = new THREE.LineSegments(slingGeo, new THREE.LineBasicMaterial({color:0xc9d1d9}));
  loadGroup.add(slings);

  three3d = {renderer, scene, camera, turret, boomPivot, boom, jibPivot, jib, hookAnchor, hook, loadGroup, loadBox, slings};

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
    if(hits.length){
      draggingHook3D = true;
    } else {
      dragging3d=true; last3dX=e.clientX; last3dY=e.clientY;
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e=>{
    if(draggingHook3D){ dragBoomTo(e); return; }
    if(!dragging3d) return;
    const dx=e.clientX-last3dX, dy=e.clientY-last3dY;
    last3dX=e.clientX; last3dY=e.clientY;
    orbit3d.theta -= dx*0.008;
    orbit3d.phi = Math.max(0.08, Math.min(Math.PI-0.08, orbit3d.phi - dy*0.008));
    updateCamera3D(); render3D();
  });
  canvas.addEventListener("pointerup", ()=>{ dragging3d=false; draggingHook3D=false; });
  canvas.addEventListener("pointerleave", ()=>{ dragging3d=false; draggingHook3D=false; });
  canvas.addEventListener("wheel", e=>{
    e.preventDefault();
    orbit3d.radius = Math.max(7, Math.min(70, orbit3d.radius + e.deltaY*0.02));
    updateCamera3D(); render3D();
  }, {passive:false});

  document.querySelectorAll(".viewBtnRow button").forEach(b=>{
    b.addEventListener("click", ()=>{
      const presets = {
        iso:  {theta:Math.PI/4,  phi:Math.PI/3,   radius:24},
        front:{theta:0,          phi:Math.PI/2.3, radius:20},
        side: {theta:Math.PI/2,  phi:Math.PI/2.3, radius:20},
        top:  {theta:Math.PI/4,  phi:0.18,        radius:28},
      };
      Object.assign(orbit3d, presets[b.dataset.camview]);
      updateCamera3D(); render3D();
    });
  });

  window.addEventListener("resize", ()=>{ if(viewMode==="3d"){ resize3D(); render3D(); } });

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
  const pos = slings.geometry.attributes.position;
  pos.array.fill(0);
  pos.setXYZ(0, 0, HOOK_DROP_M, 0); pos.setXYZ(1, 0, 0, 0); // cabo do gancho
  if(!rig || !rig.show){ loadBox.visible=false; pos.needsUpdate=true; slings.geometry.setDrawRange(0,2); return; }
  const drop = rig.drop || Math.max(rig.Ls,0.5);
  loadBox.visible = true;
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

onModelChange();