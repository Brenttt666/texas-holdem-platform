const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Hand } = require("pokersolver");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));

const rooms = new Map();
const SUITS = ["s", "h", "d", "c"];
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const card = (r,s) => r+s;
function deck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(card(r,s));
  for (let i=d.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}
function cleanName(s) { return String(s || "玩家").trim().slice(0,16) || "玩家"; }
function roomCode() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function publicState(room) {
  return {
    code: room.code, settings: room.settings, phase: room.phase,
    community: room.community, pot: room.pot, currentBet: room.currentBet,
    minRaise: room.minRaise, dealer: room.dealer, turn: room.turn,
    handNo: room.handNo, message: room.message,
    players: room.players.map((p,i)=>({
      id:p.id, name:p.name, chips:p.chips, bet:p.bet, folded:p.folded,
      allIn:p.allIn, connected:p.connected, isAI:p.isAI, seat:i,
      isDealer:i===room.dealer, isTurn:i===room.turn,
      acted:p.acted
    }))
  };
}
function sendRoom(room) {
  room.players.forEach(p => {
    if (!p.isAI && p.id) io.to(p.id).emit("state", {
      ...publicState(room),
      holeCards: p.holeCards || [],
      canAct: room.phase !== "waiting" && room.turn === room.players.indexOf(p)
    });
  });
}
function broadcast(room, event, payload) {
  room.players.forEach(p => { if (!p.isAI && p.id) io.to(p.id).emit(event,payload); });
}
function addPlayer(room, socket, name, buyIn) {
  if (room.players.length >= 8) throw new Error("牌桌已滿，最多 8 位玩家。");
  if (room.phase !== "waiting") throw new Error("牌局已開始，暫時不能加入。");
  if (room.players.some(p=>!p.isAI && p.name===name)) throw new Error("這個暱稱已有人使用。");
  const p={id:socket.id,name,chips:buyIn,bet:0,folded:false,allIn:false,connected:true,isAI:false,holeCards:[],acted:false};
  room.players.push(p); socket.join(room.code); socket.data.room=room.code;
  return p;
}
function nextActive(room, from, needsAction=true) {
  for(let n=1;n<=room.players.length;n++){
    const i=(from+n)%room.players.length, p=room.players[i];
    if(!p.folded && !p.allIn && p.chips>0 && (!needsAction || !p.acted || p.bet<room.currentBet)) return i;
  }
  return -1;
}
function activePlayers(room) { return room.players.filter(p=>!p.folded); }
function putIn(room,p,amount) {
  const n=Math.max(0,Math.min(p.chips,amount));
  p.chips-=n; p.bet+=n; room.pot+=n;
  if(p.chips===0) p.allIn=true;
}
function startHand(room) {
  const eligible=room.players.filter(p=>p.chips>0);
  if(eligible.length<2){room.phase="waiting";room.message="至少需要兩位有籌碼的玩家才能開始。";sendRoom(room);return;}
  room.handNo++; room.deck=deck(); room.community=[]; room.pot=0; room.currentBet=0;
  room.minRaise=room.settings.bigBlind; room.phase="preflop"; room.message="新的一手開始";
  room.players.forEach(p=>{p.bet=0;p.folded=p.chips<=0;p.allIn=false;p.acted=false;p.holeCards=[];});
  let d=room.dealer;
  for(let k=0;k<room.players.length;k++){d=(d+1)%room.players.length;if(room.players[d].chips>0)break;}
  room.dealer=d;
  const live=room.players.map((p,i)=>p.chips>0?i:-1).filter(i=>i>=0);
  let sb=live.length===2?d:(d+1)%room.players.length;
  while(room.players[sb].chips<=0) sb=(sb+1)%room.players.length;
  let bb=(sb+1)%room.players.length; while(room.players[bb].chips<=0)bb=(bb+1)%room.players.length;
  room.sb=sb;room.bb=bb;
  room.players.forEach(p=>{if(p.chips>0)p.holeCards=[room.deck.pop(),room.deck.pop()];});
  putIn(room,room.players[sb],room.settings.smallBlind);
  putIn(room,room.players[bb],room.settings.bigBlind);
  room.currentBet=Math.max(room.players[sb].bet,room.players[bb].bet);
  room.turn=nextActive(room,bb);
  if(room.turn<0) advanceStreet(room);
  else { sendRoom(room); maybeAI(room); }
}
function bettingComplete(room) {
  const contenders=room.players.filter(p=>!p.folded && !p.allIn);
  if(contenders.length<=1)return true;
  return contenders.every(p=>p.acted && p.bet===room.currentBet);
}
function advanceStreet(room) {
  if(activePlayers(room).length===1){finishHand(room);return;}
  room.players.forEach(p=>{p.bet=0;p.acted=false;});
  room.currentBet=0; room.minRaise=room.settings.bigBlind;
  if(room.phase==="preflop"){room.phase="flop";room.community.push(room.deck.pop(),room.deck.pop(),room.deck.pop());}
  else if(room.phase==="flop"){room.phase="turn";room.community.push(room.deck.pop());}
  else if(room.phase==="turn"){room.phase="river";room.community.push(room.deck.pop());}
  else {finishHand(room);return;}
  room.message=({flop:"翻牌 Flop",turn:"轉牌 Turn",river:"河牌 River"})[room.phase];
  room.turn=nextActive(room,room.dealer);
  if(room.turn<0){advanceStreet(room);return;}
  sendRoom(room);maybeAI(room);
}
function finishHand(room) {
  const alive=activePlayers(room);
  if(alive.length===1){alive[0].chips+=room.pot;room.message=`${alive[0].name} 贏得底池 ${room.pot}`;}
  else {
    const ranked=alive.map(p=>({p,h:Hand.solve([...p.holeCards,...room.community])}));
    const winners=Hand.winners(ranked.map(x=>x.h));
    const winPlayers=ranked.filter(x=>winners.includes(x.h)).map(x=>x.p);
    const share=Math.floor(room.pot/winPlayers.length);
    winPlayers.forEach(p=>p.chips+=share);
    room.message=`${winPlayers.map(p=>p.name).join("、")} 以 ${winners[0]. descr} 贏得底池`;
  }
  room.phase="showdown";room.turn=-1;sendRoom(room);
  setTimeout(()=>{if(rooms.has(room.code)){room.phase="waiting";room.message="本手結束，可開始下一手";sendRoom(room);}},5000);
}
function act(room, idx, action, amount=0) {
  const p=room.players[idx]; if(!p || room.turn!==idx || room.phase==="waiting")return;
  const toCall=Math.max(0,room.currentBet-p.bet);
  if(action==="fold"){p.folded=true;p.acted=true;}
  else if(action==="check"){if(toCall>0)return;p.acted=true;}
  else if(action==="call"){if(toCall===0)return;putIn(room,p,toCall);p.acted=true;}
  else if(action==="raise" || action==="bet"){
    const total=Math.floor(Number(amount));
    if(!Number.isFinite(total)||total<=room.currentBet||total-p.bet<toCall+room.minRaise||total-p.bet>p.chips+ p.bet)return;
    const old=room.currentBet;putIn(room,p,total-p.bet);
    room.minRaise=Math.max(room.settings.bigBlind,room.currentBet-old);
    room.currentBet=p.bet;
    room.players.forEach((q,j)=>{if(j!==idx && !q.folded && !q.allIn)q.acted=false;});
    p.acted=true;
  } else if(action==="allin"){
    const old=room.currentBet;putIn(room,p,p.chips);p.acted=true;
    if(p.bet>old){room.minRaise=Math.max(room.settings.bigBlind,p.bet-old);room.currentBet=p.bet;room.players.forEach((q,j)=>{if(j!==idx&&!q.folded&&!q.allIn)q.acted=false;});}
  } else return;
  if(activePlayers(room).length===1){finishHand(room);return;}
  if(bettingComplete(room)){advanceStreet(room);return;}
  room.turn=nextActive(room,idx);
  if(room.turn<0){advanceStreet(room);return;}
  room.message=`${p.name} ${action==="fold"?"棄牌":action==="check"?"過牌":action==="call"?"跟注":action==="allin"?"全押":"加注"}`;
  sendRoom(room);maybeAI(room);
}
function maybeAI(room) {
  if(room.phase==="waiting"||room.phase==="showdown"||room.turn<0)return;
  const p=room.players[room.turn]; if(!p?.isAI)return;
  setTimeout(()=>{
    if(room.turn<0||room.players[room.turn]!==p)return;
    const call=room.currentBet-p.bet;
    let action;
    if(call===0) action=Math.random()<0.22?"bet":"check";
    else action=Math.random()<0.18?"fold":"call";
    if(action==="bet"){
      const target=room.currentBet+room.settings.bigBlind*2;
      if(target-p.bet<=p.chips)act(room,room.turn,"raise",target);else act(room,room.turn,"check");
    } else act(room,room.turn,action);
  },900+Math.random()*900);
}
io.on("connection", socket=>{
  socket.on("createRoom",(data,cb)=>{
    try{
      const code=roomCode();
      const settings={smallBlind:Math.max(1,Number(data.smallBlind)||10),bigBlind:Math.max(2,Number(data.bigBlind)||20),buyIn:Math.max(100,Number(data.buyIn)||2000)};
      settings.bigBlind=Math.max(settings.smallBlind,settings.bigBlind);
      const room={code,settings,players:[],phase:"waiting",community:[],pot:0,currentBet:0,minRaise:settings.bigBlind,dealer:-1,turn:-1,handNo:0,message:"等待玩家加入"};
      rooms.set(code,room);addPlayer(room,socket,cleanName(data.name),settings.buyIn);sendRoom(room);cb({ok:true,code});
    }catch(e){cb({ok:false,error:e.message});}
  });
  socket.on("joinRoom",(data,cb)=>{
    try{
      const code=String(data.code||"").toUpperCase().trim(),room=rooms.get(code);
      if(!room)throw new Error("找不到這個房間。");
      const buyIn=Math.max(100,Math.min(room.settings.buyIn*10,Number(data.buyIn)||room.settings.buyIn));
      addPlayer(room,socket,cleanName(data.name),buyIn);sendRoom(room);broadcast(room,"notice",`${cleanName(data.name)} 加入牌桌`);
      cb({ok:true,code});
    }catch(e){cb({ok:false,error:e.message});}
  });
  socket.on("addAI",(_,cb)=>{
    const room=rooms.get(socket.data.room);if(!room||room.phase!=="waiting")return cb?.({ok:false,error:"目前不能新增 AI"});
    if(room.players.length>=8)return cb?.({ok:false,error:"牌桌已滿"});
    room.players.push({id:null,name:`AI 玩家 ${room.players.filter(p=>p.isAI).length+1}`,chips:room.settings.buyIn,bet:0,folded:false,allIn:false,connected:true,isAI:true,holeCards:[],acted:false});
    sendRoom(room);cb?.({ok:true});
  });
  socket.on("startHand",cb=>{
    const room=rooms.get(socket.data.room);if(!room)return;
    if(room.players.filter(p=>p.chips>0).length<2)return cb?.({ok:false,error:"至少需要兩位玩家。"});
    if(room.phase!=="waiting")return cb?.({ok:false,error:"目前這手尚未結束。"});
    startHand(room);cb?.({ok:true});
  });
  socket.on("action",data=>{
    const room=rooms.get(socket.data.room);if(!room)return;
    const idx=room.players.findIndex(p=>p.id===socket.id);if(idx>=0)act(room,idx,data.action,data.amount);
  });
  socket.on("disconnect",()=>{
    const room=rooms.get(socket.data.room);if(!room)return;
    const p=room.players.find(x=>x.id===socket.id);if(p){p.connected=false;if(room.phase!=="waiting")p.folded=true;sendRoom(room);}
    if(room.players.every(x=>x.isAI||!x.connected)){rooms.delete(room.code);}
  });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Poker server listening on ${PORT}`));
