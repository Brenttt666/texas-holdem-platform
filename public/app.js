const socket=io();
const $=id=>document.getElementById(id);
let current=null, myCards=[];
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
 if(!current)return;const action=b.dataset.action;
 socket.emit("action",{action,amount:Number($("raiseAmount").value)});
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
 $("addAI").disabled=s.phase!=="waiting"||s.players.length>=8;
 $("start").disabled=s.phase!=="waiting"||s.players.filter(p=>p.chips>0).length<2;
}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
