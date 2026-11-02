import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
export type Item = {id:string;[key:string]:any};
export type Dashboard = Record<'project'|'repository'|'deployment'|'finding'|'health_check'|'host'|'service'|'activity'|'incident',Item[]> & {demo:boolean;user:Item};
export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok){let message=`Request failed (${r.status})`;try{const b=await r.json();message=typeof b.detail==='string'?b.detail:JSON.stringify(b.detail)}catch{}throw new Error(message)}
 return r.json();
}
export function useDashboard(){return useQuery<Dashboard>({queryKey:['dashboard'],queryFn:()=>api('/dashboard'),refetchInterval:15000});}
export function useAction<TData=unknown>(){const client=useQueryClient();return useMutation<TData,Error,{path:string;method?:string;body?:unknown}>({mutationFn:({path,method='POST',body})=>api<TData>(path,method,body),onSuccess:()=>client.invalidateQueries()});}
export function ago(value:string){const m=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));return m<1?'just now':m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`;}
