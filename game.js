import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, set, update, onValue, onDisconnect, remove, get, child } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/*
  SETUP: Replace the firebaseConfig values below with your own Firebase web app config.
  Enable Realtime Database and set rules for a public prototype (rules are in README).
*/
const firebaseConfig = {
  apiKey: "AIzaSyCBfl-3fkDbuz-3e2Ozwnc_8lCMf4LIu2o",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const $ = id => document.getElementById(id);
const lobby = $('lobby'), gameUI = $('game'), statusEl = $('status');
let app, db, roomCode='', playerId=crypto.randomUUID().slice(0,8), playerName='TrailRider';
let roomUnsub=null, playersUnsub=null, heartbeat=null, scene, camera, renderer, car, worldGroup;
let peers = new Map(), lastSend=0, speed=0, steer=0, throttle=0, braking=0, heading=0, worldZ=0, lastFrame=0;
let keyState={left:false,right:false,gas:false,brake:false};
const isConfigured = !firebaseConfig.apiKey.startsWith('PASTE_') && !firebaseConfig.projectId.startsWith('YOUR_');

function setStatus(msg){statusEl.textContent=msg}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function initFirebase(){
  if(!isConfigured) throw new Error('Firebase is not configured yet. Follow README setup steps.');
  app=initializeApp(firebaseConfig); db=getDatabase(app);
}
function safeName(){return ($('playerName').value.trim()||'TrailRider').slice(0,16)}
function randomCode(){return Math.random().toString(36).slice(2,8).toUpperCase()}
async function createRoom(){
  try{
    playerName=safeName(); initFirebase();
    let code=randomCode();
    for(let i=0;i<5;i++){
      const snap=await get(child(ref(db),`rooms/${code}`));
      if(!snap.exists()) break;
      code=randomCode();
    }
    roomCode=code;
    await set(ref(db,`rooms/${roomCode}/meta`),{createdAt:Date.now(),host:playerId});
    await enterRoom();
  }catch(e){setStatus(e.message||'Could not create room. Check Firebase setup and internet.')}
}
async function joinRoom(){
  try{
    playerName=safeName(); roomCode=$('roomCode').value.trim().toUpperCase();
    if(!/^[A-Z0-9]{4,6}$/.test(roomCode)){setStatus('Enter a valid 4–6 character room code.');return}
    initFirebase();
    const snap=await get(child(ref(db),`rooms/${roomCode}/meta`));
    if(!snap.exists()){setStatus('Room not found. Ask your friend for the current code.');return}
    await enterRoom();
  }catch(e){setStatus(e.message||'Could not join room. Check Firebase setup and internet.')}
}
async function enterRoom(){
  lobby.hidden=true;gameUI.hidden=false;
  $('roomLabel').textContent=roomCode;
  toast('Room '+roomCode+' • Share the code!');
  await set(ref(db,`rooms/${roomCode}/players/${playerId}`),{
    name:playerName,x:0,z:0,heading:0,speed:0,color:Math.floor(Math.random()*0xffffff),updatedAt:Date.now()
  });
  onDisconnect(ref(db,`rooms/${roomCode}/players/${playerId}`)).remove();
  playersUnsub=onValue(ref(db,`rooms/${roomCode}/players`),snap=>{
    const data=snap.val()||{}; peers.clear();
    for(const [id,p] of Object.entries(data)) if(id!==playerId) peers.set(id,p);
    $('playerCount').textContent=String(Object.keys(data).length);
    syncPeerCars(data);
  });
  setupThree();
  heartbeat=setInterval(()=>{if(db&&roomCode) update(ref(db,`rooms/${roomCode}/players/${playerId}`),{
    name:playerName,x:car?.position.x||0,z:worldZ,heading,speed:Math.round(speed*18),updatedAt:Date.now()
  }).catch(()=>{})},100);
}
function makeCar(color=0x789b55){
  const g=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color,roughness:.82});
  const dark=new THREE.MeshStandardMaterial({color:0x20251f,roughness:.9});
  const glass=new THREE.MeshStandardMaterial({color:0x314a4a,roughness:.4,metalness:.1});
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.45,.48,2.3),bodyMat);body.position.y=.78;g.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.12,.55,1.05),glass);cabin.position.set(0,1.22,-.12);g.add(cabin);
  const hood=new THREE.Mesh(new THREE.BoxGeometry(1.32,.2,.65),bodyMat);hood.position.set(0,.98,.78);g.add(hood);
  for(const x of [-.76,.76])for(const z of [-.72,.72]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.22,10),dark);
    wheel.rotation.z=Math.PI/2;wheel.position.set(x,.43,z);g.add(wheel);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.23,8),new THREE.MeshStandardMaterial({color:0x9aa092}));
    hub.rotation.z=Math.PI/2;hub.position.set(x*1.01,.43,z);g.add(hub);
  }
  const bumper=new THREE.Mesh(new THREE.BoxGeometry(1.5,.16,.15),dark);bumper.position.set(0,.53,1.18);g.add(bumper);
  return g;
}
function setupThree(){
  const canvas=$('scene');
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
  renderer.setSize(innerWidth,innerHeight,false);
  renderer.shadowMap.enabled=false;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x9bb9c1);scene.fog=new THREE.Fog(0x9bb9c1,32,115);
  camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,160);
  camera.position.set(0,5,8);
  scene.add(new THREE.HemisphereLight(0xdcecff,0x536043,2));
  const sun=new THREE.DirectionalLight(0xffedcf,2);sun.position.set(-5,12,5);scene.add(sun);
  worldGroup=new THREE.Group();scene.add(worldGroup);
  const groundMat=new THREE.MeshStandardMaterial({color:0x626b4a,roughness:1});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,180,1,1),groundMat);ground.rotation.x=-Math.PI/2;ground.position.set(0,-.06,-42);worldGroup.add(ground);
  // Low-poly track edges and rocks: no shadows, few draw calls.
  const track=new THREE.Mesh(new THREE.PlaneGeometry(9,180),new THREE.MeshStandardMaterial({color:0x88795e,roughness:1}));
  track.rotation.x=-Math.PI/2;track.position.set(0,0,-42);worldGroup.add(track);
  const rockMat=new THREE.MeshStandardMaterial({color:0x626457,roughness:1});
  for(let i=0;i<70;i++){
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.25+Math.random()*.65,0),rockMat);
    rock.position.set((Math.random()<.5?-1:1)*(5+Math.random()*7),.1,-Math.random()*125);
    rock.scale.y=.5+Math.random();worldGroup.add(rock);
  }
  // Sparse low-poly trees.
  const trunkMat=new THREE.MeshStandardMaterial({color:0x514331,roughness:1});
  const leafMat=new THREE.MeshStandardMaterial({color:0x304a31,roughness:1});
  for(let i=0;i<38;i++){
    const x=(Math.random()<.5?-1:1)*(7+Math.random()*10), z=-Math.random()*120;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12,.2,1.2,5),trunkMat);trunk.position.set(x,.6,z);worldGroup.add(trunk);
    const crown=new THREE.Mesh(new THREE.ConeGeometry(.9+Math.random()*.5,2.4,5),leafMat);crown.position.set(x,2,z);worldGroup.add(crown);
  }
  car=makeCar();scene.add(car);car.position.set(0,0,2);
  addControls();
  window.addEventListener('resize',resize);
  lastFrame=performance.now();requestAnimationFrame(frame);
}
function syncPeerCars(data){
  if(!scene)return;
  for(const [id,p] of Object.entries(data)){
    if(id===playerId)continue;
    let obj=peers.get(id)?._mesh;
    if(!obj){obj=makeCar(p.color||0xc0a66c);scene.add(obj);p._mesh=obj}
    obj.position.set(Number(p.x)||0,0,Number(p.z)||0);obj.rotation.y=Number(p.heading)||0;
    const label=p.name||'Friend';
    // Name is available in the player counter; avoid expensive sprite labels on low-end devices.
    peers.set(id,{...p,_mesh:obj,_label:label});
  }
  for(const [id,p] of peers){if(!data[id]&&p._mesh){scene.remove(p._mesh);peers.delete(id)}}
}
function resize(){if(!renderer)return;renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
function addControls(){
  const bind=(id,key)=>{const el=$(id);const down=e=>{e.preventDefault();keyState[key]=true};const up=e=>{e.preventDefault();keyState[key]=false};el.addEventListener('pointerdown',down);['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,up))};
  bind('leftBtn','left');bind('rightBtn','right');bind('gasBtn','gas');bind('brakeBtn','brake');
  $('leaveBtn').addEventListener('click',leaveRoom);
  window.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='a')keyState.left=true;if(e.key==='ArrowRight'||e.key==='d')keyState.right=true;if(e.key==='ArrowUp'||e.key==='w')keyState.gas=true;if(e.key==='ArrowDown'||e.key==='s'||e.key===' ')keyState.brake=true});
  window.addEventListener('keyup',e=>{if(e.key==='ArrowLeft'||e.key==='a')keyState.left=false;if(e.key==='ArrowRight'||e.key==='d')keyState.right=false;if(e.key==='ArrowUp'||e.key==='w')keyState.gas=false;if(e.key==='ArrowDown'||e.key==='s'||e.key===' ')keyState.brake=false});
}
function frame(now){
  requestAnimationFrame(frame);if(!renderer||!car)return;
  const dt=Math.min((now-lastFrame)/1000,.04);lastFrame=now;
  throttle=keyState.gas?1:0;braking=keyState.brake?1:0;steer=(keyState.left?-1:0)+(keyState.right?1:0);
  speed+=throttle*8*dt;speed-=braking*13*dt;speed-=(!throttle&&!braking?2.5*dt:0);speed=Math.max(0,Math.min(speed,13));
  heading+=steer*(.7+speed*.045)*dt;
  car.rotation.y=heading;
  car.position.x+=Math.sin(heading)*speed*dt;
  worldZ-=speed*dt;
  if(worldZ < -125)worldZ=0;
  car.position.z=2;
  // Camera follows the car and gives a third-person chase view.
  const target=new THREE.Vector3(car.position.x,1,car.position.z);
  const camTarget=new THREE.Vector3(car.position.x-Math.sin(heading)*6,4.1,car.position.z+7.5);
  camera.position.lerp(camTarget,1-Math.exp(-4*dt));camera.lookAt(target);
  worldGroup.position.z=worldZ%125;
  for(const [id,p] of peers){if(p._mesh){p._mesh.position.x+=(Number(p.x)-p._mesh.position.x)*.2;p._mesh.position.z+=(Number(p.z)-p._mesh.position.z)*.2;p._mesh.rotation.y=Number(p.heading)||0}}
  $('speedValue').textContent=String(Math.round(speed*18));
  renderer.render(scene,camera);
}
async function leaveRoom(){
  if(heartbeat)clearInterval(heartbeat);heartbeat=null;
  if(playersUnsub)playersUnsub();playersUnsub=null;
  if(db&&roomCode)await remove(ref(db,`rooms/${roomCode}/players/${playerId}`)).catch(()=>{});
  if(renderer){renderer.dispose();renderer=null}
  peers.clear();scene=null;car=null;roomCode='';speed=0;worldZ=0;heading=0;
  gameUI.hidden=true;lobby.hidden=false;setStatus('You left the room. Create or join another room.');
}
$('createBtn').addEventListener('click',createRoom);
$('joinBtn').addEventListener('click',joinRoom);
$('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
window.addEventListener('contextmenu',e=>e.preventDefault());
