import { useState, useEffect, useCallback, useRef } from "react";

const ROUNDS = [
  { id: "r64d1", name: "Round of 64 — Day 1", requiredPicks: 8, lockDate: "2026-03-19T17:00:00Z" },
  { id: "r64d2", name: "Round of 64 — Day 2", requiredPicks: 8, lockDate: "2026-03-20T17:00:00Z" },
  { id: "r32d1", name: "Round of 32 — Day 1", requiredPicks: 6, lockDate: "2026-03-21T17:00:00Z" },
  { id: "r32d2", name: "Round of 32 — Day 2", requiredPicks: 6, lockDate: "2026-03-22T17:00:00Z" },
  { id: "s16d1", name: "Sweet 16 — Day 1", requiredPicks: 4, lockDate: "2026-03-26T20:00:00Z" },
  { id: "s16d2", name: "Sweet 16 — Day 2", requiredPicks: 4, lockDate: "2026-03-27T20:00:00Z" },
  { id: "e8d1", name: "Elite 8 — Day 1", requiredPicks: 2, lockDate: "2026-03-28T20:00:00Z" },
  { id: "e8d2", name: "Elite 8 — Day 2", requiredPicks: 2, lockDate: "2026-03-29T20:00:00Z" },
  { id: "f4", name: "Final Four", requiredPicks: 2, lockDate: "2026-04-04T20:00:00Z" },
  { id: "champ", name: "Championship", requiredPicks: 1, lockDate: "2026-04-06T23:00:00Z" },
];
const TOTAL_PICKS = ROUNDS.reduce((s, r) => s + r.requiredPicks, 0); // 43
const COMMISSIONER_USER = "commissioner";
const PAYOUT_INFO = { buyIn: 25 };
const TEAMS = [
  "Alabama","Akron","Arizona","Arkansas","BYU","Cal Baptist","Clemson","Duke",
  "Florida","Furman","Georgia","Gonzaga","Hawai'i","High Point","Hofstra","Houston",
  "Howard","Idaho","Illinois","Iowa","Iowa State","Kansas","Kennesaw State","Kentucky",
  "Lehigh","Long Island","Louisville","McNeese State","Miami","Miami Ohio","Michigan",
  "Michigan State","Missouri","NC State","Nebraska","North Carolina","North Dakota State",
  "Northern Iowa","Ohio State","Penn","Prairie View A&M","Purdue","Queens",
  "SMU","Saint Louis","Saint Mary's","Santa Clara","Siena","South Florida",
  "St. John's","TCU","Tennessee","Tennessee State","Texas","Texas A&M","Texas Tech",
  "Troy","UCF","UCLA","UMBC","UConn","Utah State","VCU","Vanderbilt","Villanova",
  "Virginia","Wisconsin","Wright State",
];
const ESPN_IDS = {
  "alabama":333,"akron":2006,"arizona":12,"arkansas":8,"byu":252,"cal baptist":2856,
  "clemson":228,"duke":150,"florida":57,"furman":231,"georgia":61,"gonzaga":2250,
  "hawai'i":62,"hawaii":62,"high point":2272,"hofstra":2275,"houston":248,
  "howard":47,"idaho":70,"illinois":356,"iowa":2294,"iowa state":66,"kansas":2305,
  "kennesaw state":338,"kentucky":96,"lehigh":2329,
  "louisville":97,"long island":112358,"mcneese state":2377,"miami":2390,"miami ohio":193,"michigan":130,
  "michigan state":127,"missouri":142,"nc state":152,"nebraska":158,
  "north carolina":153,"north dakota state":2449,"northern iowa":2460,
  "ohio state":194,"penn":219,"prairie view a&m":2504,"purdue":2509,
  "queens":2511,"smu":2567,"saint louis":139,"saint mary's":2608,
  "santa clara":2541,"siena":2561,"south florida":58,"st. john's":2599,
  "tcu":2628,"tennessee":2633,"tennessee state":2634,"texas":251,
  "texas a&m":245,"texas tech":2641,"troy":2653,"ucf":2116,"ucla":26,
  "umbc":2378,"uconn":41,"utah state":328,"vcu":2670,"vanderbilt":238,
  "villanova":222,"virginia":258,"wisconsin":275,"wright state":2750,
};
function getEspnId(n){return n?ESPN_IDS[n.trim().toLowerCase()]||0:0}
function teamLogoSrc(n){const id=getEspnId(n);return id?`https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`:null}

// Sort teams so lower seed (higher number = underdog) is listed second (away), lower number = home
function orderTeams(game){
  const s1=parseInt(game.seed1)||99,s2=parseInt(game.seed2)||99;
  // Lower seed number = better team = home (listed second/bottom). Higher seed = away (listed first/top)
  if(s1>s2) return {away:{name:game.team1,seed:game.seed1},home:{name:game.team2,seed:game.seed2},spread:game.spread,total:game.total,flipped:false};
  if(s2>s1) return {away:{name:game.team2,seed:game.seed2},home:{name:game.team1,seed:game.seed1},spread:game.spread?spread2(game.spread):game.spread,total:game.total,flipped:true};
  return {away:{name:game.team1,seed:game.seed1},home:{name:game.team2,seed:game.seed2},spread:game.spread,total:game.total,flipped:false};
}

const S={
  async getShared(k){
    try{
      const r=await fetch(`/api/storage?key=${encodeURIComponent(k)}`);
      if(!r.ok) return null;
      const d=await r.json();
      return d.value||null;
    }catch{return null}
  },
  async setShared(k,v){
    try{
      await fetch('/api/storage',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:k,value:v})
      });
    }catch(e){console.error(e)}
  },
};

// Game-level locking based on tip time
function isGameTipped(game){return game&&game.tipTime?new Date()>=new Date(game.tipTime):false}
// Round is fully locked when ALL games in that round have tipped
function isRoundFullyLocked(rid,games){const rg=(games||[]).filter(g=>g.roundId===rid);return rg.length>0&&rg.every(g=>isGameTipped(g))}
// Round has any locked games
function isRoundPartiallyLocked(rid,games){const rg=(games||[]).filter(g=>g.roundId===rid);return rg.some(g=>isGameTipped(g))}
// For backwards compat — a round is "locked" for eligibility if all games tipped
function isLocked(rid,games){return isRoundFullyLocked(rid,games)}

function fmtTime(dateStr){if(!dateStr)return"TBD";return new Date(dateStr).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/Los_Angeles"})+" PT"}

// Find the next game to tip off across entire tournament
function getNextTipoff(games){
  const now=new Date();
  const upcoming=(games||[]).filter(g=>g.tipTime&&new Date(g.tipTime)>now).sort((a,b)=>new Date(a.tipTime)-new Date(b.tipTime));
  return upcoming.length?upcoming[0]:null;
}

// Countdown to a specific date
function countdownTo(dateStr){
  if(!dateStr)return{text:"TBD",urgent:false,warning:false};
  const diff=new Date(dateStr)-new Date();
  if(diff<=0)return{text:"TIPPED",urgent:false};
  const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
  const p=n=>String(n).padStart(2,"0"),urgent=diff<3600000,warning=diff<7200000;
  if(d>0)return{text:`${d}d ${h}h ${p(m)}m ${p(s)}s`,urgent:false,warning};
  if(h>0)return{text:`${h}h ${p(m)}m ${p(s)}s`,urgent,warning:true};
  return{text:`${p(m)}m ${p(s)}s`,urgent:true,warning:true};
}

// Get earliest tip time in a round (for round-level countdown)
function getFirstTipInRound(rid,games){
  const rg=(games||[]).filter(g=>g.roundId===rid&&g.tipTime).sort((a,b)=>new Date(a.tipTime)-new Date(b.tipTime));
  return rg.length?rg[0].tipTime:null;
}

function getMostRecentLockedRound(games){
  const locked=ROUNDS.filter(r=>isRoundFullyLocked(r.id,games));
  return locked.length?locked[locked.length-1]:null;
}

function getUserDisplay(u){if(!u)return"Unknown";return`${u.username||""} (${u.firstName||""} ${(u.lastName||"").charAt(0).toUpperCase()}.)`}
function cn(...a){return a.filter(Boolean).join(" ")}
function spread2(s){if(!s)return"PK";const n=parseFloat(s);if(isNaN(n))return"PK";return n>0?`−${Math.abs(n)}`:`+${Math.abs(n)}`}

// ─── Pick format helpers ─────────────────────────────────────────────────────
// New format: keys are "gameId_ats" or "gameId_ou", values are team1/team2 or over/under
// Old format: keys are bare "gameId", values are team1/team2/over/under
// Migration converts old → new automatically

function migratePicks(roundPicks){
  if(!roundPicks||typeof roundPicks!=="object")return {};
  const migrated={};
  Object.entries(roundPicks).forEach(([key,val])=>{
    if(!val||val==="")return; // skip empty/null values
    if(key.endsWith("_ats")||key.endsWith("_ou")){
      migrated[key]=val;
    }else{
      if(val==="over"||val==="under") migrated[`${key}_ou`]=val;
      else if(val==="team1"||val==="team2") migrated[`${key}_ats`]=val;
      // skip any other invalid values
    }
  });
  return migrated;
}

function migrateAllRounds(userPicks){
  if(!userPicks)return{};
  const migrated={};
  Object.entries(userPicks).forEach(([roundId,roundPicks])=>{
    migrated[roundId]=migratePicks(roundPicks);
  });
  return migrated;
}

// Extract real game ID from pick key (strip _ats or _ou suffix)
function pickGameId(pickKey){return pickKey.replace(/_ats$/,"").replace(/_ou$/,"")}
// Get pick type from key
function pickType(pickKey){if(pickKey.endsWith("_ats"))return"ats";if(pickKey.endsWith("_ou"))return"ou";return"unknown"}
// Count picks in a round (each _ats and _ou entry counts as 1)
function countPicks(roundPicks){return Object.keys(roundPicks||{}).length}
// Get ATS pick for a game
function getAts(roundPicks,gameId){return (roundPicks||{})[`${gameId}_ats`]||null}
// Get OU pick for a game
function getOu(roundPicks,gameId){return (roundPicks||{})[`${gameId}_ou`]||null}
// Get result for a pick
function getPickResult(allResults,roundId,pickKey,pickVal){
  const gid=pickGameId(pickKey);
  const rr=(allResults||{})[roundId]||{};
  const gameRes=rr[gid];
  if(!gameRes)return null;
  return gameRes[pickVal]||null;
}

function Logo({name,size=36}){
  const[err,setErr]=useState(false);const src=teamLogoSrc(name);
  if(!src||err) return <div style={{width:size,height:size,borderRadius:"50%",background:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.4,fontWeight:800,color:"#64748b",flexShrink:0,fontFamily:"var(--fd)"}}>{(name||"?").charAt(0).toUpperCase()}</div>;
  return <img src={src} alt="" width={size} height={size} onError={()=>setErr(true)} style={{objectFit:"contain",flexShrink:0}}/>;
}

// Simple hash for passwords (not cryptographic, but better than plaintext for a friends pool)
function simpleHash(str){let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0}return'h_'+Math.abs(h).toString(36)}

