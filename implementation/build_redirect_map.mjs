import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

function parseCsv(text) {
  const rows=[];let row=[];let cell='';let quoted=false;
  for(let i=0;i<text.length;i+=1){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i+=1;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/u,''));if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('CSV字段未闭合');if(cell!==''||row.length){row.push(cell.replace(/\r$/u,''));rows.push(row);}
  const headers=rows.shift()??[];if(headers.length===0||new Set(headers).size!==headers.length)throw new Error('CSV表头无效');
  return rows.map((values,index)=>{if(values.length!==headers.length)throw new Error(`CSV第${index+2}行列数无效`);return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));});
}
function csvCell(value){const text=String(value??'');return /[",\r\n]/u.test(text)?`"${text.replaceAll('"','""')}"`:text;}
function toCsv(headers,rows){return `${headers.join(',')}\n${rows.map(r=>headers.map(h=>csvCell(r[h])).join(',')).join('\n')}\n`;}
function slugify(value){return String(value??'').trim().toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,16);}
function normalizeUrl(raw,request,policy){let url;try{url=new URL(raw);}catch{return{error:'invalid_url'}}if(url.protocol!=='https:')return{error:'non_https_scheme'};const host=url.hostname.toLowerCase();if(!policy.allowed_hosts.includes(host))return{error:'unsupported_host'};const kept=[];for(const[k,v]of url.searchParams){const key=k.toLowerCase();if(policy.allowed_existing_query_keys.includes(key))kept.push([key,v]);}for(const key of policy.allowed_utm_keys){let value=request[key]??'';if(value==='')continue;if(policy.lowercase_utm_values.includes(key))value=value.toLowerCase();kept.push([key,value]);}kept.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));const pathname=url.pathname==='/'?'':url.pathname.replace(/\/+$/gu,'');return{target_url:`https://${host}${pathname}${kept.length?`?${kept.map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`:''}`};}
function allocate(base,occupied,assigned,separator){if(!occupied.has(base)&&!assigned.has(base))return base;for(let n=1;n<100;n+=1){const candidate=`${base}${separator}${String(n).padStart(2,'0')}`;if(!occupied.has(candidate)&&!assigned.has(candidate))return candidate;}throw new Error(`短码后缀已耗尽:${base}`);}

export async function buildShortlinks(inputDir,outputDir,sourceFile=fileURLToPath(import.meta.url)) {
  const requests=parseCsv(await fs.readFile(path.join(inputDir,'shortlink_requests.csv'),'utf8'));
  if(new Set(requests.map(r=>r.request_id)).size!==requests.length)throw new Error('request_id重复');
  const policy=JSON.parse(await fs.readFile(path.join(inputDir,'migration_policy.json'),'utf8'));
  const existingDoc=JSON.parse(await fs.readFile(path.join(inputDir,'existing_slugs.json'),'utf8'));
  if(!Array.isArray(existingDoc.slugs)||!Array.isArray(policy.allowed_hosts)||!Array.isArray(policy.allowed_utm_keys))throw new Error('输入合同无效');
  const runAt=Date.parse(policy.run_at_utc);if(!Number.isFinite(runAt))throw new Error('run_at_utc无效');
  const existing=new Map(existingDoc.slugs.map(x=>[x.slug,x]));if(existing.size!==existingDoc.slugs.length)throw new Error('现网slug重复');
  const occupied=new Set(existingDoc.slugs.filter(x=>x.status==='active'&&Date.parse(x.expires_at_utc)>=runAt).map(x=>x.slug));
  const assigned=new Set();const redirects=[];const transitions=[];
  const ordered=[...requests].sort((a,b)=>Number(b.priority)-Number(a.priority)||a.requested_at_utc.localeCompare(b.requested_at_utc)||a.request_id.localeCompare(b.request_id));
  for(const request of ordered){const normalized=normalizeUrl(request.landing_url,request,policy);if(normalized.error){transitions.push({request_id:request.request_id,campaign_id:request.campaign_id,requested_slug:request.requested_slug,final_slug:'',resolution:'rejected',reason:normalized.error,existing_status:'',existing_owner:''});continue;}
    const requested=request.requested_slug.trim().toLowerCase();const base=requested||slugify(request.campaign_id);if(!new RegExp(policy.slug_pattern).test(base)){transitions.push({request_id:request.request_id,campaign_id:request.campaign_id,requested_slug:request.requested_slug,final_slug:'',resolution:'rejected',reason:'invalid_slug',existing_status:'',existing_owner:''});continue;}
    const prior=existing.get(base);let finalSlug=base;let resolution=requested?'new_requested_slug':'generated_from_campaign';let reason='available_slug';
    if(prior&&occupied.has(base)){if(prior.owner_team===request.owner_team&&prior.target_url===normalized.target_url){resolution='reused_active_slug';reason='same_owner_and_target';}else{finalSlug=allocate(base,occupied,assigned,policy.fallback_suffix_separator);resolution='collision_allocated';reason='active_slug_occupied';}}
    else if(prior){resolution='reclaimed_slug';reason=prior.status==='disabled'?'disabled_slug':Date.parse(prior.expires_at_utc)<runAt?'expired_slug':'non_active_slug';}
    else if(assigned.has(base)){finalSlug=allocate(base,occupied,assigned,policy.fallback_suffix_separator);resolution='collision_allocated';reason='batch_slug_occupied';}
    assigned.add(finalSlug);const redirect={request_id:request.request_id,slug:finalSlug,owner_team:request.owner_team,campaign_id:request.campaign_id,target_url:normalized.target_url,expires_at_utc:request.expires_at_utc,resolution};redirects.push(redirect);transitions.push({request_id:request.request_id,campaign_id:request.campaign_id,requested_slug:request.requested_slug,final_slug:finalSlug,resolution,reason,existing_status:prior?.status??'',existing_owner:prior?.owner_team??''});
  }
  const count=r=>transitions.filter(x=>x.resolution===r).length;const summary={status:policy.summary_status,request_count:requests.length,accepted_count:redirects.length,rejected_count:count('rejected'),reused_count:count('reused_active_slug'),reclaimed_count:count('reclaimed_slug'),collision_allocated_count:count('collision_allocated')};
  if(summary.request_count!==summary.accepted_count+summary.rejected_count)throw new Error('申请汇总不闭合');
  await fs.rm(outputDir,{recursive:true,force:true});await fs.mkdir(path.join(outputDir,'src'),{recursive:true});
  await fs.copyFile(sourceFile,path.join(outputDir,'src','build_redirect_map.mjs'));
  await fs.writeFile(path.join(outputDir,'redirect_map.jsonl'),`${redirects.map(x=>JSON.stringify(x)).join('\n')}\n`);
  await fs.writeFile(path.join(outputDir,'transition_log.csv'),toCsv(['request_id','campaign_id','requested_slug','final_slug','resolution','reason','existing_status','existing_owner'],transitions));
  await fs.writeFile(path.join(outputDir,'migration_summary.json'),`${JSON.stringify(summary,null,2)}\n`);
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){await buildShortlinks(path.resolve(process.argv[2]??'input_data'),path.resolve(process.argv[3]??'output'));}
