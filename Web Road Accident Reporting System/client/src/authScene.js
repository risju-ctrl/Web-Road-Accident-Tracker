/* eslint-disable */
// 3D background for the sign-in / sign-up screens: road network, a simulated
// collision, a response vehicle following the route, and incident pins.
// Ported from the Road Accident Tracker sign-in design.
// Vehicle positions are simulated; they are not GPS data.
//
// Uses three@0.128.0 (pinned in package.json): the lighting and shader patches
// below were tuned against that release and look different on newer ones.
import * as THREE from 'three';

/**
 * @param {{host: HTMLElement, label: HTMLElement, isLight: boolean}} opts
 *   host  - the element the canvas is inserted into (the visual panel)
 *   label - the "Sample incident" caption that follows the pin
 * @returns {{setTheme(isLight: boolean, redraw?: boolean): void, destroy(): void}}
 */
export function createAuthScene({ host, label, isLight }) {

  var cv=document.createElement('canvas'),vis=host,api={setTheme:function(){},destroy:function(){}};
  cv.className='lg-art lg-fade';cv.setAttribute('aria-hidden','true');vis.insertBefore(cv,vis.firstChild);
  function fallback(){vis.classList.add('lg-no3d')}
  var isLt=!!isLight,T=THREE,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,narrow=matchMedia('(max-width:900px)'),R;
  try{R=new T.WebGLRenderer({canvas:cv,antialias:true,alpha:true})}catch(e){fallback();cv.remove();return api}
  R.setPixelRatio(Math.min(devicePixelRatio||1,narrow.matches?1.5:1.75));

  var disp=[];function G(o){disp.push(o);return o}
  var sc=new T.Scene(),fog=new T.Fog(0x121212,430,1080),gm;sc.fog=fog;
  var cam=new T.PerspectiveCamera(36,1,10,3000),tgt=new T.Vector3(20,0,-10);
  var amb=new T.AmbientLight(0x9a968a,.62);sc.add(amb);
  var d1=new T.DirectionalLight(0xE9DDAA,.95);d1.position.set(-300,420,200);sc.add(d1);
  var d2=new T.DirectionalLight(0xC9A45C,.3);d2.position.set(300,200,-300);sc.add(d2);
  var carLight=new T.PointLight(0x4F80C8,0,95,1.5);sc.add(carLight);
  var W=new T.Group();W.rotation.y=-.55;sc.add(W);
  var N=18,C=52,o=N/2,seed=7,RW=11,SW=16,SPAN=N*C;
  function rnd(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646}
  function sx(i){return (i-o)*C}
  function ease(x){return 1-Math.pow(1-x,3)}
  function prog(t,a,b){return Math.min(1,Math.max(0,(t-a)/(b-a)))}

  var ground=new T.Mesh(G(new T.PlaneGeometry(3200,3200)),(gm=G(new T.MeshBasicMaterial({color:0x171715}))));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.5;W.add(ground);

  /* ---- roads: one surface + one kerb strip per street line, all on the existing grid ---- */
  var pg=G(new T.PlaneGeometry(1,1));pg.rotateX(-Math.PI/2);
  var nR=(N+1)*2,roads=new T.InstancedMesh(pg,G(new T.MeshBasicMaterial({color:0xffffff})),nR),walks=new T.InstancedMesh(pg,G(new T.MeshBasicMaterial({color:0xffffff})),nR),rd=[],ob=new T.Object3D(),i,j;
  for(i=0;i<=N;i++)for(var k=0;k<2;k++){            /* k0: street running along z, k1: running along x */
    var c=sx(i),id=i*2+k;
    ob.position.set(k?0:c,k?.05:.06,k?c:0);ob.scale.set(k?SPAN:RW,1,k?RW:SPAN);ob.updateMatrix();roads.setMatrixAt(id,ob.matrix);
    ob.position.y=k?.02:.03;ob.scale.set(k?SPAN:SW,1,k?SW:SPAN);ob.updateMatrix();walks.setMatrixAt(id,ob.matrix);
    rd.push({id:id,d:Math.abs(c)});
  }
  W.add(walks);W.add(roads);
  var gcol=new T.Color(0x171715),rcol=new T.Color(0x211f1c),scol=new T.Color(0x34342f),col=new T.Color();

  /* lane dashes, kept clear of intersections */
  var dp=[];
  for(i=0;i<=N;i++)for(var v=-SPAN/2+11;v<SPAN/2-5;v+=14){
    var r=((v%C)+C)%C;if(r<9||r>C-9)continue;dp.push(sx(i),v,0,v,sx(i),1);
  }
  var dashes=new T.InstancedMesh(G(pg.clone()),G(new T.MeshBasicMaterial({color:0xC9A45C,transparent:true,opacity:0,depthWrite:false,fog:true})),dp.length/3);
  for(i=0;i<dp.length/3;i++){var q=dp[i*3+2];ob.position.set(dp[i*3],.085,dp[i*3+1]);ob.scale.set(q?5:.7,1,q?.7:5);ob.updateMatrix();dashes.setMatrixAt(i,ob.matrix)}
  /* note: for q=1 (street along x) the pair is (z,x) -> position(x=v, z=sx) */
  W.add(dashes);

  /* ---- where vehicles travel (buildings beside these stay low so the cars stay visible) ---- */
  var CORR=[[[104,364],[104,156],[0,156],[0,0],[52,0]],[[-98,0],[52,0]],[[52,-150],[52,0]],[[156,150],[156,0],[84,0]]];
  var NL=[[[-364,156],[-208,156],[-208,312],[-364,312]],[[104,-156],[-156,-156],[-156,-260],[104,-260]],[[260,-52],[364,-52],[364,156],[260,156]],[[-208,104],[-208,0],[-312,0],[-312,104]]];
  function segD(px,pz,a,b){var dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((px-a[0])*dx+(pz-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(px-a[0]-u*dx,pz-a[1]-u*dz)}
  function nearPoly(px,pz,L,closed){var n=closed?L.length:L.length-1;for(var a=0;a<n;a++)if(segD(px,pz,L[a],L[(a+1)%L.length])<40)return true;return false}
  function heightCap(px,pz){var a;for(a=0;a<CORR.length;a++)if(nearPoly(px,pz,CORR[a],false))return 12;for(a=0;a<NL.length;a++)if(nearPoly(px,pz,NL[a],true))return 20;return 999}

  /* ---- buildings (instanced): window grid, floor ledges, roof edge, setbacks, rooftop units ---- */
  var items=[],ZN={x0:0,x1:104,z0:-52,z1:52},pal=[0x1f1f1d,0x252523,0x2a2a28,0x31312e];
  for(i=0;i<N;i++)for(j=0;j<N;j++){
    var cx=(i+.5-o)*C,cz=(j+.5-o)*C;
    if(cx>ZN.x0&&cx<ZN.x1&&cz>ZN.z0&&cz<ZN.z1)continue;
    if(rnd()<.07)continue;
    var dd=Math.sqrt(cx*cx+cz*cz),h=6+rnd()*18;
    if(dd<300)h+=(1-dd/300)*80*Math.pow(rnd(),1.4);
    h=Math.min(h,heightCap(cx,cz));
    var w=C-18-rnd()*8,dpt=C-18-rnd()*8,px=cx+(rnd()-.5)*4,pz=cz+(rnd()-.5)*4,cc=pal[Math.min(3,Math.floor(h/24))];
    items.push({x:px,z:pz,w:w,d:dpt,h:h,dist:dd,c:cc,base:0});
    if(h>38){var th=h*.2+4;items.push({x:px,z:pz,w:w*.62,d:dpt*.62,h:th,dist:dd,c:cc,base:h});
      if(h>72)items.push({x:px,z:pz,w:1.4,d:1.4,h:14,dist:dd,c:0x4a4a44,base:h+th})}
    else if(rnd()<.4)items.push({x:px+(rnd()-.5)*w*.4,z:pz+(rnd()-.5)*dpt*.4,w:7+rnd()*5,d:7+rnd()*5,h:2.2+rnd()*2.4,dist:dd,c:0x3d3d38,base:h});
  }
  var box=G(new T.BoxGeometry(1,1,1));box.translate(0,.5,0);
  var bmat=G(new T.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0}));
  bmat.onBeforeCompile=function(sh){
    var vars='varying vec3 vLoc;varying vec3 vSc;varying vec3 vIn;varying vec3 vNo;';
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+vars)
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvLoc=position;vNo=normal;\n#ifdef USE_INSTANCING\nvSc=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));vIn=instanceMatrix[3].xyz;\n#else\nvSc=vec3(1.);vIn=vec3(0.);\n#endif');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\n'+vars+'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float vh=vLoc.y*vSc.y;
      if(abs(vNo.y)<.5){
        bool fx=abs(vNo.x)>.5;
        float u=fx?vLoc.z*vSc.z:vLoc.x*vSc.x;
        float hw=(fx?vSc.z:vSc.x)*.5;
        float side=fx?sign(vNo.x)*2.:sign(vNo.z);
        vec2 cell=vec2(floor(u/6.),floor(vh/5.));
        vec2 f=vec2(fract(u/6.),fract(vh/5.));
        float win=step(.2,f.x)*step(f.x,.8)*step(.3,f.y)*step(f.y,.78)*step(5.,vh)*step(vh,vSc.y-3.)*step(3.,hw-abs(u))*step(7.,vSc.y);
        float hh=h21(cell+vIn.xz*.37+vec2(side*7.3,vIn.y*.13));
        float lit=step(.84,hh);
        diffuseColor.rgb*=mix(.72,1.,smoothstep(0.,34.,vh));
        diffuseColor.rgb*=1.+.22*step(f.y,.07)*step(5.,vh);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.34,win);
        totalEmissiveRadiance+=win*lit*vec3(.79,.62,.34)*.5;
      } else if(vNo.y>.5){
        vec2 e=.5-abs(vLoc.xz);
        float ed=min(e.x*vSc.x,e.y*vSc.z);
        diffuseColor.rgb*=ed<1.4?1.4:.8;
      }`);
  };
  var inst=new T.InstancedMesh(box,bmat,items.length);
  items.forEach(function(it,n){col.setHex(it.c);inst.setColorAt(n,col)});
  W.add(inst);
  var dm=new T.Object3D();

  /* ---- paths: straight street segments joined by rounded corners ---- */
  var RC=12;
  function V3(p){return new T.Vector3(p[0],0,p[1])}
  function cn(a,b,c){
    var l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]);
    return {e:[b[0]-(b[0]-a[0])/l1*RC,b[1]-(b[1]-a[1])/l1*RC],x:[b[0]+(c[0]-b[0])/l2*RC,b[1]+(c[1]-b[1])/l2*RC]};
  }
  function openPath(P){
    var cp=new T.CurvePath(),cur=P[0];
    for(var k=1;k<P.length-1;k++){var q=cn(P[k-1],P[k],P[k+1]);cp.add(new T.LineCurve3(V3(cur),V3(q.e)));cp.add(new T.QuadraticBezierCurve3(V3(q.e),V3(P[k]),V3(q.x)));cur=q.x}
    cp.add(new T.LineCurve3(V3(cur),V3(P[P.length-1])));return cp;
  }
  function loopPath(P,k0){
    var n=P.length,cp=new T.CurvePath(),cur=cn(P[(k0-1+n)%n],P[k0],P[(k0+1)%n]).x;
    for(var m=1;m<=n;m++){var k=(k0+m)%n,q=cn(P[(k-1+n)%n],P[k],P[(k+1)%n]);
      cp.add(new T.LineCurve3(V3(cur),V3(q.e)));cp.add(new T.QuadraticBezierCurve3(V3(q.e),V3(P[k]),V3(q.x)));cur=q.x}
    return cp;
  }
  function track(path,closed){
    var n=720,P=path.getSpacedPoints(n),X=[],Z=[],TX=[],TZ=[],m=closed?n:n+1;
    for(var a=0;a<m;a++){
      var p0=P[closed?(a-1+n)%n:Math.max(0,a-1)],p1=P[closed?(a+1)%n:Math.min(n,a+1)],dx=p1.x-p0.x,dz=p1.z-p0.z,l=Math.hypot(dx,dz)||1;
      X.push(P[a].x);Z.push(P[a].z);TX.push(dx/l);TZ.push(dz/l);
    }
    return {L:path.getLength(),n:n,c:closed,X:X,Z:Z,TX:TX,TZ:TZ};
  }
  var pose={x:0,z:0,h:0};
  function at(tr,s){
    var u,a,f,b;
    if(tr.c){u=(((s%tr.L)+tr.L)%tr.L)/tr.L*tr.n;a=Math.floor(u);b=(a+1)%tr.n}
    else{u=Math.min(1,Math.max(0,s/tr.L))*tr.n;a=Math.min(tr.n-1,Math.floor(u));b=a+1}
    f=u-a;
    pose.x=tr.X[a]+(tr.X[b]-tr.X[a])*f;pose.z=tr.Z[a]+(tr.Z[b]-tr.Z[a])*f;
    pose.h=Math.atan2(-(tr.TZ[a]+(tr.TZ[b]-tr.TZ[a])*f),tr.TX[a]+(tr.TX[b]-tr.TX[a])*f);
  }

  /* ---- routes drawn as ribbons lying on the road ---- */
  function ribbon(path,wd,c,op,y){
    var n=260,P=path.getSpacedPoints(n),pos=new Float32Array((n+1)*6),ix=[];
    for(var a=0;a<=n;a++){
      var p0=P[Math.max(0,a-1)],p1=P[Math.min(n,a+1)],dx=p1.x-p0.x,dz=p1.z-p0.z,l=Math.hypot(dx,dz)||1,nx=-dz/l*wd/2,nz=dx/l*wd/2;
      pos.set([P[a].x+nx,y,P[a].z+nz,P[a].x-nx,y,P[a].z-nz],a*6);
      if(a<n){var s=a*2;ix.push(s,s+1,s+2,s+1,s+3,s+2)}
    }
    var g=G(new T.BufferGeometry());g.setAttribute('position',new T.BufferAttribute(pos,3));g.setIndex(ix);
    var m=new T.Mesh(g,G(new T.MeshBasicMaterial({color:c,transparent:op<1,opacity:op,side:T.DoubleSide,depthWrite:false,fog:false})));
    m.userData.n=ix.length;g.setDrawRange(0,0);m.renderOrder=2;W.add(m);return m;
  }
  function drawTo(m,p){m.geometry.setDrawRange(0,Math.floor(m.userData.n*p/3)*3)}
  var rp=[[104,364-RC],[104,156],[0,156],[0,0],[40,0]];           /* response route to the crash */
  var rpPath=openPath(rp),route=ribbon(rpPath,2.6,0x4F80C8,1,.24),halo=ribbon(rpPath,7,0x4F80C8,.14,.18);
  var ambP=openPath([[156,150],[156,0],[84,0]]),routeM=ribbon(ambP,2.6,0xC9544A,1,.24),haloM=ribbon(ambP,7,0xC9544A,.14,.18);
  var sec=ribbon(openPath([[-468,-52],[-260,-52],[-260,-104],[468,-104]]),1.6,0xA09D94,.4,.2);

  /* ---- incident zone ---- */
  function V(x,z){return new T.Vector3(x,1.4,z)}
  var sh=new T.Shape();sh.moveTo(ZN.x0,-ZN.z0);sh.lineTo(ZN.x1,-ZN.z0);sh.lineTo(ZN.x1,-ZN.z1);sh.lineTo(ZN.x0,-ZN.z1);sh.closePath();
  var zone=new T.Mesh(G(new T.ShapeGeometry(sh)),G(new T.MeshBasicMaterial({color:0xC9A45C,transparent:true,opacity:0,side:T.DoubleSide,fog:false,depthWrite:false})));
  zone.rotation.x=-Math.PI/2;zone.position.y=.7;W.add(zone);
  var zl=new T.LineLoop(G(new T.BufferGeometry().setFromPoints([V(0,-52),V(104,-52),V(104,52),V(0,52)])),G(new T.LineBasicMaterial({color:0xC9A45C,transparent:true,opacity:0,fog:false})));
  zl.position.y=-.6;W.add(zl);

  /* ---- pins: pin 0 is the sample incident (appears after the crash), the rest are other reports ---- */
  function tex(k){
    var c=document.createElement('canvas');c.width=96;c.height=120;var x=c.getContext('2d');
    var cl=k==='res'?(isLt?'#8A6420':'#E9DDAA'):k==='rep'?'#C9A45C':'#A09D94';
    x.beginPath();x.moveTo(48,116);x.bezierCurveTo(16,88,8,64,8,44);x.arc(48,44,40,Math.PI,0);x.bezierCurveTo(88,64,80,88,48,116);x.closePath();x.fillStyle=cl;x.fill();
    x.beginPath();x.arc(48,44,22,0,7);x.fillStyle='#121212';x.fill();x.fillStyle=cl;x.strokeStyle=cl;x.lineWidth=5;x.lineCap='round';x.lineJoin='round';
    if(k==='res'){x.beginPath();x.arc(48,44,9,0,7);x.fill()}
    else if(k==='rep'){x.fillRect(45,30,6,17);x.beginPath();x.arc(48,56,3.6,0,7);x.fill()}
    else{x.beginPath();x.moveTo(38,45);x.lineTo(45,52);x.lineTo(59,37);x.stroke()}
    return G(new T.CanvasTexture(c));
  }
  var tx={res:tex('res'),rep:tex('rep'),clr:tex('clr')},pins=[];
  [{x:52,z:0,k:'res',s:1.45}].forEach(function(q){
    var s=q.s||1,H=24*s+6,sp=new T.Sprite(G(new T.SpriteMaterial({map:tx[q.k],transparent:true,opacity:0,depthTest:false,fog:false})));
    sp.center.set(.5,0);sp.scale.set(30*s,37.5*s,1);sp.renderOrder=10;sp.position.set(q.x,H,q.z);W.add(sp);
    var ln=new T.Line(G(new T.BufferGeometry().setFromPoints([new T.Vector3(q.x,.8,q.z),new T.Vector3(q.x,H,q.z)])),G(new T.LineBasicMaterial({color:0xC9A45C,transparent:true,opacity:0,fog:false})));W.add(ln);
    var rg=new T.Mesh(G(new T.RingGeometry(5*s,6.6*s,40)),G(new T.MeshBasicMaterial({color:q.k==='clr'?0xA09D94:0xC9A45C,transparent:true,opacity:0,fog:false,side:T.DoubleSide})));
    rg.rotation.x=-Math.PI/2;rg.position.set(q.x,1.2,q.z);W.add(rg);
    pins.push({q:q,sp:sp,ln:ln,rg:rg,H:H});
  });
  function setPin(n,a,b){b=b===undefined?a:b;n.sp.material.opacity=b;n.sp.position.y=n.H+(1-a)*28;n.ln.material.opacity=.5*b;n.rg.material.opacity=.55*b}
  var pulse=new T.Mesh(G(new T.RingGeometry(9,10.6,48)),G(new T.MeshBasicMaterial({color:0xE9DDAA,transparent:true,opacity:0,fog:false,side:T.DoubleSide})));
  pulse.rotation.x=-Math.PI/2;pulse.position.set(50,1.4,0);W.add(pulse);

  /* ---- vehicles: low-poly, shared geometry ---- */
  var cgm=[G(new T.BoxGeometry(14,2.4,6.4)),G(new T.BoxGeometry(7,2.2,5.4)),G(new T.BoxGeometry(6.4,.4,5.4)),G(new T.CylinderGeometry(1.2,1.2,1.1,10)),G(new T.BoxGeometry(.4,.8,1.5))];
  cgm[3].rotateX(Math.PI/2);
  var glass=G(new T.MeshStandardMaterial({color:0x0e0e0d,roughness:.4,metalness:.2})),tyre=G(new T.MeshStandardMaterial({color:0x0b0b0a,roughness:1})),
      head=G(new T.MeshBasicMaterial({color:0xF2E8B8})),tail=G(new T.MeshBasicMaterial({color:0x8f4a42}));
  function makeCar(body,emis){
    var bm=G(new T.MeshStandardMaterial({color:body,roughness:.55,metalness:.25,emissive:emis||0,emissiveIntensity:emis?.3:0})),g=new T.Group(),m;
    m=new T.Mesh(cgm[0],bm);m.position.y=2.3;g.add(m);
    m=new T.Mesh(cgm[1],glass);m.position.set(-1.2,4.5,0);g.add(m);
    m=new T.Mesh(cgm[2],bm);m.position.set(-1.2,5.75,0);g.add(m);
    [[4.4,3],[4.4,-3],[-4.4,3],[-4.4,-3]].forEach(function(w){m=new T.Mesh(cgm[3],tyre);m.position.set(w[0],1.2,w[1]);g.add(m)});
    [[7.1,2.1,head],[7.1,-2.1,head],[-7.1,2.1,tail],[-7.1,-2.1,tail]].forEach(function(l){m=new T.Mesh(cgm[4],l[2]);m.position.set(l[0],2.5,l[1]);g.add(m)});
    g.rotation.order='YXZ';g.scale.setScalar(.01);g.visible=false;W.add(g);return g;
  }
  /* emergency vehicles: police car + ambulance, with a soft alternating light bar */
  var lbg=G(new T.BoxGeometry(1.6,.6,1.9));
  function lightBar(g,x,y){
    var ma=G(new T.MeshBasicMaterial({color:0x000000,fog:false})),mb=G(new T.MeshBasicMaterial({color:0x000000,fog:false})),m;
    m=new T.Mesh(lbg,ma);m.position.set(x,y,1.1);g.add(m);m=new T.Mesh(lbg,mb);m.position.set(x,y,-1.1);g.add(m);
    g.userData.L={a:ma,b:mb};
  }
  function makePolice(){
    var g=makeCar(0x1d2025,0),dp=G(new T.MeshStandardMaterial({color:0xe6e3da,roughness:.5})),m;
    [3.3,-3.3].forEach(function(z){m=new T.Mesh(G(new T.BoxGeometry(4.2,1.7,.14)),dp);m.position.set(.4,2.4,z);g.add(m)});
    lightBar(g,-1.2,6.2);return g;
  }
  function makeAmb(){
    var g=new T.Group(),bm=G(new T.MeshStandardMaterial({color:0xe8e6df,roughness:.5,metalness:.15})),rm=G(new T.MeshStandardMaterial({color:0xb5473f,roughness:.6})),m;
    m=new T.Mesh(G(new T.BoxGeometry(16,4.4,6.6)),bm);m.position.set(-1,3.4,0);g.add(m);
    m=new T.Mesh(G(new T.BoxGeometry(3.2,2.2,5.8)),glass);m.position.set(6.6,4.5,0);g.add(m);
    [3.36,-3.36].forEach(function(z){m=new T.Mesh(G(new T.BoxGeometry(14,.9,.12)),rm);m.position.set(-1,3.1,z);g.add(m)});
    [[5,3.1],[5,-3.1],[-5.5,3.1],[-5.5,-3.1]].forEach(function(w){m=new T.Mesh(cgm[3],tyre);m.position.set(w[0],1.2,w[1]);g.add(m)});
    [[7.1,2.2],[7.1,-2.2]].forEach(function(l){m=new T.Mesh(cgm[4],head);m.position.set(l[0],2.4,l[1]);g.add(m)});
    lightBar(g,6.2,6.0);
    g.rotation.order='YXZ';g.scale.setScalar(.01);g.visible=false;W.add(g);return g;
  }
  function siren(g,on){
    var L=g.userData.L,k=reduce?.6:(.5+.5*Math.sin(clk*9.4)),j=1-k,x=.2+.8*k,y=.2+.8*j;
    L.a.color.setRGB(.78*x*on,.2*x*on,.18*x*on);L.b.color.setRGB(.2*y*on,.4*y*on,.82*y*on);
  }
  /* quiet background traffic: closed loops that never cross each other or the incident */
  var cars=[];
  function addCar(P,body,v,frac,delay){var tr=track(loopPath(P,0),true);cars.push({g:makeCar(body,0),tr:tr,v:v,s0:frac*tr.L,sz:1.25,d:delay})}
  addCar(NL[0],0x6b6962,24,.1,2.8);addCar(NL[1],0x57554f,28,.45,3.1);addCar(NL[2],0x7a776c,22,.3,3.4);addCar(NL[3],0x4f4d48,26,.6,3.7);

  /* the scripted sample incident: two cars collide at the intersection, a response vehicle follows the gold route */
  var carA=makeCar(0x8a867a,0),carB=makeCar(0x5a5750,0),carR=makePolice(),carM=makeAmb();
  var trR=track(rpPath,false),sStop=trR.L-30,trM=track(openPath([[156,150],[156,0],[84,0]]),false);
  var glow=new T.Mesh(G(new T.CircleGeometry(15,32)),G(new T.MeshBasicMaterial({color:0x4F80C8,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,fog:false})));
  glow.rotation.x=-Math.PI/2;glow.position.y=.3;W.add(glow);
  var dg=G(new T.BoxGeometry(1.5,1.5,1.5)),dmA=G(new T.MeshStandardMaterial({color:0x3a3935,roughness:.8})),dmB=G(new T.MeshStandardMaterial({color:0xC9A45C,roughness:.5,emissive:0xC9A45C,emissiveIntensity:.35})),deb=[];
  for(i=0;i<9;i++){var an=i/9*Math.PI*2+.4,spd=18+(i%3)*9,dbm=new T.Mesh(dg,i%3?dmA:dmB);dbm.visible=false;W.add(dbm);deb.push({m:dbm,vx:Math.cos(an)*spd,vz:Math.sin(an)*spd,vy:22+(i%4)*7})}

  var D=0,lite=false,E0=2.4,PER=32,CT=3.4,clk=reduce?99:0,introT=99;
  function sm(x){return x*x*(3-2*x)}
  function cyc(){return reduce?20.5:(clk<E0?-1:(clk-E0)%PER)}
  function placeCars(t){
    for(var n=0;n<cars.length;n++){
      var c=cars[n],e=ease(prog(t,c.d,c.d+.9));
      c.g.visible=e>0&&!(lite&&n>1);
      if(!c.g.visible)continue;
      at(c.tr,c.s0+c.v*D);
      c.g.position.set(pose.x,.1,pose.z);c.g.rotation.y=pose.h;c.g.scale.setScalar(Math.max(.01,c.sz*e));
    }
  }

  /* ---- frame ---- */
  var pl=label,lv=new T.Vector3(),mult=1,S0=new T.Vector3(-120,640,800),F0=new T.Vector3(0,470,520),P=new T.Vector3();
  function intro(t){
    introT=t;
    var p=ease(prog(t,0,3.8));
    P.lerpVectors(S0,F0,p).multiplyScalar(mult);cam.position.copy(P);cam.lookAt(tgt);cam.updateMatrixWorld();
    items.forEach(function(it,n){
      var e=ease(prog(t,.1+it.dist/800,1.4+it.dist/800));
      dm.position.set(it.x,it.base*e,it.z);dm.scale.set(it.w,Math.max(.01,it.h*e),it.d);dm.updateMatrix();inst.setMatrixAt(n,dm.matrix);
    });
    inst.instanceMatrix.needsUpdate=true;
    rd.forEach(function(q){
      var e=ease(prog(t,.3+q.d/470*1.1,1.3+q.d/470*1.1));
      col.copy(gcol).lerp(rcol,e);roads.setColorAt(q.id,col);col.copy(gcol).lerp(scol,e);walks.setColorAt(q.id,col);
    });
    roads.instanceColor.needsUpdate=true;walks.instanceColor.needsUpdate=true;
    dashes.material.opacity=.3*ease(prog(t,1.8,3.2));
    drawTo(sec,ease(prog(t,1.2,3.0)));
    pins.forEach(function(n,k){if(k)setPin(n,ease(prog(t,n.q.d,n.q.d+.6)))});
  }
  function event(c){
    var fo=1-ease(prog(c,25,26.4)),q=ease(prog(c,CT,CT+.9)),p=prog(c,.3,CT),s;
    /* the two colliding cars */
    s=ease(prog(c,0,.7))*fo;carA.visible=s>.02;
    if(carA.visible){carA.position.set(-98+137.3*p-2.5*q,.1,2*q);carA.rotation.set(0,.42*q,0);carA.scale.setScalar(1.25*s)}
    carB.visible=carA.visible;
    if(carB.visible){carB.position.set(52+4*q,.1,-150+145.25*p-3*q);carB.rotation.set(.06*q,-Math.PI/2-.5*q,0);carB.scale.setScalar(1.25*s)}
    /* a few fragments thrown out at impact */
    var td=c-CT;
    deb.forEach(function(d){var on=td>0&&td<1.2&&fo>.05;d.m.visible=on;if(on){d.m.position.set(48+d.vx*td,Math.max(.4,4+d.vy*td-45*td*td),1+d.vz*td);d.m.scale.setScalar(Math.max(.01,1-td/1.2));d.m.rotation.set(td*6,td*4,0)}});
    var pr=prog(c,CT,CT+1.5);pulse.scale.setScalar(.5+pr*2.4);pulse.material.opacity=pr>0&&pr<1?.7*(1-pr)*fo:0;
    /* marker, zone and route appear after the crash */
    var a0=ease(prog(c,CT+.5,CT+1.1))*fo,bk=reduce?1:.3+.7*(.5+.5*Math.sin((c-CT-1.4)*7)),bl=1-(1-bk)*ease(prog(c,CT+1.3,CT+1.7));
    setPin(pins[0],a0,a0*bl);
    var zz=ease(prog(c,CT+.8,CT+1.6))*fo;zone.material.opacity=.1*zz;zl.material.opacity=.55*zz;
    var rr=ease(prog(c,4.6,7.6))*(1-ease(prog(c,25,26.6)));drawTo(route,rr);drawTo(halo,rr);
    var ra=ease(prog(c,6.2,9.2))*(1-ease(prog(c,25,26.6)));drawTo(routeM,ra);drawTo(haloM,ra);
    /* response vehicle */
    s=ease(prog(c,5,5.7))*fo;carR.visible=s>.02;
    at(trR,sStop*sm(prog(c,5.2,19.2)));
    if(carR.visible){carR.position.set(pose.x,.1,pose.z);carR.rotation.set(0,pose.h,0);carR.scale.setScalar(1.3*s)}
    siren(carR,s>.02?1:0);
    glow.position.set(pose.x,.3,pose.z);glow.material.opacity=.16*s;
    carLight.position.set(pose.x,12,pose.z);W.localToWorld(carLight.position);carLight.intensity=1.2*s;
    /* ambulance arrives from the east a little later */
    s=ease(prog(c,6.8,7.5))*fo;carM.visible=s>.02;
    at(trM,trM.L*sm(prog(c,7,18)));
    if(carM.visible){carM.position.set(pose.x,.1,pose.z);carM.rotation.set(0,pose.h,0);carM.scale.setScalar(1.25*s)}
    siren(carM,s>.02?1:0);
    /* label follows the marker */
    var w=vis.clientWidth,h=vis.clientHeight;
    lv.set(52,pins[0].H+40,0);W.localToWorld(lv);lv.project(cam);
    pl.style.transform='translate('+Math.round((lv.x*.5+.5)*w+26)+'px,'+Math.round((-lv.y*.5+.5)*h-8)+'px)';
    pl.style.opacity=ease(prog(c,CT+1,CT+1.5))*fo;
  }
  function draw(){intro(introT);placeCars(clk);event(cyc());R.render(sc,cam)}
  function size(){
    var w=vis.clientWidth,h=vis.clientHeight;if(!w||!h)return;
    lite=narrow.matches;R.setPixelRatio(Math.min(devicePixelRatio||1,lite?1.5:1.75));
    R.setSize(w,h,false);cam.aspect=w/h;mult=Math.max(1,1/(w/h));cam.updateProjectionMatrix();draw();
  }
  /* light/dark palette for the scene; tonL maps the dark building tones to a warm light scale */
  function tonL(h){var l=(((h>>16)&255)+((h>>8)&255)+(h&255))/765,v=Math.max(.5,.97-1.3*l);return new T.Color(v,v*.985,v*.94)}
  function applyTheme(L,redraw){
    isLt=L;
    fog.color.setHex(L?0xEEEBE3:0x121212);gm.color.setHex(L?0xE9E5DB:0x171715);
    gcol.setHex(L?0xE9E5DB:0x171715);rcol.setHex(L?0xC2BDAE:0x211f1c);scol.setHex(L?0xF7F4EC:0x34342f);
    amb.color.setHex(L?0xffffff:0x9a968a);amb.intensity=L?.62:.62;
    d1.color.setHex(L?0xFFF3D6:0xE9DDAA);d1.intensity=L?.5:.95;d2.intensity=L?.15:.3;
    dashes.material.color.setHex(L?0x7A5A1A:0xC9A45C);pulse.material.color.setHex(L?0x8A6420:0xE9DDAA);
    items.forEach(function(it,n){if(L)col.copy(tonL(it.c));else col.setHex(it.c);inst.setColorAt(n,col)});
    inst.instanceColor.needsUpdate=true;
    pins[0].sp.material.map=tex('res');pins[0].sp.material.needsUpdate=true;
    if(redraw)draw();
  }
  if(isLt)applyTheme(true,false);
  size();
  var ro=window.ResizeObserver?new ResizeObserver(size):null;if(ro)ro.observe(vis);else addEventListener('resize',size);

  /* ---- loop: one rAF, paused when off screen, torn down on page hide ---- */
  var raf=0,t0=null,prev=0,settled=false,io=null;
  function loop(ts){
    raf=requestAnimationFrame(loop);
    if(t0===null){t0=ts;prev=ts}
    var t=(ts-t0)/1000,dt=Math.min(.05,(ts-prev)/1000);prev=ts;clk=t;
    D+=ease(prog(t,2.4,4.4))*dt;
    if(t<5)intro(t);else if(!settled){intro(99);settled=true}
    placeCars(t);event(cyc());R.render(sc,cam);
  }
  function stop(){if(raf){cancelAnimationFrame(raf);raf=0}}
  function start(){if(!raf&&!reduce){prev=performance.now();raf=requestAnimationFrame(loop)}}
  var dead=false;
  function destroy(){
    if(dead)return;dead=true;removeEventListener('pagehide',destroy);
    stop();if(io)io.disconnect();if(ro)ro.disconnect();else removeEventListener('resize',size);
    disp.forEach(function(d){d.dispose&&d.dispose()});inst.dispose();roads.dispose();walks.dispose();dashes.dispose();R.dispose();R.forceContextLoss&&R.forceContextLoss();cv.remove();
  }
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();stop();if(!dead)fallback()});
  addEventListener('pagehide',destroy);
  api.setTheme=applyTheme;api.destroy=destroy;
  if(reduce){introT=99;draw();return api}
  introT=0;draw();start();
  if(window.IntersectionObserver){io=new IntersectionObserver(function(en){en[0].isIntersecting?start():stop()});io.observe(vis)}
  return api;
}