// Session persistence
function saveSession(uname,userData){try{sessionStorage.setItem('mp_user',uname);sessionStorage.setItem('mp_userData',JSON.stringify(userData))}catch{}}
function loadSession(){try{const u=sessionStorage.getItem('mp_user');const d=sessionStorage.getItem('mp_userData');if(u&&d)return{user:u,userData:JSON.parse(d)};return null}catch{return null}}
function clearSession(){try{sessionStorage.removeItem('mp_user');sessionStorage.removeItem('mp_userData')}catch{}}
function Toast({msg,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2200);return()=>clearTimeout(t)},[onDone]);
  return <div className="toast">{msg}</div>;
}

const css=`
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
:root{
  --navy:#0f1b2d;--navy2:#162238;--navy3:#1c2d47;--navyL:#243a5e;
  --bg:#fff;--bg2:#f8fafc;--bg3:#f1f5f9;--bg4:#e2e8f0;
  --bdr:#e2e8f0;--bdr2:#cbd5e1;
  --g:#16a34a;--g2:#22c55e;--gg:rgba(22,163,74,0.08);--gg2:rgba(22,163,74,0.15);
  --red:#dc2626;--rg:rgba(220,38,38,0.06);--ylw:#ca8a04;--yg:rgba(202,138,4,0.08);
  --blu:#2563eb;--blg:rgba(37,99,235,0.06);
  --t1:#0f172a;--t2:#334155;--t3:#64748b;--t4:#94a3b8;--t5:#cbd5e1;
  --fd:'Archivo',sans-serif;--fm:'JetBrains Mono',monospace;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body,#root{background:var(--bg2);color:var(--t1);font-family:var(--fd);min-height:100vh;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:3px}

.shell{min-height:100vh;display:flex;flex-direction:column}
.main{max-width:820px;margin:0 auto;padding:20px 16px 48px;width:100%;flex:1}

/* Toast */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--navy);color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;z-index:200;animation:toastIn .3s ease;box-shadow:0 8px 24px rgba(0,0,0,.2)}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

/* Header */
.hdr{background:var(--navy);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.brand{font-weight:900;font-size:18px;letter-spacing:1.5px;text-transform:uppercase;color:#fff}
.brand em{font-style:normal;color:var(--g2)}
.brand small{display:block;font-weight:500;font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-top:1px}
.hdr-r{display:flex;align-items:center;gap:10px}
.hdr-u{font-family:var(--fm);font-size:10px;color:rgba(255,255,255,0.5);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-out{background:none;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.4);padding:4px 10px;border-radius:3px;cursor:pointer;font-size:9px;font-family:var(--fm);letter-spacing:1.5px;text-transform:uppercase;transition:all .2s}
.btn-out:hover{border-color:var(--red);color:#fff}

/* Countdown */
.cd-bar{background:var(--navy2);padding:10px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:50px;z-index:99}
.cd-bar.warn{background:linear-gradient(90deg,rgba(202,138,4,0.15),var(--navy2) 70%)}
.cd-bar.warn .cd-timer{color:var(--ylw)}
.cd-bar.urg{background:linear-gradient(90deg,rgba(220,38,38,0.2),var(--navy2) 70%);animation:cdP 1.5s infinite}
.cd-bar.urg .cd-timer{color:#ef4444}
@keyframes cdP{0%,100%{background:linear-gradient(90deg,rgba(220,38,38,0.2),var(--navy2) 70%)}50%{background:linear-gradient(90deg,rgba(220,38,38,0.35),var(--navy2) 70%)}}
.cd-left{display:flex;flex-direction:column;gap:2px}
.cd-round{font-weight:800;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.8)}
.cd-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cd-lock-time{font-family:var(--fm);font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:.5px}
.cd-timer{font-family:var(--fm);font-weight:700;font-size:28px;color:var(--g2);letter-spacing:2px;line-height:1}
.cd-locked{color:rgba(255,255,255,0.3);font-family:var(--fm);font-size:13px;letter-spacing:2px;font-weight:600}

/* Status pills in countdown bar */
.cd-status-pill{font-family:var(--fm);font-size:10px;font-weight:700;padding:4px 12px;border-radius:4px;letter-spacing:1px;animation:fu .3s ease}
.cd-pill-done{background:rgba(34,197,94,0.2);color:#4ade80;border:1px solid rgba(34,197,94,0.3)}
.cd-pill-notdone{background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.3)}
.cd-pill-wait{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.1)}
/* Done state - subtle green left border */
.cd-done-bar{border-left:4px solid var(--g2)}
/* Not done state - subtle red left border to draw attention */
.cd-notdone-bar{border-left:4px solid #ef4444}

/* Nav */
.nav{background:var(--bg);border-bottom:1px solid var(--bdr);display:flex;padding:0 16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.nav::-webkit-scrollbar{height:0}
.nt{padding:12px 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--t4);background:none;border:none;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap}
.nt:hover{color:var(--t2)}
.nt.on{color:var(--navy);border-bottom-color:var(--navy)}

/* Cards */
.crd{background:var(--bg);border:1px solid var(--bdr);border-radius:10px;padding:22px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
.crd-t{font-size:13px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:var(--t3);margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bdg{font-family:var(--fm);font-size:9px;font-weight:600;padding:3px 8px;border-radius:3px;letter-spacing:.5px}
.bdg-g{background:var(--gg);color:var(--g)}.bdg-r{background:var(--rg);color:var(--red)}.bdg-y{background:var(--yg);color:var(--ylw)}.bdg-b{background:var(--blg);color:var(--blu)}.bdg-navy{background:rgba(15,27,45,0.06);color:var(--navy)}

/* Buttons */
.btn{font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:10px 24px;border-radius:6px;cursor:pointer;border:none;transition:all .2s;font-family:var(--fd)}
.btn-navy{background:var(--navy);color:#fff}.btn-navy:hover{background:var(--navy2)}
.btn-g{background:var(--g);color:#fff}.btn-g:hover{background:var(--g2)}
.btn-g:disabled,.btn-navy:disabled{opacity:.3;cursor:not-allowed}
.btn-gh{background:transparent;border:1px solid var(--bdr);color:var(--t3)}.btn-gh:hover{border-color:var(--navy);color:var(--navy)}
.btn-d{background:var(--rg);color:var(--red);border:1px solid rgba(220,38,38,.12)}.btn-d:hover{background:rgba(220,38,38,.1)}
.btn-sm{padding:6px 14px;font-size:10px}

/* Inputs */
.inp{background:var(--bg);border:1px solid var(--bdr);color:var(--t1);padding:12px 14px;border-radius:6px;font-family:var(--fd);font-size:14px;width:100%;transition:all .2s}
.inp:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px rgba(15,27,45,0.06)}
.inp::placeholder{color:var(--t5)}
select.inp{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%2394a3b8' d='M5 6L0 0h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.fld{margin-bottom:14px}.lbl{font-family:var(--fm);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:var(--t4);margin-bottom:5px;display:block}

/* Login */
.lw{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;background:var(--navy)}
.lc{background:var(--bg);border-radius:12px;padding:44px 36px;width:100%;max-width:440px;box-shadow:0 24px 64px rgba(0,0,0,.3)}
.lb{font-size:34px;font-weight:900;text-align:center;letter-spacing:2px;text-transform:uppercase;color:var(--navy);margin-bottom:4px}
.lb em{font-style:normal;color:var(--g)}
.ls{text-align:center;font-family:var(--fm);font-size:10px;color:var(--t4);letter-spacing:1.5px;margin-bottom:6px}
.ldiv{width:32px;height:3px;background:var(--navy);margin:16px auto 24px;border-radius:2px}
.lerr{background:var(--rg);color:var(--red);padding:10px 14px;border-radius:6px;font-size:12px;margin-bottom:14px;text-align:center;border:1px solid rgba(220,38,38,.1)}
.lf{text-align:center;margin-top:18px;font-size:12px;color:var(--t4)}
.lf button{background:none;border:none;color:var(--navy);cursor:pointer;font-family:var(--fd);font-size:12px;font-weight:700}
.lf button:hover{text-decoration:underline}
.ng{display:grid;grid-template-columns:1fr 1fr;gap:10px}
/* Rules on login */
.rules{margin-top:24px;padding-top:20px;border-top:1px solid var(--bdr);font-size:11px;color:var(--t3);line-height:1.7}
.rules strong{color:var(--t2);font-weight:700}
.rules-title{font-weight:800;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--navy);margin-bottom:8px}

/* Game cards */
.gm{background:var(--bg);border:1px solid var(--bdr);border-radius:10px;padding:20px;margin-bottom:12px;transition:all .2s;box-shadow:0 1px 3px rgba(0,0,0,.03)}
.gm.sel{border-color:var(--navy);box-shadow:0 0 0 2px rgba(15,27,45,.1),0 4px 12px rgba(15,27,45,.06)}
.gm.lk{opacity:.45;pointer-events:none}
.gm-mu{display:flex;align-items:center;gap:16px;margin-bottom:14px}
.gm-ts{flex:1;display:flex;flex-direction:column;gap:8px}
.gm-t{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--t1)}
.gm-t.away{color:var(--t3)}
.gm-sd{font-family:var(--fm);font-size:12px;color:var(--t4);min-width:18px;text-align:right}
.gm-home-tag{font-family:var(--fm);font-size:9px;color:var(--t5);letter-spacing:1px;margin-left:4px}
.gm-ln{text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.gm-sp{font-family:var(--fm);font-size:16px;color:var(--navy);font-weight:700}
.gm-ou{font-family:var(--fm);font-size:12px;color:var(--t4)}
.gm-divider{height:1px;background:var(--bdr);margin:0 0 12px 0}

/* Pick buttons */
.pk-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}
.pk-row-label{font-family:var(--fm);font-size:9px;color:var(--t5);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}
.pk{padding:12px 8px;border-radius:6px;cursor:pointer;font-family:var(--fm);font-size:12px;font-weight:500;text-align:center;transition:all .15s;background:var(--bg2);border:1px solid var(--bdr);color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pk:hover:not(:disabled){border-color:var(--navy);color:var(--t1);background:rgba(15,27,45,.03)}
.pk.on{background:var(--navy);border-color:var(--navy);color:#fff;font-weight:700}
.pk:disabled{cursor:not-allowed;opacity:.35}
.pk-full{font-family:var(--fm);font-size:9px;color:var(--t4);text-align:center;padding:6px;background:var(--bg3);border-radius:4px;margin-top:4px}

/* Lock bar */
.lbar{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-radius:6px;margin-bottom:14px;background:var(--bg3);border:1px solid var(--bdr);font-size:13px}
.pc{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:6px;margin-bottom:12px;background:var(--bg);border:1px solid var(--bdr);font-size:12px}
.pc-n{font-family:var(--fm);font-weight:800;font-size:17px}
.pc-n.ok{color:var(--g)}.pc-n.part{color:var(--ylw)}.pc-of{color:var(--t4);font-family:var(--fm);font-size:11px}

/* Submitted success banner */
.sub-banner{background:var(--g);color:#fff;border-radius:8px;padding:16px 20px;margin-bottom:14px;display:flex;align-items:center;gap:12px;animation:fu .3s ease}
.sub-banner .sb-icon{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;font-weight:900}
.sub-banner .sb-text{font-weight:700;font-size:14px;letter-spacing:.5px}
.sub-banner .sb-sub{font-size:11px;font-weight:500;opacity:.85;margin-top:2px}
.sub-banner.is-locked{background:var(--navy)}

/* Progress bar */
.prog{height:6px;background:var(--bdr);border-radius:3px;margin-bottom:14px;overflow:hidden}
.prog-fill{height:100%;border-radius:3px;transition:width .3s ease}
.prog-fill.full{background:var(--g)}
.prog-fill.part{background:var(--ylw)}

/* Missed round warning */
.missed{background:var(--rg);border:1px solid rgba(220,38,38,.12);border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--red);font-weight:600;display:flex;align-items:center;gap:8px}
/* Not submitted warning */
.not-sub-banner{background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:14px;font-size:12px;color:#92400e;font-weight:600;line-height:1.5}

/* Standings */
.lr{display:grid;grid-template-columns:30px 1fr 48px 64px 40px;align-items:center;padding:11px 12px;gap:6px;border-bottom:1px solid var(--bdr)}
.lr:hover{background:var(--bg2)}
.lr.lh{font-family:var(--fm);font-size:8px;color:var(--t4);text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid var(--bdr)}
.lr:last-child{border-bottom:none}
.lr.top1{background:rgba(22,163,74,.04)}.lr.topL{background:var(--rg)}
.lrk{font-size:20px;font-weight:900;color:var(--t5);text-align:center}
.lrk.p1{color:var(--g)}.lrk.pL{color:var(--red)}
.lnm{font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)}
.lpt{font-family:var(--fm);font-weight:700;color:var(--navy);text-align:right;font-size:14px}
.lrc{font-family:var(--fm);font-size:10px;color:var(--t4);text-align:right}
.lst{text-align:center}
.dt{display:inline-block;width:6px;height:6px;border-radius:50%}
.dt-g{background:var(--g)}.dt-y{background:var(--ylw)}.dt-r{background:var(--red)}

/* Payout */
.pay-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:480px){.pay-grid{grid-template-columns:1fr}}
.pay-card{padding:14px;border-radius:8px;border:1px solid var(--bdr)}
.pay-card.gold{background:linear-gradient(135deg,rgba(22,163,74,.06),rgba(22,163,74,.02));border-color:rgba(22,163,74,.2)}
.pay-card.silver{background:var(--bg2)}.pay-card.bronze{background:var(--bg2)}.pay-card.last{background:var(--rg);border-color:rgba(220,38,38,.12)}
.pay-place{font-weight:900;font-size:22px;letter-spacing:1px;color:var(--t1)}
.pay-card.gold .pay-place{color:var(--g)}.pay-card.last .pay-place{color:var(--red)}
.pay-amt{font-family:var(--fm);font-weight:700;font-size:18px;color:var(--navy)}
.pay-desc{font-size:10px;color:var(--t4);margin-top:2px}

/* Chips */
.chp{display:inline-block;padding:5px 12px;border-radius:16px;font-family:var(--fm);font-size:10px;cursor:pointer;transition:all .15s;background:var(--bg);border:1px solid var(--bdr);color:var(--t3);margin:0 4px 6px 0}
.chp:hover{border-color:var(--navy);color:var(--t1)}
.chp.on{background:var(--navy);border-color:var(--navy);color:#fff}

/* Chat */
.cw{display:flex;flex-direction:column;height:calc(100vh - 220px);max-height:600px}
.cf-feed{flex:1;overflow-y:auto;padding:12px 0;display:flex;flex-direction:column;gap:8px}
.cb{padding:10px 14px;border-radius:10px;background:var(--bg3);border:1px solid var(--bdr);max-width:80%}
.cb.me{align-self:flex-end;background:var(--navy);border-color:var(--navy);color:#fff}
.cb.me .cbu{color:var(--g2)}.cb.me .cbts{color:rgba(255,255,255,0.4)}
.cbu{font-family:var(--fm);font-size:9px;color:var(--navy);margin-bottom:3px;font-weight:600;letter-spacing:.5px}
.cbt{font-size:13px;line-height:1.45;word-break:break-word}
.cbts{font-family:var(--fm);font-size:8px;color:var(--t4);margin-top:2px}
.ci{display:flex;gap:8px;padding-top:12px;border-top:1px solid var(--bdr)}
.ci .inp{flex:1}
.char-count{font-family:var(--fm);font-size:9px;color:var(--t5);align-self:center}

/* History */
.hi{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bdr);font-size:12px}
.rb{font-family:var(--fm);font-size:9px;font-weight:700;padding:3px 8px;border-radius:3px;letter-spacing:.5px}
.rw{background:var(--gg);color:var(--g)}.rl{background:var(--rg);color:var(--red)}.rp{background:var(--yg);color:var(--ylw)}.rq{background:var(--blg);color:var(--blu)}

/* Commissioner */
.cf2{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:18px;background:var(--bg2);border-radius:8px;border:1px solid var(--bdr)}
.cf2 .full{grid-column:1/-1}
.gs{background:var(--bg);border:1px solid var(--bdr);color:var(--t1);padding:5px 8px;border-radius:4px;font-size:10px;font-family:var(--fm);width:100%}
.um-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bdr);font-size:12px;gap:8px;flex-wrap:wrap}
.um-name{flex:1;font-weight:600;color:var(--t2);min-width:120px}
.um-info{font-family:var(--fm);color:var(--t4);font-size:10px}

.st{font-size:16px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--t3);margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid var(--bdr)}
.ey{text-align:center;padding:44px 20px;color:var(--t4)}.ey p{font-size:13px;line-height:1.6}

.stabs{display:flex;gap:0;margin-bottom:16px;border:1px solid var(--bdr);border-radius:6px;overflow:hidden}
.stab{flex:1;padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-align:center;cursor:pointer;background:var(--bg);color:var(--t4);border:none;transition:all .15s}
.stab:not(:last-child){border-right:1px solid var(--bdr)}
.stab.on{background:var(--navy);color:#fff}

@keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.an{animation:fu .3s ease}
@keyframes gl{0%,100%{opacity:1}50%{opacity:.4}}
.ld{animation:gl 1.4s infinite}

@media(max-width:600px){
  .main{padding:14px 10px 36px}.lr{grid-template-columns:24px 1fr 38px 52px 32px;padding:9px 6px;gap:3px}.lnm{font-size:10px}
  .hdr{padding:10px 14px}.brand{font-size:15px}.brand small{font-size:8px}.lb{font-size:26px}.lc{padding:28px 20px}
  .ng{grid-template-columns:1fr}.cf2{grid-template-columns:1fr}.gm-t{font-size:13px}
  .cd-bar{padding:8px 14px;top:44px}.cd-timer{font-size:22px}.cd-round{font-size:10px}
  .stabs{flex-wrap:wrap}.stab{font-size:9px;padding:6px 8px}
}
`;

