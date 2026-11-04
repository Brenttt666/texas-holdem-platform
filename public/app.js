const socket=io();
const $=id=>document.getElementById(id);
let current=null, myCards=[];
let busy=false;
socket.on("connect",()=>$("connection").textContent="● 已連線");
socket.on("disconnect",()=>$("connection").textContent="● 連線中斷");
socket.on("state",s=>{current=s;myCards=s.holeCards||[];render(s);});
socket.on("notice",m=>$("message").textContent=m);
function err(m){$("error").textContent=m||"";}
function emitAck(event,data){return new Promise(resolve=>socket.emit(event,data||{},resolve));}
$("create").onclick=async()=>{
 err("");const r=await emitAck("createRoom",{name:$("name").value,smallBlind:$("sb").value,bigBlind:$("bb").value,buyIn:$("buyin").value});
 if(!r?.ok)return err(r?.error||"建立房間失敗");showTable(r.code);
};
$("join").onclick=async()=>{
 err("");const r=await emitAck("joinRoom",{name:$("name").value,code:$("code").value,buyIn:$("joinBuy").value});
 if(!r?.ok)return err(r?.error||"加入房間失敗");showTable(r.code);
};
function showTable(code){$("lobby").hidden=true;$("tableView").hidden=false;$("roomCode").textContent=code;}
$("copy").onclick=async()=>{
 const text=`加入我的德州撲克房間：${location.origin}\n房間代碼：${current?.code||$("roomCode").textContent}`;
 try{await navigator.clipboard.writeText(text);$("copy").textContent="已複製！";}catch{$("copy").textContent=text;}
};
$("addAI").onclick=()=>socket.emit("addAI",{},r=>{if(!r?.ok)alert(r?.error||"無法加入 AI");});
$("start").onclick=()=>socket.emit("startHand",{},r=>{if(!r?.ok)alert(r?.error||"無法開始");});
document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{
 if(!current||busy)return;
 const action=b.dataset.action;
 busy=true;
 socket.timeout(5000).emit("action",{action,amount:Number($("raiseAmount").value)},(timeout,r)=>{
   busy=false;
   if(timeout)return $("message").textContent="伺服器未回應，請確認網路連線後重試。";
   if(!r?.ok)$("message").textContent=r?.error||"操作失敗，請重試。";
 });
});
document.querySelectorAll("[data-bb]").forEach(b=>b.onclick=()=>{
 if(!current)return;
 const target=Number(b.dataset.bb)*current.settings.bigBlind;
 $("raiseAmount").value=target;
 document.querySelectorAll("[data-bb]").forEach(x=>x.classList.toggle("selected",x===b));
});
function face(c){if(!c)return"";const r=c[0],s=c[1];const suit={s:"♠",h:"♥",d:"♦",c:"♣"}[s];return `<div class="card ${s==="h"||s==="d"?"red":""}">${({T:"10",J:"J",Q:"Q",K:"K",A:"A"}[r]||r)}${suit}</div>`;}
function render(s){
 showTable(s.code);$("pot").textContent=s.pot;$("message").textContent=s.message||"";
 $("blinds").textContent=`SB ${s.settings.smallBlind} / BB ${s.settings.bigBlind}`;
 $("phase").textContent=({waiting:"等待開始",preflop:"Pre-Flop",flop:"Flop",turn:"Turn",river:"River",showdown:"Showdown"})[s.phase]||s.phase;
 $("playerCount").textContent=`${s.players.length} / 8 人`;
 $("community").innerHTML=s.community.length?s.community.map(face).join(""):'<span class="back">?</span>'.repeat(5);
 $("seats").innerHTML=s.players.map(p=>`<div class="seat ${p.isTurn?"turn":""}"><strong>${esc(p.name)} ${p.isDealer?"Ⓓ":""}</strong><div class="chips">籌碼 ${p.chips}</div><div>下注 ${p.bet}</div><div class="flags">${p.folded?"FOLD":p.allIn?"ALL-IN":!p.connected?"離線":p.isTurn?"行動中":""}</div></div>`).join("");
 $("myCards").innerHTML=myCards.map(face).join("");
 $("actions").hidden=!s.canAct;
 const me=s.players.find(p=>p.id===socket.id);
 const toCall=Math.max(0,s.currentBet-(me?.bet||0));
 const check=document.querySelector('[data-action="check"]');
 const call=document.querySelector('[data-action="call"]');
 check.disabled=!s.canAct||toCall>0;
 call.disabled=!s.canAct||toCall===0;
 call.textContent=toCall>0?`Call 跟注 ${Math.min(toCall,me?.chips||0)}`:"Call 跟注";
 const minimum=s.currentBet+s.minRaise;
 $("raiseAmount").min=minimum;
 if(!Number($("raiseAmount").value)||Number($("raiseAmount").value)<minimum)$("raiseAmount").value=minimum;
 document.querySelectorAll("[data-bb]").forEach(b=>{
   const target=Number(b.dataset.bb)*s.settings.bigBlind;
   b.disabled=!s.canAct||target<minimum||target>(me?.chips||0)+(me?.bet||0);
 });
 $("addAI").disabled=s.phase!=="waiting"||s.players.length>=8;
 $("start").disabled=s.phase!=="waiting"||s.players.filter(p=>p.chips>0).length<2;
}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

