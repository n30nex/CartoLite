import { LngLat, type GeoJSONSource } from 'maplibre-gl';
import type { LiveMap } from './map';
import type { PacketAnimator } from './packetAnimator';
import { DISPLAY_EVENT } from './displayPreferences';
import { FLIGHT_CLEARANCE, flightBeacons, flightDepth, flightDirection, moveFlight, offsetPosition, type FlightPose } from './terminalFlightMath';

const SOURCE = 'terminal-flight-nodes', LAYER = SOURCE;
const MOVE_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
const CONTROLLED = '#terrain-button,#terrain-shortcut,#hillshade-button,#buildings-button,#clusters-button,#camera-pitch,#terrain-height,#north-button,#reset-layers,#reset-appearance,.layer-combinations button';

export function terminalFlight(view: LiveMap, animator: PacketAnimator, callbacks: { changed(): void; refreshControls?(): void; pauseFollow?(): void }) {
  const map = view.map, canvas = map.getCanvas(), root = document.documentElement;
  const button = document.createElement('button'); button.id = 'terminal-flight-button'; button.type = 'button';
  button.className = 'control-button terminal-flight-toggle'; button.innerHTML = '<span aria-hidden="true">◇</span><span>Fly 3D</span>';
  button.setAttribute('aria-label','Toggle Terminal 3D flight'); button.setAttribute('aria-pressed','false'); button.setAttribute('aria-controls','terminal-flight-hud');
  button.title = 'Fly around the ASCII map in 3D'; button.disabled = true;
  document.querySelector('#terrain-shortcut')!.before(button);
  const hud = document.createElement('section'); hud.id = 'terminal-flight-hud'; hud.className = 'terminal-flight-hud glass'; hud.hidden = true; hud.setAttribute('aria-label','Terminal flight controls');
  hud.innerHTML = '<header><strong>FLY 3D</strong><button type="button" data-exit aria-label="Exit Terminal flight">Exit ×</button></header>'
    + '<p class="flight-state" role="status">Loading terrain…</p><output class="flight-position" aria-live="off"></output>'
    + '<label class="flight-speed">Speed <output>60 m/s</output><input type="range" min="10" max="300" step="10" value="60" aria-label="Flight speed"></label>'
    + '<div class="flight-pad">'+[['KeyA','←','Strafe left'],['KeyW','↑','Fly forward'],['KeyS','↓','Fly backward'],['KeyD','→','Strafe right'],['KeyQ','−','Fly down'],['KeyE','+','Fly up']].map(([key,icon,label])=>`<button type="button" data-move="${key}" aria-label="${label}" title="${label}">${icon}</button>`).join('')+'</div>'
    + '<p class="flight-help">Drag to look · WASD / arrows move · Q/E down/up · Shift boosts · Esc exits.</p>'
    + '<p class="flight-note">Terrain and buildings are enabled for flight. Node beacons mark locations, not antenna heights. Exit restores your map settings.</p>'
    + '<button type="button" data-retry hidden>Retry terrain</button>';
  map.getContainer().after(hud);
  const stateText = hud.querySelector<HTMLElement>('.flight-state')!, position = hud.querySelector<HTMLOutputElement>('.flight-position')!;
  const speedInput = hud.querySelector<HTMLInputElement>('input')!, speedOutput = hud.querySelector<HTMLOutputElement>('.flight-speed output')!;
  const keys = new Set<string>(), touches = new Map<number,string>();
  let active = false, loading = false, flat = false, recovering = false, disposed = false;
  let terrainWaitExpired = false, readyPending = false, restoreCamera = false;
  let terrainFailed = false;
  let pose: FlightPose = { lng: -80, lat: 43, altitude: 300, bearing: 0, pitch: 65 };
  let frame = 0, last = 0, loadingTimer = 0, uiAt = 0, nodeAt = 0, nodeRevision = -1, selected: string | null = null;
  let anchor: [number, number] = [-80,43], speed = 60, pendingLook: [number,number] = [0,0], dragging: {id:number;x:number;y:number;distance:number}|undefined, ignoreClick = false;
  let controlled: { element: HTMLButtonElement|HTMLInputElement; disabled: boolean; pressed: string|null }[] = [];
  const handlers = [map.dragPan,map.dragRotate,map.scrollZoom,map.boxZoom,map.doubleClickZoom,map.touchZoomRotate,map.touchPitch,map.keyboard];
  let enabled: boolean[] = [];
  let saved: { center: [number,number]; zoom:number; pitch:number; bearing:number; roll:number; elevation:number; clamped:boolean; maxPitch:number; maxZoom:number; bounds:ReturnType<typeof map.getMaxBounds> } | undefined;

  const blocked = () => Boolean(document.querySelector('dialog[open],#layers-panel:not([hidden]),#sound-panel:not([hidden]),#find-panel:not([hidden]),#view-panel:not([hidden])'));
  const eligible = (target: EventTarget|null) => target === canvas || (target instanceof Element && Boolean(target.closest('.flight-pad')));
  function clearInput() { keys.clear(); touches.clear(); pendingLook=[0,0]; dragging=undefined; last=0; if(frame)cancelAnimationFrame(frame);frame=0; }
  function request() { if(active&&!disposed&&!frame&&!document.hidden&&!recovering)frame=requestAnimationFrame(tick); }
  function ground(at: [number,number]): number | undefined {
    if(flat)return 0;
    const terrain=map.getTerrain();
    // MapLibre reports 0 for an unpopulated DEM. Require the public source
    // readiness/error signals as well, so missing tiles aren't a measured 0 m.
    if(!terrain||terrainFailed||!map.getSource(terrain.source)||!map.isSourceLoaded(terrain.source))return;
    const height=map.queryTerrainElevation(at);
    return typeof height==='number'&&Number.isFinite(height)?height:undefined;
  }
  function camera() {
    const f=flightDirection(pose), clearance=Math.max(60,pose.altitude-(ground([pose.lng,pose.lat])??pose.altitude-240));
    const distance=Math.max(150,Math.min(16000,clearance*2));
    const target=offsetPosition(pose.lng,pose.lat,f[0]*distance,f[1]*distance);
    map.jumpTo({...map.calculateCameraOptionsFromTo(new LngLat(pose.lng,pose.lat),pose.altitude,new LngLat(...target),pose.altitude+f[2]*distance),roll:0}, {terminalFlight:true});
    map.getContainer().dataset.flightFrames=String(Number(map.getContainer().dataset.flightFrames??0)+1);
    Object.assign(map.getContainer().dataset,{flightLng:pose.lng.toFixed(6),flightLat:pose.lat.toFixed(6),flightAltitude:pose.altitude.toFixed(1),flightPitch:pose.pitch.toFixed(1),flightBearing:pose.bearing.toFixed(1)});
  }
  function chrome() {
    if(!active)return;
    const obscured=blocked(); if(hud.hidden!==obscured)hud.hidden=obscured;
    if(obscured)clearInput();
    for(const {element} of controlled) {
      element.disabled=true;
      if(element.hasAttribute('aria-pressed'))element.setAttribute('aria-pressed',String(element.id!=='clusters-button'));
    }
    document.querySelector('#terrain-summary')!.textContent='Fly 3D';
    document.querySelector('#camera-status')!.textContent='Flight controls are active. Exit Fly 3D to restore the map camera.';
  }
  function nodeLayer(now=performance.now()) {
    if(!active||recovering||!map.getSource('nodes')||!map.getLayer('terminal-graphics'))return;
    if(!map.getSource(SOURCE)) {
      map.addSource(SOURCE,{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:18});nodeRevision=-1;selected=null;
    }
    if(!map.getLayer(LAYER))map.addLayer({id:LAYER,source:SOURCE,type:'fill-extrusion',paint:{
      'fill-extrusion-color':['case',['boolean',['feature-state','selected'],false],'#ff0060',['match',['get','role'],'repeater','#00ff80','companion','#0080ff','room_server','#ff00ff','#ff0000']],
      'fill-extrusion-height':36,'fill-extrusion-base':0,'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true,
    }},'terminal-graphics');
    if(nodeRevision!==view.getTerminalNodeRevision()&&now-nodeAt>250) {
      const data=flightBeacons(view.getTerminalNodeFeatures());nodeRevision=view.getTerminalNodeRevision();nodeAt=now;
      (map.getSource(SOURCE) as GeoJSONSource).setData(data);map.getContainer().dataset.flightBeacons=String(data.features.length);
    }
    const next=view.getSelectedNodeID();
    if(selected!==next) {
      if(selected)map.setFeatureState({source:SOURCE,id:selected},{selected:false});
      if(next)map.setFeatureState({source:SOURCE,id:next},{selected:true});
      selected=next;
    }
  }
  function ready(useFlat=false) {
    if(!active||!loading||recovering||document.hidden)return;
    const elevation=useFlat?0:ground(anchor);if(elevation===undefined)return;
    flat=useFlat;loading=false;clearTimeout(loadingTimer);loadingTimer=0;
    view.setTerminalFlight(flat?'flat':'terrain',focusNode);
    const behind=offsetPosition(anchor[0],anchor[1],-Math.sin(pose.bearing*Math.PI/180)*240*Math.sqrt(3),-Math.cos(pose.bearing*Math.PI/180)*240*Math.sqrt(3));
    const eyeGround=ground(behind);
    // Start above the actual target/eye terrain when available; a flat fallback
    // is explicitly identified and never silently swapped for a new elevation.
    pose={...pose,lng:behind[0],lat:behind[1],altitude:Math.max(elevation,eyeGround??elevation)+240,pitch:60};
    map.setCenterClampedToGround(false);map.setMaxPitch(175);map.setMaxZoom(20);map.setMaxBounds(null);
    animator.projection.setCameraClip(at=>{const z=ground(at);return z===undefined?-Infinity:flightDepth(pose,at,z);});
    stateText.textContent=flat?'Flat flight · terrain unavailable':'Drag to look. Focus the map to use flight keys.';
    hud.querySelector<HTMLButtonElement>('[data-retry]')!.hidden=!flat;
    hud.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(b=>b.disabled=false);
    camera();nodeLayer();chrome();callbacks.changed();canvas.focus({preventScroll:true});request();
    map.getContainer().dataset.flightState='flying';
  }
  function load(at: [number,number]) {
    clearInput();loading=true;flat=false;terrainFailed=false;terrainWaitExpired=false;anchor=at;
    map.getContainer().dataset.flightState='loading';
    stateText.textContent='Loading terrain…';hud.querySelector<HTMLButtonElement>('[data-retry]')!.hidden=true;
    hud.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(b=>b.disabled=true);
    animator.projection.setCameraClip();map.stop();map.setCenterClampedToGround(true);
    view.setTerminalFlight('terrain',focusNode);map.jumpTo({center:anchor,zoom:15.5,bearing:pose.bearing,pitch:50,roll:0},{terminalFlight:true});
    clearTimeout(loadingTimer);loadingTimer=window.setTimeout(()=>{terrainWaitExpired=true;ready(true);},8000);
    request();callbacks.changed();
  }
  function focusNode(node: {lng:number;lat:number}) { if(active)load([node.lng,node.lat]); }
  function enter() {
    if(active||disposed||button.disabled)return;
    callbacks.pauseFollow?.();document.querySelector<HTMLButtonElement>('#follow-close')?.click();map.stop();
    saved={center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),roll:map.getRoll(),elevation:map.getCenterElevation(),clamped:map.getCenterClampedToGround(),maxPitch:map.getMaxPitch(),maxZoom:map.getMaxZoom(),bounds:map.getMaxBounds()};
    enabled=handlers.map(h=>h.isEnabled());handlers.forEach(h=>h.disable());
    controlled=[...document.querySelectorAll<HTMLButtonElement|HTMLInputElement>(CONTROLLED)].map(element=>({element,disabled:element.disabled,pressed:element.getAttribute('aria-pressed')}));
    active=true;root.dataset.terminalFlight='true';button.setAttribute('aria-pressed','true');hud.hidden=false;
    pose.bearing=saved.bearing;
    const nodes=view.getTerminalNodeFeatures().features, chosen=nodes.find(n=>String(n.id)===view.getSelectedNodeID());
    let target=chosen?.geometry.coordinates, closest=Infinity;
    if(!target)for(const node of nodes){const p=map.project(node.geometry.coordinates as [number,number]);if(p.x<0||p.y<0||p.x>canvas.clientWidth||p.y>canvas.clientHeight)continue;const distance=Math.hypot(p.x-canvas.clientWidth/2,p.y-canvas.clientHeight/2);if(distance<closest){closest=distance;target=node.geometry.coordinates;}}
    load(target?[target[0]!,target[1]!]:saved.center);chrome();
  }
  function stop(removing=false) {
    if(!active)return;active=false;loading=false;clearInput();clearTimeout(loadingTimer);loadingTimer=0;
    animator.projection.setCameraClip();button.setAttribute('aria-pressed','false');hud.hidden=true;
    for(const {element,disabled,pressed} of controlled){element.disabled=disabled;if(pressed!==null)element.setAttribute('aria-pressed',pressed);}controlled=[];
    if(!removing&&saved){
      if(map.getLayer(LAYER))map.removeLayer(LAYER);if(map.getSource(SOURCE))map.removeSource(SOURCE);
      handlers.forEach((h,i)=>enabled[i]?h.enable():h.disable());
      view.setTerminalFlight(null);map.stop();map.setCenterClampedToGround(saved.clamped);map.setMaxPitch(saved.maxPitch);map.setMaxZoom(saved.maxZoom);map.setMaxBounds(saved.bounds??null);
      map.jumpTo(saved,{terminalFlight:true});
    }
    delete root.dataset.terminalFlight;
    if(!removing){callbacks.refreshControls?.();callbacks.changed();button.focus({preventScroll:true});}
    saved=undefined;map.getContainer().dataset.flightBeacons='0';map.getContainer().dataset.flightState='off';
  }
  function tick(now:number) {
    frame=0;if(!active||disposed||document.hidden||recovering)return;
    if(loading){ready();return;}
    if(blocked()){clearInput();return;}
    const delta=last?(now-last)/1000:1/60;last=now;
    pose.bearing=((pose.bearing+pendingLook[0]*.18)%360+360)%360;pose.pitch=Math.max(2,Math.min(175,pose.pitch+pendingLook[1]*.18));
    const looked=Boolean(pendingLook[0]||pendingLook[1]);pendingLook=[0,0];
    const held=(code:string)=>keys.has(code)||[...touches.values()].includes(code);
    const input={forward:Number(held('KeyW')||held('ArrowUp'))-Number(held('KeyS')||held('ArrowDown')),right:Number(held('KeyD')||held('ArrowRight'))-Number(held('KeyA')||held('ArrowLeft')),up:Number(held('KeyE'))-Number(held('KeyQ'))};
    const moving=Boolean(input.forward||input.right||input.up), boost=keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1;
    let blockedTerrain=false;
    if(moving){
      const next=moveFlight(pose,input,delta,speed*boost), floor=ground([next.lng,next.lat]);
      if(floor===undefined){blockedTerrain=true;}else pose={...next,altitude:Math.max(floor+FLIGHT_CLEARANCE,next.altitude)};
    }
    if(restoreCamera||looked||moving&&!blockedTerrain){restoreCamera=false;camera();}
    if(now-uiAt>250){uiAt=now;const floor=ground([pose.lng,pose.lat]);position.value=`${pose.lat.toFixed(4)}, ${pose.lng.toFixed(4)} · ${Math.round(pose.altitude)} m MSL${floor===undefined?'':` · ${Math.round(pose.altitude-floor)} m clearance`}`;const message=blockedTerrain?'Terrain loading here. Look toward the ground to continue.':flat?'Flat flight · terrain unavailable':'Drag to look · WASD move · Q/E height';if(stateText.textContent!==message)stateText.textContent=message;}
    nodeLayer(now);if(moving)request();else last=0;
  }
  const toggle=()=>active?stop():enter();button.addEventListener('click',toggle);
  const keydown=(event:KeyboardEvent)=>{
    if(!active)return;
    if(event.key==='Escape'&&!blocked()&&!view.getSelectedNodeID()){event.preventDefault();event.stopImmediatePropagation();stop();return;}
    if(loading||recovering||blocked()||event.ctrlKey||event.altKey||event.metaKey||!eligible(event.target)||!MOVE_KEYS.has(event.code))return;
    event.preventDefault();event.stopImmediatePropagation();keys.add(event.code);request();
  };
  const keyup=(event:KeyboardEvent)=>{keys.delete(event.code);if(active&&MOVE_KEYS.has(event.code)&&eligible(event.target))event.preventDefault();};
  const down=(event:PointerEvent)=>{if(!active||loading||recovering||blocked()||event.button!==0||dragging)return;canvas.focus({preventScroll:true});dragging={id:event.pointerId,x:event.clientX,y:event.clientY,distance:0};canvas.setPointerCapture(event.pointerId);event.preventDefault();};
  const move=(event:PointerEvent)=>{if(!active||dragging?.id!==event.pointerId)return;const x=event.clientX-dragging.x,y=event.clientY-dragging.y;dragging.distance+=Math.hypot(x,y);dragging.x=event.clientX;dragging.y=event.clientY;pendingLook[0]!+=x;pendingLook[1]!+=y;event.preventDefault();request();};
  const up=(event:PointerEvent)=>{if(dragging?.id===event.pointerId){ignoreClick=dragging.distance>4;dragging=undefined;}};
  const click=(event:MouseEvent)=>{if(active&&ignoreClick){event.preventDefault();event.stopImmediatePropagation();ignoreClick=false;}};
  const wheel=(event:WheelEvent)=>{if(!active||blocked())return;event.preventDefault();speed=Math.max(10,Math.min(300,Math.round(speed*(event.deltaY<0?1.2:.8)/10)*10));speedInput.value=String(speed);speedOutput.value=`${speed} m/s`;};
  const speedChanged=()=>{speed=Number(speedInput.value);speedOutput.value=`${speed} m/s`;};speedInput.addEventListener('input',speedChanged);
  const focusChanged=(event:FocusEvent)=>{if(active&&!eligible(event.target))clearInput();};
  const visibility=()=>{clearInput();if(!document.hidden&&active){if(loading)ready(terrainWaitExpired);else request();}};
  const lost=()=>{recovering=true;clearInput();if(active)stateText.textContent='Graphics paused. Waiting for recovery…';};
  const terrainError=(event:unknown)=>{const e=event as {sourceId?:string;error?:{message?:string;url?:string}};if((typeof e.sourceId==='string'&&e.sourceId===map.getTerrain()?.source)||/mapterhorn/i.test(`${e.error?.message??''} ${e.error?.url??''}`)){terrainFailed=true;if(active&&!loading){clearInput();stateText.textContent='Terrain unavailable here. Retry terrain or exit flight.';hud.querySelector<HTMLButtonElement>('[data-retry]')!.hidden=false;}}};
  const render=()=>{if(disposed)return;button.disabled=!root.hasAttribute('data-terminal')||!map.getLayer('nodes');if(!active)return;if(recovering&&map.getContainer().dataset.graphicsRecovering==='false'){recovering=false;nodeRevision=-1;restoreCamera=true;request();}if(loading&&!readyPending){readyPending=true;queueMicrotask(()=>{readyPending=false;ready(terrainWaitExpired);});}nodeLayer();};
  const idle=()=>{render();if(active&&loading)ready();};
  const appearance=()=>{queueMicrotask(chrome);};
  const leaveForCamera=()=>{if(active)stop();};
  const close=()=>stop();hud.querySelector('[data-exit]')!.addEventListener('click',close);
  const retry=()=>load([pose.lng,pose.lat]);hud.querySelector('[data-retry]')!.addEventListener('click',retry);
  const pads=[...hud.querySelectorAll<HTMLButtonElement>('[data-move]')];
  const padDown=(event:PointerEvent)=>{if(!active||loading||recovering||blocked())return;const target=event.currentTarget as HTMLButtonElement;event.preventDefault();target.setPointerCapture(event.pointerId);touches.set(event.pointerId,target.dataset.move!);request();};
  const padUp=(event:PointerEvent)=>touches.delete(event.pointerId);
  for(const pad of pads){pad.addEventListener('pointerdown',padDown);pad.addEventListener('lostpointercapture',padUp);pad.addEventListener('pointercancel',padUp);}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('lostpointercapture',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('click',click,true);canvas.addEventListener('wheel',wheel,{passive:false});
  document.addEventListener('keydown',keydown,true);document.addEventListener('keyup',keyup,true);document.addEventListener('focusin',focusChanged);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',clearInput);window.addEventListener(DISPLAY_EVENT,appearance);
  for(const id of ['reset-button','follow-button'])document.getElementById(id)?.addEventListener('click',leaveForCamera,true);
  map.on('render',render);map.on('idle',idle);map.on('webglcontextlost',lost);map.on('error',terrainError);
  const observer=new MutationObserver(chrome);observer.observe(document.getElementById('app')!,{subtree:true,attributes:true,attributeFilter:['hidden','open']});
  render();
  return { get active(){return active;}, stop:()=>stop(), refresh:render, destroy(){
    if(disposed)return;stop(true);disposed=true;clearInput();clearTimeout(loadingTimer);observer.disconnect();
    map.off('render',render);map.off('idle',idle);map.off('webglcontextlost',lost);map.off('error',terrainError);
    document.removeEventListener('keydown',keydown,true);document.removeEventListener('keyup',keyup,true);document.removeEventListener('focusin',focusChanged);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',clearInput);window.removeEventListener(DISPLAY_EVENT,appearance);
    for(const id of ['reset-button','follow-button'])document.getElementById(id)?.removeEventListener('click',leaveForCamera,true);
    canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('lostpointercapture',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('click',click,true);canvas.removeEventListener('wheel',wheel);
    button.remove();hud.remove();
  }};
}