// ─── Auth ────────────────────────────────────────────────────────────────────
function Auth({onLogin}){
  const[mode,setMode]=useState("login");
  const[f,sF]=useState({username:"",password:"",firstName:"",lastName:""});
  const[err,sErr]=useState("");const[busy,sBusy]=useState(false);
  const u=(k,v)=>sF({...f,[k]:v});
  const go=async()=>{
    const{username,password,firstName,lastName}=f;
    if(!username.trim()||!password.trim()){sErr("Username and password required.");return}
    if(mode==="register"&&(!firstName.trim()||!lastName.trim())){sErr("First and last name required.");return}
    const uname=username.trim().toLowerCase();if(uname.length<3){sErr("Username must be 3+ characters.");return}
    sBusy(true);sErr("");const users=(await S.getShared("pool:users"))||{};
    if(mode==="register"){
      if(users[uname]){sErr("Username taken.");sBusy(false);return}
      users[uname]={password:simpleHash(password),username:username.trim(),firstName:firstName.trim(),lastName:lastName.trim(),joined:Date.now()};
      await S.setShared("pool:users",users);saveSession(uname,users[uname]);onLogin(uname,users[uname]);
    }else{
      // Auto-create commissioner on first login
      if(uname===COMMISSIONER_USER&&!users[uname]){
        users[uname]={password:simpleHash(password),username:"commissioner",firstName:"Commissioner",lastName:"Admin",joined:Date.now()};
        await S.setShared("pool:users",users);saveSession(uname,users[uname]);onLogin(uname,users[uname]);sBusy(false);return;
      }
      if(!users[uname]){sErr("User not found.");sBusy(false);return}
      // Support both hashed and plaintext passwords (backwards compatible)
      const stored=users[uname].password;
      const hashed=simpleHash(password);
      const match=stored===hashed||stored===password;
      if(!match){sErr("Wrong password.");sBusy(false);return}
      // Auto-migrate plaintext passwords to hashed
      if(stored===password&&stored!==hashed){users[uname].password=hashed;await S.setShared("pool:users",users)}
      saveSession(uname,users[uname]);onLogin(uname,users[uname]);
    }sBusy(false);
  };
  return(
    <div className="lw"><div className="lc an">
      <div className="lb">MADNESS <em>POOL</em></div>
      <div className="ls">Are you sharp? Or just a square?</div>
      <div className="ldiv"/>
      {err&&<div className="lerr">{err}</div>}
      {mode==="register"&&<div className="ng" style={{marginBottom:14}}>
        <div className="fld" style={{marginBottom:0}}><label className="lbl">First Name</label><input className="inp" placeholder="John" value={f.firstName} onChange={e=>u("firstName",e.target.value)}/></div>
        <div className="fld" style={{marginBottom:0}}><label className="lbl">Last Name</label><input className="inp" placeholder="Doe" value={f.lastName} onChange={e=>u("lastName",e.target.value)}/></div>
      </div>}
      <div className="fld"><label className="lbl">Username</label><input className="inp" placeholder="Choose a username" value={f.username} onChange={e=>u("username",e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/></div>
      <div className="fld"><label className="lbl">Password</label><input className="inp" type="password" placeholder="Password" value={f.password} onChange={e=>u("password",e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/></div>
      <button className="btn btn-navy" style={{width:"100%"}} onClick={go} disabled={busy}>{busy?"...":mode==="login"?"LOG IN":"CREATE ACCOUNT"}</button>
      <div className="lf">{mode==="login"?<>New? <button onClick={()=>{setMode("register");sErr("")}}>Create account</button></>:<>Have an account? <button onClick={()=>{setMode("login");sErr("")}}>Log in</button></>}</div>

      <div className="rules">
        <div className="rules-title">How it works</div>
        <strong>Pick against the spread.</strong> Each round, pick a set number of games — choose a team to cover the spread or the over/under on the total. You decide which type for each pick.<br/><br/>
        <strong>Points:</strong> 1 point per win, 0.5 for a push, 0 for a loss. Most points at the end wins the pot.<br/><br/>
        <strong>Last place pays out</strong> — but only if you submit 100% of your picks. Miss a round? You're ineligible for the toilet bowl.<br/><br/>
        <strong>Picks lock at tip-off.</strong> Each game locks individually when it tips. You can still change picks for later games while early games are live. All times are Pacific (PT).<br/><br/>
        <strong>Buy-in:</strong> $25 &middot; <strong>3rd:</strong> $25 flat &middot; <strong>Remaining pot:</strong> 1st 55% / 2nd 25% / Last 20%
      </div>
    </div></div>
  );
}

// ─── Countdown ───────────────────────────────────────────────────────────────
function CountdownBar({userPicks,games}){
  const[,setT]=useState(0);
  useEffect(()=>{const i=setInterval(()=>setT(t=>t+1),1000);return()=>clearInterval(i)},[]);
  const nextGame=getNextTipoff(games);
  if(!nextGame) return <div className="cd-bar"><div className="cd-left"><span className="cd-round">ALL GAMES TIPPED</span></div><div className="cd-locked">TOURNAMENT IN PROGRESS</div></div>;
  const round=ROUNDS.find(r=>r.id===nextGame.roundId);
  const cd=countdownTo(nextGame.tipTime);
  // Count picks for this round
  const roundPicks=migratePicks((userPicks||{})[nextGame.roundId]||{});
  const submitted=countPicks(roundPicks);
  const needed=round?round.requiredPicks:0;
  const done=submitted>=needed&&needed>0;
  const hasGames=(games||[]).some(g=>g.roundId===nextGame.roundId);
  return (
    <div className={cn("cd-bar",cd.urgent&&"urg",!cd.urgent&&cd.warning&&"warn",done&&"cd-done-bar",!done&&hasGames&&"cd-notdone-bar")}>
      <div className="cd-left">
        <span className="cd-round">{round?round.name:"NEXT GAME"}</span>
        <div className="cd-meta">
          {done
            ? <span className="cd-status-pill cd-pill-done">PICKS FINALIZED</span>
            : hasGames
              ? <span className="cd-status-pill cd-pill-notdone">NOT SUBMITTED — {submitted}/{needed}</span>
              : <span className="cd-status-pill cd-pill-wait">GAMES NOT YET POSTED</span>}
          <span className="cd-lock-time">Next tip: {fmtTime(nextGame.tipTime)}</span>
        </div>
      </div>
      <div className="cd-timer">{cd.text}</div>
    </div>
  );
}

// ─── Make Picks ──────────────────────────────────────────────────────────────
function MakePicks({user,games,userPicks,setUserPicks,showToast}){
  const[sr,setSr]=useState(()=>{
    // Default to round with next untipped game
    const nextGame=getNextTipoff(games);
    if(nextGame) return nextGame.roundId;
    return ROUNDS[0].id;
  });
  const round=ROUNDS.find(r=>r.id===sr),rGames=(games||[]).filter(g=>g.roundId===sr);
  const picks=migratePicks(userPicks[sr]||{});
  const pc=countPicks(picks),done=pc===round.requiredPicks;
  const atMax=pc>=round.requiredPicks;
  const savingRef=useRef(false);

  const toggleAts=async(gid,game,val)=>{
    if(isGameTipped(game)||savingRef.current)return;
    savingRef.current=true;
    const freshPicks=(await S.getShared(`picks:${user}`))||{};
    const cur=migratePicks(freshPicks[sr]||{});
    const key=`${gid}_ats`;
    if(cur[key]===val){delete cur[key]}
    else{
      if(countPicks(cur)>=round.requiredPicks&&!cur[key]){savingRef.current=false;return}
      cur[key]=val;
    }
    const up={...freshPicks,[sr]:cur};
    await S.setShared(`picks:${user}`,up);setUserPicks(up);savingRef.current=false;
    if(countPicks(cur)===round.requiredPicks)showToast(`All ${round.requiredPicks} picks submitted for ${round.name}`);
  };

  const toggleOu=async(gid,game,val)=>{
    if(isGameTipped(game)||savingRef.current)return;
    savingRef.current=true;
    const freshPicks=(await S.getShared(`picks:${user}`))||{};
    const cur=migratePicks(freshPicks[sr]||{});
    const key=`${gid}_ou`;
    if(cur[key]===val){delete cur[key]}
    else{
      if(countPicks(cur)>=round.requiredPicks&&!cur[key]){savingRef.current=false;return}
      cur[key]=val;
    }
    const up={...freshPicks,[sr]:cur};
    await S.setShared(`picks:${user}`,up);setUserPicks(up);savingRef.current=false;
    if(countPicks(cur)===round.requiredPicks)showToast(`All ${round.requiredPicks} picks submitted for ${round.name}`);
  };

  const missedRounds=ROUNDS.filter(r=>isRoundFullyLocked(r.id,games)&&countPicks(migratePicks(userPicks[r.id]||{}))<r.requiredPicks&&(games||[]).some(g=>g.roundId===r.id));

  // Round-level info
  const firstTip=getFirstTipInRound(sr,games);
  const roundFullyLocked=isRoundFullyLocked(sr,games);
  const roundCD=firstTip?countdownTo(firstTip):{text:"TBD",urgent:false};

  return (<div className="an"><div className="st">MAKE YOUR PICKS</div>
    {missedRounds.length>0&&<div className="missed">
      You missed {missedRounds.length} round{missedRounds.length>1?"s":""}: {missedRounds.map(r=>r.name).join(", ")}. Submit all future picks to stay eligible for last place.
    </div>}
    <div className="fld"><label className="lbl">Round</label><select className="inp" value={sr} onChange={e=>setSr(e.target.value)}>
      {ROUNDS.map(r=>{const fl=isRoundFullyLocked(r.id,games),up=countPicks(migratePicks(userPicks[r.id]||{})),d=up===r.requiredPicks;
        return <option key={r.id} value={r.id}>{fl?(d?"\u2705 ":"\u274C "):(d?"\u2705 ":"")} {r.name} — {r.requiredPicks} picks {fl?(d?"(submitted)":"(missed)"):(d?"(ready)":"")}</option>})}
    </select></div>
    <div className="lbar"><div style={{color:"var(--t3)",fontSize:11}}>First tip: {firstTip?fmtTime(firstTip):"TBD"}</div><div style={{fontFamily:"var(--fm)",fontWeight:700,fontSize:13}}>{roundFullyLocked? <span style={{color:"var(--red)"}}>ALL TIPPED</span>: <span style={{color:"var(--g)"}}>{roundCD.text}</span>}</div></div>

    {done&&!roundFullyLocked&&<div className="sub-banner">
      <div className="sb-icon">{"\u2713"}</div>
      <div><div className="sb-text">ALL {round.requiredPicks} PICKS SUBMITTED</div><div className="sb-sub">Your picks for {round.name} are locked in. You can still change picks for untipped games.</div></div>
    </div>}
    {done&&roundFullyLocked&&<div className="sub-banner is-locked">
      <div className="sb-icon">{"\u2713"}</div>
      <div><div className="sb-text">PICKS SUBMITTED {"&"} LOCKED</div><div className="sb-sub">{round.name} — {round.requiredPicks}/{round.requiredPicks} picks final. All games tipped.</div></div>
    </div>}
    {!done&&roundFullyLocked&&rGames.length>0&&<div className="missed">
      MISSED — You submitted {pc}/{round.requiredPicks} picks. All games have tipped.
    </div>}

    {!roundFullyLocked&&rGames.length>0&&<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
        <span style={{fontFamily:"var(--fm)",fontSize:12,fontWeight:700,color:done?"var(--g)":"var(--t2)"}}>{pc} / {round.requiredPicks} PICKS</span>
        {!done&&<span style={{fontFamily:"var(--fm)",fontSize:11,color:"var(--red)",fontWeight:600}}>NOT YET FINALIZED</span>}
        {done&&<span style={{fontFamily:"var(--fm)",fontSize:11,color:"var(--g)",fontWeight:600}}>FINALIZED</span>}
      </div>
      <div className="prog"><div className={cn("prog-fill",done?"full":"part")} style={{width:`${(pc/round.requiredPicks)*100}%`}}/></div>
      {!done&&pc>0&&rGames.length>0&&<div className="not-sub-banner">You have {pc} pick{pc>1?"s":""} selected but need {round.requiredPicks} to finalize. You can pick a team AND an over/under on the same game — each counts as 1 pick.</div>}
      {!done&&pc===0&&rGames.length>0&&<div className="not-sub-banner">Select {round.requiredPicks} picks to finalize. You can pick a team AND an over/under on the same game — each counts as 1 pick.</div>}
    </>}
    {rGames.length===0?<div className="ey"><p>No games posted for this round yet.<br/>The commissioner will add games before the round begins.</p></div>:
    rGames.map(g=>{
      const ats=getAts(picks,g.id), ou=getOu(picks,g.id);
      const hasPick=ats||ou;
      const tipped=isGameTipped(g);
      const canPickAts=!tipped&&(!atMax||ats);
      const canPickOu=!tipped&&(!atMax||ou);
      const s1=parseInt(g.seed1)||99,s2=parseInt(g.seed2)||99;
      const awayName=s1>s2?g.team1:g.team2, homeName=s1>s2?g.team2:g.team1;
      const awaySeed=s1>s2?g.seed1:g.seed2, homeSeed=s1>s2?g.seed2:g.seed1;
      const displaySpread=g.spread||"PK";
      const gameCd=g.tipTime?countdownTo(g.tipTime):null;
      return (
      <div key={g.id} className={cn("gm",hasPick&&"sel",tipped&&"lk")}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontFamily:"var(--fm)",fontSize:10,color:tipped?"var(--red)":"var(--t4)"}}>
            {g.tipTime?fmtTime(g.tipTime):"Tip time TBD"}
          </div>
          {tipped&&<span className="bdg bdg-r" style={{fontSize:9}}>LOCKED</span>}
          {!tipped&&gameCd&&<span style={{fontFamily:"var(--fm)",fontSize:10,fontWeight:700,color:gameCd.urgent?"var(--red)":gameCd.warning?"var(--ylw)":"var(--g)"}}>{gameCd.text}</span>}
        </div>
        <div className="gm-mu"><div className="gm-ts">
          <div className="gm-t away"><span className="gm-sd">{awaySeed}</span><Logo name={awayName} size={36}/><span>{awayName}</span></div>
          <div className="gm-t"><span className="gm-sd">{homeSeed}</span><Logo name={homeName} size={36}/><span>{homeName}</span><span className="gm-home-tag">HOME</span></div>
        </div><div className="gm-ln"><div className="gm-sp">{displaySpread}</div><div className="gm-ou">O/U {g.total||"–"}</div></div></div>
        <div className="gm-divider"/>
        <div className="pk-row-label">SPREAD {ats&&<span style={{color:"var(--g)",marginLeft:6}}>PICKED</span>}</div>
        <div className="pk-row">
          <button className={cn("pk",ats==="team1"&&"on")} onClick={()=>toggleAts(g.id,g,"team1")} disabled={tipped||(!canPickAts&&ats!=="team1")}>{g.team1} {g.spread||"PK"}</button>
          <button className={cn("pk",ats==="team2"&&"on")} onClick={()=>toggleAts(g.id,g,"team2")} disabled={tipped||(!canPickAts&&ats!=="team2")}>{g.team2} {spread2(g.spread)}</button>
        </div>
        <div className="pk-row-label">TOTAL {ou&&<span style={{color:"var(--g)",marginLeft:6}}>PICKED</span>}</div>
        <div className="pk-row">
          <button className={cn("pk",ou==="over"&&"on")} onClick={()=>toggleOu(g.id,g,"over")} disabled={tipped||(!canPickOu&&ou!=="over")}>Over {g.total||""}</button>
          <button className={cn("pk",ou==="under"&&"on")} onClick={()=>toggleOu(g.id,g,"under")} disabled={tipped||(!canPickOu&&ou!=="under")}>Under {g.total||""}</button>
        </div>
        {atMax&&!ats&&!ou&&!tipped&&<div className="pk-full">All {round.requiredPicks} picks used — deselect one to pick this game</div>}
      </div>)})}
  </div>);
}

// ─── View Picks (The Board) ──────────────────────────────────────────────────
function ViewPicks({allPicks,users,games,allResults}){
  const[sr,setSr]=useState(()=>{const m=getMostRecentLockedRound(games);return m?m.id:ROUNDS[0].id});
  const[sp,setSp]=useState(null);const roundLocked=isRoundFullyLocked(sr,games);const rGames=(games||[]).filter(g=>g.roundId===sr);const results=allResults[sr]||{};
  const players=Object.entries(users).filter(([u])=>u!==COMMISSIONER_USER);
  return(<div className="an"><div className="st">THE BOARD — PLAYER PICKS</div>
    <div className="fld"><label className="lbl">Round</label><select className="inp" value={sr} onChange={e=>{setSr(e.target.value);setSp(null)}}>
      {ROUNDS.map(r=><option key={r.id} value={r.id}>{r.name} {isRoundPartiallyLocked(r.id,games)?"(viewable)":"(hidden until tip)"}</option>)}
    </select></div>
    {!isRoundPartiallyLocked(sr,games)?<div className="ey"><p>Picks are hidden until games tip off.<br/>First tip: {getFirstTipInRound(sr,games)?fmtTime(getFirstTipInRound(sr,games)):"TBD"}</p></div>:<>
      <div style={{marginBottom:14}}><label className="lbl">Player</label><div>{players.map(([un,ud])=>{
        const hasPicks=Object.keys((allPicks[un]||{})[sr]||{}).length>0;
        return <button key={un} className={cn("chp",sp===un&&"on")} onClick={()=>setSp(un)} style={!hasPicks?{opacity:.5}:{}}>{getUserDisplay(ud)} {!hasPicks?"(none)":""}</button>
      })}</div></div>
      {sp?<div className="crd"><div className="crd-t">{getUserDisplay(users[sp])}</div>
        {(()=>{const picks=migratePicks((allPicks[sp]||{})[sr]||{});if(!countPicks(picks))return <div style={{color:"var(--t4)",fontSize:12,fontFamily:"var(--fm)"}}>No picks submitted for this round.</div>;
        return Object.entries(picks).map(([pickKey,pickVal])=>{const gid=pickGameId(pickKey);const gm=rGames.find(g=>g.id===gid);const st=getPickResult(allResults,sr,pickKey,pickVal);const status=st||"pending";
        const pl=pickVal==="team1"?`${gm?.team1||"?"} ${gm?.spread||"PK"}`:pickVal==="team2"?`${gm?.team2||"?"} ${spread2(gm?.spread)}`:pickVal==="over"?`Over ${gm?.total||""}`:`Under ${gm?.total||""}`;
        const typeLabel=pickType(pickKey)==="ats"?"ATS":"O/U";
        return <div key={pickKey} className="hi"><div><div style={{fontFamily:"var(--fm)",fontSize:9,color:"var(--t5)"}}>{gm?`${gm.team1} vs ${gm.team2}`:gid} <span style={{color:"var(--navy)"}}>{typeLabel}</span></div>
        <div style={{fontSize:13,marginTop:3,display:"flex",alignItems:"center",gap:7}}><Logo name={pickVal==="team1"?gm?.team1:pickVal==="team2"?gm?.team2:gm?.team1} size={18}/>{pl}</div></div>
        <span className={cn("rb",status==="win"?"rw":status==="loss"?"rl":status==="push"?"rp":"rq")}>{status==="win"?"WIN":status==="loss"?"LOSS":status==="push"?"PUSH":"PENDING"}</span></div>})})()}
      </div>:<div style={{color:"var(--t5)",fontSize:12,textAlign:"center",padding:24,fontFamily:"var(--fm)"}}>Select a player to view their picks</div>}
    </>}
  </div>);
}

// ─── Standings ───────────────────────────────────────────────────────────────
function Standings({allPicks,allResults,users,games}){
  const players=Object.entries(users).filter(([u])=>u!==COMMISSIONER_USER);
  const st=players.map(([un,ud])=>{let w=0,l=0,p=0,rS=0,rW=0;const up=allPicks[un]||{};
    ROUNDS.forEach(r=>{
      const rp=migratePicks(up[r.id]||{});
      const locked=isRoundFullyLocked(r.id,games);
      const hasGames=(games||[]).some(g=>g.roundId===r.id);
      // Only count locked rounds with games for eligibility
      if(locked&&hasGames)rW++;
      if(locked&&hasGames&&countPicks(rp)===r.requiredPicks)rS++;
      // Only score picks against graded results
      Object.entries(rp).forEach(([pickKey,pickVal])=>{
        const res=getPickResult(allResults,r.id,pickKey,pickVal);
        if(!res)return;
        if(res==="win")w++;else if(res==="push")p++;else if(res==="loss")l++;
      });
    });
    return{un,ud,pts:w+p*.5,w,l,p,rS,rW,full:rW===0||rS>=rW};
  }).sort((a,b)=>b.pts-a.pts||b.w-a.w);
  const n=st.length,pot=n*PAYOUT_INFO.buyIn;
  const remaining=pot-25;
  const payouts=[
    {place:"1ST",amt:remaining>0?Math.round(remaining*0.55):0,desc:"Pool champion",rank:"gold"},
    {place:"2ND",amt:remaining>0?Math.round(remaining*0.25):0,desc:"Runner up",rank:"silver"},
    {place:"3RD",amt:25,desc:"Money back (flat)",rank:"bronze"},
    {place:"LAST",amt:remaining>0?Math.round(remaining*0.20):0,desc:"Toilet bowl",rank:"last"},
  ];
  // Find the toilet bowl leader — last place among fully eligible players only
  const eligiblePlayers=st.filter(s=>s.full);
  const toiletBowlUser=eligiblePlayers.length>1?eligiblePlayers[eligiblePlayers.length-1].un:null;

  // Find current active round(s) for "games left" — rounds with tipped but ungraded games
  const activeRounds=ROUNDS.filter(r=>{
    if(!isRoundPartiallyLocked(r.id,games))return false;
    const rr=allResults[r.id]||{};
    const roundGames=(games||[]).filter(g=>g.roundId===r.id);
    if(roundGames.length===0)return false;
    return roundGames.some(g=>isGameTipped(g)&&(!rr[g.id]||(!rr[g.id].team1&&!rr[g.id].over)));
  });

  // Count pending picks per player for active rounds
  function getPending(un){
    let pending=0;
    const up=allPicks[un]||{};
    activeRounds.forEach(r=>{
      const rp=migratePicks(up[r.id]||{});
      Object.entries(rp).forEach(([pickKey,pickVal])=>{
        const res=getPickResult(allResults,r.id,pickKey,pickVal);
        if(!res)pending++;
      });
    });
    return pending;
  }

  return(<div className="an"><div className="st">STANDINGS</div>
    <div className="crd" style={{marginBottom:18}}>
      <div className="crd-t">PRIZE POOL <span className="bdg bdg-navy">{n} PLAYERS / ${pot}</span></div>
      <div className="pay-grid">
        {payouts.map((p,i)=> <div key={i} className={cn("pay-card",p.rank)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
            <div className="pay-place">{p.place}</div>
            <div className="pay-amt">${p.amt}</div>
          </div>
          <div className="pay-desc">{p.desc}</div>
        </div>)}
      </div>
      <div style={{marginTop:12,fontSize:9,color:"var(--t5)",fontFamily:"var(--fm)",letterSpacing:"1px",textAlign:"center"}}>
        3RD IS FLAT $25 &middot; REMAINING ${remaining>0?remaining:0} SPLITS 55/25/20 &middot; MUST SUBMIT 100% OF PICKS FOR LAST PLACE
      </div>
    </div>
    <div className="crd"><div className="crd-t">LEADERBOARD</div>
      <div className="lr lh"><div>#</div><div>PLAYER</div><div style={{textAlign:"right"}}>PTS</div><div style={{textAlign:"right"}}>W-L-P</div><div style={{textAlign:"center"}}>LIVE</div></div>
      {st.length===0?<div className="ey"><p>No players registered yet.</p></div>:st.map((s,i)=>{
        const isFirst=i===0&&n>1;
        const isToilet=s.un===toiletBowlUser;
        const pending=getPending(s.un);
        return <div key={s.un} className={cn("lr",isFirst&&"top1",isToilet&&"topL")}>
          <div className={cn("lrk",isFirst&&"p1",isToilet&&"pL")}>{i+1}</div>
          <div className="lnm">{getUserDisplay(s.ud)}{!s.full&&s.rW>0?<span style={{fontFamily:"var(--fm)",fontSize:8,color:"var(--red)",marginLeft:4}}>INELIGIBLE</span>:""}</div>
          <div className="lpt">{s.pts}</div><div className="lrc">{s.w}-{s.l}-{s.p}</div>
          <div className="lst" style={{fontFamily:"var(--fm)",fontSize:10,color:pending>0?"var(--navy)":"var(--t5)",fontWeight:pending>0?700:400}}>{pending>0?pending:"—"}</div>
        </div>})}
    </div>
    <div style={{marginTop:8,fontSize:9,color:"var(--t5)",fontFamily:"var(--fm)",textAlign:"center",lineHeight:1.8}}>
      LIVE = Picks pending results &middot; Tiebreaker: most wins &middot; INELIGIBLE = missed a round (no last place payout)
    </div>
  </div>);
}

// ─── Trash Talk ──────────────────────────────────────────────────────────────
function TrashTalk({user,userData}){
  const[msgs,setMsgs]=useState([]);const[val,setVal]=useState("");const[busy,setBusy]=useState(true);const btm=useRef(null);
  const load=useCallback(async()=>{setMsgs((await S.getShared("pool:chat"))||[]);setBusy(false)},[]);
  useEffect(()=>{load();const i=setInterval(load,15000);return()=>clearInterval(i)},[load]);
  useEffect(()=>{btm.current?.scrollIntoView({behavior:"smooth"})},[msgs]);
  const send=async()=>{const v=val.trim();if(!v||v.length>500)return;const m=(await S.getShared("pool:chat"))||[];m.push({user,displayName:getUserDisplay(userData),text:v,time:Date.now()});if(m.length>200)m.splice(0,m.length-200);await S.setShared("pool:chat",m);setVal("");setMsgs(m)};
  return(<div className="an"><div className="st">TRASH TALK</div><div className="cw"><div className="cf-feed">
    {busy?<div className="ey ld">Loading...</div>:msgs.length===0?<div className="ey"><p>No messages yet. Be the first to talk trash.</p></div>:
    msgs.map((m,i)=><div key={i} className={cn("cb",m.user===user&&"me")}><div className="cbu">{m.displayName||m.user}</div><div className="cbt">{m.text}</div><div className="cbts">{new Date(m.time).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/Los_Angeles"})} PT</div></div>)}
    <div ref={btm}/></div><div className="ci">
      <input className="inp" placeholder="Talk trash..." value={val} onChange={e=>setVal(e.target.value.slice(0,500))} onKeyDown={e=>e.key==="Enter"&&send()} maxLength={500}/>
      {val.length>400&&<span className="char-count">{500-val.length}</span>}
      <button className="btn btn-navy btn-sm" onClick={send} disabled={!val.trim()}>SEND</button>
    </div></div></div>);
}

// ─── History ─────────────────────────────────────────────────────────────────
function History({user,games,userPicks,allResults}){
  return (<div className="an"><div className="st">MY PICK HISTORY</div>
    {ROUNDS.map(round=>{
      const picks=migratePicks((userPicks||{})[round.id]||{});const rg=(games||[]).filter(g=>g.roundId===round.id);
      const roundLocked=isRoundFullyLocked(round.id,games),hasGames=rg.length>0,pc=countPicks(picks),hasPicks=pc>0;
      const missed=roundLocked&&hasGames&&!hasPicks;
      const incomplete=roundLocked&&hasGames&&hasPicks&&pc<round.requiredPicks;
      if(!roundLocked&&!hasPicks) return null;
      let rw=0,rl=0,rp=0;Object.entries(picks).forEach(([pickKey,pickVal])=>{const r=getPickResult(allResults,round.id,pickKey,pickVal);if(r==="win")rw++;else if(r==="loss")rl++;else if(r==="push")rp++});
      return <div key={round.id} className="crd" style={{marginBottom:14}}>
        <div className="crd-t">{round.name}
          {(rw+rl+rp>0)&&<span className="bdg bdg-g">{rw}-{rl}-{rp}</span>}
          {missed&&<span className="bdg bdg-r">MISSED</span>}
          {incomplete&&<span className="bdg bdg-y">INCOMPLETE ({pc}/{round.requiredPicks})</span>}
        </div>
        {missed?<div style={{color:"var(--red)",fontSize:12,fontFamily:"var(--fm)"}}>No picks submitted — all games tipped without entries.</div>:
        Object.entries(picks).map(([pickKey,pickVal])=>{const gid=pickGameId(pickKey);const gm=rg.find(g=>g.id===gid);const st=getPickResult(allResults,round.id,pickKey,pickVal)||"pending";
        const pl=pickVal==="team1"?`${gm?.team1||"?"} ${gm?.spread||"PK"}`:pickVal==="team2"?`${gm?.team2||"?"} ${spread2(gm?.spread)}`:pickVal==="over"?`Over ${gm?.total||""}`:`Under ${gm?.total||""}`;
        const typeLabel=pickType(pickKey)==="ats"?"ATS":"O/U";
        return <div key={pickKey} className="hi"><div><div style={{fontFamily:"var(--fm)",fontSize:9,color:"var(--t5)"}}>{gm?`${gm.team1} vs ${gm.team2}`:gid} <span style={{color:"var(--navy)"}}>{typeLabel}</span></div>
        <div style={{fontSize:13,marginTop:3,display:"flex",alignItems:"center",gap:7}}><Logo name={pickVal==="team1"?gm?.team1:pickVal==="team2"?gm?.team2:gm?.team1} size={18}/>{pl}</div></div>
        <span className={cn("rb",st==="win"?"rw":st==="loss"?"rl":st==="push"?"rp":"rq")}>{st==="win"?"WIN":st==="loss"?"LOSS":st==="push"?"PUSH":"PENDING"}</span></div>})}
      </div>}).filter(Boolean)}
    {ROUNDS.every(r=>!isRoundFullyLocked(r.id,games))&&Object.values(userPicks||{}).every(r=>!Object.keys(r).length)&&<div className="ey"><p>No picks yet. Head to Make Picks to get started.</p></div>}
  </div>);
}

// ─── Commissioner ────────────────────────────────────────────────────────────
function Commish({games,setGames,allResults,setAllResults,allPicks,setAllPicks,users,setUsers,showToast,loadData}){
  const[sr,setSr]=useState(ROUNDS[0].id);const[subTab,setSubTab]=useState("games");
  const[f,sF]=useState({team1:"",team2:"",seed1:"",seed2:"",spread:"",total:"",tipTime:""});
  const[editUser,setEditUser]=useState(null);const[editRound,setEditRound]=useState(ROUNDS[0].id);
  const[saving,setSaving]=useState(false);
  const rg=(games||[]).filter(g=>g.roundId===sr);const res=allResults[sr]||{};
  const players=Object.entries(users).filter(([u])=>u!==COMMISSIONER_USER);

  const add=async()=>{if(!f.team1||!f.team2||saving)return;
    setSaving(true);
    const fresh=(await S.getShared("pool:games"))||[];
    const fields=Object.fromEntries(Object.entries(f).map(([k,v])=>[k,typeof v==="string"?v.trim():v]));
    // Convert tipTime from datetime-local to ISO string
    if(fields.tipTime){fields.tipTime=new Date(fields.tipTime).toISOString()}
    const g={id:`g_${Date.now()}`,roundId:sr,...fields};
    const up=[...fresh,g];
    await S.setShared("pool:games",up);
    setGames(up);
    sF({team1:"",team2:"",seed1:"",seed2:"",spread:"",total:"",tipTime:""});
    setSaving(false);
    showToast("Game added")};
  const rm=async id=>{setSaving(true);
    const fresh=(await S.getShared("pool:games"))||[];
    const up=fresh.filter(g=>g.id!==id);
    await S.setShared("pool:games",up);
    setGames(up);setSaving(false);showToast("Game removed")};
  const grade=async(gid,key,val)=>{
    const freshResults=(await S.getShared("pool:results"))||{};
    const rr={...(freshResults[sr]||{})};if(!rr[gid])rr[gid]={};
    if(!val||val===""){
      // Clearing the grade — remove both sides
      if(key==="team1"){delete rr[gid]["team1"];delete rr[gid]["team2"]}
      else if(key==="team2"){delete rr[gid]["team1"];delete rr[gid]["team2"]}
      else if(key==="over"){delete rr[gid]["over"];delete rr[gid]["under"]}
      else if(key==="under"){delete rr[gid]["over"];delete rr[gid]["under"]}
      // If game has no results left, clean it up
      if(Object.keys(rr[gid]).length===0)delete rr[gid];
    }else{
      rr[gid][key]=val;
      if(key==="team1")rr[gid]["team2"]=val==="win"?"loss":val==="loss"?"win":"push";
      else if(key==="team2")rr[gid]["team1"]=val==="win"?"loss":val==="loss"?"win":"push";
      else if(key==="over")rr[gid]["under"]=val==="win"?"loss":val==="loss"?"win":"push";
      else if(key==="under")rr[gid]["over"]=val==="win"?"loss":val==="loss"?"win":"push";
    }
    const up={...freshResults,[sr]:rr};
    await S.setShared("pool:results",up);
    setAllResults(up)};
  const removeUser=async un=>{
    const freshUsers=(await S.getShared("pool:users"))||{};
    delete freshUsers[un];
    await S.setShared("pool:users",freshUsers);
    setUsers(freshUsers);
    const ap={...allPicks};delete ap[un];setAllPicks(ap);
    try{await S.setShared(`picks:${un}`,null)}catch{}
    showToast("User removed")};
  const editUserPick=async(un,rid,gid,val)=>{
    const freshPicks=(await S.getShared(`picks:${un}`))||{};
    const rp={...(freshPicks[rid]||{})};
    if(val==="")delete rp[gid];else rp[gid]=val;
    const updated={...freshPicks,[rid]:rp};
    await S.setShared(`picks:${un}`,updated);
    const ap={...allPicks,[un]:updated};setAllPicks(ap)};
  const clearUserPicks=async(un,rid)=>{
    const freshPicks=(await S.getShared(`picks:${un}`))||{};
    delete freshPicks[rid];
    await S.setShared(`picks:${un}`,freshPicks);
    const ap={...allPicks,[un]:freshPicks};setAllPicks(ap);
    showToast("Picks cleared")};

  const[confirmReset,setConfirmReset]=useState(false);
  const resetPool=async()=>{
    if(!confirmReset){setConfirmReset(true);return}
    for(const un of Object.keys(users)){if(un===COMMISSIONER_USER)continue;try{await S.setShared(`picks:${un}`,null)}catch{}}
    await S.setShared("pool:users",{});await S.setShared("pool:games",[]);await S.setShared("pool:results",{});await S.setShared("pool:chat",[]);
    setUsers({});setGames([]);setAllResults({});setAllPicks({});setConfirmReset(false);showToast("Pool reset — starting fresh");
  };

  const[editingLines,setEditingLines]=useState({});
  const updateGameLine=(gameId,field,value)=>{
    setEditingLines(prev=>({...prev,[`${gameId}_${field}`]:value}));
    // Update local display immediately
    const updated=games.map(g=>g.id===gameId?{...g,[field]:value}:g);
    setGames(updated);
  };
  const saveGameLine=async(gameId,field)=>{
    const key=`${gameId}_${field}`;
    const value=editingLines[key];
    if(value===undefined)return;
    setSaving(true);
    const fresh=(await S.getShared("pool:games"))||[];
    const idx=fresh.findIndex(g=>g.id===gameId);
    if(idx!==-1){fresh[idx]={...fresh[idx],[field]:value};await S.setShared("pool:games",fresh)}
    setEditingLines(prev=>{const n={...prev};delete n[key];return n});
    setSaving(false);
    showToast("Line updated")};

  const togglePaid=async(un)=>{
    const freshUsers=(await S.getShared("pool:users"))||{};
    if(!freshUsers[un])return;
    freshUsers[un].paid=!freshUsers[un].paid;
    await S.setShared("pool:users",freshUsers);
    setUsers(freshUsers);
    showToast(freshUsers[un].paid?"Marked as paid":"Marked as unpaid")};

  return (<div className="an"><div className="st">COMMISSIONER PANEL</div>
    <div className="stabs">
      <button className={cn("stab",subTab==="games"&&"on")} onClick={()=>setSubTab("games")}>GAMES</button>
      <button className={cn("stab",subTab==="users"&&"on")} onClick={()=>setSubTab("users")}>USERS</button>
      <button className={cn("stab",subTab==="editpicks"&&"on")} onClick={()=>setSubTab("editpicks")}>EDIT PICKS</button>
      <button className={cn("stab",subTab==="reset"&&"on")} onClick={()=>setSubTab("reset")} style={subTab==="reset"?{background:"var(--red)"}:{}}>RESET</button>
    </div>

    {subTab==="games"&&<>
      <div className="fld"><label className="lbl">Round</label><select className="inp" value={sr} onChange={e=>setSr(e.target.value)}>
        {ROUNDS.map(r=><option key={r.id} value={r.id}>{r.name} — {r.requiredPicks} picks</option>)}
      </select></div>
      <div className="lbar" style={{marginBottom:14}}><div style={{color:"var(--t3)",fontSize:13}}>First tip: {getFirstTipInRound(sr,games)?fmtTime(getFirstTipInRound(sr,games)):"TBD"}</div><div>{isRoundFullyLocked(sr,games)?<span className="bdg bdg-r">ALL TIPPED</span>:isRoundPartiallyLocked(sr,games)?<span className="bdg bdg-y">IN PROGRESS</span>:<span className="bdg bdg-g">OPEN</span>}</div></div>
      <div className="crd"><div className="crd-t">ADD GAME</div>
        <div className="cf2">
          <div><label className="lbl">Team 1</label><select className="inp" value={f.team1} onChange={e=>sF({...f,team1:e.target.value})}><option value="">Select team...</option>{TEAMS.filter(t=>t!==f.team2).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="lbl">Team 2</label><select className="inp" value={f.team2} onChange={e=>sF({...f,team2:e.target.value})}><option value="">Select team...</option>{TEAMS.filter(t=>t!==f.team1).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="lbl">Seed 1</label><input className="inp" placeholder="e.g. 1" value={f.seed1} onChange={e=>sF({...f,seed1:e.target.value})}/></div>
          <div><label className="lbl">Seed 2</label><input className="inp" placeholder="e.g. 16" value={f.seed2} onChange={e=>sF({...f,seed2:e.target.value})}/></div>
          <div><label className="lbl">Spread</label><input className="inp" placeholder="e.g. -3.5" value={f.spread} onChange={e=>sF({...f,spread:e.target.value})}/></div>
          <div><label className="lbl">Total (O/U)</label><input className="inp" placeholder="e.g. 142.5" value={f.total} onChange={e=>sF({...f,total:e.target.value})}/></div>
          <div className="full"><label className="lbl">Tip Time</label><input className="inp" type="datetime-local" value={f.tipTime} onChange={e=>sF({...f,tipTime:e.target.value})}/></div>
          {f.team1&&f.team2&&<div className="full" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",justifyContent:"center",background:"var(--bg3)",borderRadius:6}}>
            <Logo name={f.team1} size={32}/><span style={{fontWeight:800,fontSize:14,letterSpacing:1}}>{f.team1}</span>
            <span style={{color:"var(--t4)",fontFamily:"var(--fm)",fontSize:10}}>vs</span>
            <span style={{fontWeight:800,fontSize:14,letterSpacing:1}}>{f.team2}</span><Logo name={f.team2} size={32}/></div>}
          <button className="btn btn-navy full" onClick={add} disabled={!f.team1||!f.team2||saving}>{saving?"SAVING...":"ADD GAME"}</button>
        </div></div>
      <div className="crd">
        {(()=>{const graded=rg.filter(g=>res[g.id]&&(res[g.id].team1||res[g.id].over));const ungraded=rg.length-graded.length;
          return <div className="crd-t">GAMES & RESULTS <span className="bdg bdg-navy">{rg.length} GAMES</span>
            {rg.length>0&&graded.length===rg.length&&<span className="bdg bdg-g">ALL GRADED</span>}
            {rg.length>0&&ungraded>0&&graded.length>0&&<span className="bdg bdg-y">{ungraded} UNGRADED</span>}
            {rg.length>0&&graded.length===0&&<span className="bdg bdg-r">NOT GRADED</span>}
          </div>})()}
        {rg.length===0?<div className="ey"><p>No games added.</p></div>:rg.map(g=>{
          const isGraded=res[g.id]&&(res[g.id].team1||res[g.id].over);
          return <div key={g.id} style={{padding:"18px 22px",borderBottom:"2px solid var(--bdr)",background:isGraded?"rgba(22,163,74,0.04)":"transparent",margin:"0 -22px"}}>
            {/* Matchup header — big and clear */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {isGraded?<span style={{color:"var(--g)",fontWeight:800,fontSize:12,fontFamily:"var(--fm)",background:"var(--gg)",padding:"3px 8px",borderRadius:3}}>GRADED</span>
                :<span style={{color:"var(--red)",fontWeight:800,fontSize:12,fontFamily:"var(--fm)",background:"var(--rg)",padding:"3px 8px",borderRadius:3}}>PENDING</span>}
              </div>
              <button className="btn btn-d btn-sm" onClick={()=>rm(g.id)}>REMOVE</button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <Logo name={g.team1} size={32}/>
              <span style={{fontWeight:900,fontSize:18,letterSpacing:1,textTransform:"uppercase",color:"var(--navy)"}}>({g.seed1}) {g.team1}</span>
              <span style={{fontFamily:"var(--fm)",fontSize:12,color:"var(--t4)"}}>vs</span>
              <span style={{fontWeight:900,fontSize:18,letterSpacing:1,textTransform:"uppercase",color:"var(--navy)"}}>({g.seed2}) {g.team2}</span>
              <Logo name={g.team2} size={32}/>
            </div>
            {/* Editable spread, total, and tip time */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={{fontFamily:"var(--fm)",fontSize:10,fontWeight:700,color:"var(--navy)",letterSpacing:1.5,display:"block",marginBottom:4}}>SPREAD</label>
                <input className="inp" style={{fontSize:16,fontWeight:700,fontFamily:"var(--fm)",color:"var(--navy)",textAlign:"center",padding:"12px",background:"var(--bg3)"}}
                  value={g.spread||""} onChange={e=>updateGameLine(g.id,"spread",e.target.value)}
                  onBlur={()=>saveGameLine(g.id,"spread")}
                  placeholder="e.g. -3.5"/>
              </div>
              <div>
                <label style={{fontFamily:"var(--fm)",fontSize:10,fontWeight:700,color:"var(--navy)",letterSpacing:1.5,display:"block",marginBottom:4}}>TOTAL (O/U)</label>
                <input className="inp" style={{fontSize:16,fontWeight:700,fontFamily:"var(--fm)",color:"var(--navy)",textAlign:"center",padding:"12px",background:"var(--bg3)"}}
                  value={g.total||""} onChange={e=>updateGameLine(g.id,"total",e.target.value)}
                  onBlur={()=>saveGameLine(g.id,"total")}
                  placeholder="e.g. 142.5"/>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontFamily:"var(--fm)",fontSize:10,fontWeight:700,color:"var(--navy)",letterSpacing:1.5,display:"block",marginBottom:4}}>TIP TIME {isGameTipped(g)&&<span style={{color:"var(--red)",marginLeft:6}}>TIPPED</span>}{!isGameTipped(g)&&g.tipTime&&<span style={{color:"var(--g)",marginLeft:6}}>{countdownTo(g.tipTime).text}</span>}</label>
              <input className="inp" type="datetime-local" style={{fontSize:14,fontWeight:600,fontFamily:"var(--fm)",color:"var(--navy)",padding:"10px 12px"}}
                value={g.tipTime?(()=>{const d=new Date(g.tipTime);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`})():""} 
                onChange={e=>{const iso=e.target.value?new Date(e.target.value).toISOString():"";updateGameLine(g.id,"tipTime",iso)}}
                onBlur={()=>saveGameLine(g.id,"tipTime")}/>
            </div>
            {/* Grading */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[{k:"team1",l:`${g.team1} covers`},{k:"over",l:"Over hits"}].map(({k,l})=>
                <div key={k}>
                  <div style={{fontFamily:"var(--fm)",fontSize:11,fontWeight:600,color:"var(--t3)",marginBottom:4}}>{l}</div>
                  <select className="gs" style={{fontSize:13,padding:"8px 10px"}} value={res[g.id]?.[k]||""} onChange={e=>grade(g.id,k,e.target.value)}>
                    <option value="">— Not graded —</option><option value="win">WIN</option><option value="loss">LOSS</option><option value="push">PUSH</option></select>
                </div>)}
            </div>
          </div>})}
      </div>
    </>}

    {subTab==="users"&&<div className="crd">
      {(()=>{const paidCount=players.filter(([un,ud])=>ud.paid).length;const unpaidCount=players.length-paidCount;
        return <div className="crd-t">MANAGE USERS <span className="bdg bdg-navy">{players.length} PLAYERS</span>
          <span className="bdg bdg-g">{paidCount} PAID</span>
          {unpaidCount>0&&<span className="bdg bdg-r">{unpaidCount} UNPAID</span>}
        </div>})()}
      {players.length===0?<div className="ey"><p>No players registered yet.</p></div>:
      players.map(([un,ud])=>{const up=allPicks[un]||{};const sub=ROUNDS.filter(r=>countPicks(migratePicks(up[r.id]||{}))===r.requiredPicks).length;
        return <div key={un} className="um-row">
          <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",flex:"0 0 auto"}} onClick={()=>togglePaid(un)}>
            <div style={{width:22,height:22,borderRadius:4,border:ud.paid?"2px solid var(--g)":"2px solid var(--bdr2)",background:ud.paid?"var(--gg)":"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"var(--g)",fontWeight:800,transition:"all .15s"}}>
              {ud.paid?"\u2713":""}
            </div>
          </div>
          <div className="um-name">{getUserDisplay(ud)}</div>
          <div className="um-info">{ud.paid?<span style={{color:"var(--g)",fontWeight:700}}>PAID</span>:<span style={{color:"var(--red)",fontWeight:700}}>UNPAID</span>}</div>
          <div className="um-info">{sub}/{ROUNDS.length} rds</div>
          <button className="btn btn-d btn-sm" onClick={()=>removeUser(un)}>REMOVE</button>
        </div>})}
    </div>}

    {subTab==="editpicks"&&<>
      <div className="fld"><label className="lbl">Player</label><select className="inp" value={editUser||""} onChange={e=>setEditUser(e.target.value||null)}>
        <option value="">Select player...</option>{players.map(([un,ud])=><option key={un} value={un}>{getUserDisplay(ud)}</option>)}</select></div>
      {editUser?<>
        <div className="fld"><label className="lbl">Round</label><select className="inp" value={editRound} onChange={e=>setEditRound(e.target.value)}>
          {ROUNDS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        {(()=>{const userP=migratePicks((allPicks[editUser]||{})[editRound]||{});const roundGames=(games||[]).filter(g=>g.roundId===editRound);const round=ROUNDS.find(r=>r.id===editRound);
          return <div className="crd"><div className="crd-t">{getUserDisplay(users[editUser])} — {round.name}<span className="bdg bdg-navy">{countPicks(userP)}/{round.requiredPicks}</span>
            {countPicks(userP)>0&&<button className="btn btn-d btn-sm" style={{marginLeft:"auto"}} onClick={()=>clearUserPicks(editUser,editRound)}>CLEAR ALL</button>}</div>
            {roundGames.length===0?<div style={{color:"var(--t4)",fontSize:12,fontFamily:"var(--fm)"}}>No games in this round.</div>:
            roundGames.map(g=>{
              const atsKey=`${g.id}_ats`, ouKey=`${g.id}_ou`;
              const atsPick=userP[atsKey]||"", ouPick=userP[ouKey]||"";
              return <div key={g.id} style={{padding:"12px 0",borderBottom:"1px solid var(--bdr)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <Logo name={g.team1} size={22}/><span style={{fontWeight:700,fontSize:13,letterSpacing:.5,textTransform:"uppercase"}}>{g.team1} vs {g.team2}</span><Logo name={g.team2} size={22}/>
                <span style={{fontFamily:"var(--fm)",fontSize:10,color:"var(--t4)",marginLeft:"auto"}}>{g.spread||"PK"} / O/U {g.total||"–"}</span></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontFamily:"var(--fm)",fontSize:10,color:"var(--t3)",marginBottom:4,fontWeight:600}}>SPREAD</div>
                  <select className="inp" style={{fontSize:12}} value={atsPick} onChange={e=>editUserPick(editUser,editRound,atsKey,e.target.value)}>
                    <option value="">No pick</option><option value="team1">{g.team1} {g.spread||"PK"}</option><option value="team2">{g.team2} {spread2(g.spread)}</option></select>
                </div>
                <div>
                  <div style={{fontFamily:"var(--fm)",fontSize:10,color:"var(--t3)",marginBottom:4,fontWeight:600}}>TOTAL</div>
                  <select className="inp" style={{fontSize:12}} value={ouPick} onChange={e=>editUserPick(editUser,editRound,ouKey,e.target.value)}>
                    <option value="">No pick</option><option value="over">Over {g.total||""}</option><option value="under">Under {g.total||""}</option></select>
                </div>
              </div>
            </div>})}
          </div>})()}
      </>:<div className="ey"><p>Select a player above to view and edit their picks.</p></div>}
    </>}

    {subTab==="reset"&&<div className="crd">
      <div className="crd-t" style={{color:"var(--red)"}}>DANGER ZONE</div>
      <p style={{fontSize:13,color:"var(--t3)",lineHeight:1.6,marginBottom:16}}>
        This will permanently delete all users, picks, games, results, and chat messages.
        The pool will be completely empty. This cannot be undone.
      </p>
      {!confirmReset?
        <button className="btn btn-d" onClick={resetPool} style={{width:"100%",padding:"14px 24px",fontSize:13}}>
          RESET ENTIRE POOL
        </button>
      :<div>
        <div style={{background:"var(--rg)",border:"1px solid rgba(220,38,38,.2)",borderRadius:6,padding:14,marginBottom:12,fontSize:13,color:"var(--red)",fontWeight:700,textAlign:"center"}}>
          ARE YOU SURE? THIS DELETES EVERYTHING.
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-gh" onClick={()=>setConfirmReset(false)} style={{flex:1}}>CANCEL</button>
          <button className="btn btn-d" onClick={resetPool} style={{flex:1,background:"var(--red)",color:"#fff",border:"none"}}>YES, RESET NOW</button>
        </div>
      </div>}
    </div>}
  </div>);
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App(){
  const[user,setUser]=useState(null);const[userData,setUserData]=useState(null);const[tab,setTab]=useState("picks");
  const[games,setGames]=useState([]);const[userPicks,setUserPicks]=useState({});const[allPicks,setAllPicks]=useState({});
  const[allResults,setAllResults]=useState({});const[users,setUsers]=useState({});const[loaded,setLoaded]=useState(false);
  const[toast,setToast]=useState(null);
  const isCom=user===COMMISSIONER_USER;
  const showToast=msg=>setToast(msg);

  // Restore session on mount
  useEffect(()=>{const s=loadSession();if(s){setUser(s.user);setUserData(s.userData)}},[]);

  const handleLogout=()=>{clearSession();setUser(null);setUserData(null);setTab("picks");setLoaded(false)};

  const loadData=useCallback(async()=>{
    try{
      const[g,r,u]=await Promise.all([S.getShared("pool:games"),S.getShared("pool:results"),S.getShared("pool:users")]);
      setGames(g||[]);setAllResults(r||{});setUsers(u||{});
      if(u){
        const playerNames=Object.keys(u).filter(un=>un!==COMMISSIONER_USER);
        const pickResults=await Promise.all(playerNames.map(un=>S.getShared(`picks:${un}`)));
        const pe={};
        for(let i=0;i<playerNames.length;i++){
          if(pickResults[i]){
            const migrated=migrateAllRounds(pickResults[i]);
            pe[playerNames[i]]=migrated;
            // Save migrated picks back if they changed
            if(JSON.stringify(migrated)!==JSON.stringify(pickResults[i])){
              await S.setShared(`picks:${playerNames[i]}`,migrated);
            }
          }
        }
        setAllPicks(pe);if(user&&pe[user])setUserPicks(pe[user]);
      }
      setLoaded(true);
    }catch(e){console.error("Load error:",e);setLoaded(true)}
  },[user]);

  useEffect(()=>{if(user)loadData()},[user,loadData]);
  // Pause auto-refresh when user is actively making picks or commissioner is managing
  // This prevents background fetches from overwriting unsaved local state
  const pauseRefresh=(isCom&&tab==="commish")||(!isCom&&tab==="picks");
  useEffect(()=>{if(!user||pauseRefresh)return;const i=setInterval(loadData,30000);return()=>clearInterval(i)},[user,loadData,pauseRefresh]);

  if(!user)return <><style>{css}</style><Auth onLogin={(u,d)=>{setUser(u);setUserData(d)}}/></>;

  // Commissioner sees only Standings, Talk, and Commish. Not Picks/History/Board.
  const tabs=isCom?[
    {id:"standings",label:"STANDINGS"},{id:"board",label:"THE BOARD"},{id:"talk",label:"TALK"},{id:"commish",label:"COMMISH"},
  ]:[
    {id:"picks",label:"PICKS"},{id:"standings",label:"STANDINGS"},{id:"board",label:"THE BOARD"},
    {id:"history",label:"HISTORY"},{id:"talk",label:"TALK"},
  ];
  // If commissioner logs in and tab isn't available, default
  const activeTab=tabs.find(t=>t.id===tab)?tab:tabs[0].id;

  return <><style>{css}</style><div className="shell">
    <header className="hdr"><div className="brand">MADNESS <em>POOL</em><small>Against The Spread &middot; March 2026</small></div>
      <div className="hdr-r"><div className="hdr-u">{userData?getUserDisplay(userData):user}</div>
      <button className="btn-out" onClick={handleLogout}>OUT</button></div>
    </header>
    {!isCom&&<CountdownBar userPicks={userPicks} games={games}/>}
    <nav className="nav">{tabs.map(t=><button key={t.id} className={cn("nt",activeTab===t.id&&"on")} onClick={()=>setTab(t.id)}>{t.label}</button>)}</nav>
    <div className="main">{!loaded?<div className="ey ld">Loading pool data...</div>:<>
      {activeTab==="picks"&&!isCom&&<MakePicks user={user} games={games} userPicks={userPicks} setUserPicks={p=>{setUserPicks(p);setAllPicks({...allPicks,[user]:p})}} showToast={showToast}/>}
      {activeTab==="standings"&&<Standings allPicks={allPicks} allResults={allResults} users={users} games={games}/>}
      {activeTab==="board"&&<ViewPicks allPicks={allPicks} users={users} games={games} allResults={allResults}/>}
      {activeTab==="history"&&!isCom&&<History user={user} games={games} userPicks={userPicks} allResults={allResults}/>}
      {activeTab==="talk"&&<TrashTalk user={user} userData={userData}/>}
      {activeTab==="commish"&&isCom&&<Commish games={games} setGames={setGames} allResults={allResults} setAllResults={setAllResults} allPicks={allPicks} setAllPicks={setAllPicks} users={users} setUsers={setUsers} showToast={showToast} loadData={loadData}/>}
    </>}</div>
    {toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
  </div></>;
}
