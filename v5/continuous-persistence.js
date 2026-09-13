/** KOSIF V5 — browser persistence coordinator for D1-backed engagement snapshots. */
import { createEngagementPersistenceClient } from './engagement-persistence.js';
import { store, DEFAULT_GATEWAY, GATEWAY_KEY, resetWorkspace } from './continuous-store.js';

const SESSION_KEY='kosif:v5:remote-engagement';
const MAX_LOCAL_STATE_BYTES=1_800_000;
let timer=null, inFlight=false, pending=false, render=()=>{};

function gateway(){return localStorage.getItem(GATEWAY_KEY)||DEFAULT_GATEWAY}
function client(){return createEngagementPersistenceClient({baseUrl:gateway()})}
function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function saveSession(value){if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY)}
function setRemote(patch){store.remote={...store.remote,...patch};renderRemoteStatus()}
function workspaceState(){return{engagement:store.engagement,analysis:store.analysis,materiality:store.materiality,tbRisks:store.tbRisks,recipeId:store.recipePlan?.recipe?.id||'statement-of-financial-position',documentAnalyses:[...store.documentAnalyses.entries()]}}
function estimateBytes(value){return new TextEncoder().encode(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?{$kosifBigInt:v.toString()}:v)).byteLength}
function renderRemoteStatus(){const el=document.querySelector('#remotePersistenceState');if(!el)return;const r=store.remote;const label=r.mode==='remote'?`الحفظ السحابي: ${r.status||'جاهز'} · v${r.version??0}`:r.mode==='unavailable'?'الحفظ السحابي: غير متاح':'الحفظ: محلي';el.textContent=label;el.className=`gateway-state ${r.mode==='remote'?(r.status==='خطأ'?'fail':'ok'):'warn'}`}
function ensureUi(){const strip=document.querySelector('.gateway-strip');if(strip&&!document.querySelector('#remotePersistenceState'))strip.insertAdjacentHTML('beforeend','<span id="remotePersistenceState" class="gateway-state warn">الحفظ: محلي</span>')}

async function createRemote(){const created=await client().create({entity:store.engagement.entity,periodEnd:store.engagement.period,jurisdiction:store.engagement.jurisdiction,framework:store.engagement.framework,engagementType:store.engagement.engagementType,currency:store.engagement.currency});const s={gateway:gateway(),engagementId:created.engagementId,accessToken:created.accessToken};saveSession(s);store.engagement.id=created.engagementId;setRemote({mode:'remote',status:'جاهز',version:created.version||0,engagementId:s.engagementId,accessToken:s.accessToken});return s}

export async function hydrateRemote(){ensureUi();setRemote({mode:'local',status:'محلي',version:0});let health;try{health=await client().health()}catch{return setRemote({mode:'unavailable',status:'غير متصل'})}if(!health?.engagementPersistence?.configured)return setRemote({mode:'local',status:'D1 غير مهيأ'});let s=session();if(s?.gateway!==gateway()){saveSession(null);s=null}if(!s){try{s=await createRemote()}catch{return setRemote({mode:'unavailable',status:'تعذر الإنشاء'})}}try{const loaded=await client().load(s.engagementId,s.accessToken);if(loaded.state?.engagement){resetWorkspace(loaded.state);setRemote({mode:'remote',status:'محمّل',version:loaded.version,engagementId:s.engagementId,accessToken:s.accessToken});return true}setRemote({mode:'remote',status:'جاهز',version:loaded.version||0,engagementId:s.engagementId,accessToken:s.accessToken});return true}catch(e){if([401,403,404].includes(e.status)){saveSession(null);try{await createRemote();return true}catch{return setRemote({mode:'unavailable',status:'تعذر الإنشاء'})}}setRemote({mode:'unavailable',status:'خطأ'});return false}}

async function saveNow(){if(store.remote.mode!=='remote'||!store.remote.accessToken)return;if(inFlight){pending=true;return}const state=workspaceState(),bytes=estimateBytes(state);if(bytes>MAX_LOCAL_STATE_BYTES){setRemote({status:'الحالة كبيرة للحفظ'});return}inFlight=true;pending=false;setRemote({status:'جارٍ الحفظ'});try{const result=await client().save(store.remote.engagementId,store.remote.accessToken,state,store.remote.version||0);setRemote({status:'محفوظ',version:result.version})}catch(e){if(e.status===409&&Number.isInteger(e.body?.currentVersion)){setRemote({status:'تعارض',version:e.body.currentVersion})}else setRemote({status:'خطأ'})}finally{inFlight=false;if(pending)queueRemoteSave(80)}}
export function queueRemoteSave(delay=700){if(store.remote.mode!=='remote')return;clearTimeout(timer);timer=setTimeout(saveNow,delay)}
export function initPersistence({renderAll=()=>{}}={}){render=renderAll;ensureUi();return{hydrate:hydrateRemote,schedule:queueRemoteSave,saveNow,clear(){saveSession(null);setRemote({mode:'local',status:'محلي',version:0,engagementId:null,accessToken:null})}}}
