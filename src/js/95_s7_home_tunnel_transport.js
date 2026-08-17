// ============================================================
// 95_s7_home_tunnel_transport.js
// S7 2服家庭服务器：反向 Secure MQTT/WSS 隧道 Transport
//
// 设计边界：
// - iMac server.js 主动向公共 MQTT Broker 建立 WSS 出站连接；家庭路由器无需开放入站端口。
// - 浏览器也只主动连接 Broker；MQTT 仅作为“字节管道”，房间/BP/阵容/权限仍由 iMac server.js 权威处理。
// - 绝不新增战斗过程同步：battleStart 初始条件之后仍由各客户端本地确定性模拟，只在结束后发送 battleResult。
// - 隧道 payload 使用 HKDF + AES-256-GCM；topic 使用随机 channel，降低公共 Broker 上的明文暴露。
// ============================================================
(function(){
"use strict";

var DEFAULT_BROKER = "wss://broker.emqx.io:8084/mqtt";
var DEFAULT_CHANNEL = "c2c3c40bfadc237a9f757c8c";
var DEFAULT_KEY = "rdsOv39NiQMBhiKseS0e-E5egR0PwDlFnlIJT0yR5v4";
var CONFIG_KEY = "pvz_s7_home_tunnel_v1";
var WELCOME_TIMEOUT_MS = 9000;
var PAGE_EXIT_SEQ_BASE = 9007199253000000;
var te = new TextEncoder(), td = new TextDecoder();

function _u8(x){return x instanceof Uint8Array?x:new Uint8Array(x||0);}
function _rand(n){var a=new Uint8Array(n);crypto.getRandomValues(a);return a;}
function _b64u(bytes){var s="",i;bytes=_u8(bytes);for(i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function _unb64u(s){s=String(s||"").replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";var bin=atob(s),a=new Uint8Array(bin.length),i;for(i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
function _secureSmallInt(max){var a=_rand(4),x=(((a[0]<<24)>>>0)+(a[1]<<16)+(a[2]<<8)+a[3])>>>0;return x%max;}
function _loadCfg(){try{var x=JSON.parse(localStorage.getItem(CONFIG_KEY)||"null");if(x&&typeof x==="object")return x;}catch(_){}return {};}
function _saveCfg(x){try{localStorage.setItem(CONFIG_KEY,JSON.stringify(x));}catch(_){}}

async function _deriveKey(secretB64u,channel,clientId){
  var raw=_unb64u(secretB64u);
  if(raw.length!==32)throw new Error("2服隧道密钥长度错误");
  var base=await crypto.subtle.importKey("raw",raw,"HKDF",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:te.encode(channel),info:te.encode("PVZS7-HOME-TUNNEL-V1:"+clientId)},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function _encrypt(key,direction,channel,clientId,seq,obj){
  var iv=_rand(12),aad="PVZS7-HOME-TUNNEL-V1|"+direction+"|"+channel+"|"+clientId+"|"+seq;
  var plain=te.encode(JSON.stringify(obj));
  var ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:iv,additionalData:te.encode(aad),tagLength:128},key,plain));
  return JSON.stringify({v:1,cid:clientId,seq:seq,iv:_b64u(iv),ct:_b64u(ct)});
}
async function _decrypt(key,direction,channel,clientId,payload){
  var env=JSON.parse(td.decode(payload));
  if(!env||env.v!==1||env.cid!==clientId||!Number.isSafeInteger(env.seq)||env.seq<1)throw new Error("非法2服隧道包");
  var aad="PVZS7-HOME-TUNNEL-V1|"+direction+"|"+channel+"|"+clientId+"|"+env.seq;
  var pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:_unb64u(env.iv),additionalData:te.encode(aad),tagLength:128},key,_unb64u(env.ct));
  return {seq:env.seq,obj:JSON.parse(td.decode(pt))};
}

function HomeTunnelTransport(){
  var saved=_loadCfg();
  this.broker=saved.broker||DEFAULT_BROKER;
  this.channel=saved.channel||DEFAULT_CHANNEL;
  this.secret=saved.key||DEFAULT_KEY;
  this.gameVersion="1.7.2";
  this.mqtt=null;
  this.brokerConnected=false;
  this.connected=false;
  this.clientId=null;
  this.key=null;
  this.seqUp=0;
  this.seqDown=0;
  this.sink=function(){};
  this.welcomeTimer=null;
  this.pageExitPacket=null;
  this._wantConnection=false;
}
HomeTunnelTransport.prototype.setSink=function(fn){this.sink=typeof fn==="function"?fn:function(){};};
HomeTunnelTransport.prototype._emit=function(kind,data){try{this.sink(kind,data);}catch(e){console.error(e);}};
HomeTunnelTransport.prototype.configure=function(opts){
  opts=opts||{};
  if(this.mqtt&&this.mqtt.shouldReconnect)return false;
  if(opts.broker)this.broker=String(opts.broker);
  if(opts.channel)this.channel=String(opts.channel);
  if(opts.key)this.secret=String(opts.key);
  if(opts.gameVersion)this.gameVersion=String(opts.gameVersion);
  return true;
};
HomeTunnelTransport.prototype.isConnected=function(){return !!this.connected;};
HomeTunnelTransport.prototype._root=function(){return "pvzs7/v1/home/"+this.channel;};
HomeTunnelTransport.prototype._clearWelcomeTimer=function(){if(this.welcomeTimer)clearTimeout(this.welcomeTimer);this.welcomeTimer=null;};
HomeTunnelTransport.prototype._armWelcomeTimeout=function(){
  var self=this;this._clearWelcomeTimer();
  this.welcomeTimer=setTimeout(function(){
    if(!self.connected&&self._wantConnection)self._emit("error",{message:"2服家庭服务器未在线，或家庭端 MQTT 隧道尚未启动"});
  },WELCOME_TIMEOUT_MS);
};
HomeTunnelTransport.prototype._preparePageExit=async function(){
  if(!this.key||!this.clientId)return;
  var seq=PAGE_EXIT_SEQ_BASE+_secureSmallInt(900000);
  var payload=await _encrypt(this.key,"up",this.channel,this.clientId,seq,{__tunnel:"pageExit"});
  this.pageExitPacket={topic:this._root()+"/up/"+this.clientId,payload:payload};
};
HomeTunnelTransport.prototype._publishObject=async function(obj,allowBeforeWelcome){
  if(!this.mqtt||!this.mqtt.connected||!this.key)return false;
  if(!allowBeforeWelcome&&!this.connected)return false;
  this.seqUp++;
  var payload=await _encrypt(this.key,"up",this.channel,this.clientId,this.seqUp,obj);
  if(!this.mqtt||!this.mqtt.connected)return false;
  return this.mqtt.publish(this._root()+"/up/"+this.clientId,payload,false);
};
HomeTunnelTransport.prototype._hello=function(){
  var self=this;
  this._armWelcomeTimeout();
  this._publishObject({__tunnel:"hello",ver:this.gameVersion},true).catch(function(e){self._emit("error",{message:"2服隧道握手失败："+(e&&e.message?e.message:"unknown")});});
};
HomeTunnelTransport.prototype.connect=function(){
  if(this.mqtt&&this.mqtt.shouldReconnect)return;
  var MiniMqtt=window.S7MiniMqttV1;
  if(!MiniMqtt){this._emit("error",{message:"2服隧道依赖的 MQTT wire 未加载"});return;}
  this._wantConnection=true;
  this.clientId="h2_"+_b64u(_rand(16));
  this.seqUp=0;this.seqDown=0;this.connected=false;this.brokerConnected=false;this.pageExitPacket=null;
  var self=this;
  _deriveKey(this.secret,this.channel,this.clientId).then(function(key){
    if(!self._wantConnection)return;
    self.key=key;
    return self._preparePageExit();
  }).then(function(){
    if(!self._wantConnection)return;
    self.mqtt=new MiniMqtt(self.broker,"s7home_web_"+_b64u(_rand(10)));
    self.mqtt.onconnect=function(){
      self.brokerConnected=true;
      self.mqtt.subscribe(self._root()+"/down/"+self.clientId);
      self.mqtt.subscribe(self._root()+"/status");
      self._hello();
    };
    self.mqtt.onclose=function(){
      var was=self.connected;self.brokerConnected=false;self.connected=false;self._clearWelcomeTimer();
      if(was)self._emit("disconnected");
    };
    self.mqtt.onreconnecting=function(){self._emit("reconnecting",{delay:3000,count:1});};
    self.mqtt.onerror=function(e){self._emit("error",{message:"2服 MQTT 隧道连接错误："+(e&&e.message?e.message:"unknown")});};
    self.mqtt.onmessage=function(topic,payload){self._onMessage(topic,payload).catch(function(){});};
    self.mqtt.connect();
  }).catch(function(e){self._emit("error",{message:"2服隧道初始化失败："+(e&&e.message?e.message:"unknown")});});
};
HomeTunnelTransport.prototype._onMessage=async function(topic,payload){
  if(topic===this._root()+"/status")return; // 仅用于 Broker retained 在线指示，真正连通以 welcome 为准。
  if(topic!==this._root()+"/down/"+this.clientId||!this.key)return;
  var x=await _decrypt(this.key,"down",this.channel,this.clientId,payload);
  if(x.seq<=this.seqDown)return;
  this.seqDown=x.seq;
  var obj=x.obj;
  if(obj&&obj.__tunnel==="welcome"){
    this._clearWelcomeTimer();
    var first=!this.connected;
    this.connected=true;
    if(first)this._emit("connected",{serverVersion:obj.serverVersion||""});
    return;
  }
  if(obj&&obj.__tunnel==="serverClose"){
    this.connected=false;
    this._emit("disconnected",{reason:obj.reason||"server close"});
    return;
  }
  this._emit("message",obj);
};
HomeTunnelTransport.prototype.send=function(obj){
  if(!this.connected||!this.mqtt||!this.mqtt.connected)return false;
  var self=this;
  this._publishObject(obj,false).catch(function(e){self._emit("error",{message:"2服隧道发送失败："+(e&&e.message?e.message:"unknown")});});
  return true;
};
HomeTunnelTransport.prototype.pageExit=function(){
  try{if(this.pageExitPacket&&this.mqtt&&this.mqtt.connected)this.mqtt.publish(this.pageExitPacket.topic,this.pageExitPacket.payload,false);}catch(_){}
};
HomeTunnelTransport.prototype.disconnect=function(){
  this._wantConnection=false;
  this._clearWelcomeTimer();
  this.pageExit();
  if(this.mqtt)this.mqtt.end();
  this.mqtt=null;this.brokerConnected=false;this.connected=false;this.key=null;
  this._emit("disconnected");
};
HomeTunnelTransport.prototype.debug=function(){return{broker:this.broker,channel:this.channel,clientId:this.clientId,brokerConnected:this.brokerConnected,connected:this.connected};};

var transport=new HomeTunnelTransport();
window.S7HomeTunnelTransport=transport;
window.s7HomeTunnelDebug=function(){return transport.debug();};
window.s7ConfigureHomeTunnel=function(opts){
  opts=opts||{};
  var next={broker:String(opts.broker||transport.broker||DEFAULT_BROKER),channel:String(opts.channel||transport.channel||DEFAULT_CHANNEL),key:String(opts.key||transport.secret||DEFAULT_KEY)};
  if(!/^wss?:\/\//i.test(next.broker))throw new Error("2服 Broker 必须以 ws:// 或 wss:// 开头");
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(next.channel))throw new Error("2服 channel 格式错误");
  if(_unb64u(next.key).length!==32)throw new Error("2服 key 必须是32字节 base64url");
  _saveCfg(next);transport.broker=next.broker;transport.channel=next.channel;transport.secret=next.key;return {broker:next.broker,channel:next.channel};
};
window.s7ResetHomeTunnel=function(){try{localStorage.removeItem(CONFIG_KEY);}catch(_){}transport.broker=DEFAULT_BROKER;transport.channel=DEFAULT_CHANNEL;transport.secret=DEFAULT_KEY;return{broker:DEFAULT_BROKER,channel:DEFAULT_CHANNEL};};
})();
