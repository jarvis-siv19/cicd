import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowUpRight,GitPullRequest,Layers3,Plus,RefreshCw,Workflow} from 'lucide-react';
import {api,useAction,type Dashboard,type Item} from '../api';
import {Empty,ErrorNotice,PageTitle,Panel,Submit} from '../components/ui';
import './patterns.css';

type PatternResult={sample:boolean;truncated:boolean;results:{repo:string;status:string;html_url?:string;error?:string}[]};
type PatternsResponse={patterns:Item[];demo:boolean};
const starter=`name: Organization CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Add stack-specific setup, lint, test, and build steps.

  security:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: gitleaks/gitleaks-action@v2
      - uses: aquasecurity/trivy-action@0.36.0
        with:
          scan-type: fs
          severity: CRITICAL
          exit-code: "1"
`;

export default function OrganizationPatterns({data}:{data:Dashboard}){
 const patterns=useQuery<PatternsResponse>({queryKey:['organization-patterns'],queryFn:()=>api('/organization-patterns')});
 const action=useAction<PatternResult|Item>();
 const organizations=[...new Set(data.repository.filter(r=>r.state==='managed').map(r=>r.name.split('/')[0]).filter(Boolean))].sort();
 const [organization,setOrganization]=useState(organizations[0]||'');
 const [name,setName]=useState('');
 const [path,setPath]=useState('.github/workflows/cicd.yml');
 const [content,setContent]=useState(starter);
 const [result,setResult]=useState<PatternResult|null>(null);
 const save=async(e:React.FormEvent)=>{e.preventDefault();setResult(null);try{await action.mutateAsync({path:'/organization-patterns',body:{organization,name,path,content}});setName('');await patterns.refetch()}catch{}};
 const apply=async(pattern:Item)=>{if(!window.confirm(`Create workflow pull requests for every managed ${pattern.organization} repository?`))return;setResult(null);try{const result=await action.mutateAsync({path:`/organization-patterns/${pattern.id}/apply`});if('results' in result)setResult(result as PatternResult)}catch{}};
 return <><PageTitle title="Organization patterns" description="Define a shared Actions workflow and propose it to managed repositories across an organization." action={<button className="button" onClick={()=>patterns.refetch()} disabled={patterns.isFetching}><RefreshCw size={15} className={patterns.isFetching?'spin':''}/>Refresh</button>}/><ErrorNotice error={patterns.error||action.error}/>{result&&<Panel title={<><GitPullRequest size={17}/>Pattern application results</>} subtitle={result.sample?'Sample mode — no pull requests were created.':`${result.results.filter(r=>r.status==='pull_request_created').length} pull requests created · ${result.results.filter(r=>r.status==='failed').length} failed`}><div className="pattern-results">{result.results.map(item=><div className="simple-row" key={item.repo}><b>{item.repo}</b><span>{item.error||item.status}</span>{item.html_url&&<a className="external" href={item.html_url} target="_blank" rel="noreferrer">Open PR <ArrowUpRight size={14}/></a>}</div>)}</div>{result.truncated&&<p className="help">Only the first 100 repositories are processed at once.</p>}</Panel>}<div className="pattern-layout"><Panel title={<><Layers3 size={18}/>Saved patterns</>} subtitle={`${patterns.data?.patterns.length||0} organization templates`}><div className="pattern-list">{patterns.data?.patterns.map(pattern=><article className="pattern-item" key={pattern.id}><div className="pattern-item-head"><span><Workflow size={16}/></span><div><h3>{pattern.name}</h3><p>{pattern.organization} · {pattern.path}</p></div><button className="button small" onClick={()=>apply(pattern)}>Propose to org</button></div><pre>{pattern.content.slice(0,800)}{pattern.content.length>800?'…':''}</pre></article>)}</div>{!patterns.isLoading&&!patterns.data?.patterns.length&&<Empty title="No organization patterns" text="Add a common workflow, then create a pull request in each managed repository in that organization."/>}</Panel><Panel title={<><Plus size={18}/>Create a pattern</>} subtitle="Applying a pattern always opens pull requests—never direct branch edits."><form className="padding" onSubmit={save}><label>Organization<select required value={organization} onChange={e=>setOrganization(e.target.value)}>{organizations.map(org=><option key={org}>{org}</option>)}</select></label><label>Pattern name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Default CI and security"/></label><label>Workflow path<input required value={path} onChange={e=>setPath(e.target.value)}/></label><label>Workflow YAML<textarea className="pattern-source" required rows={19} spellCheck={false} value={content} onChange={e=>setContent(e.target.value)}/></label><p className="help">Only managed repositories are targeted. Each pull request contains the same workflow content and should be reviewed for repository-specific commands, environment secrets, and deployment settings.</p><Submit pending={action.isPending}><Plus size={15}/>Save organization pattern</Submit></form></Panel></div></>;
}