// V1.2: Web Audio synthesized effects (no external assets required).
let audioContext=null, soundOn=true, lastPhase=null, lastCommunity=0, lastHand=0, lastSeconds=null;
function sound(freq=440,duration=.07,type="sine",volume=.055){
 if(!soundOn)return;
 try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
 const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.value=freq;
 gain.gain.setValueAtTime(volume,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);
 osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);
 }catch{}
}
$("soundToggle").onclick=()=>{soundOn=!soundOn;$("soundToggle").textContent=soundOn?"🔊 音效開":"🔇 音效關";if(soundOn)sound(660);};
$("revealCards").onclick=()=>{sound(800,.12);socket.emit("revealCards",{},r=>{if(!r?.ok)$("message").textContent=r?.error||"亮牌失敗";});};
function tickClock(){
 const el=$("turnClock");if(!current?.deadline){el.hidden=true;lastSeconds=null;return;}
 const left=Math.max(0,Math.ceil((current.deadline-(Date.now()+clockOffset))/1000));
 el.hidden=false;el.classList.toggle("urgent",left<=5);
 el.textContent=(current.phase==="allin_reveal"?"等待亮牌":"玩家思考時間")+`：${left} 秒`;
 if(left!==lastSeconds&&left<=5&&left>0){sound(left===1?920:670,.10,"square",.035);}lastSeconds=left;
}
let clockOffset=0;
setInterval(tickClock,200);
const originalRender=render;
render=function(s){
 const oldPhase=lastPhase, oldCount=lastCommunity, oldHand=lastHand;
 originalRender(s);
 clockOffset=s.serverNow-Date.now();tickClock();
 $("revealPanel").hidden=!s.canReveal;
 $("revealHint").textContent=s.phase==="allin_reveal"?"全押後所有人亮牌，才會發公共牌":"棄牌後可自行選擇是否公開手牌";
 $("seats").innerHTML=s.players.map(p=>`<div class="seat ${p.isTurn?"turn":""}"><strong>${esc(p.name)} ${p.isDealer?"Ⓓ":""}</strong><div class="chips">籌碼 ${p.chips}</div><div>下注 ${p.bet}</div><div class="flags">${p.folded?"FOLD":p.allIn?"ALL-IN":!p.connected?"離線":p.isTurn?"行動中":""}</div>${p.shownCards?.length?`<div class="shown">${p.shownCards.map(face).join("")}</div>`:""}</div>`).join("");
 if(oldHand===s.handNo&&s.community.length>oldCount){sound(420,.10,"triangle");setTimeout(()=>sound(620,.14,"triangle"),110);}
 if(oldPhase!==null&&oldPhase!==s.phase&&s.phase==="allin_reveal")sound(780,.22,"triangle");
 lastPhase=s.phase;lastCommunity=s.community.length;lastHand=s.handNo;
};
// Button feedback for all player actions and presets.
document.querySelectorAll('[data-action],[data-bb],#start,#addAI').forEach(b=>b.addEventListener('click',()=>sound(530,.055,'sine')));
