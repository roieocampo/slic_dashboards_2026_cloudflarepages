import { json, requireSession, isAdmin, fetchSettings, sbRequest } from '../_utils.js';

function currentPicker(settings) {
  return {
    request_id: settings.picker_request_id || '',
    kind: settings.picker_kind || '',
    status: settings.picker_status || 'idle',
    message: settings.picker_message || '',
    updated_at: settings.picker_updated_at || null,
  };
}
export async function onRequestGet(context) {
  try {
    const {session,error}=await requireSession(context.request,context.env);
    if(error)return error;
    if(!isAdmin(session))return json({ok:false,error:'Admin Access required.'},403);
    return json({ok:true,picker:currentPicker(await fetchSettings(context.env))});
  }catch(e){return json({ok:false,error:e.message||String(e)},500);}
}
export async function onRequestPost(context) {
  try {
    const {session,error}=await requireSession(context.request,context.env);
    if(error)return error;
    if(!isAdmin(session))return json({ok:false,error:'Admin Access required.'},403);
    const body=await context.request.json();
    const kind=String(body.kind||'').toLowerCase();
    if(kind!=='export')return json({ok:false,error:'Invalid picker type.'},400);
    const settings=await fetchSettings(context.env);
    const lastHeartbeat=Date.parse(settings.agent_last_seen_at||'');
    if (!Number.isFinite(lastHeartbeat) || Date.now()-lastHeartbeat>90000) {
      return json({ok:false,error:'Local agent is offline or outdated. Start the UPDATED run_slic_auto_sync.bat on your Windows PC, or type the export path and save it directly.'},409);
    }
    const age=Date.now()-new Date(settings.picker_updated_at||0).getTime();
    if(['running','pending'].includes(settings.picker_status)&&age>=0&&age<180000){
      return json({ok:false,error:'A Windows picker request is already active on the local PC. Complete it first, or wait for it to expire.'},409);
    }
    const requestId=crypto.randomUUID();
    await sbRequest(context.env,'PATCH','slic_sync_settings?id=eq.1',{
      picker_request_id:requestId,
      picker_kind:kind,
      picker_status:'pending',
      picker_message:'',
      picker_updated_at:new Date().toISOString(),
    },'return=minimal');
    return json({ok:true,request_id:requestId});
  }catch(e){return json({ok:false,error:e.message||String(e)},500);}
}